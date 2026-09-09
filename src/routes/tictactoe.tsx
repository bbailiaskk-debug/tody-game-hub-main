import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSiteSettings } from "../components/site/theme";

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

const WINNING_LINES = [
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

function TicTacToePage() {
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
          <span className="label-mono text-[0.62rem]">
            {isBg ? "КЛАСИЧЕСКА ИГРА" : "CLASSIC GAME"}
          </span>
        </div>

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
                  ? isBg ? "Равенство!" : "Draw!"
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
              <button
                type="button"
                onClick={resetGame}
                className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-brand uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <RotateCcw className="size-4" />
                {isBg ? "НОВА ИГРА" : "NEW GAME"}
              </button>
            </div>
          </div>
        </div>

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
