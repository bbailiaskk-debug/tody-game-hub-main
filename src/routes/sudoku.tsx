import { createFileRoute } from "@tanstack/react-router";
import { Check, Eraser, Pencil, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/sudoku")({
  head: () => {
    const seo = seoHead({
      path: "/sudoku",
      title: "Судоку",
      description: "Play Sudoku — the classic 9×9 number puzzle with three difficulty levels.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: SudokuPage,
});

type Difficulty = "easy" | "medium" | "hard";

const REMOVALS: Record<Difficulty, number> = { easy: 38, medium: 46, hard: 54 };
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function shuffledNumbers(): number[] {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = values[i];
    if (tmp === undefined) continue;
    values[i] = values[j] ?? tmp;
    values[j] = tmp;
  }
  return values;
}

function cloneGrid(g: number[][]): number[][] {
  return g.map((row) => [...row]);
}

function canPlace(g: number[][], r: number, c: number, v: number): boolean {
  for (let i = 0; i < 9; i++) {
    if ((g[r]?.[i] ?? 0) === v) return false;
    if ((g[i]?.[c] ?? 0) === v) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      if ((g[br + dr]?.[bc + dc] ?? 0) === v) return false;
    }
  }
  return true;
}

function findEmpty(g: number[][]): [number, number] | null {
  for (let r = 0; r < 9; r++) {
    const row = g[r];
    if (!row) continue;
    for (let c = 0; c < 9; c++) {
      if ((row[c] ?? 0) === 0) return [r, c];
    }
  }
  return null;
}

function fillGrid(g: number[][], index: number): boolean {
  for (let i = index; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    if ((g[r]?.[c] ?? 0) !== 0) continue;
    for (const v of shuffledNumbers()) {
      if (canPlace(g, r, c, v)) {
        if (g[r]) g[r][c] = v;
        if (fillGrid(g, i + 1)) return true;
        if (g[r]) g[r][c] = 0;
      }
    }
    return false;
  }
  return true;
}

function generateSolution(): number[][] {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillGrid(grid, 0);
  return grid;
}

function countSolutions(board: number[][], limit = 2): number {
  const empty = findEmpty(board);
  if (!empty) return 1;
  const [r, c] = empty;
  const candidates: number[] = [];
  for (let v = 1; v <= 9; v++) {
    if (canPlace(board, r, c, v)) candidates.push(v);
  }
  let total = 0;
  for (const v of candidates) {
    if (board[r]) board[r][c] = v;
    total += countSolutions(board, limit - total);
    if (board[r]) board[r][c] = 0;
    if (total >= limit) return total;
  }
  return total;
}

function generatePuzzle(solution: number[][], difficulty: Difficulty): number[][] {
  const puzzle = cloneGrid(solution);
  const cells: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      cells.push([r, c]);
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = cells[i];
    const b = cells[j];
    if (a && b) {
      cells[i] = b;
      cells[j] = a;
    }
  }
  const target = REMOVALS[difficulty];
  let removed = 0;
  for (const [r, c] of cells) {
    if (removed >= target) break;
    const backup = puzzle[r]?.[c] ?? 0;
    if (puzzle[r]) puzzle[r][c] = 0;
    if (countSolutions(cloneGrid(puzzle), 2) === 1) {
      removed++;
    } else if (puzzle[r]) {
      puzzle[r][c] = backup;
    }
  }
  return puzzle;
}

interface SudokuGame {
  solution: number[][];
  puzzle: number[][];
}

function makeGame(difficulty: Difficulty): SudokuGame {
  const solution = generateSolution();
  const puzzle = generatePuzzle(solution, difficulty);
  return { solution, puzzle };
}

function conflictAt(board: number[][], r: number, c: number): boolean {
  const v = board[r]?.[c] ?? 0;
  if (v === 0) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== c && (board[r]?.[i] ?? 0) === v) return true;
    if (i !== r && (board[i]?.[c] ?? 0) === v) return true;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const rr = br + dr;
      const cc = bc + dc;
      if ((rr !== r || cc !== c) && (board[rr]?.[cc] ?? 0) === v) return true;
    }
  }
  return false;
}

function isComplete(board: number[][]): boolean {
  for (const row of board) {
    for (const v of row) {
      if (v === 0) return false;
    }
  }
  return true;
}

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Stopwatch({
  running,
  onTimeUpdate,
}: {
  running: boolean;
  onTimeUpdate: (seconds: number) => void;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        onTimeUpdate(next);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, onTimeUpdate]);

  return <span>{fmt(seconds)}</span>;
}

function SudokuPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [game, setGame] = useState(() => makeGame("medium"));
  const [board, setBoard] = useState<number[][]>(() => cloneGrid(game.puzzle));
  const [notes, setNotes] = useState<Record<string, number[]>>({});
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [pencilMode, setPencilMode] = useState(false);
  const [status, setStatus] = useState<"playing" | "won">("playing");
  const [message, setMessage] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const elapsedSecondsRef = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;
  const boardRef = useRef(board);
  boardRef.current = board;

  const startNewGame = useCallback((d: Difficulty) => {
    const next = makeGame(d);
    setDifficulty(d);
    setGame(next);
    setBoard(cloneGrid(next.puzzle));
    setNotes({});
    setSelected(null);
    setSelectedNumber(null);
    setPencilMode(false);
    setStatus("playing");
    setGameKey((k) => k + 1);
    elapsedSecondsRef.current = 0;
    setMessage(null);
  }, []);

  const removeNoteFromPeers = useCallback((r: number, c: number, v: number) => {
    setNotes((prev) => {
      const next = { ...prev };
      for (let i = 0; i < 9; i++) {
        if (i !== c) {
          const keyRow = `${r}-${i}`;
          const noteRow = next[keyRow];
          if (noteRow?.includes(v)) {
            const filtered = noteRow.filter((n) => n !== v);
            if (filtered.length === 0) delete next[keyRow];
            else next[keyRow] = filtered;
          }
        }
        if (i !== r) {
          const keyCol = `${i}-${c}`;
          const noteCol = next[keyCol];
          if (noteCol?.includes(v)) {
            const filtered = noteCol.filter((n) => n !== v);
            if (filtered.length === 0) delete next[keyCol];
            else next[keyCol] = filtered;
          }
        }
      }
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const rr = br + dr;
          const cc = bc + dc;
          if (rr === r && cc === c) continue;
          const key = `${rr}-${cc}`;
          const note = next[key];
          if (note?.includes(v)) {
            const filtered = note.filter((n) => n !== v);
            if (filtered.length === 0) delete next[key];
            else next[key] = filtered;
          }
        }
      }
      return next;
    });
  }, []);

  const toggleNote = useCallback((r: number, c: number, v: number) => {
    setNotes((prev) => {
      const key = `${r}-${c}`;
      const current = prev[key] ?? [];
      const next = { ...prev };
      const has = current.includes(v);
      if (has) {
        const filtered = current.filter((n) => n !== v);
        if (filtered.length === 0) delete next[key];
        else next[key] = filtered;
      } else {
        next[key] = [...current, v].sort();
      }
      return next;
    });
  }, []);

  const placeNumber = useCallback(
    (v: number) => {
      if (!selected) {
        setSelectedNumber(v);
        return;
      }
      const [r, c] = selected;
      if (status !== "playing") return;
      if ((gameRef.current.puzzle[r]?.[c] ?? 0) !== 0) return;

      if (pencilMode) {
        toggleNote(r, c, v);
        return;
      }

      const next = cloneGrid(board);
      if (next[r]) next[r][c] = v;
      setBoard(next);
      setMessage(null);
      removeNoteFromPeers(r, c, v);
      setNotes((prev) => {
        const key = `${r}-${c}`;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });

      const solved = next.every((row, rr) =>
        row.every((vv, cc) => vv === (gameRef.current.solution[rr]?.[cc] ?? 0)),
      );
      if (solved) setStatus("won");
    },
    [selected, status, pencilMode, board, toggleNote, removeNoteFromPeers],
  );

  const clearCell = useCallback(() => {
    if (!selected) return;
    const [r, c] = selected;
    if (status !== "playing") return;
    if ((gameRef.current.puzzle[r]?.[c] ?? 0) !== 0) return;
    setBoard((prev) => {
      const next = cloneGrid(prev);
      if (next[r]) next[r][c] = 0;
      return next;
    });
    setSelectedNumber(null);
  }, [selected, status]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (status !== "playing") return;
      setSelected([r, c]);
      if ((gameRef.current.puzzle[r]?.[c] ?? 0) !== 0) return;
      const val = board[r]?.[c] ?? 0;
      if (val === 0 && selectedNumber !== null) {
        placeNumber(selectedNumber);
      } else if (val !== 0 && selectedNumber === null) {
        setSelectedNumber(val);
      } else if (val !== 0 && selectedNumber !== null) {
        placeNumber(selectedNumber);
      }
    },
    [status, board, selectedNumber, placeNumber],
  );

  const checkBoard = useCallback(() => {
    const next = cloneGrid(boardRef.current);
    if (!isComplete(next)) {
      setMessage(isBg ? "Попълни всички клетки" : isZh ? "填满所有格子" : "FILL ALL CELLS");
      return;
    }
    const solved = next.every((row, rr) =>
      row.every((vv, cc) => vv === (gameRef.current.solution[rr]?.[cc] ?? 0)),
    );
    if (solved) {
      setStatus("won");
      setMessage(null);
    } else {
      setMessage(isBg ? "Има грешки" : isZh ? "有错误" : "SOMETHING'S WRONG");
    }
  }, [isBg, isZh]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (status !== "playing") {
        if (e.key === "Enter") startNewGame(difficulty);
        return;
      }
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
        setSelected((prev) => {
          if (!prev) return prev;
          const [r, c] = prev;
          switch (e.key) {
            case "ArrowUp":
              return [Math.max(0, r - 1), c];
            case "ArrowDown":
              return [Math.min(8, r + 1), c];
            case "ArrowLeft":
              return [r, Math.max(0, c - 1)];
            default:
              return [r, Math.min(8, c + 1)];
          }
        });
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        placeNumber(Number(e.key));
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        clearCell();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        checkBoard();
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [status, difficulty, startNewGame, placeNumber, clearCell, checkBoard]);

  const handleTimeUpdate = useCallback((next: number) => {
    elapsedSecondsRef.current = next;
  }, []);

  const peers = new Set<string>();
  if (selected) {
    const [r, c] = selected;
    for (let i = 0; i < 9; i++) {
      peers.add(`${r}-${i}`);
      peers.add(`${i}-${c}`);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        peers.add(`${br + dr}-${bc + dc}`);
      }
    }
  }

  const diffLabel = (d: Difficulty) =>
    isBg
      ? d === "easy"
        ? "ЛЕСНО"
        : d === "medium"
          ? "СРЕДНО"
          : "ТРУДНО"
      : isZh
        ? d === "easy"
          ? "简单"
          : d === "medium"
            ? "中等"
            : "困难"
        : d === "easy"
          ? "EASY"
          : d === "medium"
            ? "MEDIUM"
            : "HARD";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[900px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">11 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">СУДОКУ</h1>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "ПЪЗЪЛ С ЧИСЛА" : isZh ? "数字谜题" : "NUMBER PUZZLE"}
          </span>
        </div>

        <div className="night-panel relative mt-8 rounded-3xl border border-border/60 bg-[#161B16] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => startNewGame(d)}
                  className={`rounded-full border px-4 py-2 font-mono text-[0.62rem] font-bold tracking-[0.15em] uppercase transition-colors ${
                    difficulty === d
                      ? "border-[#1DB954]/60 bg-[#1DB954]/10 text-[var(--brand-bright)]"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {diffLabel(d)}
                </button>
              ))}
            </div>
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
              {isBg ? "ВРЕМЕ" : isZh ? "时间" : "TIME"} —{" "}
              <Stopwatch
                key={gameKey}
                running={status === "playing"}
                onTimeUpdate={handleTimeUpdate}
              />
            </span>
          </div>

          <div className="mt-4 rounded-2xl bg-[#0d1a17] p-2 sm:p-3">
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 9 }, (_, br) => (
                <div key={br} className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 9 }, (_, index) => {
                    const r = br * 3 + Math.floor(index / 3);
                    const c = (br % 3) * 3 + (index % 3);
                    const value = board[r]?.[c] ?? 0;
                    const given = (game.puzzle[r]?.[c] ?? 0) !== 0;
                    const isSelected = selected?.[0] === r && selected?.[1] === c;
                    const conflict = !given && value !== 0 && conflictAt(board, r, c);
                    const noteList = notes[`${r}-${c}`] ?? [];
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleCellClick(r, c)}
                        className={`relative grid aspect-square place-items-center rounded-md border font-mono text-lg transition-colors sm:text-xl ${
                          isSelected
                            ? "border-[#1DB954] bg-[#1DB954]/15 text-foreground shadow-[0_0_10px_rgba(29,185,84,0.25)]"
                            : peers.has(`${r}-${c}`)
                              ? "border-border/40 bg-[#1DB954]/5 text-foreground"
                              : given
                                ? "border-border/50 bg-surface-2/60 text-foreground"
                                : "border-border/40 bg-surface/40 text-brand"
                        } ${conflict ? "text-red-400" : ""}`}
                        aria-label={`row ${r + 1} column ${c + 1} ${value || "empty"}`}
                      >
                        {value !== 0 ? (
                          <span className={`${given ? "font-bold" : ""}`}>{value}</span>
                        ) : noteList.length > 0 ? (
                          <span className="grid grid-cols-3 gap-y-0.5 text-[0.5rem] tracking-tight opacity-70 sm:text-[0.6rem]">
                            {Array.from({ length: 9 }, (_, n) => (
                              <span
                                key={n}
                                className={
                                  noteList.includes(n + 1)
                                    ? "text-muted-foreground"
                                    : "text-transparent"
                                }
                              >
                                {n + 1}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSelectedNumber(v)}
                className={`grid size-10 place-items-center rounded-lg border font-mono text-lg font-bold transition-colors sm:size-12 ${
                  selectedNumber === v
                    ? "border-[#1DB954]/70 bg-[#1DB954]/15 text-[var(--brand-bright)]"
                    : "border-border/60 bg-surface text-foreground hover:bg-surface-2"
                }`}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPencilMode((p) => !p)}
              className={`grid size-10 place-items-center rounded-lg border font-mono transition-colors sm:size-12 ${
                pencilMode
                  ? "border-[#f59e0b]/70 bg-[#f59e0b]/15 text-[#fbbf24]"
                  : "border-border/60 bg-surface text-muted-foreground hover:bg-surface-2"
              }`}
              aria-label="Notes"
              aria-pressed={pencilMode}
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={clearCell}
              className="grid size-10 place-items-center rounded-lg border border-border/60 bg-surface text-muted-foreground transition-colors hover:bg-surface-2 sm:size-12"
              aria-label="Erase cell"
            >
              <Eraser className="size-4" />
            </button>
            <button
              type="button"
              onClick={checkBoard}
              className="grid size-10 place-items-center rounded-lg border border-border/60 bg-surface text-brand transition-colors hover:bg-surface-2 sm:size-12"
              aria-label="Check solution"
            >
              <Check className="size-4" />
            </button>
          </div>

          {message ? (
            <p className="mt-3 text-center font-mono text-[0.65rem] tracking-[0.2em] text-red-400 uppercase">
              {message}
            </p>
          ) : null}

          {status === "won" ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#161B16]/85 backdrop-blur-sm">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                {isBg ? "ПОБЕДА" : isZh ? "胜利" : "VICTORY"}
              </span>
              <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                {isBg ? "Време" : isZh ? "用时" : "Time"} — {fmt(elapsedSecondsRef.current)}
              </span>
              <button
                type="button"
                onClick={() => startNewGame(difficulty)}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <RotateCcw className="size-4" />
                {isBg ? "НОВА ИГРА" : isZh ? "新游戏" : "NEW GAME"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">1–9</span> — {isBg ? "поставяне" : "place"}
          </span>
          <span>
            <span className="text-brand">⌫</span> — {isBg ? "изчистване" : "erase"}
          </span>
          <span>
            <span className="text-brand">PENCIL</span> — {isBg ? "молив / бележки" : "notes"}
          </span>
        </div>
      </section>
    </main>
  );
}
