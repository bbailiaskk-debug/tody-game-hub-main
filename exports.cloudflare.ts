import { DurableObject } from "cloudflare:workers";
import type { DurableObjectNamespace, WebSocket } from "cloudflare:workers";

import {
  gameStatus,
  initialState,
  legalMovesForSquare,
  makeMoveSimple,
  type GameState,
  type PieceType,
  type Square,
} from "./src/lib/chess-engine";
import { getChessSecret, normalizeEmail, verifyChessToken } from "./src/lib/chess-auth";
import type {
  ChessMatchSnapshot,
  ClientToServerMessage,
  MatchResult,
  PlayerInfo,
  PlayerRole,
  RematchRequest,
  ServerToClientMessage,
} from "./src/lib/chess-online-types";
import type {
  TttBoard,
  TttClientToServerMessage,
  TttMatchSnapshot,
  TttPlayers,
  TttRematchRequest,
  TttResult,
  TttServerToClientMessage,
  TttStatus,
  TttTurn,
} from "./src/lib/tictactoe-online-types";
import { createAhState, resetAhRound, stepAirHockey } from "./src/lib/airhockey-engine";
import type { AhInput, AhState as AirHockeyState } from "./src/lib/airhockey-engine";
import type {
  AhClientToServerMessage,
  AhEndReason,
  AhMatchSnapshot,
  AhPlayers,
  AhPreferredRole,
  AhRematchRequest,
  AhResult,
  AhServerToClientMessage,
  AhStatus,
} from "./src/lib/airhockey-online-types";

type KvLike = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

type ChessEnv = {
  AUTH_USERS_KV?: KvLike;
  CHESS_GAME_DO?: DurableObjectNamespace;
};

type StoredGame = {
  gameId: string;
  state: GameState;
  status: ChessMatchSnapshot["status"];
  players: { white: PlayerInfo | null; black: PlayerInfo | null };
  lastMove: { from: Square; to: Square } | null;
  moveCount: number;
  result: MatchResult;
  createdAt: number;
  rematch: RematchRequest;
};

type StoredConnections = Record<string, { email: string; name: string; lastSeen: number }>;

const GAME_STALE_MS = 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function toSquare(value: unknown): Square | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const r = Number(value[0]);
  const c = Number(value[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  const square: Square = [r, c];
  return square;
}

function toSnapshot(game: StoredGame): ChessMatchSnapshot {
  return {
    gameId: game.gameId,
    state: game.state,
    status: game.status,
    players: {
      white: game.players.white ? { ...game.players.white } : null,
      black: game.players.black ? { ...game.players.black } : null,
    },
    lastMove: game.lastMove,
    moveCount: game.moveCount,
    result: game.result,
    createdAt: game.createdAt,
  };
}

function createFreshGame(gameId: string): StoredGame {
  return {
    gameId,
    state: initialState(),
    status: "playing",
    players: { white: null, black: null },
    lastMove: null,
    moveCount: 0,
    result: null,
    createdAt: Date.now(),
    rematch: { white: false, black: false },
  };
}

const TTT_WINNING_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

type StoredTttGame = {
  gameId: string;
  board: TttBoard;
  turn: TttTurn;
  status: TttStatus;
  players: TttPlayers;
  lastMove: number | null;
  moveCount: number;
  result: TttResult;
  createdAt: number;
  rematch: TttRematchRequest;
};

function freshTttBoard(): TttBoard {
  return Array(9).fill(null);
}

function tttOutcome(board: TttBoard): { status: TttStatus; result: TttResult } {
  for (const [a, b, c] of TTT_WINNING_LINES) {
    const cell = board[a];
    if (cell && cell === board[b] && cell === board[c]) {
      const status: TttStatus = cell === "X" ? "x-wins" : "o-wins";
      return { status, result: status };
    }
  }
  if (board.every((cell) => cell !== null)) return { status: "draw", result: "draw" };
  return { status: "playing", result: null };
}

function tttToSnapshot(game: StoredTttGame): TttMatchSnapshot {
  return {
    gameId: game.gameId,
    board: [...game.board],
    turn: game.turn,
    status: game.status,
    players: {
      x: game.players.x ? { ...game.players.x } : null,
      o: game.players.o ? { ...game.players.o } : null,
    },
    lastMove: game.lastMove,
    moveCount: game.moveCount,
    result: game.result,
    rematch: { ...game.rematch },
    createdAt: game.createdAt,
  };
}

function createFreshTttGame(gameId: string): StoredTttGame {
  return {
    gameId,
    board: freshTttBoard(),
    turn: "X",
    status: "playing",
    players: { x: null, o: null },
    lastMove: null,
    moveCount: 0,
    result: null,
    createdAt: Date.now(),
    rematch: { x: false, o: false },
  };
}

export class ChessMatchDO extends DurableObject<ChessEnv> {
  private readonly wsToConnId = new Map<WebSocket, string>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const gameId = pathParts[3] ?? "";
    const upgrade = request.headers.get("Upgrade");
    const isWebSocketUpgrade = typeof upgrade === "string" && upgrade.toLowerCase() === "websocket";

    if (!isWebSocketUpgrade) {
      if (!gameId) return json({ error: "invalid-game" }, 400);
      const snapshot = await this.ctx.blockConcurrencyWhile(() => this.getOrCreateSnapshot(gameId));
      return json({ snapshot });
    }

    if (!gameId) return json({ error: "invalid-game" }, 400);

    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    const connId = (url.searchParams.get("cid") ?? "").trim();
    const token = url.searchParams.get("auth");

    // The SSR service injects the authoritative chess secret (the same one it
    // uses to mint WS auth tokens) as X-Chess-Secret, so mint and verify always
    // match. Fall back to local bindings for direct-to-DO requests.
    const injectedSecret = request.headers.get("x-chess-secret")?.trim();
    const secret = injectedSecret || (await getChessSecret(this.env.AUTH_USERS_KV));
    const valid = await verifyChessToken(secret, gameId, email, token);
    if (!valid || !email || !connId) {
      return json({ error: "unauthorized" }, 401);
    }

    const snapshot = await this.ctx.blockConcurrencyWhile(async (): Promise<ChessMatchSnapshot> => {
      const connections = await this.getConnections();
      connections[connId] = { email, name: email.split("@")[0] || "player", lastSeen: Date.now() };
      await this.ctx.storage.put("connections", connections);

      // Claim a seat immediately so a client that races its first message (and
      // has the join dropped by the handshake flush) still gets a role. The
      // later join message may still refresh the display name.
      const game = await this.ensureGame();
      if (!game.result) {
        this.assignRole(game, email, email.split("@")[0] || "player");
        await this.ctx.storage.put("game", game);
      }
      return toSnapshot(game);
    });

    const pair = new WebSocketPair();
    const serverWs = pair[0];
    this.wsToConnId.set(serverWs, connId);
    this.ctx.acceptWebSocket(serverWs, [connId]);
    this.send(serverWs, { type: "state", snapshot });

    return new Response(null, { status: 101, webSocket: pair[1] } as ResponseInit);
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    try {
      const parsed = this.parseMessage(message);
      if (!parsed) return;
      const connectionId = this.getConnectionId(ws);
      if (!connectionId || parsed.connId !== connectionId) {
        this.send(ws, { type: "error", message: "unknown-connection" });
        return;
      }
      await this.ctx.blockConcurrencyWhile(async () => {
        await this.handleClientMessage(ws, parsed);
      });
    } catch (error) {
      console.warn("Unhandled error while handling a chess websocket message.", error);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      await this.handleConnectionClosed(ws);
    } catch (error) {
      console.warn("Unhandled error while closing a chess websocket.", error);
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    try {
      await this.handleConnectionClosed(ws);
    } catch (error) {
      console.warn("Unhandled error while handling a chess websocket error.", error);
    }
  }

  override async alarm(): Promise<void> {
    try {
      await this.ctx.blockConcurrencyWhile(async () => {
        const connections = await this.getConnections();
        await this.refreshOnline(connections);
        if (Object.keys(connections).length > 0) {
          await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
        }
      });
    } catch (error) {
      console.warn("Unhandled error in chess presence sweep alarm.", error);
    }
  }

  private async handleClientMessage(ws: WebSocket, msg: ClientToServerMessage): Promise<void> {
    const connections = await this.getConnections();
    const connection = connections[msg.connId];
    if (!connection) {
      this.send(ws, { type: "error", message: "unknown-connection" });
      return;
    }

    connection.lastSeen = Date.now();
    await this.ctx.storage.put("connections", connections);

    const game = await this.ensureGame();

    switch (msg.type) {
      case "join": {
        if (game.result) {
          this.send(ws, { type: "error", message: "game-over" });
          return;
        }
        const name = (msg.name ?? "").trim() || connection.email.split("@")[0] || "player";
        connection.name = name;
        await this.ctx.storage.put("connections", connections);

        const role = this.assignRole(game, connection.email, name);
        await this.ctx.storage.put("game", game);

        this.send(ws, { type: "state", snapshot: toSnapshot(game) });
        this.broadcast({
          type: "playerJoined",
          players: {
            white: game.players.white ? { ...game.players.white } : null,
            black: game.players.black ? { ...game.players.black } : null,
          },
          message: `${name} (${role}) joined`,
        });
        break;
      }

      case "move": {
        const role = this.roleOf(game, connection.email);
        if (role !== "white" && role !== "black") {
          this.send(ws, { type: "error", message: "spectator" });
          return;
        }
        if (game.result) {
          this.send(ws, { type: "error", message: "game-over" });
          return;
        }
        const expectedColor = role === "white" ? "w" : "b";
        if (game.state.turn !== expectedColor) {
          this.send(ws, { type: "error", message: "not-your-turn" });
          return;
        }
        const from = toSquare(msg.from);
        const to = toSquare(msg.to);
        if (!from || !to) {
          this.send(ws, { type: "error", message: "invalid-move" });
          return;
        }
        const piece = game.state.board[from[0]]?.[from[1]];
        if (!piece || piece.color !== expectedColor) {
          this.send(ws, { type: "error", message: "illegal-move" });
          return;
        }
        const isLegal = legalMovesForSquare(game.state, from[0], from[1]).some(
          ([tr, tc]) => tr === to[0] && tc === to[1],
        );
        if (!isLegal) {
          this.send(ws, { type: "error", message: "illegal-move" });
          return;
        }
        const promotion: PieceType =
          msg.promotion === "r" || msg.promotion === "b" || msg.promotion === "n"
            ? msg.promotion
            : "q";

        game.state = makeMoveSimple(game.state, from, to, promotion);
        game.moveCount += 1;
        game.lastMove = { from, to };
        game.status = gameStatus(game.state);
        if (game.status === "checkmate") {
          game.result = game.state.turn === "w" ? "black-wins" : "white-wins";
        } else if (game.status === "stalemate") {
          game.result = "draw";
        } else {
          game.rematch = { white: false, black: false };
        }
        await this.ctx.storage.put("game", game);

        this.broadcast({
          type: "move",
          lastMove: game.lastMove,
          state: game.state,
          moveCount: game.moveCount,
        });
        if (game.result) {
          this.broadcast({
            type: "end",
            result: game.result,
            status: game.status,
            state: game.state,
          });
        }
        break;
      }

      case "resign": {
        const role = this.roleOf(game, connection.email);
        if (role !== "white" && role !== "black") {
          this.send(ws, { type: "error", message: "spectator" });
          return;
        }
        if (game.result) return;
        game.result = role === "white" ? "black-wins" : "white-wins";
        game.status = "checkmate";
        await this.ctx.storage.put("game", game);
        this.broadcast({
          type: "end",
          result: game.result,
          status: game.status,
          state: game.state,
        });
        break;
      }

      case "rematch": {
        const role = this.roleOf(game, connection.email);
        if (role !== "white" && role !== "black") return;
        if (!game.result) return;
        game.rematch[role] = true;
        const ready = game.rematch.white && game.rematch.black;
        if (ready) {
          game.state = initialState();
          game.status = "playing";
          game.result = null;
          game.lastMove = null;
          game.moveCount = 0;
          game.rematch = { white: false, black: false };
          await this.ctx.storage.put("game", game);
          this.broadcast({ type: "state", snapshot: toSnapshot(game) });
        } else {
          await this.ctx.storage.put("game", game);
          this.broadcast({ type: "rematchUpdate", rematch: game.rematch });
        }
        break;
      }

      case "ping":
        this.send(ws, { type: "pong" });
        break;
      default:
        break;
    }

    void this.scheduleSweep();
  }

  private async handleConnectionClosed(ws: WebSocket): Promise<void> {
    const connId = this.getConnectionId(ws);
    this.wsToConnId.delete(ws);
    if (!connId) return;

    await this.ctx.blockConcurrencyWhile(async () => {
      const connections = await this.getConnections();
      if (connections[connId]) {
        delete connections[connId];
        await this.ctx.storage.put("connections", connections);
      }
      await this.refreshOnline(connections);
      void this.scheduleSweep();
    });
  }

  private async refreshOnline(connections: StoredConnections): Promise<void> {
    const stored = await this.ctx.storage.get<StoredGame>("game");
    if (!stored) return;
    const now = Date.now();
    let changed = false;
    for (const role of ["white", "black"] as const) {
      const player = stored.players[role];
      if (!player) continue;
      const isOnline = Object.values(connections).some(
        (conn) =>
          normalizeEmail(conn.email) === normalizeEmail(player.email) &&
          now - conn.lastSeen < GAME_STALE_MS,
      );
      if (player.online !== isOnline) {
        player.online = isOnline;
        changed = true;
      }
    }
    if (changed) {
      await this.ctx.storage.put("game", stored);
      this.broadcast({ type: "state", snapshot: toSnapshot(stored) });
    }
  }

  private async getOrCreateSnapshot(gameId: string): Promise<ChessMatchSnapshot> {
    const stored = await this.ctx.storage.get<StoredGame>("game");
    if (stored) return toSnapshot(stored);
    const fresh = createFreshGame(gameId);
    await this.ctx.storage.put("game", fresh);
    return toSnapshot(fresh);
  }

  private async ensureGame(): Promise<StoredGame> {
    const stored = await this.ctx.storage.get<StoredGame>("game");
    if (stored) return stored;
    const fresh = createFreshGame(this.detectMatchId());
    await this.ctx.storage.put("game", fresh);
    return fresh;
  }

  private async getConnections(): Promise<StoredConnections> {
    return (await this.ctx.storage.get<StoredConnections>("connections")) ?? {};
  }

  private async scheduleSweep(): Promise<void> {
    try {
      const existing = await this.ctx.storage.getAlarm();
      if (existing !== null) return;
      await this.ctx.storage.setAlarm(Date.now() + GAME_STALE_MS + 5000);
    } catch (error) {
      console.warn("Failed to schedule chess presence sweep.", error);
    }
  }

  private detectMatchId(): string {
    try {
      const namespace = this.env.CHESS_GAME_DO;
      if (namespace) return namespace.get(this.ctx.id).name || "";
    } catch (error) {
      console.warn("Failed to resolve chess match id from DO context.", error);
    }
    return "";
  }

  private roleOf(game: StoredGame, email: string): PlayerRole {
    const normalizedEmail = normalizeEmail(email);
    if (game.players.white && normalizeEmail(game.players.white.email) === normalizedEmail)
      return "white";
    if (game.players.black && normalizeEmail(game.players.black.email) === normalizedEmail)
      return "black";
    return "spectator";
  }

  private assignRole(game: StoredGame, email: string, name: string): PlayerRole {
    const existing = this.roleOf(game, email);
    if (existing === "white" || existing === "black") {
      const player = game.players[existing];
      if (player) {
        player.online = true;
        player.name = name;
      }
      return existing;
    }
    const role: PlayerRole = !game.players.white
      ? "white"
      : !game.players.black
        ? "black"
        : "spectator";
    if (role === "white" || role === "black") {
      game.players[role] = { email, name, role, online: true };
    }
    return role;
  }

  private broadcast(message: ServerToClientMessage): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch (error) {
        console.warn("Failed to broadcast to a chess websocket.", error);
      }
    }
  }

  private send(ws: WebSocket, message: ServerToClientMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.warn("Failed to send a chess websocket message.", error);
    }
  }

  private getConnectionId(ws: WebSocket): string | null {
    const mapped = this.wsToConnId.get(ws);
    if (mapped) return mapped;
    const tagged = this.ctx.getWebSocketTags(ws)[0];
    if (!tagged) return null;
    this.wsToConnId.set(ws, tagged);
    return tagged;
  }

  private parseMessage(
    message: string | ArrayBuffer | ArrayBufferView,
  ): ClientToServerMessage | null {
    let text: string;
    if (typeof message === "string") {
      text = message;
    } else if (message instanceof ArrayBuffer) {
      text = new TextDecoder().decode(new Uint8Array(message));
    } else {
      const bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
      text = new TextDecoder().decode(bytes);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      if (typeof (parsed as { type?: unknown }).type !== "string") return null;
      return parsed as ClientToServerMessage;
    } catch {
      return null;
    }
  }
}

type TttEnv = {
  AUTH_USERS_KV?: KvLike;
  TTT_GAME_DO?: DurableObjectNamespace;
};

export class TicTacToeMatchDO extends DurableObject<TttEnv> {
  private readonly wsToConnId = new Map<WebSocket, string>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const gameId = pathParts[3] ?? "";
    const upgrade = request.headers.get("Upgrade");
    const isWebSocketUpgrade = typeof upgrade === "string" && upgrade.toLowerCase() === "websocket";

    if (!isWebSocketUpgrade) {
      if (!gameId) return json({ error: "invalid-game" }, 400);
      const snapshot = await this.ctx.blockConcurrencyWhile(() => this.getOrCreateSnapshot(gameId));
      return json({ snapshot });
    }

    if (!gameId) return json({ error: "invalid-game" }, 400);

    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    const connId = (url.searchParams.get("cid") ?? "").trim();
    const token = url.searchParams.get("auth");

    // The SSR service injects the authoritative chess secret (the same one it
    // uses to mint WS auth tokens) as X-Chess-Secret, so mint and verify always
    // match. Fall back to local bindings for direct-to-DO requests.
    const injectedSecret = request.headers.get("x-chess-secret")?.trim();
    const secret = injectedSecret || (await getChessSecret(this.env.AUTH_USERS_KV));
    const valid = await verifyChessToken(secret, gameId, email, token);
    if (!valid || !email || !connId) {
      return json({ error: "unauthorized" }, 401);
    }

    const snapshot = await this.ctx.blockConcurrencyWhile(async (): Promise<TttMatchSnapshot> => {
      const connections = await this.getConnections();
      connections[connId] = { email, name: email.split("@")[0] || "player", lastSeen: Date.now() };
      await this.ctx.storage.put("connections", connections);

      // Claim a seat immediately so a client that races its first message (and
      // has the join dropped by the handshake flush) still gets a role. The
      // later join message may still refresh the display name.
      const game = await this.ensureGame();
      if (!game.result) {
        this.assignRole(game, email, email.split("@")[0] || "player");
        await this.ctx.storage.put("game", game);
      }
      return tttToSnapshot(game);
    });

    const pair = new WebSocketPair();
    const serverWs = pair[0];
    this.wsToConnId.set(serverWs, connId);
    this.ctx.acceptWebSocket(serverWs, [connId]);
    this.send(serverWs, { type: "state", snapshot });

    return new Response(null, { status: 101, webSocket: pair[1] } as ResponseInit);
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    try {
      const parsed = this.parseMessage(message);
      if (!parsed) return;
      const connectionId = this.getConnectionId(ws);
      if (!connectionId || parsed.connId !== connectionId) {
        this.send(ws, { type: "error", message: "unknown-connection" });
        return;
      }
      await this.ctx.blockConcurrencyWhile(async () => {
        await this.handleClientMessage(ws, parsed);
      });
    } catch (error) {
      console.warn("Unhandled error while handling a tictactoe websocket message.", error);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      await this.handleConnectionClosed(ws);
    } catch (error) {
      console.warn("Unhandled error while closing a tictactoe websocket.", error);
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    try {
      await this.handleConnectionClosed(ws);
    } catch (error) {
      console.warn("Unhandled error while handling a tictactoe websocket error.", error);
    }
  }

  override async alarm(): Promise<void> {
    try {
      await this.ctx.blockConcurrencyWhile(async () => {
        const connections = await this.getConnections();
        await this.refreshOnline(connections);
        if (Object.keys(connections).length > 0) {
          await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
        }
      });
    } catch (error) {
      console.warn("Unhandled error in tictactoe presence sweep alarm.", error);
    }
  }

  private async handleClientMessage(ws: WebSocket, msg: TttClientToServerMessage): Promise<void> {
    const connections = await this.getConnections();
    const connection = connections[msg.connId];
    if (!connection) {
      this.send(ws, { type: "error", message: "unknown-connection" });
      return;
    }

    connection.lastSeen = Date.now();
    await this.ctx.storage.put("connections", connections);

    const game = await this.ensureGame();

    switch (msg.type) {
      case "join": {
        if (game.result) {
          this.send(ws, { type: "error", message: "game-over" });
          return;
        }
        const name = (msg.name ?? "").trim() || connection.email.split("@")[0] || "player";
        connection.name = name;
        await this.ctx.storage.put("connections", connections);

        const role = this.assignRole(game, connection.email, name);
        await this.ctx.storage.put("game", game);

        this.send(ws, { type: "state", snapshot: tttToSnapshot(game) });
        this.broadcast({
          type: "playerJoined",
          players: {
            x: game.players.x ? { ...game.players.x } : null,
            o: game.players.o ? { ...game.players.o } : null,
          },
          message: `${name} (${role}) joined`,
        });
        break;
      }

      case "move": {
        const role = this.roleOf(game, connection.email);
        if (role !== "x" && role !== "o") {
          this.send(ws, { type: "error", message: "spectator" });
          return;
        }
        if (game.result) {
          this.send(ws, { type: "error", message: "game-over" });
          return;
        }
        const expectedTurn: TttTurn = role === "x" ? "X" : "O";
        if (game.turn !== expectedTurn) {
          this.send(ws, { type: "error", message: "not-your-turn" });
          return;
        }
        const cell = Number(msg.cell);
        if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
          this.send(ws, { type: "error", message: "invalid-move" });
          return;
        }
        if (game.board[cell] !== null) {
          this.send(ws, { type: "error", message: "illegal-move" });
          return;
        }

        game.board = [...game.board];
        game.board[cell] = expectedTurn;
        game.moveCount += 1;
        game.lastMove = cell;
        game.turn = expectedTurn === "X" ? "O" : "X";
        const outcome = tttOutcome(game.board);
        game.status = outcome.status;
        game.result = outcome.result;
        if (!game.result) {
          game.rematch = { x: false, o: false };
        }
        await this.ctx.storage.put("game", game);

        if (game.result) {
          this.broadcast({
            type: "end",
            result: game.result,
            status: game.status,
            board: game.board,
            turn: game.turn,
            moveCount: game.moveCount,
          });
        } else {
          this.broadcast({
            type: "move",
            board: game.board,
            turn: game.turn,
            lastMove: game.lastMove,
            moveCount: game.moveCount,
            status: "playing",
          });
        }
        break;
      }

      case "resign": {
        const role = this.roleOf(game, connection.email);
        if (role !== "x" && role !== "o") {
          this.send(ws, { type: "error", message: "spectator" });
          return;
        }
        if (game.result) return;
        game.result = role === "x" ? "o-wins" : "x-wins";
        game.status = game.result;
        await this.ctx.storage.put("game", game);
        this.broadcast({
          type: "end",
          result: game.result,
          status: game.status,
          board: game.board,
          turn: game.turn,
          moveCount: game.moveCount,
        });
        break;
      }

      case "rematch": {
        const role = this.roleOf(game, connection.email);
        if (role !== "x" && role !== "o") return;
        if (!game.result) return;
        game.rematch[role] = true;
        const ready = game.rematch.x && game.rematch.o;
        if (ready) {
          game.board = freshTttBoard();
          game.turn = "X";
          game.status = "playing";
          game.result = null;
          game.lastMove = null;
          game.moveCount = 0;
          game.rematch = { x: false, o: false };
          await this.ctx.storage.put("game", game);
          this.broadcast({ type: "state", snapshot: tttToSnapshot(game) });
        } else {
          await this.ctx.storage.put("game", game);
          this.broadcast({ type: "rematchUpdate", rematch: game.rematch });
        }
        break;
      }

      case "ping":
        this.send(ws, { type: "pong" });
        break;
      default:
        break;
    }

    void this.scheduleSweep();
  }

  private async handleConnectionClosed(ws: WebSocket): Promise<void> {
    const connId = this.getConnectionId(ws);
    this.wsToConnId.delete(ws);
    if (!connId) return;

    await this.ctx.blockConcurrencyWhile(async () => {
      const connections = await this.getConnections();
      if (connections[connId]) {
        delete connections[connId];
        await this.ctx.storage.put("connections", connections);
      }
      await this.refreshOnline(connections);
      void this.scheduleSweep();
    });
  }

  private async refreshOnline(connections: StoredConnections): Promise<void> {
    const stored = await this.ctx.storage.get<StoredTttGame>("game");
    if (!stored) return;
    const now = Date.now();
    let changed = false;
    for (const role of ["x", "o"] as const) {
      const player = stored.players[role];
      if (!player) continue;
      const isOnline = Object.values(connections).some(
        (conn) =>
          normalizeEmail(conn.email) === normalizeEmail(player.email) &&
          now - conn.lastSeen < GAME_STALE_MS,
      );
      if (player.online !== isOnline) {
        player.online = isOnline;
        changed = true;
      }
    }
    if (changed) {
      await this.ctx.storage.put("game", stored);
      this.broadcast({ type: "state", snapshot: tttToSnapshot(stored) });
    }
  }

  private async getOrCreateSnapshot(gameId: string): Promise<TttMatchSnapshot> {
    const stored = await this.ctx.storage.get<StoredTttGame>("game");
    if (stored) return tttToSnapshot(stored);
    const fresh = createFreshTttGame(gameId);
    await this.ctx.storage.put("game", fresh);
    return tttToSnapshot(fresh);
  }

  private async ensureGame(): Promise<StoredTttGame> {
    const stored = await this.ctx.storage.get<StoredTttGame>("game");
    if (stored) return stored;
    const fresh = createFreshTttGame(this.detectMatchId());
    await this.ctx.storage.put("game", fresh);
    return fresh;
  }

  private async getConnections(): Promise<StoredConnections> {
    return (await this.ctx.storage.get<StoredConnections>("connections")) ?? {};
  }

  private async scheduleSweep(): Promise<void> {
    try {
      const existing = await this.ctx.storage.getAlarm();
      if (existing !== null) return;
      await this.ctx.storage.setAlarm(Date.now() + GAME_STALE_MS + 5000);
    } catch (error) {
      console.warn("Failed to schedule tictactoe presence sweep.", error);
    }
  }

  private detectMatchId(): string {
    try {
      const namespace = this.env.TTT_GAME_DO;
      if (namespace) return namespace.get(this.ctx.id).name || "";
    } catch (error) {
      console.warn("Failed to resolve tictactoe match id from DO context.", error);
    }
    return "";
  }

  private roleOf(game: StoredTttGame, email: string): "x" | "o" | "spectator" {
    const normalizedEmail = normalizeEmail(email);
    if (game.players.x && normalizeEmail(game.players.x.email) === normalizedEmail) return "x";
    if (game.players.o && normalizeEmail(game.players.o.email) === normalizedEmail) return "o";
    return "spectator";
  }

  private assignRole(game: StoredTttGame, email: string, name: string): "x" | "o" | "spectator" {
    const existing = this.roleOf(game, email);
    if (existing === "x" || existing === "o") {
      const player = game.players[existing];
      if (player) {
        player.online = true;
        player.name = name;
      }
      return existing;
    }
    const role: "x" | "o" | "spectator" = !game.players.x
      ? "x"
      : !game.players.o
        ? "o"
        : "spectator";
    if (role === "x" || role === "o") {
      game.players[role] = { email, name, role, online: true };
    }
    return role;
  }

  private broadcast(message: TttServerToClientMessage): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch (error) {
        console.warn("Failed to broadcast to a tictactoe websocket.", error);
      }
    }
  }

  private send(ws: WebSocket, message: TttServerToClientMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.warn("Failed to send a tictactoe websocket message.", error);
    }
  }

  private getConnectionId(ws: WebSocket): string | null {
    const mapped = this.wsToConnId.get(ws);
    if (mapped) return mapped;
    const tagged = this.ctx.getWebSocketTags(ws)[0];
    if (!tagged) return null;
    this.wsToConnId.set(ws, tagged);
    return tagged;
  }

  private parseMessage(
    message: string | ArrayBuffer | ArrayBufferView,
  ): TttClientToServerMessage | null {
    let text: string;
    if (typeof message === "string") {
      text = message;
    } else if (message instanceof ArrayBuffer) {
      text = new TextDecoder().decode(new Uint8Array(message));
    } else {
      const bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
      text = new TextDecoder().decode(bytes);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      if (typeof (parsed as { type?: unknown }).type !== "string") return null;
      return parsed as TttClientToServerMessage;
    } catch {
      return null;
    }
  }
}

const AH_TICK_MS = 1000 / 60;
const AH_PERSIST_EVERY_TICKS = 10;
const AH_MATCH_MS = 120_000;

type AirHockeyEnv = {
  AUTH_USERS_KV?: KvLike;
  AIR_HOCKEY_DO?: DurableObjectNamespace;
};

type StoredAhGame = {
  gameId: string;
  players: AhPlayers;
  state: AirHockeyState;
  status: AhStatus;
  createdAt: number;
  rematch: AhRematchRequest;
  timeLeftMs: number;
  matchOver: boolean;
  endReason: AhEndReason;
};

type StoredAhConnections = Record<
  string,
  { email: string; name: string; lastSeen: number; preferredRole: AhPreferredRole | null }
>;

function ahResultOf(game: StoredAhGame): AhResult {
  if (game.state.winner === 1) return "p1-wins";
  if (game.state.winner === 2) return "p2-wins";
  if (game.endReason === "timeup") {
    if (game.state.score1 > game.state.score2) return "p1-wins";
    if (game.state.score2 > game.state.score1) return "p2-wins";
    return "draw";
  }
  return null;
}

function ahStatusOf(game: StoredAhGame): AhStatus {
  if (game.state.winner === 1) return "p1-wins";
  if (game.state.winner === 2) return "p2-wins";
  if (game.endReason === "timeup") {
    const result = ahResultOf(game);
    return result === "p1-wins" ? "p1-wins" : result === "p2-wins" ? "p2-wins" : "draw";
  }
  return game.players.p1 && game.players.p2 ? "playing" : "waiting";
}

function inlineAhState(state: AirHockeyState): AirHockeyState {
  return {
    p1: { ...state.p1 },
    p2: { ...state.p2 },
    puck: { ...state.puck },
    serveTimer: state.serveTimer,
    score1: state.score1,
    score2: state.score2,
    winner: state.winner,
  };
}

function ahToSnapshot(game: StoredAhGame): AhMatchSnapshot {
  return {
    gameId: game.gameId,
    players: {
      p1: game.players.p1 ? { ...game.players.p1 } : null,
      p2: game.players.p2 ? { ...game.players.p2 } : null,
    },
    state: inlineAhState(game.state),
    status: game.status,
    result: ahResultOf(game),
    rematch: { ...game.rematch },
    createdAt: game.createdAt,
    timeLeftMs: game.timeLeftMs,
    endReason: game.endReason,
  };
}

export class AirHockeyDO extends DurableObject<AirHockeyEnv> {
  private readonly wsToConnId = new Map<WebSocket, string>();
  private readonly pendingInputs = new Map<string, AhInput>();
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private tickCount = 0;
  private cachedConnections: StoredAhConnections | null = null;
  private cachedGame: StoredAhGame | null = null;

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const gameId = pathParts[3] ?? "";
    const upgrade = request.headers.get("Upgrade");
    const isWebSocketUpgrade =
      typeof upgrade === "string" && upgrade.toLowerCase() === "websocket";

    if (!isWebSocketUpgrade) {
      if (!gameId) return json({ error: "invalid-game" }, 400);
      const snapshot = await this.ctx.blockConcurrencyWhile(() => this.getOrCreateSnapshot(gameId));
      return json({ snapshot });
    }

    if (!gameId) return json({ error: "invalid-game" }, 400);

    const email = normalizeEmail(url.searchParams.get("email") ?? "");
    const connId = (url.searchParams.get("cid") ?? "").trim();
    const token = url.searchParams.get("auth");
    const roleQuery = url.searchParams.get("role") ?? "";
    const preferredRole: AhPreferredRole | null =
      roleQuery === "p1" || roleQuery === "p2" ? roleQuery : null;

    // Same shared chess secret used by the SSR mint/verify path (see server.ts).
    const injectedSecret = request.headers.get("x-chess-secret")?.trim();
    const secret = injectedSecret || (await getChessSecret(this.env.AUTH_USERS_KV));
    const valid = await verifyChessToken(secret, gameId, email, token);
    if (!valid || !email || !connId) {
      return json({ error: "unauthorized" }, 401);
    }

    const snapshot = await this.ctx.blockConcurrencyWhile(async (): Promise<AhMatchSnapshot> => {
      const connections = await this.getConnections();
      connections[connId] = {
        email,
        name: email.split("@")[0] || "player",
        lastSeen: Date.now(),
        preferredRole,
      };
      await this.ctx.storage.put("connections", connections);

      const game = await this.ensureGame();
      if (!game.matchOver) {
        this.assignRole(game, email, email.split("@")[0] || "player", preferredRole);
        game.status = ahStatusOf(game);
        await this.ctx.storage.put("game", game);
      }
      return ahToSnapshot(game);
    });

    const pair = new WebSocketPair();
    const serverWs = pair[0];
    this.wsToConnId.set(serverWs, connId);
    this.ctx.acceptWebSocket(serverWs, [connId]);
    this.send(serverWs, { type: "state", snapshot });

    this.startLoop();

    return new Response(null, { status: 101, webSocket: pair[1] } as ResponseInit);
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    try {
      const parsed = this.parseMessage(message);
      if (!parsed) return;
      const connectionId = this.getConnectionId(ws);
      if (!connectionId || parsed.connId !== connectionId) {
        this.send(ws, { type: "error", message: "unknown-connection" });
        return;
      }
      if (parsed.type === "input") {
        const mx = Number.isFinite(parsed.mx) ? this.clampToField(parsed.mx as number) : null;
        const my = Number.isFinite(parsed.my) ? this.clampToField(parsed.my as number) : null;
        const dx = Math.max(-1, Math.min(1, Number.isFinite(parsed.dx) ? Number(parsed.dx) : 0));
        const dy = Math.max(-1, Math.min(1, Number.isFinite(parsed.dy) ? Number(parsed.dy) : 0));
        this.pendingInputs.set(connectionId, { mx, my, dx, dy });
        const connections = await this.getConnections();
        if (connections[connectionId]) {
          connections[connectionId].lastSeen = Date.now();
        }
        return;
      }
      await this.ctx.blockConcurrencyWhile(async () => {
        await this.handleClientMessage(ws, parsed);
      });
    } catch (error) {
      console.warn("Unhandled error while handling an air hockey websocket message.", error);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      await this.handleConnectionClosed(ws);
    } catch (error) {
      console.warn("Unhandled error while closing an air hockey websocket.", error);
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    try {
      await this.handleConnectionClosed(ws);
    } catch (error) {
      console.warn("Unhandled error while handling an air hockey websocket error.", error);
    }
  }

  override async alarm(): Promise<void> {
    try {
      await this.ctx.blockConcurrencyWhile(async () => {
        const connections = await this.getConnections();
        await this.refreshOnline(connections);
        if (Object.keys(connections).length > 0) {
          await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);
        }
      });
    } catch (error) {
      console.warn("Unhandled error in air hockey presence sweep alarm.", error);
    }
  }

  private async handleClientMessage(ws: WebSocket, msg: AhClientToServerMessage): Promise<void> {
    const connections = await this.getConnections();
    const connection = connections[msg.connId];
    if (!connection) {
      this.send(ws, { type: "error", message: "unknown-connection" });
      return;
    }

    connection.lastSeen = Date.now();

    const game = await this.ensureGame();

    switch (msg.type) {
      case "join": {
        if (game.matchOver) {
          this.send(ws, { type: "error", message: "game-over" });
          return;
        }
        const name = (msg.name ?? "").trim() || connection.email.split("@")[0] || "player";
        connection.name = name;
        await this.ctx.storage.put("connections", connections);

        const role = this.assignRole(game, connection.email, name, connection.preferredRole);
        game.status = ahStatusOf(game);
        await this.ctx.storage.put("game", game);

        this.send(ws, { type: "state", snapshot: ahToSnapshot(game) });
        this.broadcast({
          type: "playerJoined",
          players: game.players,
          message: `${name} (${role}) joined`,
        });
        void this.scheduleSweep();
        break;
      }

      case "resign": {
        const role = this.roleOf(game, connection.email);
        if (role === "spectator") {
          this.send(ws, { type: "error", message: "spectator" });
          return;
        }
        if (game.matchOver) return;
        game.state.winner = role === "p1" ? 2 : 1;
        game.matchOver = true;
        game.status = ahStatusOf(game);
        await this.ctx.storage.put("game", game);
        this.broadcast({ type: "state", snapshot: ahToSnapshot(game) });
        this.broadcast({ type: "end", result: ahResultOf(game), status: game.status });
        break;
      }

      case "rematch": {
        const role = this.roleOf(game, connection.email);
        if (role === "spectator" || !game.matchOver) return;
        game.rematch[role] = true;
        const ready = game.rematch.p1 && game.rematch.p2;
        if (ready) {
          game.state = createAhState();
          resetAhRound(game.state, Math.random() < 0.5 ? -1 : 1);
          game.rematch = { p1: false, p2: false };
          game.timeLeftMs = AH_MATCH_MS;
          game.matchOver = false;
          game.endReason = null;
          game.status = ahStatusOf(game);
          await this.ctx.storage.put("game", game);
          this.broadcast({ type: "state", snapshot: ahToSnapshot(game) });
        } else {
          await this.ctx.storage.put("game", game);
          this.broadcast({ type: "rematchUpdate", rematch: game.rematch });
        }
        break;
      }

      case "ping":
        this.send(ws, { type: "pong" });
        break;
      default:
        break;
    }
  }

  private clampToField(value: number): number {
    return Math.max(-50, Math.min(890, value));
  }

  private startLoop(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      void this.tick();
    }, AH_TICK_MS);
  }

  private stopLoop(): void {
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private async tick(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) {
      this.stopLoop();
      return;
    }

    const connections = await this.getConnections();
    const game = await this.ensureGame();

    if (game.players.p1 && game.players.p2 && !game.matchOver) {
      const inputFor = (role: "p1" | "p2"): AhInput => {
        const player = game.players[role];
        if (!player) return { mx: null, my: null, dx: 0, dy: 0 };
        const connId = Object.keys(connections).find(
          (id) => normalizeEmail(connections[id]?.email ?? "") === normalizeEmail(player.email),
        );
        const input = connId ? this.pendingInputs.get(connId) : undefined;
        if (connId) this.pendingInputs.delete(connId);
        return input ?? { mx: null, my: null, dx: 0, dy: 0 };
      };

      const a = inputFor("p1");
      const b = inputFor("p2");
      stepAirHockey(game.state, AH_TICK_MS / 1000, { a, b });

      if (game.state.winner) {
        game.matchOver = true;
      } else {
        game.timeLeftMs = Math.max(0, game.timeLeftMs - AH_TICK_MS);
        if (game.timeLeftMs <= 0) {
          game.endReason = "timeup";
          game.matchOver = true;
        }
      }
      game.status = ahStatusOf(game);

      this.tickCount += 1;
      if (game.state.winner || this.tickCount % AH_PERSIST_EVERY_TICKS === 0) {
        await Promise.all([
          this.ctx.storage.put("game", game),
          this.ctx.storage.put("connections", connections),
        ]);
      }
      this.broadcast({ type: "state", snapshot: ahToSnapshot(game) });
      if (game.endReason === "timeup") {
        this.broadcast({
          type: "end",
          result: ahResultOf(game),
          status: game.status,
        });
      }
    }

    if (this.ctx.getWebSockets().length > 0) {
      this.startLoop();
    }
  }

  private async handleConnectionClosed(ws: WebSocket): Promise<void> {
    const connId = this.getConnectionId(ws);
    this.wsToConnId.delete(ws);
    this.pendingInputs.delete(connId ?? "");
    if (!connId) return;

    await this.ctx.blockConcurrencyWhile(async () => {
      const connections = await this.getConnections();
      if (connections[connId]) {
        delete connections[connId];
        await this.ctx.storage.put("connections", connections);
      }
      await this.refreshOnline(connections);
      void this.scheduleSweep();
    });
  }

  private async refreshOnline(connections: StoredAhConnections): Promise<void> {
    const stored = await this.ensureGame();
    if (!stored) return;
    const now = Date.now();
    let changed = false;
    for (const role of ["p1", "p2"] as const) {
      const player = stored.players[role];
      if (!player) continue;
      const isOnline = Object.values(connections).some(
        (conn) =>
          normalizeEmail(conn.email) === normalizeEmail(player.email) &&
          now - conn.lastSeen < GAME_STALE_MS,
      );
      if (player.online !== isOnline) {
        player.online = isOnline;
        changed = true;
      }
    }
    if (changed) {
      stored.status = ahStatusOf(stored);
      await this.ctx.storage.put("game", stored);
      this.broadcast({ type: "state", snapshot: ahToSnapshot(stored) });
    }
  }

  private async getOrCreateSnapshot(gameId: string): Promise<AhMatchSnapshot> {
    if (this.cachedGame) return ahToSnapshot(this.cachedGame);
    const stored = await this.ctx.storage.get<StoredAhGame>("game");
    if (stored) {
      this.cachedGame = this.normalizeGameOnLoad(stored);
      return ahToSnapshot(stored);
    }
    const fresh = this.createFreshGame(gameId);
    this.cachedGame = fresh;
    await this.ctx.storage.put("game", fresh);
    return ahToSnapshot(fresh);
  }

  private createFreshGame(gameId: string): StoredAhGame {
    const state = createAhState();
    return {
      gameId,
      players: { p1: null, p2: null },
      state,
      status: "waiting",
      createdAt: Date.now(),
      rematch: { p1: false, p2: false },
      timeLeftMs: AH_MATCH_MS,
      matchOver: false,
      endReason: null,
    };
  }

  private normalizeGameOnLoad(stored: StoredAhGame): StoredAhGame {
    if (typeof stored.timeLeftMs !== "number") {
      stored.timeLeftMs = AH_MATCH_MS;
      stored.matchOver = Boolean(stored.state.winner);
      stored.endReason = null;
      delete (stored as Partial<StoredAhGame> & { autoRestartAt?: unknown }).autoRestartAt;
    }
    return stored;
  }

  private async ensureGame(): Promise<StoredAhGame> {
    if (this.cachedGame) return this.cachedGame;
    const stored = await this.ctx.storage.get<StoredAhGame>("game");
    if (stored) {
      this.cachedGame = this.normalizeGameOnLoad(stored);
      return this.cachedGame;
    }
    const fresh = this.createFreshGame(this.detectMatchId());
    this.cachedGame = fresh;
    await this.ctx.storage.put("game", fresh);
    return fresh;
  }

  private async getConnections(): Promise<StoredAhConnections> {
    if (this.cachedConnections) return this.cachedConnections;
    const loaded = (await this.ctx.storage.get<StoredAhConnections>("connections")) ?? {};
    this.cachedConnections = loaded;
    return loaded;
  }

  private async scheduleSweep(): Promise<void> {
    try {
      const existing = await this.ctx.storage.getAlarm();
      if (existing !== null) return;
      await this.ctx.storage.setAlarm(Date.now() + GAME_STALE_MS + 5000);
    } catch (error) {
      console.warn("Failed to schedule air hockey presence sweep.", error);
    }
  }

  private detectMatchId(): string {
    try {
      const namespace = this.env.AIR_HOCKEY_DO;
      if (namespace) return namespace.get(this.ctx.id).name || "";
    } catch (error) {
      console.warn("Failed to resolve air hockey match id from DO context.", error);
    }
    return "";
  }

  private roleOf(game: StoredAhGame, email: string): "p1" | "p2" | "spectator" {
    const normalizedEmail = normalizeEmail(email);
    if (game.players.p1 && normalizeEmail(game.players.p1.email) === normalizedEmail) return "p1";
    if (game.players.p2 && normalizeEmail(game.players.p2.email) === normalizedEmail) return "p2";
    return "spectator";
  }

  private assignRole(
    game: StoredAhGame,
    email: string,
    name: string,
    preferredRole: AhPreferredRole | null = null,
  ): "p1" | "p2" | "spectator" {
    const existing = this.roleOf(game, email);
    if (existing === "p1" || existing === "p2") {
      const player = game.players[existing];
      if (player) {
        player.online = true;
        player.name = name;
      }
      return existing;
    }
    const role: "p1" | "p2" | "spectator" =
      preferredRole === "p1" && !game.players.p1
        ? "p1"
        : preferredRole === "p2" && !game.players.p2
          ? "p2"
          : !game.players.p1
            ? "p1"
            : !game.players.p2
              ? "p2"
              : "spectator";
    if (role === "p1" || role === "p2") {
      game.players[role] = { email, name, role, online: true };
    }
    return role;
  }

  private broadcast(message: AhServerToClientMessage): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch (error) {
        console.warn("Failed to broadcast to an air hockey websocket.", error);
      }
    }
  }

  private send(ws: WebSocket, message: AhServerToClientMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.warn("Failed to send an air hockey websocket message.", error);
    }
  }

  private getConnectionId(ws: WebSocket): string | null {
    const mapped = this.wsToConnId.get(ws);
    if (mapped) return mapped;
    const tagged = this.ctx.getWebSocketTags(ws)[0];
    if (!tagged) return null;
    this.wsToConnId.set(ws, tagged);
    return tagged;
  }

  private parseMessage(
    message: string | ArrayBuffer | ArrayBufferView,
  ): AhClientToServerMessage | null {
    let text: string;
    if (typeof message === "string") {
      text = message;
    } else if (message instanceof ArrayBuffer) {
      text = new TextDecoder().decode(new Uint8Array(message));
    } else {
      const bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
      text = new TextDecoder().decode(bytes);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      if (typeof (parsed as { type?: unknown }).type !== "string") return null;
      return parsed as AhClientToServerMessage;
    } catch {
      return null;
    }
  }
}
