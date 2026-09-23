import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/candycrush")({
  head: () => {
    const seo = seoHead({
      path: "/candycrush",
      title: "Candy Crush",
      description:
        "Play Candy Crush with Minecraft ores — swap coal, iron, gold, diamond and emerald gems to match three or more.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: CandyCrushPage,
});

const SIZE = 8;
const ORES = ["coal", "iron", "gold", "diamond", "emerald"] as const;
const ORE_COLORS = {
  coal: "#374151",
  iron: "#d4b483",
  gold: "#facc15",
  diamond: "#38bdf8",
  emerald: "#34d399",
} as const;

function oreStyle(type: number): React.CSSProperties {
  const color = ORE_COLORS[ORES[type] ?? "coal"] ?? ORE_COLORS.coal;
  return {
    backgroundImage: `radial-gradient(circle at 30% 30%, ${color} 0 15%, transparent 16%), radial-gradient(circle at 70% 70%, ${color} 0 12%, transparent 13%), radial-gradient(circle at 66% 30%, ${color} 0 8%, transparent 9%)`,
    backgroundColor: "#64748b",
  };
}

type Cell = number | null;

function makeBoard(): Cell[][] {
  const board: Cell[][] = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      let type = Math.floor(Math.random() * ORES.length);
      const left = board[r]?.[c - 1];
      const left2 = board[r]?.[c - 2];
      const up = board[r - 1]?.[c];
      const up2 = board[r - 2]?.[c];
      while (type === left || type === left2 || type === up || type === up2) {
        type = Math.floor(Math.random() * ORES.length);
      }
      const row = board[r];
      if (row) row[c] = type;
    }
  }
  return board;
}

function findMatches(board: Cell[][]): Set<string> {
  const matches = new Set<string>();
  const key = (r: number, c: number) => `${r}-${c}`;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r]?.[c];
      if (v === null || v === undefined) continue;
      let len = 1;
      while (c + len < SIZE && board[r]?.[c + len] === v) len++;
      if (len >= 3) {
        for (let i = 0; i < len; i++) matches.add(key(r, c + i));
      }
      len = 1;
      while (r + len < SIZE && board[r + len]?.[c] === v) len++;
      if (len >= 3) {
        for (let i = 0; i < len; i++) matches.add(key(r + i, c));
      }
    }
  }
  return matches;
}

function clearMatches(board: Cell[][], matches: Set<string>): Cell[][] {
  return board.map((row, r) => row.map((v, c) => (matches.has(`${r}-${c}`) ? null : v)));
}

function applyGravity(board: Cell[][]): Cell[][] {
  const next: Cell[][] = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const v = board[r]?.[c];
      if (v !== null && v !== undefined) {
        const target = next[write];
        if (target) target[c] = v;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      const target = next[r];
      if (target) target[c] = Math.floor(Math.random() * ORES.length);
    }
  }
  return next;
}

function hasAnyMove(board: Cell[][]): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (c + 1 < SIZE) {
        const swapped = swapCells(board, r, c, r, c + 1);
        if (findMatches(swapped).size > 0) return true;
      }
      if (r + 1 < SIZE) {
        const swapped = swapCells(board, r, c, r + 1, c);
        if (findMatches(swapped).size > 0) return true;
      }
    }
  }
  return false;
}

function swapCells(board: Cell[][], r1: number, c1: number, r2: number, c2: number): Cell[][] {
  const next = board.map((row) => [...row]);
  const a = next[r1]?.[c1];
  const b = next[r2]?.[c2];
  if (next[r1]) next[r1][c1] = b ?? null;
  if (next[r2]) next[r2][c2] = a ?? null;
  return next;
}

function CandyCrushPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const [board, setBoard] = useState<Cell[][]>(() => makeBoard());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [moves, setMoves] = useState(0);
  const busyRef = useRef(false);
  const chainRef = useRef(1);
  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    setBest(Number(localStorage.getItem("candycrush-best") || "0"));
  }, []);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem("candycrush-best", String(score));
    }
  }, [score, best]);

  const processCascade = useCallback((b: Cell[][]) => {
    const matches = findMatches(b);
    if (matches.size === 0) {
      if (!hasAnyMove(b)) {
        setBoard(makeBoard());
      } else {
        setBoard(b);
      }
      busyRef.current = false;
      chainRef.current = 1;
      return;
    }

    const gain = matches.size * 10 * chainRef.current;
    setScore((s) => s + gain);
    const cleared = clearMatches(b, matches);
    setBoard(cleared);
    window.setTimeout(() => {
      const fallen = applyGravity(cleared);
      setBoard(fallen);
      window.setTimeout(() => {
        chainRef.current += 1;
        processCascade(fallen);
      }, 180);
    }, 200);
  }, []);

  const resetBoard = useCallback(() => {
    busyRef.current = false;
    chainRef.current = 1;
    setBoard(makeBoard());
    setSelected(null);
    setMoves(0);
  }, []);

  const handleTileClick = useCallback(
    (r: number, c: number) => {
      if (busyRef.current) return;
      if (!selected) {
        setSelected([r, c]);
        return;
      }
      const [sr, sc] = selected;
      if (sr === r && sc === c) {
        setSelected(null);
        return;
      }
      const adjacent = Math.abs(sr - r) + Math.abs(sc - c) === 1;
      if (!adjacent) {
        setSelected([r, c]);
        return;
      }
      setSelected(null);

      const current = boardRef.current;
      const swapped = swapCells(current, sr, sc, r, c);
      setBoard(swapped);
      if (findMatches(swapped).size > 0) {
        busyRef.current = true;
        chainRef.current = 1;
        setMoves((m) => m + 1);
        window.setTimeout(() => processCascade(swapped), 120);
      } else {
        busyRef.current = true;
        window.setTimeout(() => {
          setBoard(current);
          busyRef.current = false;
        }, 140);
      }
    },
    [selected, processCascade],
  );

  const tileClass = "grid aspect-square w-full place-items-center rounded-md";
  const selectedTile = (r: number, c: number) => selected?.[0] === r && selected?.[1] === c;
  const cursorRef = useRef<[number, number]>([0, 0]);

  const moveCursor = useCallback((dr: number, dc: number) => {
    cursorRef.current = [
      Math.max(0, Math.min(SIZE - 1, cursorRef.current[0] + dr)),
      Math.max(0, Math.min(SIZE - 1, cursorRef.current[1] + dc)),
    ];
    const [r, c] = cursorRef.current;
    setSelected([r, c]);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        moveCursor(-1, 0);
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        moveCursor(1, 0);
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        moveCursor(0, -1);
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        moveCursor(0, 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const [r, c] = cursorRef.current;
        handleTileClick(r, c);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [moveCursor, handleTileClick]);

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[700px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">12 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">CANDY CRUSH</h1>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "МАЙНКРАФТ РУДИ" : isZh ? "我的世界矿石" : "MINECRAFT ORES"}
          </span>
        </div>

        <div className="night-panel relative mt-8 rounded-3xl border border-border/60 bg-[#161B16] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
              {isBg ? "РЕЗУЛТАТ" : isZh ? "得分" : "SCORE"} — {score}
            </span>
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "НАЙ-ДОБЪР" : isZh ? "最佳" : "BEST"} — {best}
            </span>
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "ХОДОВЕ" : isZh ? "步数" : "MOVES"} — {moves}
            </span>
          </div>

          <div className="mt-4 rounded-2xl bg-[#0d1a17] p-2 sm:p-3">
            <div className="mx-auto grid w-full max-w-[26rem] grid-cols-8 gap-1 sm:gap-1.5">
              {board.map((row, r) =>
                row.map((v, c) => (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => handleTileClick(r, c)}
                    style={typeof v === "number" ? oreStyle(v) : undefined}
                    className={`${tileClass} border transition-all duration-150 ${
                      selectedTile(r, c)
                        ? "scale-105 border-[#1DB954] shadow-[0_0_12px_rgba(29,185,84,0.45)]"
                        : "border-black/40 hover:border-black/70"
                    } ${v === null ? "bg-surface/20" : ""}`}
                    aria-label={typeof v === "number" ? (ORES[v] ?? "ore") : "empty"}
                  />
                )),
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-[#374151]" />
              {isBg ? "въглища" : isZh ? "煤炭" : "coal"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-[#d4b483]" />
              {isBg ? "желязо" : isZh ? "铁" : "iron"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-[#facc15]" />
              {isBg ? "злато" : isZh ? "黄金" : "gold"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-[#38bdf8]" />
              {isBg ? "диамант" : isZh ? "钻石" : "diamond"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-[#34d399]" />
              {isBg ? "ермерауд" : isZh ? "绿宝石" : "emerald"}
            </span>
          </div>

          <div className="mt-5 flex items-center justify-center">
            <button
              type="button"
              onClick={resetBoard}
              className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
            >
              <RotateCcw className="size-4" />
              {isBg ? "НОВА ИГРА" : isZh ? "新游戏" : "NEW GAME"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">{isBg ? "клик" : isZh ? "点击" : "click"}</span> —{" "}
            {isBg ? "избери / размени" : isZh ? "选择/交换" : "select / swap"}
          </span>
          <span>
            <span className="text-brand">←↑↓→</span> — {isBg ? "клавиатура" : "keyboard"}
          </span>
          <span>
            <span className="text-brand">⏎</span> — {isBg ? "потвърди" : "enter"}
          </span>
        </div>
      </section>
    </main>
  );
}
