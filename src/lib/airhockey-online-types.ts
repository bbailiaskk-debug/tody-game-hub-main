import type { AhState } from "./airhockey-engine";

export type AhRole = "p1" | "p2" | "spectator";

export type AhPreferredRole = "p1" | "p2";

export type AhPlayerInfo = {
  email: string;
  name: string;
  role: "p1" | "p2";
  online: boolean;
};

export type AhPlayers = {
  p1: AhPlayerInfo | null;
  p2: AhPlayerInfo | null;
};

export type AhStatus = "waiting" | "playing" | "p1-wins" | "p2-wins" | "draw";
export type AhResult = "p1-wins" | "p2-wins" | "draw" | null;

export type AhEndReason = "winner" | "timeup" | null;

export type AhRematchRequest = { p1: boolean; p2: boolean };

export type AhMatchSnapshot = {
  gameId: string;
  players: AhPlayers;
  state: AhState;
  status: AhStatus;
  result: AhResult;
  rematch: AhRematchRequest;
  createdAt: number;
  timeLeftMs: number;
  endReason: AhEndReason;
};

export type AhServerToClientMessage =
  | { type: "state"; snapshot: AhMatchSnapshot }
  | { type: "playerJoined"; players: AhPlayers; message: string }
  | { type: "playerLeft"; players: AhPlayers; message: string }
  | { type: "opponentStatus"; online: boolean }
  | { type: "end"; result: AhResult; status: AhStatus }
  | { type: "rematchUpdate"; rematch: AhRematchRequest }
  | { type: "error"; message: string }
  | { type: "pong" };

export type AhClientToServerMessage = (
  | { type: "join"; email: string; name: string; gameId: string }
  | { type: "input"; mx: number | null; my: number | null; dx: number; dy: number }
  | { type: "resign" }
  | { type: "rematch" }
  | { type: "ping" }
) & { connId: string };
