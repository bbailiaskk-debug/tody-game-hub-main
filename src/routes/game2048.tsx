import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";

export const Route = createFileRoute("/game2048")({
  head: () => ({
    meta: [
      { title: "2048 — Todor Khristov Gaming" },
      {
        name: "description",
        content: "Play 2048 — slide and merge tiles to reach 2048.",
      },
    ],
  }),
  component: Game2048Page,
});

const SIZE = 4;

type Grid = number[][];

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneGrid(g: Grid): Grid {
  return g.map((row) => [...row]);
}

function getEmptyCells(g: Grid): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) {
    const row = g[r];
    if (!row) continue;
    for (let c = 0; c < SIZE; c++) {
      if (row[c] === 0) cells.push([r, c]);
    }
  }
  return cells;
}

function addRandomTile(g: Grid): Grid {
  const next = cloneGrid(g);
  const empty = getEmptyCells(next);
  if (empty.length === 0) return next;
  const picked = empty[Math.floor(Math.random() * empty.length)];
  if (!picked) return next;
  const [r, c] = picked;
  const targetRow = next[r];
  if (targetRow) {
    targetRow[c] = Math.random() < 0.9 ? 2 : 4;
  }
  return next;
}

function slideRow(row: number[]): { row: number[]; score: number; moved: boolean } {
  const filtered = row.filter((v) => v !== 0);
  const result: number[] = [];
  let score = 0;
  for (let i = 0; i < filtered.length; i++) {
    const current = filtered[i] ?? 0;
    const nextVal = filtered[i + 1];
    if (nextVal !== undefined && current === nextVal) {
      result.push(current * 2);
      score += current * 2;
      i++;
    } else {
      result.push(current);
    }
  }
  while (result.length < SIZE) result.push(0);
  const moved = result.some((v, i) => v !== row[i]);
  return { row: result, score, moved };
}

function transpose(g: Grid): Grid {
  const firstRow = g[0] ?? [];
  return firstRow.map((_, c) => g.map((r) => r[c] ?? 0));
}

function moveLeft(g: Grid): { grid: Grid; score: number; moved: boolean } {
  let totalScore = 0;
  let anyMoved = false;
  const next = g.map((row) => {
    const { row: newRow, score, moved } = slideRow(row);
    totalScore += score;
    if (moved) anyMoved = true;
    return newRow;
  });
  return { grid: next, score: totalScore, moved: anyMoved };
}

function moveRight(g: Grid): { grid: Grid; score: number; moved: boolean } {
  const reversed = g.map((row) => [...row].reverse());
  const { grid, score, moved } = moveLeft(reversed);
  return { grid: grid.map((row) => [...row].reverse()), score, moved };
}

function moveUp(g: Grid): { grid: Grid; score: number; moved: boolean } {
  const t = transpose(g);
  const { grid, score, moved } = moveLeft(t);
  return { grid: transpose(grid), score, moved };
}

function moveDown(g: Grid): { grid: Grid; score: number; moved: boolean } {
  const t = transpose(g);
  const { grid, score, moved } = moveRight(t);
  return { grid: transpose(grid), score, moved };
}

function canMove(g: Grid): boolean {
  for (let r = 0; r < SIZE; r++) {
    const row = g[r];
    const nextRow = g[r + 1];
    if (!row) continue;
    for (let c = 0; c < SIZE; c++) {
      const val = row[c] ?? 0;
      if (val === 0) return true;
      if (c + 1 < SIZE && val === (row[c + 1] ?? 0)) return true;
      if (nextRow && val === (nextRow[c] ?? 0)) return true;
    }
  }
  return false;
}

function hasWon(g: Grid): boolean {
  return g.some((row) => row.some((v) => v >= 2048));
}

const TILE_COLORS: Record<number, string> = {
  0: "bg-surface/30 border-border/20",
  2: "bg-[#1a3a2a] border-[#2a5a3a] text-[#a8e6cf]",
  4: "bg-[#1d3d2c] border-[#2d5d3c] text-[#b8f0c0]",
  8: "bg-[#2d6b4a] border-[#3d8b5a] text-[#e6ffd6]",
  16: "bg-[#3a8a5a] border-[#4aaa6a] text-[#ffffff]",
  32: "bg-[#d97706] border-[#f59e0b] text-[#ffffff]",
  64: "bg-[#dc2626] border-[#ef4444] text-[#ffffff]",
  128: "bg-[#7c3aed] border-[#8b5cf6] text-[#ffffff]",
  256: "bg-[#2563eb] border-[#3b82f6] text-[#ffffff]",
  512: "bg-[#0891b2] border-[#06b6d4] text-[#ffffff]",
  1024: "bg-[#be123c] border-[#f43f5e] text-[#ffffff]",
  2048: "bg-[#1DB954] border-[#4ADE80] text-[#0d1a17]",
};

function getTileColor(v: number): string {
  return TILE_COLORS[v] || "bg-[#1DB954] border-[#4ADE80] text-[#0d1a17]";
}

function getTileSize(v: number): string {
  if (v >= 1024) return "text-[clamp(1rem,4vw,1.8rem)]";
  if (v >= 128) return "text-[clamp(1.2rem,5vw,2.2rem)]";
  return "text-[clamp(1.4rem,6vw,2.5rem)]";
}

function Game2048Page() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";

  const [grid, setGrid] = useState<Grid>(() => {
    let g = emptyGrid();
    g = addRandomTile(g);
    g = addRandomTile(g);
    return g;
  });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    setBest(Number(localStorage.getItem("2048-best") || "0"));
  }, []);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem("2048-best", String(score));
    }
  }, [score, best]);

  const move = useCallback(
    (dir: "left" | "right" | "up" | "down") => {
      if (gameOver || won) return;
      const g = gridRef.current;
      let result;
      switch (dir) {
        case "left":
          result = moveLeft(g);
          break;
        case "right":
          result = moveRight(g);
          break;
        case "up":
          result = moveUp(g);
          break;
        case "down":
          result = moveDown(g);
          break;
      }
      if (!result.moved) return;
      const newGrid = addRandomTile(result.grid);
      setGrid(newGrid);
      setScore((prev) => prev + result.score);
      if (hasWon(newGrid)) setWon(true);
      if (!canMove(newGrid)) setGameOver(true);
    },
    [gameOver, won],
  );

  const resetGame = useCallback(() => {
    let g = emptyGrid();
    g = addRandomTile(g);
    g = addRandomTile(g);
    setGrid(g);
    setScore(0);
    setGameOver(false);
    setWon(false);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
      }
      switch (e.key) {
        case "ArrowLeft":
          move("left");
          break;
        case "ArrowRight":
          move("right");
          break;
        case "ArrowUp":
          move("up");
          break;
        case "ArrowDown":
          move("down");
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [move]);

  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      touchRef.current = null;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 30) return;
      if (absDx > absDy) {
        move(dx > 0 ? "right" : "left");
      } else {
        move(dy > 0 ? "down" : "up");
      }
    },
    [move],
  );

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">07 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">2048</h1>
          <span className="label-mono text-[0.62rem]">{isBg ? "ПЪЗЗЛ ИГРА" : "PUZZLE GAME"}</span>
        </div>

        <div className="night-panel relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
              {isBg ? "РЕЗУЛТАТ" : "SCORE"} — {score}
            </span>
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "НАЙ-ДОБЪР" : "BEST"} — {best}
            </span>
          </div>

          <div className="px-5 pb-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="grid grid-cols-4 gap-2 rounded-2xl bg-[#0d1a17] p-2">
              {grid.map((row, r) =>
                row.map((val, c) => (
                  <div
                    key={`${r}-${c}`}
                    className={`flex aspect-square items-center justify-center rounded-xl border font-mono font-bold transition-all duration-150 ${getTileColor(val)} ${getTileSize(val)}`}
                  >
                    {val || ""}
                  </div>
                )),
              )}
            </div>
          </div>

          {(gameOver || won) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#161B16]/85 backdrop-blur-sm">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                {won ? "2048!" : isBg ? "КРАЙ НА ИГРАТА" : "GAME OVER"}
              </span>
              <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                {isBg ? "Твой резултат" : "Your score"} — {score}
              </span>
              <button
                type="button"
                onClick={
                  won
                    ? () => {
                        setWon(false);
                      }
                    : resetGame
                }
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <RotateCcw className="size-4" />
                {won ? (isBg ? "ПРОДЪЛЖИ" : "KEEP GOING") : isBg ? "ОЩЕ ВЕДНЪЖ" : "PLAY AGAIN"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            onClick={resetGame}
            className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
          >
            <RotateCcw className="size-4" />
            {isBg ? "НОВА ИГРА" : "NEW GAME"}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">←↑→↓</span> — {isBg ? "плъзни" : "slide"}
          </span>
          <span>
            <span className="text-brand">swipe</span> — {isBg ? "мобилно" : "mobile"}
          </span>
        </div>
      </section>
    </main>
  );
}
