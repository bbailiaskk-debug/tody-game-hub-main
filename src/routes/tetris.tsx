import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/tetris")({
  head: () => {
    const seo = seoHead({
      path: "/tetris",
      title: "TETRIS",
      description:
        "Класически TETRIS в стила на урока за C# — редиш падащите блокове, чистиш редове и записваш рекорд.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: TetrisPage,
});

const COLS = 10;
const ROWS = 20;
const TILE = 26;
const CANVAS_W = COLS * TILE;
const CANVAS_H = ROWS * TILE;

type Text = { bg: string; en: string; zh: string };
type TetrominoId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
type Phase = "title" | "play" | "over";
type Cell = { c: number; r: number };

const TETRO_IDS: TetrominoId[] = ["I", "O", "T", "S", "Z", "J", "L"];

const MATRICES: Record<TetrominoId, string[]> = {
  I: ["....", "####", "....", "...."],
  O: ["....", ".##.", ".##.", "...."],
  T: ["....", ".#..", "###.", "...."],
  S: ["....", ".##.", "##..", "...."],
  Z: ["....", ".##.", "..##", "...."],
  J: ["....", ".#..", ".###", "...."],
  L: ["....", "...#", "###.", "...."],
};

const PIECE_COLORS: Record<TetrominoId, string> = {
  I: "#22d3ee",
  O: "#fbbf24",
  T: "#c084fc",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
};

const TYPE_INDEX: Record<TetrominoId, number> = { I: 0, O: 1, T: 2, S: 3, Z: 4, J: 5, L: 6 };
const TYPE_BY_INDEX = ["I", "O", "T", "S", "Z", "J", "L"] as const;

const COPY = {
  tagline: {
    bg: "КЛАСИЧЕСТИ БЛОКОВЕ",
    en: "THE CLASSIC BLOCKS",
    zh: "经典方块",
  },
  desc: {
    bg: "Реди падащите тетромино, чисти пълните редове и не позволявай на купчината да стигне върха. ←/→ движат, ↑/X върти, Z върти обратно, Space пуска, Shift задържа.",
    en: "Arrange the falling tetrominoes, clear full rows and never let the stack reach the top. ←/→ move, ↑/X rotate, Z rotate back, Space drop, Shift hold.",
    zh: "排列下落中的四格方块，消除整行，别让方块堆到顶部。←/→ 移动，↑/X 旋转，Z 反向旋转，空格硬降，Shift 暂存。",
  },
  score: { bg: "ТОЧКИ", en: "SCORE", zh: "得分" },
  level: { bg: "НИВО", en: "LEVEL", zh: "等级" },
  lines: { bg: "РЕДОВЕ", en: "LINES", zh: "行数" },
  best: { bg: "РЕКОРД", en: "BEST", zh: "纪录" },
  play: { bg: "СТАРТ", en: "PLAY", zh: "开始" },
  retry: { bg: "ОТНОВО", en: "RETRY", zh: "重新挑战" },
  home: { bg: "МЕНЮ", en: "HOME", zh: "返回" },
  gameOver: { bg: "КРАЙ НА ИГРАТА", en: "GAME OVER", zh: "游戏结束" },
  next: { bg: "СЛЕДВАЩ", en: "NEXT", zh: "下一个" },
  hold: { bg: "ЗАДЪРЖИ", en: "HOLD", zh: "暂存" },
  controls: {
    bg: "← → движи · ↑/X върти · Z обратно · ↓ меко · SPACE твърдо · SHIFT задържи",
    en: "← → move · ↑/X rotate · Z back · ↓ soft · SPACE hard · SHIFT hold",
    zh: "← → 移动 · ↑/X 旋转 · Z 回旋 · ↓ 软降 · 空格 硬降 · Shift 暂存",
  },
};

function rotateCW(grid: string[]): string[] {
  const out: string[] = ["....", "....", "....", "...."];
  for (let r = 0; r < 4; r += 1) {
    let line = "";
    for (let c = 0; c < 4; c += 1) {
      line += grid[3 - c]?.[r] ?? ".";
    }
    out[r] = line;
  }
  return out;
}

function cellsOf(id: TetrominoId, rot: number): Cell[] {
  let grid = MATRICES[id];
  let r = ((rot % 4) + 4) % 4;
  while (r > 0) {
    grid = rotateCW(grid);
    r -= 1;
  }
  const cells: Cell[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (grid[row]?.[col] === "#") cells.push({ c: col, r: row });
    }
  }
  return cells;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const item = pool.splice(idx, 1)[0];
    if (item !== undefined) out.push(item);
  }
  return out;
}

function TetrisPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const t = (text: Text) => text[lang];

  const boardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const holdCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<{ ctx: AudioContext | null }>({ ctx: null });

  const boardRef = useRef<number[][]>([]);
  const typeIndexRef = useRef<number>(0);
  const pieceRef = useRef<{ x: number; y: number; rot: number }>({ x: 3, y: 0, rot: 0 });
  const queueRef = useRef<TetrominoId[]>([]);
  const holdRef = useRef<TetrominoId | null>(null);
  const holdUsedRef = useRef(false);
  const phaseRef = useRef<Phase>("title");
  const langRef = useRef(lang);
  const rafRef = useRef<number | null>(null);
  const gravityRef = useRef(0);
  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);
  const bestRef = useRef(0);
  const dirtyRef = useRef(true);

  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [best, setBest] = useState(0);
  const [nextId, setNextId] = useState<TetrominoId>("T");
  const [holdId, setHoldId] = useState<TetrominoId | null>(null);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    bestRef.current = Number(window.localStorage.getItem("tetris-best") || "0");
    setBest(bestRef.current);
  }, []);

  const ensureAudio = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current.ctx) {
      try {
        audioRef.current.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    void audioRef.current.ctx.resume?.();
    return audioRef.current.ctx;
  }, []);

  const tone = useCallback(
    (freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) => {
      const ctx = ensureAudio();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
        gain.gain.setValueAtTime(vol, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      } catch {
        // ignore
      }
    },
    [ensureAudio],
  );

  const levelSpeed = useCallback((lv: number) => Math.max(70, 760 - (lv - 1) * 60), []);

  const nextIdFromQueue = useCallback((): TetrominoId => {
    if (queueRef.current.length === 0) {
      queueRef.current = shuffle(TETRO_IDS);
    }
    const id = queueRef.current.shift();
    return id ?? "I";
  }, []);

  const collides = useCallback((x: number, y: number, rot: number, idx: number): boolean => {
    for (const cell of cellsOf(TYPE_BY_INDEX[idx] ?? "I", rot)) {
      const col = x + cell.c;
      const row = y + cell.r;
      if (col < 0 || col >= COLS || row >= ROWS) return true;
      if (row >= 0 && (boardRef.current[row]?.[col] ?? -1) !== -1) return true;
    }
    return false;
  }, []);

  const drawGhostCells = useCallback(() => {
    let drop = 0;
    while (
      !collides(
        pieceRef.current.x,
        pieceRef.current.y + drop + 1,
        pieceRef.current.rot,
        typeIndexRef.current,
      )
    ) {
      drop += 1;
    }
    return {
      drop,
      cells: cellsOf(TYPE_BY_INDEX[typeIndexRef.current] ?? "I", pieceRef.current.rot),
    };
  }, [collides]);

  const syncBest = useCallback((value: number) => {
    setBest(value);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("tetris-best", String(value));
      } catch {
        // ignore
      }
    }
  }, []);

  const lockPiece = useCallback(() => {
    const idx = typeIndexRef.current;
    const id = TYPE_BY_INDEX[idx];
    for (const cell of cellsOf(id ?? "I", pieceRef.current.rot)) {
      const row = pieceRef.current.y + cell.r;
      const col = pieceRef.current.x + cell.c;
      if (row < 0) continue;
      if (boardRef.current[row]) boardRef.current[row][col] = idx;
    }
    let cleared = 0;
    for (let row = 0; row < ROWS; row += 1) {
      if (boardRef.current[row]?.every((v) => v !== -1)) {
        boardRef.current.splice(row, 1);
        boardRef.current.unshift(new Array(COLS).fill(-1));
        cleared += 1;
        row -= 1;
      }
    }
    if (cleared > 0) {
      const base = [0, 100, 300, 500, 800];
      const gain = base[Math.min(cleared, 4)] ?? 800;
      scoreRef.current += gain * levelRef.current;
      linesRef.current += cleared;
      const nextLevel = 1 + Math.floor(linesRef.current / 10);
      if (nextLevel !== levelRef.current) {
        levelRef.current = nextLevel;
        setLevel(nextLevel);
      }
      setLines(linesRef.current);
      setScore(scoreRef.current);
      const seq = [523, 659, 784, 1047];
      for (let i = 0; i < Math.min(cleared + 1, 4); i += 1) {
        tone(seq[i] ?? 523, 0.09, "square", 0.045, undefined, i * 0.07);
      }
    } else {
      tone(160, 0.09, "sine", 0.06, 90);
    }
    if (scoreRef.current > bestRef.current) {
      bestRef.current = scoreRef.current;
      syncBest(scoreRef.current);
    }
    const spawnId = nextIdFromQueue();
    setNextId(queueRef.current[0] ?? "I");
    typeIndexRef.current = TYPE_INDEX[spawnId];
    pieceRef.current = { x: 3, y: 0, rot: 0 };
    setHoldId(holdRef.current);
    if (collides(3, 0, 0, TYPE_INDEX[spawnId])) {
      phaseRef.current = "over";
      setPhase("over");
      tone(220, 0.55, "sawtooth", 0.06, 60);
    } else {
      holdUsedRef.current = false;
    }
  }, [collides, nextIdFromQueue, syncBest, tone]);

  const gravityStep = useCallback(() => {
    if (
      collides(
        pieceRef.current.x,
        pieceRef.current.y + 1,
        pieceRef.current.rot,
        typeIndexRef.current,
      )
    ) {
      lockPiece();
    } else {
      pieceRef.current.y += 1;
    }
  }, [collides, lockPiece]);

  const movePiece = useCallback(
    (dx: number) => {
      if (
        !collides(
          pieceRef.current.x + dx,
          pieceRef.current.y,
          pieceRef.current.rot,
          typeIndexRef.current,
        )
      ) {
        pieceRef.current.x += dx;
      }
    },
    [collides],
  );

  const rotatePiece = useCallback(
    (dir: 1 | -1) => {
      const nextRot = (((pieceRef.current.rot + dir) % 4) + 4) % 4;
      const kicks = [0, -1, 1, -2, 2];
      for (const kick of kicks) {
        if (
          !collides(pieceRef.current.x + kick, pieceRef.current.y, nextRot, typeIndexRef.current)
        ) {
          pieceRef.current.x += kick;
          pieceRef.current.rot = nextRot;
          tone(340, 0.04, "sine", 0.03, 420);
          return;
        }
      }
    },
    [collides, tone],
  );

  const softDrop = useCallback(() => {
    if (
      collides(
        pieceRef.current.x,
        pieceRef.current.y + 1,
        pieceRef.current.rot,
        typeIndexRef.current,
      )
    ) {
      lockPiece();
    } else {
      pieceRef.current.y += 1;
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }
  }, [collides, lockPiece]);

  const hardDrop = useCallback(() => {
    let drop = 0;
    while (
      !collides(
        pieceRef.current.x,
        pieceRef.current.y + drop + 1,
        pieceRef.current.rot,
        typeIndexRef.current,
      )
    ) {
      drop += 1;
    }
    pieceRef.current.y += drop;
    scoreRef.current += drop * 2;
    setScore(scoreRef.current);
    tone(400, 0.06, "triangle", 0.04, 220);
    lockPiece();
  }, [collides, lockPiece, tone]);

  const doHold = useCallback(() => {
    if (holdUsedRef.current) return;
    const currentId = TYPE_BY_INDEX[typeIndexRef.current] ?? "I";
    if (holdRef.current === null) {
      holdRef.current = currentId;
      const spawnId = nextIdFromQueue();
      setNextId(queueRef.current[0] ?? "I");
      typeIndexRef.current = TYPE_INDEX[spawnId];
      pieceRef.current = { x: 3, y: 0, rot: 0 };
    } else {
      const swapId = holdRef.current;
      holdRef.current = currentId;
      typeIndexRef.current = TYPE_INDEX[swapId];
      pieceRef.current = { x: 3, y: 0, rot: 0 };
    }
    setHoldId(holdRef.current);
    holdUsedRef.current = true;
    if (collides(3, 0, 0, typeIndexRef.current)) {
      phaseRef.current = "over";
      setPhase("over");
      tone(220, 0.55, "sawtooth", 0.06, 60);
    }
  }, [collides, nextIdFromQueue, tone]);

  const resetGame = useCallback(() => {
    ensureAudio();
    boardRef.current = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
    queueRef.current = shuffle(TETRO_IDS);
    holdRef.current = null;
    holdUsedRef.current = false;
    scoreRef.current = 0;
    linesRef.current = 0;
    levelRef.current = 1;
    gravityRef.current = 0;
    const firstId = nextIdFromQueue();
    typeIndexRef.current = TYPE_INDEX[firstId];
    pieceRef.current = { x: 3, y: 0, rot: 0 };
    setNextId(queueRef.current[0] ?? "I");
    setHoldId(null);
    setScore(0);
    setLevel(1);
    setLines(0);
    phaseRef.current = "play";
    setPhase("play");
  }, [ensureAudio, nextIdFromQueue]);

  useEffect(() => {
    const draw = (ctx: CanvasRenderingContext2D, _t: number) => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, "#0a0e14");
      grad.addColorStop(1, "#10161f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          const v = boardRef.current[r]?.[c] ?? -1;
          if (v >= 0) {
            const color = PIECE_COLORS[TYPE_BY_INDEX[v] ?? "I"] ?? "#ffffff";
            ctx.fillStyle = color;
            ctx.fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2);
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(c * TILE + 1, r * TILE + 1, TILE - 2, 4);
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.03)";
            ctx.fillRect(c * TILE, r * TILE, TILE, 1);
          }
        }
      }

      const idx = typeIndexRef.current;
      const currentId = TYPE_BY_INDEX[idx] ?? "I";
      const color = PIECE_COLORS[currentId] ?? "#ffffff";
      const ghost =
        phaseRef.current === "play"
          ? drawGhostCells()
          : { drop: 0, cells: cellsOf(currentId, pieceRef.current.rot) };
      const cells = ghost.cells;
      if (phaseRef.current === "play") {
        for (const cell of cells) {
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = color;
          ctx.fillRect(
            (pieceRef.current.x + cell.c) * TILE + 1,
            (pieceRef.current.y + ghost.drop + cell.r) * TILE + 1,
            TILE - 2,
            TILE - 2,
          );
          ctx.globalAlpha = 1;
        }
      }
      for (const cell of cells) {
        const px = (pieceRef.current.x + cell.c) * TILE;
        const py = (pieceRef.current.y + cell.r) * TILE;
        if (py < 0) continue;
        ctx.fillStyle = color;
        ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(px + 1, py + 1, TILE - 2, 4);
      }

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let c = 1; c < COLS; c += 1) {
        ctx.beginPath();
        ctx.moveTo(c * TILE + 0.5, 0);
        ctx.lineTo(c * TILE + 0.5, CANVAS_H);
        ctx.stroke();
      }
    };

    const step = () => {
      rafRef.current = requestAnimationFrame(step);
      const canvas = boardCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      if (phaseRef.current === "play") {
        const interval = levelSpeed(levelRef.current);
        gravityRef.current += 16.7;
        while (gravityRef.current >= interval) {
          gravityRef.current -= interval;
          gravityStep();
        }
        draw(ctx, performance.now());
      } else if (dirtyRef.current) {
        dirtyRef.current = false;
        draw(ctx, performance.now());
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawGhostCells, gravityStep, levelSpeed]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(key)) {
        e.preventDefault();
      }
      if (phaseRef.current !== "play") {
        if (key === "Enter" || key === " ") {
          if (!e.repeat) resetGame();
        }
        return;
      }
      if (key === "ArrowLeft") movePiece(-1);
      else if (key === "ArrowRight") movePiece(1);
      else if (key === "ArrowDown") softDrop();
      else if (key === "ArrowUp" || key === "x" || key === "X") rotatePiece(1);
      else if (key === "z" || key === "Z") rotatePiece(-1);
      else if (key === " ") {
        if (!e.repeat) hardDrop();
      } else if (key === "Shift" || key === "c" || key === "C") {
        if (!e.repeat) doHold();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [movePiece, softDrop, rotatePiece, hardDrop, doHold, resetGame]);

  const drawPreview = useCallback((canvas: HTMLCanvasElement | null, id: TetrominoId | null) => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = 84;
    canvas.height = 56;
    ctx.clearRect(0, 0, 84, 56);
    if (!id) return;
    const cells = cellsOf(id, 0);
    if (cells.length === 0) return;
    let minC = 9;
    let maxC = -1;
    let minR = 9;
    let maxR = -1;
    for (const cell of cells) {
      minC = Math.min(minC, cell.c);
      maxC = Math.max(maxC, cell.c);
      minR = Math.min(minR, cell.r);
      maxR = Math.max(maxR, cell.r);
    }
    const w = maxC - minC + 1;
    const h = maxR - minR + 1;
    const size = Math.min(34, Math.floor(Math.min(72 / w, 44 / h)));
    const ox = (84 - w * size) / 2;
    const oy = (56 - h * size) / 2;
    ctx.fillStyle = PIECE_COLORS[id] ?? "#ffffff";
    for (const cell of cells) {
      ctx.fillRect(
        ox + (cell.c - minC) * size + 1,
        oy + (cell.r - minR) * size + 1,
        size - 2,
        size - 2,
      );
    }
  }, []);

  useEffect(() => {
    if (phase !== "over") drawPreview(nextCanvasRef.current, nextId);
  }, [nextId, phase, drawPreview]);

  useEffect(() => {
    drawPreview(holdCanvasRef.current, holdId);
  }, [holdId, drawPreview]);

  useEffect(() => {
    const canvas = boardCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.scale(dpr, dpr);
    dirtyRef.current = true;
  }, [phase]);

  const stat = (label: string, value: string, accent: string) => (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 text-center">
      <p className={`font-mono text-lg leading-none font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-[0.55rem] font-mono tracking-[0.15em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );

  const touchBtn =
    "grid h-12 select-none place-items-center rounded-2xl border border-border bg-surface-2 font-mono text-xl text-muted-foreground transition-colors hover:border-brand-dim hover:text-brand active:bg-brand/15";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1280px] px-6 pb-28 pt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="label-mono text-brand">17 /</span>
            <span className="label-mono">{isBg ? "КЛАСИКА" : isZh ? "经典" : "CLASSIC"}</span>
          </div>
          <Link
            to="/games"
            className="label-mono text-[0.62rem] transition-colors hover:text-brand"
          >
            {COPY.home[lang]}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">TETRIS</h1>
          <span className="label-mono text-[0.62rem]">{COPY.tagline[lang]}</span>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{COPY.desc[lang]}</p>

        <div className="mx-auto mt-10 w-full max-w-[560px]">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
            <div className="order-2 flex w-full shrink-0 gap-2 sm:order-1 sm:w-28 sm:flex-col">
              {stat(COPY.score[lang], score.toLocaleString(), "text-brand")}
              {stat(COPY.best[lang], best.toLocaleString(), "text-amber-300")}
            </div>

            <div className="relative order-1 shrink-0 overflow-hidden rounded-3xl border border-border bg-black sm:order-2">
              <canvas ref={boardCanvasRef} className="block h-auto w-[min(78vw,260px)]" />
              {phase === "title" ? (
                <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
                  <div className="px-4 text-center">
                    <p className="font-display text-3xl font-bold">
                      TET<span className="text-brand">RIS</span>
                    </p>
                    <button
                      type="button"
                      onClick={resetGame}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 font-mono text-[0.8rem] font-bold tracking-[0.2em] text-primary-foreground transition-transform hover:-translate-y-0.5"
                    >
                      <Play className="size-4" />
                      {COPY.play[lang]}
                    </button>
                    <p className="mt-4 max-w-[16rem] text-[0.6rem] text-muted-foreground">
                      {COPY.controls[lang]}
                    </p>
                  </div>
                </div>
              ) : null}

              {phase === "over" ? (
                <div className="absolute inset-0 grid place-items-center bg-background/75 backdrop-blur-sm">
                  <div className="px-4 py-5 text-center">
                    <p className="font-display text-3xl font-bold text-red-400">
                      {COPY.gameOver[lang]}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      {stat(COPY.score[lang], score.toLocaleString(), "text-brand")}
                      {stat(COPY.best[lang], best.toLocaleString(), "text-amber-300")}
                    </div>
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={resetGame}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-mono text-[0.75rem] font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5"
                      >
                        <RotateCcw className="size-4" />
                        {COPY.retry[lang]}
                      </button>
                      <Link
                        to="/games"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-mono text-[0.75rem] font-bold tracking-[0.18em] text-foreground transition-transform hover:-translate-y-0.5"
                      >
                        <Home className="size-4" />
                        {COPY.home[lang]}
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="order-3 flex w-full gap-2 sm:w-28 sm:flex-col">
              <div className="flex-1 rounded-2xl border border-border bg-card px-3 py-2 sm:flex-none">
                <p className="mb-2 text-center text-[0.55rem] font-mono tracking-[0.15em] text-muted-foreground uppercase">
                  {COPY.next[lang]}
                </p>
                <canvas ref={nextCanvasRef} className="mx-auto block" />
              </div>
              <div className="flex-1 rounded-2xl border border-border bg-card px-3 py-2 sm:flex-none">
                <p className="mb-2 text-center text-[0.55rem] font-mono tracking-[0.15em] text-muted-foreground uppercase">
                  {COPY.hold[lang]}
                </p>
                <canvas ref={holdCanvasRef} className="mx-auto block" />
              </div>
              {stat(COPY.level[lang], String(level), "text-cyan-300")}
              {stat(COPY.lines[lang], String(lines), "text-pink-300")}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(5,1fr)] gap-2">
            <button type="button" onPointerDown={doHold} className={touchBtn} aria-label="Hold">
              ⇄
            </button>
            <button
              type="button"
              onPointerDown={() => rotatePiece(1)}
              className={touchBtn}
              aria-label="Rotate"
            >
              ↻
            </button>
            <button
              type="button"
              onPointerDown={() => movePiece(-1)}
              className={touchBtn}
              aria-label="Move left"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={softDrop}
              className={touchBtn}
              aria-label="Soft drop"
            >
              ▼
            </button>
            <button
              type="button"
              onPointerDown={() => movePiece(1)}
              className={touchBtn}
              aria-label="Move right"
            >
              ▶
            </button>
          </div>
          <p className="mt-3 text-center text-[0.6rem] text-muted-foreground">
            {COPY.controls[lang]}
          </p>
        </div>
      </section>
    </main>
  );
}
