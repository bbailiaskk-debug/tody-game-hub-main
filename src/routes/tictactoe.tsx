import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogIn, RotateCcw, Share2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { useTicTacToeOnline } from "../lib/tictactoe-multiplayer";

export const Route = createFileRoute("/tictactoe")({
  head: () => ({
    meta: [
      { title: "Tic Tac Toe — Todor Khristov Gaming" },
      {
        name: "description",
        content: "Play Tic Tac Toe (Morra) — classic two-player game.",
      },
    ],
  }),
  component: TicTacToePage,
});

type Cell = "X" | "O" | null;
type Board = Cell[];

const WINNING_LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkWinner(board: Board): Cell | "draw" {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell !== null)) return "draw";
  return null;
}

const BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-brand uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5";

function LocalTicTacToeGame() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";

  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [isXTurn, setIsXTurn] = useState(true);
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 });

  const winner = checkWinner(board);
  const gameOver = winner !== null;
  const currentTurn = isXTurn ? "X" : "O";

  const handleCellClick = useCallback(
    (index: number) => {
      if (board[index] || gameOver) return;
      const next = [...board];
      next[index] = isXTurn ? "X" : "O";
      setBoard(next);
      setIsXTurn((prev) => !prev);
    },
    [board, isXTurn, gameOver],
  );

  useEffect(() => {
    if (!gameOver) return;
    if (winner === "X" || winner === "O") {
      setScores((prev) => ({ ...prev, [winner]: prev[winner] + 1 }));
    } else if (winner === "draw") {
      setScores((prev) => ({ ...prev, draws: prev.draws + 1 }));
    }
  }, [gameOver, winner]);

  const resetGame = useCallback(() => {
    setBoard(Array(9).fill(null));
    setIsXTurn(true);
  }, []);

  const resetScores = useCallback(() => {
    setScores({ X: 0, O: 0, draws: 0 });
    resetGame();
  }, [resetGame]);

  const winLine = WINNING_LINES.find(
    ([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c],
  );

  return (
    <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex gap-5">
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-[#4ADE80] uppercase">
            X — {scores.X}
          </span>
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
            {isBg ? "Равни" : "Draws"} — {scores.draws}
          </span>
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-[#f97316] uppercase">
            O — {scores.O}
          </span>
        </div>
        <button
          type="button"
          onClick={resetScores}
          className="font-mono text-[0.6rem] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          {isBg ? "НУЛИРАЙ" : "RESET"}
        </button>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 px-5 py-10">
        <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {gameOver
            ? winner === "draw"
              ? isBg
                ? "Равенство!"
                : "Draw!"
              : isBg
                ? `${winner} печели!`
                : `${winner} wins!`
            : isBg
              ? `Ход на ${currentTurn}`
              : `${currentTurn}'s turn`}
        </span>

        <div className="grid grid-cols-3 gap-2">
          {board.map((cell, i) => {
            const isWinCell = winLine?.includes(i);
            const isX = cell === "X";
            const isO = cell === "O";
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleCellClick(i)}
                disabled={!!cell || gameOver}
                className={`grid size-[clamp(5rem,18vw,8rem)] place-items-center rounded-2xl border font-mono text-[clamp(2rem,8vw,4rem)] font-bold transition-all duration-200 ${
                  isWinCell
                    ? "border-[#1DB954]/60 bg-[#1DB954]/15 shadow-[0_0_20px_rgba(29,185,84,0.25)]"
                    : cell
                      ? "border-border/40 bg-surface/50"
                      : "border-border/30 bg-surface/30 hover:border-border/60 hover:bg-surface/60"
                } ${isX ? "text-[#4ADE80]" : isO ? "text-[#f97316]" : "text-transparent"}`}
              >
                {cell}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={resetGame} className={BUTTON_CLASS}>
            <RotateCcw className="size-4" />
            {isBg ? "НОВА ИГРА" : "NEW GAME"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnlineTicTacToeLobby({ online }: { online: ReturnType<typeof useTicTacToeOnline> }) {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const [codeInput, setCodeInput] = useState("");

  const loggedIn = Boolean(online.myEmail);

  if (online.phase === "connecting") {
    return (
      <div className="mt-8 flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-[#161B16] p-8 text-center">
        <span className="font-mono text-sm tracking-[0.2em] text-brand uppercase">
          {isBg ? "Свързване…" : "CONNECTING…"}
        </span>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="mt-8 flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-3xl border border-border/60 bg-[#161B16] p-8 text-center">
        <span className="font-mono text-sm tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "Изисква се акаунт" : "ACCOUNT REQUIRED"}
        </span>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-xs tracking-[0.15em] text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5"
        >
          <LogIn className="size-4" />
          {isBg ? "ВХОД" : "LOGIN"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-5 rounded-3xl border border-border/60 bg-[#161B16] p-8">
      <span className="font-mono text-sm tracking-[0.2em] text-foreground uppercase">
        {isBg ? "Играй с приятел в реално време" : "PLAY A FRIEND IN REAL TIME"}
      </span>

      <div className="flex w-full max-w-md flex-col gap-3">
        <input
          type="text"
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
          placeholder={isBg ? "Код на играта" : "GAME CODE"}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground uppercase outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[#1DB954]/60"
          onKeyDown={(event) => {
            if (event.key === "Enter" && codeInput.trim().length > 0) {
              void online.joinGame(codeInput);
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (codeInput.trim().length > 0) void online.joinGame(codeInput);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-brand uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
          disabled={codeInput.trim().length === 0}
        >
          <UserPlus className="size-4" />
          {isBg ? "ПРИСЪЕДИНИ СЕ" : "JOIN GAME"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px w-10 bg-border" />
        <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "или" : "or"}
        </span>
        <span className="h-px w-10 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => void online.createGame()}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground uppercase shadow-glow transition-transform hover:-translate-y-0.5"
      >
        <Users className="size-4" />
        {isBg ? "СЪЗДАЙ ИГРА" : "CREATE GAME"}
      </button>

      {online.error && online.error !== "login-required" && (
        <span className="font-mono text-xs tracking-[0.15em] text-red-400 uppercase">
          {online.error}
        </span>
      )}
    </div>
  );
}

function OnlineTicTacToeGame() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const online = useTicTacToeOnline();
  const navigate = useNavigate();

  const snapshot = online.snapshot;
  const board = snapshot?.board ?? null;
  const myRole = online.myRole;

  const winLine = board
    ? WINNING_LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c])
    : undefined;
  const gameOver = Boolean(snapshot?.result);
  const canMove =
    online.phase === "playing" &&
    myRole !== null &&
    myRole !== "spectator" &&
    snapshot !== null &&
    snapshot.turn === (myRole === "x" ? "X" : "O") &&
    !gameOver;

  const handleCellClick = useCallback(
    (index: number) => {
      if (!canMove || board?.[index] || gameOver) return;
      online.sendMove(index);
    },
    [canMove, board, gameOver, online],
  );

  if (!snapshot || !board) {
    return <OnlineTicTacToeLobby online={online} />;
  }

  const joinedCount = [snapshot.players.x, snapshot.players.o].filter(Boolean).length;

  let headerText: string;
  if (online.phase === "error" && online.error) {
    headerText =
      online.error === "disconnected"
        ? isBg
          ? "СВЪРЗВАНЕТО ПРЕКЪСНАТО"
          : "DISCONNECTED"
        : online.error;
  } else if (gameOver && snapshot.result) {
    headerText =
      snapshot.result === "draw"
        ? isBg
          ? "РАВЕНСТВО"
          : "DRAW"
        : snapshot.result === "x-wins"
          ? isBg
            ? "X ПЕЧЕЛИ!"
            : "X WINS!"
          : isBg
            ? "O ПЕЧЕЛИ!"
            : "O WINS!";
  } else if (joinedCount < 2) {
    headerText = isBg ? "Чакаме противник…" : "WAITING FOR OPPONENT…";
  } else if (canMove) {
    headerText = isBg ? "Твой ход" : "YOUR TURN";
  } else {
    headerText = isBg ? "Ход на противника" : "OPPONENT'S TURN";
  }

  const headerTone = gameOver ? "text-brand" : canMove ? "text-[#f97316]" : "text-muted-foreground";

  const shareUrl =
    typeof window !== "undefined" && online.gameId
      ? `${window.location.origin}/tictactoe?game=${online.gameId}`
      : "";

  return (
    <>
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between px-5 py-3">
          <span
            className={`inline-flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.18em] uppercase ${headerTone}`}
          >
            {headerText}
          </span>
          <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
            {isBg ? "Ходове" : "MOVES"} — {snapshot.moveCount}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 px-5 pb-10">
          <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-xl border border-border/40 bg-surface/40 px-4 py-2 font-mono text-[0.62rem] tracking-[0.15em] uppercase">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className={`size-2 shrink-0 rounded-full ${snapshot.players.x?.online ? "bg-[#4ADE80]" : "bg-muted-foreground/40"}`}
              />
              <span className={`truncate ${myRole === "x" ? "text-foreground" : ""}`}>
                {snapshot.players.x?.name || "X"}
              </span>
            </span>
            <span className="text-brand">VS</span>
            <span className="flex min-w-0 items-center justify-end gap-1.5 text-muted-foreground">
              <span className={`truncate ${myRole === "o" ? "text-foreground" : ""}`}>
                {snapshot.players.o?.name || "O"}
              </span>
              <span
                className={`size-2 shrink-0 rounded-full ${snapshot.players.o?.online ? "bg-[#4ADE80]" : "bg-muted-foreground/40"}`}
              />
            </span>
          </div>

          <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {gameOver
              ? snapshot.result === "draw"
                ? isBg
                  ? "Равенство!"
                  : "Draw!"
                : snapshot.result
                  ? isBg
                    ? `${snapshot.result === "x-wins" ? "X" : "O"} печели!`
                    : `${snapshot.result === "x-wins" ? "X" : "O"} wins!`
                  : ""
              : canMove
                ? isBg
                  ? `Твой ход — ${snapshot.turn}`
                  : `Your turn — ${snapshot.turn}`
                : isBg
                  ? `Ход на ${snapshot.turn}`
                  : `${snapshot.turn}'s turn`}
          </span>

          <div className="grid grid-cols-3 gap-2">
            {board.map((cell, i) => {
              const isWinCell = winLine?.includes(i);
              const isX = cell === "X";
              const isO = cell === "O";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleCellClick(i)}
                  disabled={!!cell || gameOver || !canMove}
                  className={`grid size-[clamp(5rem,18vw,8rem)] place-items-center rounded-2xl border font-mono text-[clamp(2rem,8vw,4rem)] font-bold transition-all duration-200 ${
                    isWinCell
                      ? "border-[#1DB954]/60 bg-[#1DB954]/15 shadow-[0_0_20px_rgba(29,185,84,0.25)]"
                      : cell
                        ? "border-border/40 bg-surface/50"
                        : "border-border/30 bg-surface/30 hover:border-border/60 hover:bg-surface/60"
                  } ${isX ? "text-[#4ADE80]" : isO ? "text-[#f97316]" : "text-transparent"}`}
                >
                  {cell}
                </button>
              );
            })}
          </div>
        </div>

        {gameOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#161B16]/85 backdrop-blur-sm">
            <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
              {snapshot.result === "draw"
                ? isBg
                  ? "РАВЕНСТВО"
                  : "DRAW"
                : snapshot.result === "x-wins"
                  ? isBg
                    ? "X ПЕЧЕЛИ"
                    : "X WINS"
                  : isBg
                    ? "O ПЕЧЕЛИ"
                    : "O WINS"}
            </span>
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
              {headerText}
            </span>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => online.requestRematch()}
                className={BUTTON_CLASS}
              >
                <RotateCcw className="size-4" />
                {online.rematch[myRole === "x" ? "x" : "o"]
                  ? isBg
                    ? "Чакаме противника…"
                    : "WAITING…"
                  : isBg
                    ? "РЕВАНШ"
                    : "REMATCH"}
              </button>
            </div>
            <span className="font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase">
              {isBg ? "Код" : "CODE"} — {online.gameId}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {online.gameId && (
          <>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-mono text-[0.65rem] font-bold tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <Share2 className="size-4" />
              {isBg ? "КОПИРАЙ ЛИНК" : "COPY LINK"}
            </button>
            <span className="rounded-full bg-surface-2 px-4 py-2.5 font-mono text-sm font-bold tracking-[0.3em] text-brand">
              {online.gameId}
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            online.leaveGame();
            void navigate({ to: "/games" });
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-mono text-[0.65rem] font-bold tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          {isBg ? "НАПУСНИ" : "LEAVE"}
        </button>
      </div>
    </>
  );
}

function TicTacToePage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const [mode, setMode] = useState<"local" | "online">(() => {
    if (typeof window === "undefined") return "local";
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "online" ? "online" : "local";
  });

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">06 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            {isBg ? "МОРСКИ ШАХ" : "TIC TAC TOE"}
          </h1>
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 p-1">
            <button
              type="button"
              onClick={() => setMode("local")}
              className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
                mode === "local"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isBg ? "ЛОКАЛНО" : "LOCAL"}
            </button>
            <button
              type="button"
              onClick={() => setMode("online")}
              className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
                mode === "online"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isBg ? "ОНЛАЙН" : "ONLINE"}
            </button>
          </div>
        </div>

        <span className="label-mono mt-2 block text-[0.62rem]">
          {isBg ? "КЛАСИЧЕСКА ИГРА / МУЛТИПЛЕЙЪР" : "CLASSIC GAME / MULTIPLAYER"}
        </span>

        {mode === "local" ? <LocalTicTacToeGame /> : <OnlineTicTacToeGame />}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-[#4ADE80]">X</span> — {isBg ? "Играч 1" : "Player 1"}
          </span>
          <span>
            <span className="text-[#f97316]">O</span> — {isBg ? "Играч 2" : "Player 2"}
          </span>
        </div>
      </section>
    </main>
  );
}
