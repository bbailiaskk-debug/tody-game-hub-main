import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Clock,
  Disc3,
  LogIn,
  MonitorPlay,
  RotateCcw,
  Share2,
  Swords,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";
import {
  CENTER_X,
  CENTER_Y,
  CPU_SPEED,
  FRICTION,
  GAME_H,
  GAME_W,
  GOAL_HALF,
  OX,
  OY,
  PADDLE_R,
  PADDLE_SPEED,
  PLAY_H,
  PLAY_W,
  PUCK_MAX,
  PUCK_R,
  RESTITUTION,
  WIN_SCORE,
  applyPaddleInput,
  type AhState,
  type Paddle,
  type Puck,
} from "../lib/airhockey-engine";
import { useAirHockeyOnline, type AirHockeyOnlineController } from "../lib/airhockey-multiplayer";
import type { AhPlayers } from "../lib/airhockey-online-types";

export const Route = createFileRoute("/airhockey")({
  head: () => {
    const seo = seoHead({
      path: "/airhockey",
      title: "Air Hockey",
      description:
        "Въздушен хокей за двама играчи на едно устройство, срещу компютъра или онлайн 1-на-1 с приятел — първият до 7 гола печели. Играй безплатно в браузъра.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: AirHockeyPage,
});

const P1_KEYS: readonly [string, string, string, string] = ["w", "a", "s", "d"];
const P2_KEYS: readonly [string, string, string, string] = [
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
];
const GAME_KEYS = new Set<string>([...P1_KEYS, ...P2_KEYS, " "]);

type Mode = "multi" | "cpu" | "online";
type Winner = 1 | 2 | null;

function drawPaddle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  main: string,
  dark: string,
) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, main);
  g.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
}

function drawPuck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.2, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.7, "#e2e8f0");
  g.addColorStop(1, "#94a3b8");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTable(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, GAME_W, GAME_H);

  ctx.fillStyle = "#0d1a17";
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const table = ctx.createLinearGradient(0, OY, 0, OY + PLAY_H);
  table.addColorStop(0, "#15311f");
  table.addColorStop(0.5, "#1a3a2a");
  table.addColorStop(1, "#15311f");
  ctx.fillStyle = table;
  roundRect(ctx, OX, OY, PLAY_W, PLAY_H, 18);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  roundRect(ctx, OX, OY, PLAY_W, PLAY_H, 18);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.moveTo(CENTER_X, OY);
  ctx.lineTo(CENTER_X, OY + PLAY_H);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  for (let side = 0; side < 2; side++) {
    const gx = side === 0 ? OX - 10 : OX + PLAY_W + 10;
    const gx2 = side === 0 ? 6 : GAME_W - 6;
    ctx.fillStyle = "#060d0b";
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(CENTER_Y - GOAL_HALF, gx);
    ctx.lineTo(CENTER_Y - GOAL_HALF - 10, gx2);
    ctx.lineTo(CENTER_Y + GOAL_HALF + 10, gx2);
    ctx.lineTo(CENTER_Y + GOAL_HALF, gx);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

let audioCtx: AudioContext | null = null;

function playBlip(freqStart: number, freqEnd: number, duration: number, volume: number) {
  try {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    /* ignore audio errors */
  }
}

function playBounce() {
  playBlip(240, 120, 0.07, 0.06);
}

function playPaddleHit() {
  playBlip(300, 160, 0.08, 0.08);
}

function playGoal() {
  playBlip(440, 660, 0.12, 0.1);
  setTimeout(() => playBlip(660, 880, 0.12, 0.1), 90);
}

function playWin() {
  playBlip(523, 523, 0.12, 0.09);
  setTimeout(() => playBlip(659, 659, 0.12, 0.09), 120);
  setTimeout(() => playBlip(784, 1046, 0.22, 0.1), 240);
}

function AirHockeyPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "multi";
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "online" || params.get("game") ? "online" : "multi";
  });
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [winner, setWinner] = useState<Winner>(null);

  const stateRef = useRef({
    p1: { x: OX + PLAY_W * 0.2, y: CENTER_Y, vx: 0, vy: 0 } as Paddle,
    p2: { x: OX + PLAY_W * 0.8, y: CENTER_Y, vx: 0, vy: 0 } as Paddle,
    puck: { x: CENTER_X, y: CENTER_Y, vx: -220, vy: 0 } as Puck,
    serveTimer: 0.7,
    score1: 0,
    score2: 0,
    winner: null as Winner,
  });

  const resetRound = useCallback((serveDir: -1 | 1) => {
    const s = stateRef.current;
    s.puck = {
      x: CENTER_X,
      y: CENTER_Y,
      vx: serveDir * (180 + Math.random() * 80),
      vy: (Math.random() - 0.5) * 140,
    };
    s.serveTimer = 0.7;
  }, []);

  const resetGame = useCallback(() => {
    const s = stateRef.current;
    s.p1 = { x: OX + PLAY_W * 0.2, y: CENTER_Y, vx: 0, vy: 0 };
    s.p2 = { x: OX + PLAY_W * 0.8, y: CENTER_Y, vx: 0, vy: 0 };
    s.score1 = 0;
    s.score2 = 0;
    s.winner = null;
    setScores([0, 0]);
    setWinner(null);
    resetRound(-1);
  }, [resetRound]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  useEffect(() => {
    const ensureAudio = () => {
      if (!audioCtx) {
        try {
          audioCtx = new (
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          )();
        } catch {
          /* ignore */
        }
      }
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", ensureAudio, { capture: true });
    return () => window.removeEventListener("pointerdown", ensureAudio, { capture: true });
  }, []);

  const endRound = useCallback(
    (conceder: 1 | 2) => {
      const s = stateRef.current;
      if (s.winner) return;
      if (conceder === 1) {
        s.score2 += 1;
        setScores([s.score1, s.score2]);
        playGoal();
        if (s.score2 >= WIN_SCORE) {
          s.winner = 2;
          setWinner(2);
          playWin();
          return;
        }
      } else {
        s.score1 += 1;
        setScores([s.score1, s.score2]);
        playGoal();
        if (s.score1 >= WIN_SCORE) {
          s.winner = 1;
          setWinner(1);
          playWin();
          return;
        }
      }
      resetRound(conceder === 1 ? -1 : 1);
    },
    [resetRound],
  );

  const handleGoal = useCallback(
    (conceder: 1 | 2) => {
      endRound(conceder);
    },
    [endRound],
  );

  const movePaddleToward = useCallback((p: Paddle, tx: number, ty: number, speed: number) => {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      p.vx = 0;
      p.vy = 0;
      return;
    }
    p.vx = (dx / dist) * speed;
    p.vy = (dy / dist) * speed;
  }, []);

  const collidePuckPaddle = useCallback((p: Paddle) => {
    const puck = stateRef.current.puck;
    const dx = puck.x - p.x;
    const dy = puck.y - p.y;
    const rsum = PUCK_R + PADDLE_R;
    const dist2 = dx * dx + dy * dy;
    if (dist2 >= rsum * rsum) return;
    const dist = Math.sqrt(dist2) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    puck.x = p.x + nx * (rsum + 0.5);
    puck.y = p.y + ny * (rsum + 0.5);
    const rn = (puck.vx - p.vx) * nx + (puck.vy - p.vy) * ny;
    if (rn < 0) {
      const j = (-(1 + RESTITUTION) / 2) * rn;
      puck.vx += j * nx;
      puck.vy += j * ny;
    }
    puck.vx += p.vx * 0.4;
    puck.vy += p.vy * 0.4;
    playPaddleHit();
  }, []);

  const step = useCallback(
    (dt: number) => {
      const s = stateRef.current;
      const isCpu = modeRef.current === "cpu";

      if (s.serveTimer > 0) {
        s.serveTimer -= dt;
      }

      const stepPaddle = (
        p: Paddle,
        keys: readonly [string, string, string, string],
        half: "left" | "right",
        pointerControl: boolean,
      ) => {
        const [keyUp, keyDown, keyLeft, keyRight] = keys;
        let dx = 0;
        let dy = 0;
        const k = keysRef.current;
        if (k.has(keyUp)) dy -= 1;
        if (k.has(keyDown)) dy += 1;
        if (k.has(keyLeft)) dx -= 1;
        if (k.has(keyRight)) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const norm = Math.hypot(dx, dy) || 1;
          p.vx = (dx / norm) * PADDLE_SPEED;
          p.vy = (dy / norm) * PADDLE_SPEED;
        } else if (pointerControl) {
          p.vx = 0;
          p.vy = 0;
          for (const ptr of pointersRef.current.values()) {
            const ptrHalf = ptr.x < CENTER_X ? "left" : "right";
            if (ptrHalf === half) {
              movePaddleToward(p, ptr.x, ptr.y, PADDLE_SPEED);
              break;
            }
          }
        } else {
          p.vx = 0;
          p.vy = 0;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x = Math.max(OX + PADDLE_R, Math.min(OX + PLAY_W - PADDLE_R, p.x));
        p.y = Math.max(OY + PADDLE_R, Math.min(OY + PLAY_H - PADDLE_R, p.y));
      };

      if (isCpu) {
        const p2 = s.p2;
        let tx = p2.x;
        let ty = p2.y;
        const puck = s.puck;
        if (s.winner) {
          tx = CENTER_X + PLAY_W * 0.28;
          ty = CENTER_Y;
        } else if (puck.vx > 40) {
          tx = Math.max(CENTER_X + PADDLE_R + 4, puck.x - 46);
          ty = puck.y;
        } else if (puck.vx > -40) {
          tx = puck.x - 46;
          ty = puck.y;
        } else {
          tx = CENTER_X + PLAY_W * 0.05;
          ty = CENTER_Y + Math.sin(performance.now() / 900) * 60;
        }
        const dx = tx - p2.x;
        const dy = ty - p2.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
          p2.vx = (dx / dist) * CPU_SPEED;
          p2.vy = (dy / dist) * CPU_SPEED;
        } else {
          p2.vx = 0;
          p2.vy = 0;
        }
        p2.x += p2.vx * dt;
        p2.y += p2.vy * dt;
        p2.x = Math.max(CENTER_X + PADDLE_R, Math.min(OX + PLAY_W - PADDLE_R, p2.x));
        p2.y = Math.max(OY + PADDLE_R, Math.min(OY + PLAY_H - PADDLE_R, p2.y));
      }

      stepPaddle(s.p1, P1_KEYS, "left", true);
      if (!isCpu) {
        stepPaddle(s.p2, P2_KEYS, "right", true);
      }

      const puck = s.puck;
      if (s.serveTimer <= 0) {
        puck.vx *= FRICTION;
        puck.vy *= FRICTION;
        puck.x += puck.vx * dt;
        puck.y += puck.vy * dt;

        if (puck.y - PUCK_R < OY) {
          puck.y = OY + PUCK_R;
          puck.vy = Math.abs(puck.vy) * 0.8;
          playBounce();
        } else if (puck.y + PUCK_R > OY + PLAY_H) {
          puck.y = OY + PLAY_H - PUCK_R;
          puck.vy = -Math.abs(puck.vy) * 0.8;
          playBounce();
        }

        const inGoalMouth = Math.abs(puck.y - CENTER_Y) <= GOAL_HALF;

        if (puck.x - PUCK_R <= OX) {
          if (inGoalMouth) {
            handleGoal(1);
          } else {
            puck.x = OX + PUCK_R;
            puck.vx = Math.abs(puck.vx) * 0.8;
            playBounce();
          }
        } else if (puck.x + PUCK_R >= OX + PLAY_W) {
          if (inGoalMouth) {
            handleGoal(2);
          } else {
            puck.x = OX + PLAY_W - PUCK_R;
            puck.vx = -Math.abs(puck.vx) * 0.8;
            playBounce();
          }
        }

        collidePuckPaddle(s.p1);
        collidePuckPaddle(s.p2);

        const speed = Math.hypot(puck.vx, puck.vy);
        if (speed > 0.0001 && speed < 55) {
          const k = (55 / speed) * 0.4;
          puck.vx += puck.vx * k;
          puck.vy += puck.vy * k;
        }
        const cap = Math.min(1, PUCK_MAX / (Math.hypot(puck.vx, puck.vy) || 1));
        if (cap < 1) {
          puck.vx *= cap;
          puck.vy *= cap;
        }
      }
    },
    [handleGoal, movePaddleToward, collidePuckPaddle],
  );

  const tableCache = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;

    if (!tableCache.current) {
      const off = document.createElement("canvas");
      off.width = GAME_W;
      off.height = GAME_H;
      const octx = off.getContext("2d");
      if (octx) drawTable(octx);
      tableCache.current = off;
    }
    ctx.clearRect(0, 0, GAME_W, GAME_H);
    ctx.drawImage(tableCache.current, 0, 0);

    drawPuck(ctx, s.puck.x, s.puck.y, PUCK_R);
    drawPaddle(ctx, s.p1.x, s.p1.y, PADDLE_R, "#ef4444", "#7f1d1d");
    drawPaddle(ctx, s.p2.x, s.p2.y, PADDLE_R, "#3b82f6", "#1e3a8a");

    if (s.serveTimer > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(CENTER_X, CENTER_Y, PUCK_R + 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      lastRef.current = lastRef.current ?? now;
      const dt = Math.min(0.033, (now - lastRef.current) / 1000);
      lastRef.current = now;
      if (modeRef.current !== "online") {
        step(dt);
      }
      draw();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [step, draw]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (GAME_KEYS.has(key)) {
        e.preventDefault();
      }
      keysRef.current.add(key);
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * GAME_W;
    const y = ((clientY - rect.top) / rect.height) * GAME_H;
    return { x, y };
  };

  const p1Name =
    mode === "cpu"
      ? isBg
        ? "ТИ"
        : isZh
          ? "你"
          : "YOU"
      : isBg
        ? "ИГРАЧ 1"
        : isZh
          ? "玩家 1"
          : "P1";
  const p2Name = mode === "cpu" ? "CPU" : isBg ? "ИГРАЧ 2" : isZh ? "玩家 2" : "P2";

  const switchMode = (next: Mode) => {
    setMode(next);
    resetGame();
  };

  const t = {
    heading: isBg ? "ВЪЗДУШЕН ХОКЕЙ" : isZh ? "空气曲棍球" : "AIR HOCKEY",
    tag: isBg ? "СПОРТ АРКАДА" : isZh ? "体育街机" : "SPORTS ARCADE",
    multi: isBg ? "2 ИГРАЧА" : isZh ? "双人" : "2 PLAYERS",
    cpu: isBg ? "СРЕЩУ КОМПЮТЪР" : isZh ? "对战电脑" : "VS CPU",
    online: isBg ? "ОНЛАЙН" : isZh ? "在线" : "ONLINE",
    firstTo: isBg ? "ПЪРВИ ДО 7" : isZh ? "先得 7 分" : "FIRST TO 7",
    hint: isBg
      ? "2 ИГРАЧА · 1 УСТРОЙСТВО — Играч 1: лява половина (W A S D или допир/мишка) · Играч 2: дясна половина (стрелки или допир/мишка)"
      : isZh
        ? "单设备双人 — 玩家 1：左半区（W A S D 或触摸/鼠标）· 玩家 2：右半区（方向键或触摸/鼠标）"
        : "2 PLAYERS · 1 DEVICE — P1: left half (W A S D or touch/mouse) · P2: right half (arrow keys or touch/mouse)",
    newGame: isBg ? "НОВА ИГРА" : isZh ? "新游戏" : "NEW GAME",
    win1: isBg ? "ИГРАЧ 1 ПОБЕДИ!" : isZh ? "玩家 1 获胜！" : "P1 WINS!",
    win2: isBg ? "ИГРАЧ 2 ПОБЕДИ!" : isZh ? "玩家 2 获胜！" : "P2 WINS!",
    youWin: isBg ? "ТИ ПОБЕДИ!" : isZh ? "你赢了！" : "YOU WIN!",
    cpuWins: isBg ? "КОМПЮТЪРЪТ ПОБЕДИ!" : isZh ? "电脑获胜！" : "CPU WINS!",
    playAgain: isBg ? "ОЩЕ ВЕДНЪЖ" : isZh ? "再来一局" : "PLAY AGAIN",
  };

  const winText = winner
    ? mode === "cpu"
      ? winner === 1
        ? t.youWin
        : t.cpuWins
      : winner === 1
        ? t.win1
        : t.win2
    : "";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">09 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : isZh ? "游戏" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.2rem,6vw,4.5rem)] leading-none">{t.heading}</h1>
          <span className="label-mono text-[0.62rem]">{t.tag}</span>
        </div>

        <div className="mt-5 inline-flex flex-wrap items-center gap-1 rounded-full border border-border/60 bg-surface/60 p-1">
          <button
            type="button"
            onClick={() => switchMode("multi")}
            aria-pressed={mode === "multi"}
            className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
              mode === "multi"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Swords className="size-3.5" />
              {t.multi}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchMode("cpu")}
            aria-pressed={mode === "cpu"}
            className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
              mode === "cpu"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MonitorPlay className="size-3.5" />
              {t.cpu}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchMode("online")}
            aria-pressed={mode === "online"}
            className={`rounded-full px-5 py-2 font-mono text-[0.65rem] font-bold tracking-[0.18em] uppercase transition-colors ${
              mode === "online"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {t.online}
            </span>
          </button>
        </div>

        <div className="night-panel relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          {mode !== "online" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
                    {t.firstTo}
                  </span>
                  <span className="hidden font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase sm:inline">
                    {isBg ? "СРЕЩА" : isZh ? "对战" : "MATCH"}
                  </span>
                </div>
              </div>

              <div className="px-5 pb-4">
                <div className="grid grid-cols-3 items-center gap-2 rounded-2xl bg-[#0d1a17] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-3 rounded-full bg-[#ef4444]" aria-hidden="true" />
                    <span className="font-mono text-[0.62rem] tracking-[0.18em] text-muted-foreground uppercase">
                      {p1Name}
                    </span>
                  </div>
                  <div className="text-center font-mono text-2xl font-bold tracking-[0.15em] text-[var(--brand-bright)]">
                    {scores[0]} <span className="text-muted-foreground">:</span> {scores[1]}
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <span className="font-mono text-[0.62rem] tracking-[0.18em] text-muted-foreground uppercase">
                      {p2Name}
                    </span>
                    <span className="grid size-3 rounded-full bg-[#3b82f6]" aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div className="relative px-5 pb-5">
                <canvas
                  ref={canvasRef}
                  width={GAME_W}
                  height={GAME_H}
                  aria-label={t.heading}
                  className="w-full touch-none rounded-2xl"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const p = toCanvasCoords(e.clientX, e.clientY);
                    if (p) pointersRef.current.set(e.pointerId, p);
                  }}
                  onPointerMove={(e) => {
                    if (!pointersRef.current.has(e.pointerId)) return;
                    const p = toCanvasCoords(e.clientX, e.clientY);
                    if (p) pointersRef.current.set(e.pointerId, p);
                  }}
                  onPointerUp={(e) => {
                    pointersRef.current.delete(e.pointerId);
                  }}
                  onPointerCancel={(e) => {
                    pointersRef.current.delete(e.pointerId);
                  }}
                  onPointerLeave={(e) => {
                    pointersRef.current.delete(e.pointerId);
                  }}
                />

                {winner ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#161B16]/85 backdrop-blur-sm">
                    <Trophy className="size-10 text-[#FFD700]" aria-hidden="true" />
                    <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                      {winText}
                    </span>
                    <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                      {scores[0]} : {scores[1]}
                    </span>
                    <button
                      type="button"
                      onClick={resetGame}
                      className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
                    >
                      <RotateCcw className="size-4" />
                      {t.playAgain}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <OnlineAirHockeyGame />
          )}
        </div>

        {mode !== "online" ? (
          <>
            <p className="mt-6 text-center font-mono text-[0.62rem] leading-relaxed tracking-[0.15em] text-muted-foreground uppercase">
              {t.hint}
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={resetGame}
                className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <Disc3 className="size-4" />
                {t.newGame}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function AhOnlineGameLobby({ online }: { online: AirHockeyOnlineController }) {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [codeInput, setCodeInput] = useState("");
  const [color, setColor] = useState<"p1" | "p2" | null>(null);

  const loggedIn = Boolean(online.myEmail);

  if (online.phase === "connecting") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="font-mono text-sm tracking-[0.2em] text-brand uppercase">
          {isBg ? "Свързване…" : isZh ? "连接中…" : "CONNECTING…"}
        </span>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="font-mono text-sm tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "Изисква се акаунт" : isZh ? "需要账号" : "ACCOUNT REQUIRED"}
        </span>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-xs tracking-[0.15em] text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5"
        >
          <LogIn className="size-4" />
          {isBg ? "ВХОД" : isZh ? "登录" : "LOGIN"}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-5 p-8">
      <span className="font-mono text-sm tracking-[0.2em] text-foreground uppercase">
        {isBg
          ? "Играй с приятел в реално време"
          : isZh
            ? "与朋友实时对决"
            : "PLAY A FRIEND IN REAL TIME"}
      </span>

      <div className="w-full max-w-md">
        <div className="mb-3 text-center font-mono text-[0.62rem] tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "Избери цвят" : isZh ? "选择颜色" : "CHOOSE COLOR"}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setColor(color === "p1" ? null : "p1")}
            aria-pressed={color === "p1"}
            className={`rounded-2xl border px-5 py-4 text-center transition-all duration-200 ${
              color === "p1"
                ? "border-[#1DB954]/60 bg-[#1DB954]/10 shadow-[0_0_14px_rgba(29,185,84,0.2)]"
                : "border-border bg-surface hover:border-border/70"
            }`}
          >
            <span className="mx-auto grid size-5 rounded-full bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.45)]" />
            <span className="mt-3 block font-mono text-xs font-bold tracking-[0.18em] text-foreground uppercase">
              {isBg ? "ЧЕРВЕНО" : isZh ? "红色" : "RED"}
            </span>
            <span className="mt-1 block font-mono text-[0.55rem] tracking-[0.15em] text-muted-foreground uppercase">
              {isBg ? "Лява бухалка" : isZh ? "左侧球拍" : "LEFT PADDLE"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setColor(color === "p2" ? null : "p2")}
            aria-pressed={color === "p2"}
            className={`rounded-2xl border px-5 py-4 text-center transition-all duration-200 ${
              color === "p2"
                ? "border-[#1DB954]/60 bg-[#1DB954]/10 shadow-[0_0_14px_rgba(29,185,84,0.2)]"
                : "border-border bg-surface hover:border-border/70"
            }`}
          >
            <span className="mx-auto grid size-5 rounded-full bg-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.45)]" />
            <span className="mt-3 block font-mono text-xs font-bold tracking-[0.18em] text-foreground uppercase">
              {isBg ? "СИНЬО" : isZh ? "蓝色" : "BLUE"}
            </span>
            <span className="mt-1 block font-mono text-[0.55rem] tracking-[0.15em] text-muted-foreground uppercase">
              {isBg ? "Дясна бухалка" : isZh ? "右侧球拍" : "RIGHT PADDLE"}
            </span>
          </button>
        </div>
        {color ? (
          <p className="mt-3 text-center font-mono text-[0.58rem] tracking-[0.15em] text-[var(--brand-bright)] uppercase">
            {isBg
              ? color === "p1"
                ? "Класираш се за ЧЕРВЕНО — при заето място получаваш СИНЬО."
                : "Класираш се за СИНЬО — при заето място получаваш ЧЕРВЕНО."
              : isZh
                ? color === "p1"
                  ? "你选择了红色 — 若已被占用将改为蓝色。"
                  : "你选择了蓝色 — 若已被占用将改为红色。"
                : color === "p1"
                  ? "You'll play RED — if taken, you'll get BLUE."
                  : "You'll play BLUE — if taken, you'll get RED."}
          </p>
        ) : (
          <p className="mt-3 text-center font-mono text-[0.58rem] tracking-[0.15em] text-muted-foreground uppercase">
            {isBg
              ? "Без избор цветът се определя автоматично."
              : isZh
                ? "未选择时颜色自动分配。"
                : "No choice — color is auto-assigned."}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <input
          type="text"
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
          placeholder={isBg ? "Код на играта" : isZh ? "游戏代码" : "GAME CODE"}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground uppercase outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[#1DB954]/60"
          onKeyDown={(event) => {
            if (event.key === "Enter" && codeInput.trim().length > 0) {
              void online.joinGame(codeInput, color ?? undefined);
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (codeInput.trim().length > 0) void online.joinGame(codeInput, color ?? undefined);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
          disabled={codeInput.trim().length === 0}
        >
          <UserPlus className="size-4" />
          {isBg ? "ПРИСЪЕДИНИ СЕ" : isZh ? "加入游戏" : "JOIN GAME"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px w-10 bg-border" />
        <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
          {isBg ? "или" : isZh ? "或" : "or"}
        </span>
        <span className="h-px w-10 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => void online.createGame(color ?? undefined)}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 font-mono text-xs font-bold tracking-[0.2em] text-primary-foreground uppercase shadow-glow transition-transform hover:-translate-y-0.5"
      >
        <Users className="size-4" />
        {isBg ? "СЪЗДАЙ ИГРА" : isZh ? "创建游戏" : "CREATE GAME"}
      </button>

      {online.error && online.error !== "login-required" && (
        <span className="font-mono text-xs tracking-[0.15em] text-red-400 uppercase">
          {online.error}
        </span>
      )}
    </div>
  );
}

function OnlineAirHockeyGame() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const online = useAirHockeyOnline();
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastSnapRef = useRef<{ state: AhState; receivedAt: number } | null>(null);
  const prevSnapRef = useRef<{ state: AhState; receivedAt: number } | null>(null);
  const ownPaddleRef = useRef<Paddle | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (GAME_KEYS.has(key)) {
        e.preventDefault();
      }
      keysRef.current.add(key);
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const sendInputRef = useRef(online.sendInput);
  sendInputRef.current = online.sendInput;
  const myRoleRef = useRef(online.myRole);
  myRoleRef.current = online.myRole;
  const phaseRef = useRef(online.phase);
  phaseRef.current = online.phase;

  useEffect(() => {
    const snap = online.snapshot;
    if (!snap) return;
    const prev = lastSnapRef.current;
    prevSnapRef.current = prev;
    lastSnapRef.current = { state: snap.state, receivedAt: performance.now() };

    const role = myRoleRef.current;
    if (role === "p1" || role === "p2") {
      const own = role === "p1" ? snap.state.p1 : snap.state.p2;
      const current = ownPaddleRef.current;
      const drift = current ? Math.hypot(own.x - current.x, own.y - current.y) : Infinity;
      if (!current || drift > 42 || snap.state.winner) {
        ownPaddleRef.current = { ...own };
      }
    }
  }, [online.snapshot]);

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;

    const draw = (now: number, role: "p1" | "p2" | "spectator" | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const current = lastSnapRef.current;
      ctx.clearRect(0, 0, GAME_W, GAME_H);
      if (!tableCache.current) {
        const off = document.createElement("canvas");
        off.width = GAME_W;
        off.height = GAME_H;
        const octx = off.getContext("2d");
        if (octx) drawTable(octx);
        tableCache.current = off;
      }
      ctx.drawImage(tableCache.current, 0, 0);
      if (!current) return;

      const prevReceivedAt = prevSnapRef.current?.receivedAt ?? current.receivedAt;
      const span = Math.max(1, current.receivedAt - prevReceivedAt);
      const t = Math.min(1, Math.max(0, (now - prevReceivedAt) / span));

      const teleport =
        prevSnapRef.current !== null &&
        (Math.hypot(
          prevSnapRef.current.state.puck.x - current.state.puck.x,
          prevSnapRef.current.state.puck.y - current.state.puck.y,
        ) > 120 ||
          Math.hypot(
            prevSnapRef.current.state.p1.x - current.state.p1.x,
            prevSnapRef.current.state.p1.y - current.state.p1.y,
          ) > 120 ||
          Math.hypot(
            prevSnapRef.current.state.p2.x - current.state.p2.x,
            prevSnapRef.current.state.p2.y - current.state.p2.y,
          ) > 120);

      const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });

      const prevState = prevSnapRef.current?.state ?? current.state;
      const puck =
        teleport || !prevSnapRef.current
          ? current.state.puck
          : lerp(prevState.puck, current.state.puck);
      drawPuck(ctx, puck.x, puck.y, PUCK_R);

      if (role === "p1" || role === "p2") {
        const own = ownPaddleRef.current;
        const snapOwn = role === "p1" ? current.state.p1 : current.state.p2;
        const snapOpp = role === "p1" ? current.state.p2 : current.state.p1;
        const prevSnapOpp = role === "p1" ? prevState.p2 : prevState.p1;
        const oppPos = teleport || !prevSnapRef.current ? snapOpp : lerp(prevSnapOpp, snapOpp);
        const ownPos = own ? own : snapOwn;
        if (role === "p1") {
          drawPaddle(ctx, oppPos.x, oppPos.y, PADDLE_R, "#3b82f6", "#1e3a8a");
          drawPaddle(ctx, ownPos.x, ownPos.y, PADDLE_R, "#ef4444", "#7f1d1d");
        } else {
          drawPaddle(ctx, oppPos.x, oppPos.y, PADDLE_R, "#ef4444", "#7f1d1d");
          drawPaddle(ctx, ownPos.x, ownPos.y, PADDLE_R, "#3b82f6", "#1e3a8a");
        }
      } else {
        const p1 =
          teleport || !prevSnapRef.current
            ? current.state.p1
            : lerp(prevState.p1, current.state.p1);
        const p2 =
          teleport || !prevSnapRef.current
            ? current.state.p2
            : lerp(prevState.p2, current.state.p2);
        drawPaddle(ctx, p1.x, p1.y, PADDLE_R, "#ef4444", "#7f1d1d");
        drawPaddle(ctx, p2.x, p2.y, PADDLE_R, "#3b82f6", "#1e3a8a");
      }

      if (current.state.serveTimer > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(CENTER_X, CENTER_Y, PUCK_R + 14, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (now: number) => {
      if (last === null) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const phase = phaseRef.current;
      const role = myRoleRef.current;
      if (phase === "waiting" || phase === "playing") {
        const keys = role === "p2" ? P2_KEYS : P1_KEYS;
        let dx = 0;
        let dy = 0;
        const k = keysRef.current;
        if (k.has(keys[0])) dy -= 1;
        if (k.has(keys[1])) dy += 1;
        if (k.has(keys[2])) dx -= 1;
        if (k.has(keys[3])) dx += 1;
        let mx: number | null = null;
        let my: number | null = null;
        if (dx === 0 && dy === 0) {
          for (const ptr of pointersRef.current.values()) {
            mx = ptr.x;
            my = ptr.y;
            break;
          }
        }
        sendInputRef.current(mx, my, dx, dy);
        if (phase === "playing" && (role === "p1" || role === "p2")) {
          const pred = ownPaddleRef.current;
          if (pred) applyPaddleInput(pred, { mx, my, dx, dy }, dt);
        }
      }

      draw(now, role);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * GAME_W,
      y: ((clientY - rect.top) / rect.height) * GAME_H,
    };
  };

  const snap = online.snapshot;
  const heading = isBg ? "ВЪЗДУШЕН ХОКЕЙ" : isZh ? "空气曲棍球" : "AIR HOCKEY";

  if (!snap) {
    return <AhOnlineGameLobby online={online} />;
  }

  const myRole = online.myRole;
  const joinedCount = [snap.players.p1, snap.players.p2].filter(Boolean).length;
  const shareUrl =
    typeof window !== "undefined" && online.gameId
      ? `${window.location.origin}/airhockey?game=${online.gameId}`
      : "";

  let headerText: string;
  if (online.phase === "error" && online.error) {
    headerText =
      online.error === "disconnected"
        ? isBg
          ? "СВЪРЗВАНЕТО ПРЕКЪСНАТО"
          : isZh
            ? "连接已断开"
            : "DISCONNECTED"
        : online.error;
  } else if (snap.result === "draw") {
    headerText = isZh ? "平局！" : isBg ? "РАВЕНСТВО!" : "DRAW!";
  } else if (snap.result) {
    headerText =
      snap.result === "p1-wins"
        ? isBg
          ? "ИГРАЧ 1 ПОБЕДИ!"
          : isZh
            ? "玩家 1 获胜！"
            : "P1 WINS!"
        : isBg
          ? "ИГРАЧ 2 ПОБЕДИ!"
          : isZh
            ? "玩家 2 获胜！"
            : "P2 WINS!";
  } else if (joinedCount < 2) {
    headerText = isZh ? "等待对手…" : isBg ? "Чакаме противник…" : "WAITING FOR OPPONENT…";
  } else {
    headerText = isZh ? "比赛进行中" : isBg ? "НА ЖИВО" : "LIVE MATCH";
  }

  const headerTone = snap.result
    ? "text-brand"
    : online.phase === "error"
      ? "text-[#f87171]"
      : "text-muted-foreground";

  const p1 = snap.players.p1;
  const p2 = snap.players.p2;
  const p1Name = p1?.name || (isBg ? "ИГРАЧ 1" : isZh ? "玩家 1" : "P1");
  const p2Name = p2?.name || (isBg ? "Чакаме…" : isZh ? "等待…" : "WAITING…");
  const myRematchPending =
    myRole === "p1" ? snap.rematch.p1 : myRole === "p2" ? snap.rematch.p2 : false;
  const timeSeconds = Math.ceil(
    Math.max(0, Number.isFinite(snap.timeLeftMs) ? snap.timeLeftMs : 120000) / 1000,
  );
  const timeText = `${Math.floor(timeSeconds / 60)}:${String(timeSeconds % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <span className={`font-mono text-[0.65rem] tracking-[0.2em] uppercase ${headerTone}`}>
          {headerText}
        </span>
        <span className="hidden font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase sm:inline">
          {isBg ? "ОНЛАЙН МАЧ" : isZh ? "在线比赛" : "ONLINE MATCH"}
        </span>
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/40 bg-surface/40 px-4 py-2 font-mono text-[0.62rem] tracking-[0.15em] uppercase">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <span
              className={`size-2 shrink-0 rounded-full ${p1?.online ? "bg-[#4ADE80]" : "bg-muted-foreground/40"}`}
            />
            <span className={`truncate ${myRole === "p1" ? "text-foreground" : ""}`}>{p1Name}</span>
          </span>
          <span className="shrink-0 text-brand">VS</span>
          <span className="flex min-w-0 items-center justify-end gap-1.5 text-muted-foreground">
            <span className={`truncate ${myRole === "p2" ? "text-foreground" : ""}`}>{p2Name}</span>
            <span
              className={`size-2 shrink-0 rounded-full ${p2?.online ? "bg-[#4ADE80]" : "bg-muted-foreground/40"}`}
            />
          </span>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 items-center gap-2 rounded-2xl bg-[#0d1a17] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-3 rounded-full bg-[#ef4444]" aria-hidden="true" />
            <span className="font-mono text-[0.62rem] tracking-[0.18em] text-muted-foreground uppercase">
              {p1Name}
            </span>
          </div>
          <div className="text-center">
            <div className="font-mono text-2xl font-bold tracking-[0.15em] text-[var(--brand-bright)]">
              {snap.state.score1} <span className="text-muted-foreground">:</span>{" "}
              {snap.state.score2}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[0.6rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              <Clock className="size-3" />
              {timeText}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="font-mono text-[0.62rem] tracking-[0.18em] text-muted-foreground uppercase">
              {p2Name}
            </span>
            <span className="grid size-3 rounded-full bg-[#3b82f6]" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="relative px-5 pb-5">
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          aria-label={heading}
          className="w-full touch-none rounded-2xl"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = toCanvasCoords(e.clientX, e.clientY);
            if (p) pointersRef.current.set(e.pointerId, p);
          }}
          onPointerMove={(e) => {
            if (!pointersRef.current.has(e.pointerId)) return;
            const p = toCanvasCoords(e.clientX, e.clientY);
            if (p) pointersRef.current.set(e.pointerId, p);
          }}
          onPointerUp={(e) => {
            pointersRef.current.delete(e.pointerId);
          }}
          onPointerCancel={(e) => {
            pointersRef.current.delete(e.pointerId);
          }}
          onPointerLeave={(e) => {
            pointersRef.current.delete(e.pointerId);
          }}
        />

        {snap.result ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#161B16]/85 backdrop-blur-sm">
            <Trophy className="size-10 text-[#FFD700]" aria-hidden="true" />
            <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
              {headerText}
            </span>
            {snap.endReason === "timeup" ? (
              <span className="font-mono text-xs tracking-[0.2em] text-[#f87171] uppercase">
                {isBg ? "ВРЕМЕТО ИЗТЕЧЕ" : isZh ? "时间到" : "TIME'S UP"}
              </span>
            ) : null}
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
              {snap.state.score1} : {snap.state.score2}
            </span>
            <button
              type="button"
              onClick={() => online.requestRematch()}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
            >
              <RotateCcw className="size-4" />
              {myRematchPending
                ? isBg
                  ? "Чакаме противника…"
                  : isZh
                    ? "等待对手…"
                    : "WAITING…"
                : snap.endReason === "timeup"
                  ? isBg
                    ? "ПРОДЪЛЖИ"
                    : isZh
                      ? "继续"
                      : "CONTINUE"
                  : isBg
                    ? "РЕВАНШ"
                    : isZh
                      ? "再来一局"
                      : "REMATCH"}
            </button>
            <span className="font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase">
              {isBg ? "Код" : isZh ? "代码" : "CODE"} — {snap.gameId}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 px-5 pb-6">
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
              {isBg ? "КОПИРАЙ ЛИНК" : isZh ? "复制链接" : "COPY LINK"}
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
          {isBg ? "НАПУСНИ" : isZh ? "退出" : "LEAVE"}
        </button>
      </div>
    </>
  );
}
