export type TttCell = "X" | "O" | null;
export type TttBoard = TttCell[];
export type TttTurn = "X" | "O";
export type TttRole = "x" | "o" | "spectator";
export type TttStatus = "playing" | "x-wins" | "o-wins" | "draw";
export type TttResult = "x-wins" | "o-wins" | "draw" | null;

export type TttPlayerInfo = {
  email: string;
  name: string;
  role: "x" | "o";
  online: boolean;
};

export type TttPlayers = {
  x: TttPlayerInfo | null;
  o: TttPlayerInfo | null;
};

export type TttRematchRequest = { x: boolean; o: boolean };

export type TttMatchSnapshot = {
  gameId: string;
  board: TttBoard;
  turn: TttTurn;
  status: TttStatus;
  players: TttPlayers;
  lastMove: number | null;
  moveCount: number;
  result: TttResult;
  rematch: TttRematchRequest;
  createdAt: number;
};

export type TttServerToClientMessage =
  | { type: "state"; snapshot: TttMatchSnapshot }
  | { type: "playerJoined"; players: TttPlayers; message: string }
  | { type: "playerLeft"; players: TttPlayers; message: string }
  | { type: "opponentStatus"; online: boolean }
  | {
      type: "move";
      board: TttBoard;
      turn: TttTurn;
      lastMove: number;
      moveCount: number;
      status: "playing";
    }
  | {
      type: "end";
      result: TttResult;
      status: TttStatus;
      board: TttBoard;
      turn: TttTurn;
      moveCount: number;
    }
  | { type: "rematchUpdate"; rematch: TttRematchRequest }
  | { type: "error"; message: string }
  | { type: "pong" };

export type TttClientToServerMessage = (
  | { type: "join"; email: string; name: string; gameId: string }
  | { type: "move"; cell: number }
  | { type: "resign" }
  | { type: "rematch" }
  | { type: "ping" }
) & { connId: string };
