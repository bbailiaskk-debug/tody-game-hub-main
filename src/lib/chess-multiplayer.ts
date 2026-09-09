import { useCallback, useEffect, useRef, useState } from "react";

import { serverChessAuth } from "./chess-server";
import type {
  ChessMatchSnapshot,
  PlayerInfo,
  ServerToClientMessage,
} from "./chess-online-types";
import type { PieceType, Square } from "./chess-engine";
import { readPersistedAuthSession, readPersistedUserProfile, storageGet } from "./local-persistence";

export type ChessOnlinePhase = "idle" | "connecting" | "waiting" | "playing" | "finished" | "error";

export type ChessOnlineController = {
  phase: ChessOnlinePhase;
  error: string | null;
  snapshot: ChessMatchSnapshot | null;
  myRole: PlayerInfo["role"] | null;
  opponentOnline: boolean;
  rematch: { white: boolean; black: boolean };
  gameId: string | null;
  myEmail: string | null;
  myName: string | null;
  createGame: () => Promise<void>;
  joinGame: (code: string) => Promise<void>;
  connectGame: (gameId: string) => Promise<void>;
  leaveGame: () => void;
  sendMove: (from: Square, to: Square, promotion?: PieceType) => void;
  resign: () => void;
  requestRematch: () => void;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_RECONNECT_ATTEMPTS = 3;
const PING_INTERVAL_MS = 15000;

function randomGameCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * CODE_CHARS.length);
    code += CODE_CHARS[index] ?? "A";
  }
  return code;
}

type ConnectInfo = { gameId: string; email: string; name: string; token: string };

export function useChessOnline(): ChessOnlineController {
  const [phase, setPhase] = useState<ChessOnlinePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ChessMatchSnapshot | null>(null);
  const [rematch, setRematch] = useState<{ white: boolean; black: boolean }>({
    white: false,
    black: false,
  });
  const [gameId, setGameId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const session = readPersistedAuthSession();
    const profile = readPersistedUserProfile();
    const storedEmail = session?.email || profile?.email || storageGet("currentUserEmail");
    return storedEmail?.trim().toLowerCase() || null;
  });
  const [myName, setMyName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const session = readPersistedAuthSession();
    const profile = readPersistedUserProfile();
    return session?.name || profile?.name || null;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const connIdRef = useRef<string | null>(null);
  const connectInfoRef = useRef<ConnectInfo | null>(null);
  const attemptsRef = useRef(0);
  const leftRef = useRef(true);
  const pingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      leftRef.current = true;
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const stopPing = useCallback(() => {
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ connId: connIdRef.current, ...message }));
    }
  }, []);

  const openSocket = useCallback(() => {
    const info = connectInfoRef.current;
    if (!info) return;

    wsRef.current?.close();

    const connId = crypto.randomUUID();
    connIdRef.current = connId;
    const url = new URL(`/api/ws/chess/${info.gameId}`, window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("email", info.email);
    url.searchParams.set("cid", connId);
    url.searchParams.set("auth", info.token);

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;
    setPhase("connecting");
    setError(null);

    ws.onopen = () => {
      send({
        type: "join",
        connId,
        gameId: info.gameId,
        email: info.email,
        name: info.name,
      });
      stopPing();
      pingTimerRef.current = window.setInterval(() => {
        send({ type: "ping", connId });
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerToClientMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "state":
          setSnapshot(msg.snapshot);
          setPhase(
            msg.snapshot.result
              ? "finished"
              : msg.snapshot.players.white && msg.snapshot.players.black
                ? "playing"
                : "waiting",
          );
          break;
        case "move":
          setSnapshot((prev) =>
            prev ? { ...prev, state: msg.state, lastMove: msg.lastMove, moveCount: msg.moveCount } : prev,
          );
          setPhase("playing");
          break;
        case "end":
          setSnapshot((prev) => (prev ? { ...prev, result: msg.result, status: msg.status, state: msg.state } : prev));
          setPhase("finished");
          break;
        case "playerJoined":
        case "playerLeft":
          setSnapshot((prev) => (prev ? { ...prev, players: msg.players } : prev));
          setPhase("playing");
          break;
        case "rematchUpdate":
          setRematch(msg.rematch);
          break;
        case "opponentStatus":
        case "pong":
        case "error":
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      stopPing();
      if (!leftRef.current && attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        attemptsRef.current += 1;
        window.setTimeout(openSocket, 1500 * attemptsRef.current);
        return;
      }
      if (!leftRef.current) {
        setError("disconnected");
        setPhase("error");
      }
    };

    ws.onerror = () => {
      // onclose follows and drives reconnect / error state.
    };
  }, [send, stopPing]);

  const connectGame = useCallback(
    async (gameIdInput: string) => {
      const normalizedId = gameIdInput.trim().toUpperCase();
      const session = readPersistedAuthSession();
      const profile = readPersistedUserProfile();
      const storedEmail = session?.email || profile?.email || storageGet("currentUserEmail");
      const email = storedEmail?.trim().toLowerCase();
      if (!email) {
        setPhase("error");
        setError("login-required");
        return;
      }

      const authResult = await serverChessAuth({ data: { gameId: normalizedId, email } });
      if (!authResult || authResult.ok !== true) {
        setPhase("error");
        setError(authResult?.error ?? "auth-failed");
        return;
      }

      const defaultName = authResult.name || session?.name || profile?.name || email.split("@")[0] || "player";
      leftRef.current = false;
      attemptsRef.current = 0;
      connectInfoRef.current = {
        gameId: normalizedId,
        email: authResult.email,
        name: defaultName,
        token: authResult.token,
      };
      setGameId(normalizedId);
      setMyEmail(authResult.email);
      setMyName(defaultName);
      setSnapshot(null);
      setRematch({ white: false, black: false });
      openSocket();
    },
    [openSocket],
  );

  const createGame = useCallback(async () => {
    await connectGame(randomGameCode());
  }, [connectGame]);

  const joinGame = useCallback(
    async (code: string) => {
      await connectGame(code);
    },
    [connectGame],
  );

  const autoJoinRef = useRef(false);

  useEffect(() => {
    if (autoJoinRef.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawGame = params.get("game");
    if (!rawGame) return;
    const session = readPersistedAuthSession();
    const profile = readPersistedUserProfile();
    const storedEmail = session?.email || profile?.email || storageGet("currentUserEmail");
    if (!storedEmail?.trim().toLowerCase()) return;
    autoJoinRef.current = true;
    void joinGame(rawGame.trim().toUpperCase());
  }, [joinGame]);

  const leaveGame = useCallback(() => {
    leftRef.current = true;
    stopPing();
    wsRef.current?.close();
    wsRef.current = null;
    connectInfoRef.current = null;
    setSnapshot(null);
    setGameId(null);
    setError(null);
    setRematch({ white: false, black: false });
    setPhase("idle");
  }, [stopPing]);

  const sendMove = useCallback(
    (from: Square, to: Square, promotion?: PieceType) => {
      send({ type: "move", from, to, ...(promotion ? { promotion } : {}) });
    },
    [send],
  );

  const resign = useCallback(() => {
    send({ type: "resign" });
  }, [send]);

  const requestRematch = useCallback(() => {
    send({ type: "rematch" });
  }, [send]);

  const myRole: PlayerInfo["role"] | null = (() => {
    if (!myEmail || !snapshot) return null;
    if (snapshot.players.white?.email === myEmail) return "white";
    if (snapshot.players.black?.email === myEmail) return "black";
    return "spectator";
  })();

  const opponentOnline = snapshot
    ? myRole === "white"
      ? snapshot.players.black?.online ?? false
      : myRole === "black"
        ? snapshot.players.white?.online ?? false
        : false
    : false;

  return {
    phase,
    error,
    snapshot,
    myRole,
    opponentOnline,
    rematch,
    gameId,
    myEmail,
    myName,
    createGame,
    joinGame,
    connectGame,
    leaveGame,
    sendMove,
    resign,
    requestRematch,
  };
}