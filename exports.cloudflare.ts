import { DurableObject } from "cloudflare:workers";
import type { DurableObjectNamespace, WebSocket } from "cloudflare:workers";

import {
  getMessagesSecret,
  messagesDoName,
  normalizeMessagesEmail,
  parseCookieHeader,
  verifySessionToken,
  MESSAGES_COOKIE,
  MIRROR_HEADER,
  SESSION_EMAIL_HEADER,
  SESSION_HEADER,
} from "./src/lib/messages-auth";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_VALUE_CHARS,
  MAX_CALLS_PER_CHAT,
  MAX_CHATS,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_MESSAGES_PER_CHAT,
  MAX_TEXT_LENGTH,
  initialsForName,
  isOnlineAt,
  normalizePresenceStatus,
  splitFriendRequests,
  type CallOutcome,
  type CallRecord,
  type CallRoster,
  type CallSignal,
  type ChatContact,
  type ChatMessage,
  type FriendRequest,
  type FriendsSnapshot,
  type FriendshipStatus,
  type IncomingAttachment,
  type MessageAttachment,
  type MessageChat,
  type MessagesProfile,
  type MessagesSnapshot,
  type MessagePush,
  type TypingState,
  liveTyping,
} from "./src/lib/messages-protocol";

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

type MessagesEnv = {
  AUTH_USERS_KV?: KvLike;
  MESSAGES_DO?: DurableObjectNamespace;
};

const ATTACHMENT_PREFIX = "att:";
const PROFILE_KEY = "profile";
const CONTACTS_KEY = "contacts";
const CHAT_PREFIX = "chat:";
const CHAT_INDEX_KEY = "chatIndex";
/** A call in progress, kept only as long as the call is. */
const CALL_PREFIX = "call:";
const REV_KEY = "rev";
const ATTACHMENT_INDEX_KEY = "attachments";
const FRIEND_PREFIX = "friend:";
const FRIEND_INDEX_KEY = "friendIndex";
const TYPING_KEY = "typing";
const MAX_FRIEND_RECORDS = 500;

type StoredAttachment = {
  id: string;
  mimeType: string;
  name: string;
  /** Base64 payload without the data-url prefix. */
  data: string;
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/** Only an inline data url is stored; anything else is dropped. */
const readAvatarDataUrl = (value: unknown) =>
  typeof value === "string" && value.startsWith("data:image/") ? value.slice(0, 200_000) : null;

const sanitizeAttachmentMeta = (value: unknown): MessageAttachment | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const id = String(entry["id"] ?? "").trim();
  if (!id || id.length > 80) return null;
  const mimeType = String(entry["mimeType"] ?? "application/octet-stream")
    .trim()
    .slice(0, 80);
  const rawKind = entry["kind"];
  const kind = rawKind === "image" || mimeType.startsWith("image/") ? "image" : "file";
  const size = Number(entry["size"]);
  return {
    id,
    kind,
    name:
      String(entry["name"] ?? "file")
        .trim()
        .slice(0, 120) || "file",
    mimeType: mimeType || "application/octet-stream",
    size: Number.isFinite(size) && size > 0 ? Math.round(size) : 0,
    stored: Boolean(entry["stored"]),
  };
};

/**
 * A finished call, taken apart and put back together from what a client claims.
 *
 * The record is written by a phone, so it is checked the same way an attachment
 * is: bounded strings, bounded numbers, and a fixed set of outcomes. A row that
 * cannot be understood is not written at all rather than half written.
 */
const sanitizeCallRecord = (
  value: unknown,
  fallbackCallId: string,
  peerEmail: string,
): CallRecord | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const callId = String(entry["callId"] ?? fallbackCallId)
    .trim()
    .slice(0, 80);
  if (!callId) return null;
  const outcomes: CallOutcome[] = [
    "completed",
    "missed",
    "declined",
    "cancelled",
    "busy",
    "failed",
  ];
  const outcome = outcomes.includes(entry["outcome"] as CallOutcome)
    ? (entry["outcome"] as CallOutcome)
    : "missed";
  const at = Number(entry["at"]);
  const endedAt = Number(entry["endedAt"]);
  const started = Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now();
  const stopped = Number.isFinite(endedAt) && endedAt > 0 ? Math.round(endedAt) : started;
  const duration = Number(entry["durationMs"]);
  const caller = String(entry["caller"] ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  return {
    callId,
    caller: caller || peerEmail,
    starts: entry["starts"] === "video" ? "video" : "audio",
    at: started,
    endedAt: Math.max(started, stopped),
    // A call that ran cannot have been shorter than a second, and one that was
    // never answered is exactly zero.
    durationMs: outcome === "completed" ? Math.max(0, Math.round(duration) || 0) : 0,
    outcome,
    endedBy:
      String(entry["endedBy"] ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 120) || peerEmail,
  };
};

/** The rows already in storage, checked again on the way out. */
const sanitizeCallRecords = (value: unknown, peerEmail = ""): CallRecord[] => {
  if (!Array.isArray(value)) return [];
  const records: CallRecord[] = [];
  for (const entry of value.slice(-MAX_CALLS_PER_CHAT)) {
    const record = sanitizeCallRecord(entry, "", peerEmail);
    if (record) records.push(record);
  }
  return records;
};

/** A call as this object holds it: who is in it, and in what order. */
type CallSession = {
  callId: string;
  host: string;
  chatId: string;
  starts: "audio" | "video";
  createdAt: number;
  participants: Array<{
    email: string;
    order: number;
    status: "invited" | "active" | "left";
  }>;
  endedAt?: number;
  endedBy?: string;
  reason?: string;
};

/**
 * One object per account. Holds that account's profile, contact list and the
 * mirrored copy of every conversation they take part in.
 *
 * Reads and writes are serialised through blockConcurrencyWhile so concurrent
 * devices on the same account cannot interleave a read-modify-write.
 */
export class MessagesDO extends DurableObject<MessagesEnv> {
  private readonly connsById = new Map<WebSocket, string>();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/messages/, "") || "/";

    const isUpgrade = (request.headers.get("Upgrade") ?? "").toLowerCase() === "websocket";
    if (isUpgrade) {
      return this.handleUpgrade(request, url);
    }

    const identity = await this.resolveIdentity(request);
    if (!identity) return jsonResponse({ error: "unauthorized" }, 401);

    if (path === "/attachment") {
      return this.handleAttachment(request, url);
    }

    try {
      if (request.method === "GET") {
        // A cheap profile-only read used to refresh contact presence without
        // pulling a whole conversation history.
        if (path === "/profile") {
          const profile = await this.ctx.blockConcurrencyWhile(() => this.readProfile());
          return jsonResponse(profile);
        }
        if (path === "/friend/list") {
          const friends = await this.ctx.blockConcurrencyWhile(() =>
            this.readFriendsSnapshot(identity),
          );
          return jsonResponse({ ok: true, friends });
        }
        const snapshot = await this.ctx.blockConcurrencyWhile(() => this.readSnapshot());
        return jsonResponse(snapshot);
      }

      const payload = (await request.json()) as Record<string, unknown>;
      // Set by the gateway when it mirrors somebody else's change into this
      // object, and stripped from anything a client sends. It travels as an
      // argument rather than in the payload so a body field cannot stand in
      // for it.
      const mirrored = request.headers.get(MIRROR_HEADER) === "1";
      const result = await this.ctx.blockConcurrencyWhile(() =>
        this.applyWrite(path, payload, mirrored, identity),
      );
      // Typing pushes its own precise frame, so the generic notice would be a
      // second broadcast for the same change and would drag a full snapshot
      // re-sync in behind every typing signal.
      if (!result.silent) this.broadcast({ type: "sync", rev: result.rev });
      // Contact fan-out touches other objects, so it must not hold this one.
      if (result.fanout) void this.mirrorPresenceToContacts(identity);
      return jsonResponse(result);
    } catch (error) {
      console.warn("Messages DO write failed.", error);
      return jsonResponse({ error: "write-failed" }, 500);
    }
  }

  // ---------------------------------------------------------------- identity

  /**
   * The SSR service verifies the HttpOnly session cookie and forwards the
   * resolved identity plus the signing secret as headers, so the object never
   * needs its own KV binding to agree on the secret. Direct requests fall back
   * to reading the cookie here.
   */
  private async resolveIdentity(request: Request): Promise<string | null> {
    const injected = request.headers.get(SESSION_EMAIL_HEADER)?.trim();
    const injectedSecret = request.headers.get(SESSION_HEADER)?.trim();
    const secret = injectedSecret || (await getMessagesSecret(this.env.AUTH_USERS_KV));
    if (!secret) return null;

    if (injected) {
      // A forwarded identity is only trustworthy when paired with the secret,
      // which only the SSR can supply.
      return injectedSecret ? normalizeMessagesEmail(injected) : null;
    }

    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const verified = await verifySessionToken(secret, cookies[MESSAGES_COOKIE] ?? null);
    return verified.ok ? verified.email : null;
  }

  private async handleUpgrade(request: Request, url: URL): Promise<Response> {
    const identity = await this.resolveIdentity(request);
    const connId = (url.searchParams.get("cid") ?? "").trim();
    if (!identity || !connId) return jsonResponse({ error: "unauthorized" }, 401);

    const pair = new WebSocketPair();
    const serverWs = pair[0];
    this.connsById.set(serverWs, connId);
    this.ctx.acceptWebSocket(serverWs, [connId]);

    // The critical section must stay pure storage. Holding the concurrency gate
    // across calls to other objects deadlocks this object when a peer is slow,
    // which workerd resolves by resetting the whole instance.
    const flipped = await this.ctx.blockConcurrencyWhile(async () => {
      // Seed the owner identity on first use: the object is addressed by a hash
      // of the email, so this is the only place the plaintext email is known.
      const profile = await this.readProfile();
      if (profile.email !== identity) {
        await this.writeProfile({ ...profile, email: identity });
      }
      return this.touchPresence();
    });

    if (flipped) {
      const rev = await this.bumpRev();
      this.broadcast({ type: "sync", rev });
      // Fan-out happens after the gate is released.
      void this.mirrorPresenceToContacts(identity);
    }

    return new Response(null, { status: 101, webSocket: pair[1] } as ResponseInit);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleClosed(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleClosed(ws);
  }

  private async handleClosed(ws: WebSocket): Promise<void> {
    this.connsById.delete(ws);
    if (this.connsById.size > 0) return;

    try {
      // Read inside the gate, fan out outside it, for the same reason as
      // handleUpgrade: never hold the lock across another object's I/O.
      const email = await this.ctx.blockConcurrencyWhile(async () => {
        const profile = await this.readProfile();
        if (!profile.email) return "";
        await this.touchPresence();
        await this.writeProfile({ ...(await this.readProfile()), lastSeenAt: 0, online: false });
        return profile.email;
      });
      if (email) void this.mirrorPresenceToContacts(email);
    } catch (error) {
      console.warn("Failed to record messages presence offline.", error);
    }
  }

  // ----------------------------------------------------------------- storage

  private async readProfile(): Promise<MessagesProfile> {
    const stored = await this.ctx.storage.get<MessagesProfile>(PROFILE_KEY);
    const now = Date.now();
    if (!stored) {
      return {
        email: "",
        name: "",
        about: "",
        accent: "#1DB954",
        avatar: null,
        online: true,
        lastSeenAt: now,
        status: "online",
      };
    }
    return {
      email: normalizeMessagesEmail(stored.email ?? ""),
      name: String(stored.name ?? ""),
      about: String(stored.about ?? ""),
      accent: String(stored.accent ?? "#1DB954"),
      status: normalizePresenceStatus(stored.status),
      avatar: typeof stored.avatar === "string" && stored.avatar ? stored.avatar : null,
      online: isOnlineAt(stored.lastSeenAt ?? 0, now),
      lastSeenAt: Number(stored.lastSeenAt) || 0,
    };
  }

  private async writeProfile(profile: MessagesProfile) {
    await this.ctx.storage.put(PROFILE_KEY, profile);
  }

  /** Refreshes lastSeenAt; returns true when the online flag flipped. */
  private async touchPresence(): Promise<boolean> {
    const profile = await this.readProfile();
    const wasOnline = profile.online;
    profile.lastSeenAt = Date.now();
    profile.online = true;
    await this.writeProfile(profile);
    return !wasOnline;
  }

  private async bumpRev(): Promise<number> {
    const rev = (Number(await this.ctx.storage.get(REV_KEY)) || 0) + 1;
    await this.ctx.storage.put(REV_KEY, rev);
    return rev;
  }

  private async readContacts(): Promise<ChatContact[]> {
    const stored = await this.ctx.storage.get<ChatContact[]>(CONTACTS_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  private async writeContacts(contacts: ChatContact[]) {
    await this.ctx.storage.put(CONTACTS_KEY, contacts.slice(0, 500));
  }

  private async readChatIds(): Promise<string[]> {
    const stored = await this.ctx.storage.get<string[]>(CHAT_INDEX_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  private async readChat(chatId: string): Promise<MessageChat | null> {
    return (await this.ctx.storage.get<MessageChat>(`${CHAT_PREFIX}${chatId}`)) ?? null;
  }

  private async writeChat(chat: MessageChat) {
    const trimmed: MessageChat = {
      ...chat,
      messages: chat.messages.slice(-MAX_MESSAGES_PER_CHAT),
      ...(chat.calls?.length
        ? { calls: sanitizeCallRecords(chat.calls).slice(-MAX_CALLS_PER_CHAT) }
        : {}),
    };
    await this.ctx.storage.put(`${CHAT_PREFIX}${chat.id}`, trimmed);

    const ids = await this.readChatIds();
    const next = [trimmed.id, ...ids.filter((id) => id !== trimmed.id)].slice(0, MAX_CHATS);
    await this.ctx.storage.put(CHAT_INDEX_KEY, next);
  }

  private async deleteChat(chatId: string) {
    await this.ctx.storage.delete(`${CHAT_PREFIX}${chatId}`);
    const ids = await this.readChatIds();
    await this.ctx.storage.put(
      CHAT_INDEX_KEY,
      ids.filter((id) => id !== chatId),
    );
  }

  private async readSnapshot(): Promise<MessagesSnapshot> {
    const [profile, contacts, chatIds, rev] = await Promise.all([
      this.readProfile(),
      this.readContacts(),
      this.readChatIds(),
      this.ctx.storage.get(REV_KEY),
    ]);

    const chats: MessageChat[] = [];
    for (const id of chatIds) {
      const chat = await this.readChat(id);
      if (chat) chats.push(chat);
    }

    const now = Date.now();
    return {
      profile: {
        ...profile,
        online: profile.lastSeenAt > 0 && isOnlineAt(profile.lastSeenAt, now),
      },
      contacts: contacts.map((contact) => ({
        ...contact,
        online: isOnlineAt(contact.lastSeenAt, now),
      })),
      chats,
      rev: Number(rev) || 0,
      serverTime: now,
      typing: liveTyping(await this.readTyping(), now),
    };
  }

  // -------------------------------------------------------------- typing

  private async readTyping(): Promise<TypingState[]> {
    const stored = await this.ctx.storage.get<TypingState[]>(TYPING_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  /**
   * Records that a peer is composing in a conversation. Kept in the object
   * rather than only on the socket so a device that joins mid-compose (a
   * freshly opened laptop) still renders the indicator.
   */
  private async setTyping(payload: Record<string, unknown>) {
    const chatId = String(payload["chatId"] ?? "")
      .trim()
      .slice(0, 80);
    const peerEmail = normalizeMessagesEmail(String(payload["peerEmail"] ?? ""));
    if (!chatId || !peerEmail) {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }

    const now = Date.now();
    const next = liveTyping(await this.readTyping(), now).filter(
      (entry) => !(entry.chatId === chatId && entry.peerEmail === peerEmail),
    );
    const stopped = payload["typing"] === false;
    if (!stopped) next.push({ chatId, peerEmail, at: now });

    await this.ctx.storage.put(TYPING_KEY, next.slice(-50));

    if (!stopped) {
      this.broadcast({ type: "typing", chatId, peerEmail, at: now });
    } else {
      // Let the other side clear its bubble right away.
      this.broadcast({ type: "sync", rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 });
    }

    // The frame above is the whole notification for this path.
    return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0, silent: true };
  }

  // ------------------------------------------------------------------ writes

  private async applyWrite(
    path: string,
    payload: Record<string, unknown>,
    mirrored = false,
    /** Whose object this is, as the gateway resolved it rather than as claimed. */
    sender = "",
  ): Promise<{ ok: boolean; rev: number; silent?: boolean; fanout?: boolean }> {
    switch (path) {
      case "/message":
        return this.writeMessage(payload);
      case "/contact":
        return this.writeContact(payload);
      case "/contact/remove":
        return this.removeContact(payload);
      case "/profile":
        return this.writeOwnProfile(payload);
      /**
       * Pushes the profile, including the chosen presence, out to every contact.
       * The fan-out is cross-object I/O, so it runs after the write has left the
       * concurrency gate rather than inside it.
       */
      case "/mirror":
        return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0, fanout: true };
      case "/read":
        return this.markRead(payload);
      case "/message/change":
        return this.changeMessage(payload, mirrored);
      case "/call":
        return this.relayCallSignal(payload, mirrored, sender);
      case "/chat/remove":
        return this.removeChat(payload);
      case "/chat/ensure":
        return this.ensureChat(payload);
      case "/typing":
        return this.setTyping(payload);
      case "/presence":
        return this.setPresence(payload);
      case "/peer-presence":
        return this.applyPeerPresence(payload);
      case "/friend/upsert":
        return this.upsertFriend(payload);
      case "/friend/list":
        return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
      default:
        return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }
  }

  // ------------------------------------------------------------------ calls

  /**
   * Passes one call frame to this account's open sockets, and tells the gateway
   * whose objects it still has to reach.
   *
   * A call is a group now, so the object keeps a small session beside the chat:
   * who is in it, in what order, and who is still there. The frames themselves
   * are only routed, never read for anything else, because the people holding
   * them are the ones who know what a session description means.
   *
   * `silent` keeps the generic notice off: the frame itself is the notification,
   * and a full snapshot re-sync in behind every candidate would be waste.
   */
  private async relayCallSignal(payload: Record<string, unknown>, mirrored: boolean, sender = "") {
    const rev = async () => Number(await this.ctx.storage.get(REV_KEY)) || 0;
    const chatId = String(payload["chatId"] ?? "")
      .trim()
      .slice(0, 80);
    const callId = String(payload["callId"] ?? "")
      .trim()
      .slice(0, 80);
    const kind = String(payload["kind"] ?? "");
    const allowed = new Set<CallSignal["kind"]>([
      "begin",
      "invite",
      "accept",
      "decline",
      "leave",
      "end",
      "offer",
      "answer",
      "candidate",
      "renegotiate",
      "state",
      "log",
    ]);
    if (!chatId || !callId || !allowed.has(kind as CallSignal["kind"])) {
      return { ok: false, rev: await rev(), silent: true };
    }

    const chat = await this.readChat(chatId);
    if (!chat) return { ok: false, rev: await rev(), silent: true };

    /**
     * A finished call is written into the history rather than passed on to
     * whoever is ringing: nobody is ringing any more, and the record belongs in
     * the conversation. It lands in both objects through the gateway, so both
     * sides read the same row instead of each keeping its own.
     */
    if (kind === "log") {
      const record = sanitizeCallRecord(payload["log"], callId, chat.peerEmail);
      if (!record) return { ok: false, rev: await rev(), silent: true };
      const kept = (chat.calls ?? []).filter((entry) => entry.callId !== record.callId);
      chat.calls = [...kept, record].slice(-MAX_CALLS_PER_CHAT);
      await this.writeChat(chat);
      return {
        ok: true,
        rev: await this.bumpRev(),
        silent: true,
        peerEmail: chat.peerEmail,
        mirrored,
      };
    }

    const to = normalizeEmail(String(payload["to"] ?? ""));
    const session = await this.applyCallFrame({ callId, chatId, kind, to, sender, payload });
    if (!session) return { ok: false, rev: await rev(), silent: true };

    const signal: CallSignal = {
      kind: kind as CallSignal["kind"],
      callId,
      chatId,
      // Stamped by the object, from the identity the gateway already resolved.
      // Every frame comes back to the sender's own devices as well, and this is
      // how a phone tells that echo from the other person speaking.
      ...(sender ? { from: sender } : {}),
      ...(to ? { to } : {}),
      ...(kind === "invite" ? { starts: payload["starts"] === "video" ? "video" : "audio" } : {}),
      ...(payload["description"] !== undefined ? { description: payload["description"] } : {}),
      ...(payload["candidate"] !== undefined ? { candidate: payload["candidate"] } : {}),
      ...(typeof payload["mic"] === "boolean" ? { mic: payload["mic"] } : {}),
      ...(typeof payload["camera"] === "boolean" ? { camera: payload["camera"] } : {}),
      ...(typeof payload["screen"] === "boolean" ? { screen: payload["screen"] } : {}),
      ...(typeof payload["reason"] === "string" ? { reason: payload["reason"].slice(0, 40) } : {}),
    };

    // The caller's own devices get the frame too, so a second laptop joins the
    // call it started instead of ringing the account again.
    this.broadcast({ type: "call", signal });
    // A membership change travels beside the frame, so a phone that was told
    // "you are in a call" also learns who else is in it.
    if (session.roster) this.broadcast({ type: "roster", roster: session.roster });
    return {
      ok: true,
      rev: await rev(),
      silent: true,
      peerEmail: chat.peerEmail,
      mirrored,
      /** The other objects the gateway still has to write this frame into. */
      peers: session.peers,
      ...(session.roster ? { roster: session.roster } : {}),
      ...(session.members ? { members: session.members } : {}),
    };
  }

  // ------------------------------------------------------------------ calls

  /** A call as this object holds it: who is in it, and in what order. */
  private async readCallSession(callId: string) {
    return (await this.ctx.storage.get<CallSession>(`${CALL_PREFIX}${callId}`)) ?? null;
  }

  /**
   * Applies one frame to the call, and works out who else has to be told.
   *
   * The object is a post office, not a switchboard: it keeps the list of who is
   * in the call, checks that the sender is one of them, and returns the other
   * addresses. Who offers the connection to whom is decided by the two phones,
   * from the order kept here, so they never both offer at once.
   */
  private async applyCallFrame(input: {
    callId: string;
    chatId: string;
    kind: string;
    to: string;
    sender: string;
    payload: Record<string, unknown>;
  }): Promise<{ peers: string[]; roster?: CallRoster; members?: string[] } | null> {
    const { callId, chatId, kind, to, sender } = input;
    const now = Date.now();

    /** The roster, as the clients read it. */
    const rosterOf = (session: CallSession): CallRoster => ({
      callId: session.callId,
      host: session.host,
      starts: session.starts,
      createdAt: session.createdAt,
      participants: session.participants.map((entry) => ({
        email: entry.email,
        order: entry.order,
        status: entry.status,
      })),
    });

    // A new call, placed by whoever pressed the button. The host is the first
    // participant, which is what fixes the order everybody else follows.
    if (kind === "begin") {
      const starts = input.payload["starts"] === "video" ? "video" : "audio";
      const session: CallSession = {
        callId,
        host: sender,
        chatId,
        starts,
        createdAt: now,
        participants: [{ email: sender, order: 0, status: "active" }],
      };
      await this.ctx.storage.put(`${CALL_PREFIX}${callId}`, session);
      return { peers: to && to !== sender ? [to] : [], roster: rosterOf(session) };
    }

    const session = await this.readCallSession(callId);
    if (!session) return null;
    // A frame from someone who is not in this call is not relayed, which is also
    // what keeps one account from driving another account's call.
    const member = session.participants.find((entry) => entry.email === sender);
    if (!member) return null;
    if (session.endedAt && kind !== "end") {
      // A late frame for a call that is over is answered once, so the phone that
      // sent it stops ringing rather than waiting for a reply that never comes.
      if (kind === "invite" || kind === "accept") return { peers: to && to !== sender ? [to] : [] };
      return { peers: [] };
    }

    // Who to reach, worked out before the call is marked as over: an end that
    // filters out everybody it just marked as gone would tell nobody.
    const others = session.participants
      .filter((entry) => entry.email !== sender && entry.status !== "left")
      .map((entry) => entry.email);

    let changed = false;
    if (kind === "invite") {
      if (to && to !== sender && !session.participants.some((entry) => entry.email === to)) {
        const order = session.participants.reduce((most, entry) => Math.max(most, entry.order), 0);
        session.participants.push({ email: to, order: order + 1, status: "invited" });
        changed = true;
      }
    }
    if (kind === "accept" && member.status !== "active") {
      member.status = "active";
      changed = true;
    }
    if (kind === "decline" || kind === "leave") {
      member.status = "left";
      changed = true;
    }
    if (kind === "end") {
      session.endedAt = now;
      session.endedBy = sender;
      session.reason = String(input.payload["reason"] ?? "hangup").slice(0, 40);
      // Everybody still in it is now gone from it.
      for (const entry of session.participants) {
        if (entry.status !== "left") entry.status = "left";
      }
      changed = true;
    }

    if (changed) await this.ctx.storage.put(`${CALL_PREFIX}${callId}`, session);

    // A frame with a name on it goes to that person; anything else goes to
    // everyone else who is still in the call. A renegotiation notice is a name
    // on it too: only the pair of devices holding that link has to hear it.
    const directed =
      kind === "offer" || kind === "answer" || kind === "candidate" || kind === "renegotiate";
    const peers = to ? others.filter((email) => email === to) : directed ? [] : others;

    return {
      peers,
      ...(changed ? { roster: rosterOf(session) } : {}),
      // The frame that ends a call answers with everybody who was in it, so the
      // gateway can put the history in each of their own conversations.
      ...(kind === "end"
        ? {
            members: [
              ...new Set(
                session.participants
                  .map((entry) => entry.email)
                  .filter((email) => email && email !== sender),
              ),
            ],
          }
        : {}),
    };
  }

  // ---------------------------------------------------------------- friends

  private async readFriendIds(): Promise<string[]> {
    const stored = await this.ctx.storage.get<string[]>(FRIEND_INDEX_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  private async readFriends(): Promise<FriendRequest[]> {
    const ids = await this.readFriendIds();
    const records: FriendRequest[] = [];
    for (const id of ids) {
      const record = await this.ctx.storage.get<FriendRequest>(`${FRIEND_PREFIX}${id}`);
      if (record) records.push(record);
    }
    return records;
  }

  /**
   * Writes one friendship record. The identical id is used in both objects, so
   * accept/reject from either side lands on the same row everywhere.
   */
  private async upsertFriend(payload: Record<string, unknown>) {
    const id = String(payload["id"] ?? "")
      .trim()
      .slice(0, 80);
    const fromEmail = normalizeMessagesEmail(String(payload["fromEmail"] ?? ""));
    const toEmail = normalizeMessagesEmail(String(payload["toEmail"] ?? ""));
    const status = payload["status"];
    if (!id || !fromEmail || !toEmail) {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }
    if (status !== "pending" && status !== "accepted" && status !== "rejected") {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }

    const now = Date.now();
    const existing = await this.ctx.storage.get<FriendRequest>(`${FRIEND_PREFIX}${id}`);
    const rawAvatar = payload["fromAvatar"];
    const fromName = String(payload["fromName"] ?? existing?.fromName ?? "")
      .trim()
      .slice(0, 80);
    const toName = String(payload["toName"] ?? existing?.toName ?? "")
      .trim()
      .slice(0, 80);

    const record: FriendRequest = {
      id,
      fromEmail,
      fromName,
      fromAvatar: readAvatarDataUrl(rawAvatar) ?? existing?.fromAvatar ?? null,
      toEmail,
      toName,
      status,
      createdAt: Number(existing?.createdAt) || now,
      updatedAt: now,
    };

    await this.ctx.storage.put(`${FRIEND_PREFIX}${id}`, record);
    const ids = await this.readFriendIds();
    if (!ids.includes(id)) {
      await this.ctx.storage.put(FRIEND_INDEX_KEY, [id, ...ids].slice(0, MAX_FRIEND_RECORDS));
    }
    return { ok: true, rev: await this.bumpRev() };
  }

  private async readFriendsSnapshot(me: string): Promise<FriendsSnapshot> {
    const records = await this.readFriends();
    return splitFriendRequests(records, me);
  }

  /**
   * Applies a presence/profile update pushed by a contact's object. Only the
   * contact entry is touched, so one account can never write another account's
   * profile or messages.
   */
  private async applyPeerPresence(payload: Record<string, unknown>) {
    const peerEmail = normalizeMessagesEmail(String(payload["peerEmail"] ?? ""));
    if (!peerEmail) return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };

    const contacts = await this.readContacts();
    const target = contacts.find((contact) => contact.peerEmail === peerEmail);
    if (!target) return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };

    const lastSeenAt = Number(payload["lastSeenAt"]) || 0;
    const online = payload["online"] === true && isOnlineAt(lastSeenAt);
    const name =
      String(payload["name"] ?? target.name)
        .trim()
        .slice(0, 80) || target.name;
    const rawAvatar = payload["avatar"];

    const updated: ChatContact = {
      ...target,
      name,
      initials: initialsForName(name),
      about: String(payload["about"] ?? target.about).slice(0, 160),
      accent: String(payload["accent"] ?? target.accent),
      avatar:
        typeof rawAvatar === "string" && rawAvatar.startsWith("data:image/")
          ? rawAvatar.slice(0, 400_000)
          : target.avatar,
      online,
      lastSeenAt,
      status: normalizePresenceStatus(payload["status"] ?? target.status),
    };

    // Nothing actually changed, so skip the write. Bumping the revision here
    // would push a sync frame to every device of this account for a no-op,
    // which is what makes the list look like it is refreshing in a loop.
    const unchanged =
      target.name === updated.name &&
      target.initials === updated.initials &&
      target.about === updated.about &&
      target.accent === updated.accent &&
      target.avatar === updated.avatar &&
      target.online === updated.online &&
      target.lastSeenAt === updated.lastSeenAt &&
      target.status === updated.status;
    if (unchanged) {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }

    await this.writeContacts(
      contacts.map((contact) => (contact.id === target.id ? updated : contact)),
    );
    const rev = await this.bumpRev();
    this.broadcast({
      type: "presence",
      profile: {
        email: peerEmail,
        name,
        online,
        lastSeenAt,
        status: updated.status,
      },
    });
    return { ok: true, rev };
  }

  private async writeMessage(payload: Record<string, unknown>) {
    const chatId = String(payload["chatId"] ?? "")
      .trim()
      .slice(0, 80);
    const peerEmail = normalizeMessagesEmail(String(payload["peerEmail"] ?? ""));
    const fromMe = payload["fromMe"] !== false;
    const text = String(payload["text"] ?? "")
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
    const messageId = String(payload["id"] ?? "")
      .trim()
      .slice(0, 80);
    const at = Number(payload["at"]);

    if (!chatId || !messageId) {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }

    const rawAttachments = Array.isArray(payload["attachments"])
      ? (payload["attachments"] as unknown[]).slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
      : [];
    const storedIds: string[] = [];

    for (const raw of rawAttachments) {
      const meta = sanitizeAttachmentMeta(raw);
      if (!meta) continue;
      const dataUrl = String((raw as Record<string, unknown>)["dataUrl"] ?? "");
      const comma = dataUrl.indexOf(",");
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
      if (!base64) continue;
      if (meta.kind === "image" && base64.length > MAX_ATTACHMENT_VALUE_CHARS) continue;
      if (meta.kind === "file" && base64.length > MAX_ATTACHMENT_VALUE_CHARS) continue;
      if (meta.size > MAX_IMAGE_BYTES || meta.size > MAX_FILE_BYTES) continue;

      const record: StoredAttachment = {
        id: meta.id,
        mimeType: meta.mimeType,
        name: meta.name,
        data: base64,
      };
      await this.ctx.storage.put(`${ATTACHMENT_PREFIX}${meta.id}`, record);
      storedIds.push(meta.id);

      const index = await this.ctx.storage.get<string[]>(ATTACHMENT_INDEX_KEY);
      await this.ctx.storage.put(
        ATTACHMENT_INDEX_KEY,
        [meta.id, ...(Array.isArray(index) ? index : []).filter((id) => id !== meta.id)].slice(
          0,
          2000,
        ),
      );
    }

    let chat = await this.readChat(chatId);
    if (!chat) {
      chat = {
        id: chatId,
        peerEmail,
        pinned: false,
        muted: false,
        updatedAt: Number.isFinite(at) ? at : Date.now(),
        messages: [],
      };
    }
    if (peerEmail) chat.peerEmail = peerEmail;

    // Idempotent: a retried send must not duplicate the message.
    if (chat.messages.some((message) => message.id === messageId)) {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }

    const attachments: MessageAttachment[] = rawAttachments
      .map(sanitizeAttachmentMeta)
      .filter((item): item is MessageAttachment => item !== null)
      .map((item) => ({ ...item, stored: storedIds.includes(item.id) }));

    const message: ChatMessage = {
      id: messageId,
      fromMe,
      text,
      at: Number.isFinite(at) ? at : Date.now(),
      status: fromMe ? "sent" : "read",
      ...(attachments.length ? { attachments } : {}),
    };

    chat.messages = [...chat.messages, message];
    chat.updatedAt = message.at;
    await this.writeChat(chat);
    return { ok: true, rev: await this.bumpRev() };
  }

  /**
   * Applies an edit or a deletion to one message.
   *
   * The row is a tombstone rather than a removal, and the gateway mirrors the
   * same call into the peer's object, so an edit or a delete converges on every
   * device of both participants through the next sync frame.
   *
   * `mirrored` is decided by the gateway from a request header it strips from
   * client traffic, never from the body. It is what lets a change reach the copy
   * the peer holds: there the author's message is stored with `fromMe: false`, so
   * the author check below would otherwise refuse it.
   */
  private async changeMessage(payload: Record<string, unknown>, mirrored: boolean) {
    const chatId = String(payload["chatId"] ?? "")
      .trim()
      .slice(0, 80);
    const messageId = String(payload["id"] ?? "")
      .trim()
      .slice(0, 80);
    const action = String(payload["action"] ?? "");
    // A rejected or repeated change is silent: no revision, so no device is told
    // to re-read a snapshot that would come back identical.
    const quiet = async (peerEmail = "") => ({
      ok: true,
      rev: Number(await this.ctx.storage.get(REV_KEY)) || 0,
      silent: true,
      peerEmail,
    });

    if (!chatId || !messageId || (action !== "edit" && action !== "delete")) {
      return quiet();
    }

    const chat = await this.readChat(chatId);
    if (!chat) return quiet();

    const index = chat.messages.findIndex((message) => message.id === messageId);
    const target = index >= 0 ? chat.messages[index] : undefined;
    if (!target) return quiet();
    // A client may only change what it sent itself.
    if (!target.fromMe && !mirrored) {
      return {
        ok: false,
        rev: Number(await this.ctx.storage.get(REV_KEY)) || 0,
        silent: true,
      };
    }

    const now = Date.now();
    const text = String(payload["text"] ?? "")
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
    // An edit that empties the message is not a message, so it is refused here
    // as well as at the gateway rather than leaving a blank bubble behind.
    if (action === "edit" && !text) return quiet();

    const next: ChatMessage =
      action === "edit" ? { ...target, text, editedAt: now } : { ...target, deletedAt: now };

    // A retried change must not move the timestamp again. The peer is still
    // named, so a mirror lost the first time is retried here.
    const repeated =
      (action === "edit" && target.editedAt && target.text === next.text) ||
      (action === "delete" && target.deletedAt);
    if (repeated) return quiet(chat.peerEmail);

    chat.messages = chat.messages.map((message, position) => (position === index ? next : message));
    // The conversation keeps its own time: reordering it on an edit would make
    // the thread jump to the top of the list for a typo fix.
    await this.writeChat(chat);
    // The peer is answered from storage, not from the caller, so a client can
    // never name a third object to write into.
    return { ok: true, rev: await this.bumpRev(), peerEmail: chat.peerEmail };
  }

  private async writeContact(payload: Record<string, unknown>) {
    const id = String(payload["id"] ?? "")
      .trim()
      .slice(0, 80);
    const peerEmail = normalizeMessagesEmail(String(payload["peerEmail"] ?? ""));
    const name = String(payload["name"] ?? "")
      .trim()
      .slice(0, 80);
    if (!id || !name) {
      return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    }

    const rawAvatar = payload["avatar"];
    const avatar =
      typeof rawAvatar === "string" && rawAvatar.startsWith("data:image/")
        ? rawAvatar.slice(0, 400_000)
        : null;

    const contacts = await this.readContacts();
    const existing = contacts.find((contact) => contact.id === id);
    const now = Date.now();

    const contact: ChatContact = {
      id,
      peerEmail,
      name,
      initials: initialsForName(name),
      about: String(payload["about"] ?? existing?.about ?? "").slice(0, 160),
      accent: String(payload["accent"] ?? existing?.accent ?? "#1DB954"),
      avatar: avatar ?? existing?.avatar ?? null,
      online: existing?.online ?? false,
      lastSeenAt: existing?.lastSeenAt ?? 0,
      lastSeenLabel: existing?.lastSeenLabel ?? "",
      linked: peerEmail.length > 0,
      status: normalizePresenceStatus(existing?.status),
    };

    const next = existing
      ? contacts.map((item) => (item.id === id ? contact : item))
      : [contact, ...contacts];
    await this.writeContacts(next);
    return { ok: true, rev: await this.bumpRev() };
  }

  private async removeContact(payload: Record<string, unknown>) {
    const id = String(payload["id"] ?? "").trim();
    const contacts = await this.readContacts();
    const target = contacts.find((contact) => contact.id === id);
    await this.writeContacts(contacts.filter((contact) => contact.id !== id));
    if (target?.peerEmail) {
      const ids = await this.readChatIds();
      for (const chatId of ids) {
        const chat = await this.readChat(chatId);
        if (chat && chat.peerEmail === target.peerEmail) await this.deleteChat(chatId);
      }
    }
    return { ok: true, rev: await this.bumpRev() };
  }

  private async removeChat(payload: Record<string, unknown>) {
    const chatId = String(payload["chatId"] ?? "").trim();
    if (chatId) await this.deleteChat(chatId);
    return { ok: true, rev: await this.bumpRev() };
  }

  /**
   * Creates an empty conversation up front.
   *
   * A chat that only exists on the device would be wiped by the next sync,
   * taking any message written into it with it, so opening a conversation from
   * a friend list has to persist the row before anything is sent.
   */
  private async ensureChat(payload: Record<string, unknown>) {
    const chatId = String(payload["chatId"] ?? "")
      .trim()
      .slice(0, 80);
    const peerEmail = normalizeMessagesEmail(String(payload["peerEmail"] ?? ""));
    if (!chatId) return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };

    const existing = await this.readChat(chatId);
    if (!existing) {
      const now = Date.now();
      await this.writeChat({
        id: chatId,
        peerEmail,
        pinned: false,
        muted: false,
        updatedAt: now,
        messages: [],
      });
    }

    if (peerEmail) {
      const contacts = await this.readContacts();
      if (!contacts.some((contact) => contact.peerEmail === peerEmail)) {
        const name =
          String(payload["peerName"] ?? peerEmail)
            .trim()
            .slice(0, 80) || peerEmail;
        const avatar = payload["peerAvatar"];
        await this.writeContacts([
          {
            id: `contact-${peerEmail}`.slice(0, 80),
            peerEmail,
            name,
            initials: initialsForName(name),
            about: "",
            accent: "#1DB954",
            avatar: readAvatarDataUrl(avatar),
            online: false,
            lastSeenAt: 0,
            lastSeenLabel: "",
            linked: true,
            status: "online",
          },
          ...contacts,
        ]);
      }
    }

    return { ok: true, rev: await this.bumpRev() };
  }

  private async markRead(payload: Record<string, unknown>) {
    const chatId = String(payload["chatId"] ?? "").trim();
    const chat = chatId ? await this.readChat(chatId) : null;
    if (!chat) return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    let changed = false;
    chat.messages = chat.messages.map((message) => {
      if (message.fromMe || message.status === "read") return message;
      changed = true;
      return { ...message, status: "read" as const };
    });
    if (!changed) return { ok: true, rev: Number(await this.ctx.storage.get(REV_KEY)) || 0 };
    await this.writeChat(chat);
    return { ok: true, rev: await this.bumpRev() };
  }

  private async writeOwnProfile(payload: Record<string, unknown>) {
    const profile = await this.readProfile();
    const rawAvatar = payload["avatar"];
    const name = String(payload["name"] ?? profile.name)
      .trim()
      .slice(0, 80);
    const next: MessagesProfile = {
      ...profile,
      email: profile.email || normalizeMessagesEmail(String(payload["email"] ?? "")),
      name,
      about: String(payload["about"] ?? profile.about).slice(0, 160),
      accent: String(payload["accent"] ?? profile.accent),
      status: normalizePresenceStatus(payload["status"] ?? profile.status),
      avatar:
        rawAvatar === null
          ? null
          : typeof rawAvatar === "string" && rawAvatar.startsWith("data:image/")
            ? rawAvatar.slice(0, 400_000)
            : profile.avatar,
    };
    await this.writeProfile(next);
    return { ok: true, rev: await this.bumpRev() };
  }

  private async setPresence(payload: Record<string, unknown>) {
    const profile = await this.readProfile();
    profile.lastSeenAt = payload["online"] === false ? 0 : Date.now();
    profile.online = payload["online"] !== false;
    await this.writeProfile(profile);
    return { ok: true, rev: await this.bumpRev() };
  }

  /**
   * Pushes this account's presence into each contact's object so friends see a
   * live status without polling everyone.
   */
  private async mirrorPresenceToContacts(ownerEmail: string): Promise<void> {
    const owner = normalizeMessagesEmail(ownerEmail);
    if (!owner || !this.env.MESSAGES_DO) return;

    const profile = await this.readProfile();
    if (!profile.email) profile.email = owner;
    await this.writeProfile({ ...profile, email: profile.email || owner });
    // Read from the profile rather than trusting a caller's argument, so the
    // mirrored presence can never disagree with what was actually stored.
    const online = profile.online && isOnlineAt(profile.lastSeenAt, Date.now());

    const contacts = (await this.readContacts()).filter((contact) => contact.peerEmail);
    await Promise.all(
      contacts.map(async (contact) => {
        try {
          const id = this.env.MESSAGES_DO?.idFromName(await messagesDoName(contact.peerEmail));
          if (!id || !this.env.MESSAGES_DO) return;
          await this.env.MESSAGES_DO.get(id).fetch(
            new Request("https://do/peer-presence", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                [SESSION_HEADER]: "1",
                [SESSION_EMAIL_HEADER]: contact.peerEmail,
              },
              body: JSON.stringify({
                peerEmail: owner,
                name: profile.name,
                avatar: profile.avatar,
                about: profile.about,
                accent: profile.accent,
                online,
                lastSeenAt: profile.lastSeenAt,
                status: profile.status,
              }),
            }),
          );
        } catch (error) {
          console.warn("Failed to mirror messages presence to a contact.", error);
        }
      }),
    );
  }

  private async handleAttachment(request: Request, url: URL): Promise<Response> {
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!id) return jsonResponse({ error: "invalid-attachment" }, 400);

    const record = await this.ctx.storage.get<StoredAttachment>(`${ATTACHMENT_PREFIX}${id}`);
    if (!record?.data) return jsonResponse({ error: "not-found" }, 404);

    const bytes = Uint8Array.from(atob(record.data), (char) => char.charCodeAt(0));
    return new Response(bytes, {
      headers: {
        "content-type": record.mimeType || "application/octet-stream",
        "content-disposition": `inline; filename="${record.name.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  }

  // ------------------------------------------------------------- websockets

  private broadcast(message: MessagePush): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch (error) {
        console.warn("Failed to push a messages websocket frame.", error);
      }
    }
  }
}
