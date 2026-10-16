import type { GameState, GameStatus, PieceType, Square } from "./chess-engine";

export type PlayerRole = "white" | "black" | "spectator";

export type PlayerInfo = {
  email: string;
  name: string;
  role: PlayerRole;
  online: boolean;
};

export type MatchResult = "white-wins" | "black-wins" | "draw" | null;

export type ChessMatchSnapshot = {
  gameId: string;
  state: GameState;
  status: GameStatus;
  players: {
    white: PlayerInfo | null;
    black: PlayerInfo | null;
  };
  lastMove: { from: Square; to: Square } | null;
  moveCount: number;
  result: MatchResult;
  createdAt: number;
};

export type RematchRequest = { white: boolean; black: boolean };

export type ServerToClientMessage =
  | { type: "state"; snapshot: ChessMatchSnapshot }
  | { type: "playerJoined"; players: ChessMatchSnapshot["players"]; message: string }
  | { type: "playerLeft"; players: ChessMatchSnapshot["players"]; message: string }
  | { type: "opponentStatus"; online: boolean }
  | { type: "move"; lastMove: { from: Square; to: Square }; state: GameState; moveCount: number }
  | { type: "end"; result: MatchResult; status: GameStatus; state: GameState }
  | { type: "rematchUpdate"; rematch: RematchRequest }
  | { type: "error"; message: string }
  | { type: "pong" };

export type ClientToServerMessage = (
  | { type: "join"; email: string; name: string; gameId: string }
  | { type: "move"; from: Square; to: Square; promotion?: PieceType }
  | { type: "resign" }
  | { type: "rematch" }
  | { type: "ping" }
) & { connId: string };
