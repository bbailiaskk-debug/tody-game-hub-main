import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";

export const Route = createFileRoute("/dino")({
  head: () => ({
    meta: [
      { title: "Chrome Dinosaur Game — Todor Khristov Gaming" },
      {
        name: "description",
        content: "Playable Chrome Dinosaur Game — jump over the cacti and take a break.",
      },
    ],
  }),
  component: DinoGamePage,
});

const GAME_W = 900;
const GAME_H = 300;
const GROUND_Y = 252;

type Obstacle = {
  x: number;
  width: number;
  height: number;
};

function DinoGamePage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const displayedScoreRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const gameRef = useRef({
    dinoY: GROUND_Y,
    vy: 0,
    ducking: false,
    obstacles: [] as Obstacle[],
    spawnTimer: 0,
    speed: 320,
    frames: 0,
    score: 0,
  });

  useEffect(() => {
    setBest(Number(window.localStorage.getItem("dino-high-score") || "0"));
  }, []);

  const drawDino = (ctx: CanvasRenderingContext2D, ducking: boolean) => {
    const x = 60;
    const y = gameRef.current.dinoY;
    const bodyColor = "#1DB954";
    const darkColor = "#147d3a";

    ctx.fillStyle = bodyColor;

    if (ducking) {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x, y + 8, 48, 18);
      ctx.fillRect(x + 34, y + 2, 24, 18);
      ctx.fillRect(x + 50, y + 14, 14, 12);
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + 42, y + 8, 5, 8);
    } else {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x, y, 26, 22);
      ctx.fillRect(x + 16, y - 20, 24, 24);
      ctx.fillRect(x - 6, y + 12, 12, 14);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 30, y - 14, 8, 8);
      ctx.fillStyle = "#0d1a17";
      ctx.fillRect(x + 34, y - 12, 4, 4);

      ctx.fillStyle = bodyColor;
      const legY = gameRef.current.frames % 10 < 5 ? y + 22 : y + 18;
      ctx.fillRect(x + 4, legY, 6, 16);
      ctx.fillRect(x + 14, y + 20, 6, 18);
    }
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, o: Obstacle) => {
    ctx.fillStyle = "#d6e69c";
    for (let i = 0; i < Math.ceil(o.height / 14); i++) {
      ctx.fillRect(o.x + 4, GROUND_Y - (i + 1) * 14, o.width - 8, 14);
    }
    ctx.fillStyle = "#1DB954";
    ctx.fillRect(o.x, GROUND_Y - o.height, 4, o.height);
    ctx.fillRect(o.x + o.width - 4, GROUND_Y - o.height, 4, o.height);
  };

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = "#161B16";
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.strokeStyle = "#1DB954";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(GAME_W, GROUND_Y);
    ctx.stroke();
    drawDino(ctx, false);
  }, []);

  const startGame = useCallback(() => {
    if (isGameOver) {
      gameRef.current = {
        dinoY: GROUND_Y,
        vy: 0,
        ducking: false,
        obstacles: [],
        spawnTimer: 0,
        speed: 320,
        frames: 0,
        score: 0,
      };
      setIsGameOver(false);
    }
    setIsRunning(true);
    lastRef.current = null;
    displayedScoreRef.current = 0;
    setScore(0);
  }, [isGameOver]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);

  useEffect(() => {
    if (!isRunning) return;

    const step = (now: number) => {
      const g = gameRef.current;
      rafRef.current = requestAnimationFrame(step);

      if (lastRef.current === null) {
        lastRef.current = now;
        return;
      }
      const dt = Math.min((now - lastRef.current) / 1000, 0.05);
      lastRef.current = now;

      const space = keysRef.current.has(" ") || keysRef.current.has("ArrowUp");
      const down = keysRef.current.has("ArrowDown");
      const onGround = g.dinoY >= GROUND_Y;

      if (space && onGround) {
        g.vy = -760;
        g.dinoY = GROUND_Y - 2;
      }

      if (g.dinoY < GROUND_Y) {
        g.vy += 2200 * dt;
        g.dinoY += g.vy * dt;
        if (g.dinoY > GROUND_Y) {
          g.dinoY = GROUND_Y;
          g.vy = 0;
        }
      }

      g.ducking = onGround && down;

      g.speed = Math.min(320 + g.score * 0.6, 720);
      g.frames += 1;
      g.score += dt * g.speed * 0.02;
      const nextScore = Math.floor(g.score);
      if (nextScore !== displayedScoreRef.current) {
        displayedScoreRef.current = nextScore;
        setScore(nextScore);
      }

      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0) {
        const height = Math.random() < 0.5 ? 36 : 52;
        g.obstacles.push({
          x: GAME_W + 20,
          width: 22,
          height,
        });
        g.spawnTimer = 0.9 + Math.random() * 1.4;
      }

      g.obstacles = g.obstacles.filter((o) => o.x + o.width > -20);
      for (const o of g.obstacles) {
        o.x -= g.speed * dt;
      }

      const w = g.ducking ? 58 : 40;
      const h = g.ducking ? 26 : 42;
      const dinoHit = {
        x: 60,
        y: g.ducking ? g.dinoY + 8 : g.dinoY - 20,
        width: w,
        height: h,
      };

      for (const o of g.obstacles) {
        const oHit = { x: o.x + 2, y: GROUND_Y - o.height, width: o.width - 4, height: o.height };
        if (
          dinoHit.x < oHit.x + oHit.width &&
          dinoHit.x + dinoHit.width > oHit.x &&
          dinoHit.y < oHit.y + oHit.height &&
          dinoHit.y + dinoHit.height > oHit.y
        ) {
          setIsRunning(false);
          setIsGameOver(true);
          const highScore = Number(window.localStorage.getItem("dino-high-score") || "0");
          const newBest = Math.max(highScore, Math.floor(g.score));
          window.localStorage.setItem("dino-high-score", String(newBest));
          setBest(newBest);
          return;
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#161B16";
      ctx.fillRect(0, 0, GAME_W, GAME_H);

      ctx.strokeStyle = "#1DB954";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(GAME_W, GROUND_Y);
      ctx.stroke();

      ctx.fillStyle = "#1DB954";
      for (let i = 0; i < 9; i++) {
        const x = (((i * 100 - g.score * 2) % (GAME_W + 100)) + GAME_W) % (GAME_W + 100);
        ctx.fillRect(x, GROUND_Y + 8, 26, 3);
      }

      g.obstacles.forEach((o) => drawObstacle(ctx, o));
      drawDino(ctx, g.ducking);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ([" ", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
      if (e.key === " " || e.key === "ArrowUp") {
        if (!isRunning && !isGameOver) startGame();
        else if (isGameOver) startGame();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isRunning, isGameOver, startGame]);

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">05 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            {isBg ? "CHROME DINO" : "CHROME DINO"}
          </h1>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "TAKE A BREAK" : "TAKE A BREAK"}
          </span>
        </div>

        <div className="night-panel relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#161B16] shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "НАЙ-ДОБЪР РЕЗУЛТАТ" : "HIGH SCORE"} — {best}
            </span>
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
              {isBg ? "РЕЗУЛТАТ" : "SCORE"} — {score}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            width={GAME_W}
            height={GAME_H}
            className="block h-auto w-full select-none"
          />

          {!isRunning && !isGameOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#161B16]/70 backdrop-blur-sm">
              <span className="font-mono text-sm tracking-[0.3em] text-muted-foreground uppercase">
                {isBg ? "Натисни SPACE или докосни, за да започнеш" : "Press SPACE or tap to start"}
              </span>
              <button
                type="button"
                onClick={startGame}
                className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                {isBg ? "СТАРТ" : "START"}
              </button>
            </div>
          )}

          {isGameOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#161B16]/80 backdrop-blur-sm">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                {isBg ? "ИГРАТА СВЪРШИ" : "GAME OVER"}
              </span>
              <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                {isBg ? "Твой резултат" : "Your score"} — {score}
              </span>
              <button
                type="button"
                onClick={startGame}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <RotateCcw className="size-4" />
                {isBg ? "ОЩЕ ВЕДНЪЖ" : "PLAY AGAIN"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">SPACE</span> — {isBg ? "скок" : "jump"}
          </span>
          <span>
            <span className="text-brand">↓</span> — {isBg ? "приклекни" : "duck"}
          </span>
        </div>
      </section>
    </main>
  );
}
