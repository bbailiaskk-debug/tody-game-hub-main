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
    this.ctx.acceptWebSocket(serverWs);
    this.send(serverWs, { type: "state", snapshot });

    return new Response(null, { status: 101, webSocket: pair[1] } as ResponseInit);
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer | ArrayBufferView): Promise<void> {
    try {
      const parsed = this.parseMessage(message);
      if (!parsed) return;
      if (typeof parsed.connId !== "string" || !parsed.connId) return;
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
          msg.promotion === "r" || msg.promotion === "b" || msg.promotion === "n" ? msg.promotion : "q";

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

        this.broadcast({ type: "move", lastMove: game.lastMove, state: game.state, moveCount: game.moveCount });
        if (game.result) {
          this.broadcast({ type: "end", result: game.result, status: game.status, state: game.state });
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
        this.broadcast({ type: "end", result: game.result, status: game.status, state: game.state });
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
    const connId = this.wsToConnId.get(ws);
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
          normalizeEmail(conn.email) === normalizeEmail(player.email) && now - conn.lastSeen < GAME_STALE_MS,
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
    if (game.players.white && normalizeEmail(game.players.white.email) === normalizedEmail) return "white";
    if (game.players.black && normalizeEmail(game.players.black.email) === normalizedEmail) return "black";
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
    const role: PlayerRole = !game.players.white ? "white" : !game.players.black ? "black" : "spectator";
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

  private parseMessage(message: string | ArrayBuffer | ArrayBufferView): ClientToServerMessage | null {
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