import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Play, RotateCcw, Star, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/beatbattle")({
  head: () => {
    const seo = seoHead({
      path: "/beatbattle",
      title: "BEAT BATTLE",
      description:
        "Оригинална ритъм игра в дуела на музиката — удряй нотите в ритъма, запълни лентата на съперника и не спирай да свириш.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: BeatBattlePage,
});

type Text = { bg: string; en: string; zh: string };
type Lane = 0 | 1 | 2 | 3;
type Judgment = "perfect" | "good" | "miss";
type Phase = "title" | "play" | "result";

type Note = {
  id: number;
  lane: Lane;
  at: number;
  judged: Judgment | null;
};

type Song = {
  id: number;
  name: Text;
  emoji: string;
  beats: number;
  seed: number;
  diff: number;
};

type Popup = {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
};

const BPM = 132;
const BEAT_MS = 60000 / BPM;
const CANVAS_W = 440;
const CANVAS_H = 330;
const LANE_W = CANVAS_W / 4;
const TARGET_Y = 282;
const SPEED = 0.24;
const LEAD_MS = 240 / SPEED;
const HIT_EARLY = 165;
const HIT_LATE = 185;
const MISS_AFTER = 260;

const LANE_GLYPHS = ["←", "↓", "↑", "→"];
const LANE_COLORS = ["#f472b6", "#22d3ee", "#fbbf24", "#a78bfa"];
const KEY_TO_LANE: Record<string, Lane | undefined> = {
  ArrowLeft: 0,
  a: 0,
  A: 0,
  ArrowDown: 1,
  s: 1,
  S: 1,
  ArrowUp: 2,
  w: 2,
  W: 2,
  ArrowRight: 3,
  d: 3,
  D: 3,
};

const SONGS: Song[] = [
  {
    id: 0,
    name: { bg: "ПЪРВИ БИТ", en: "FIRST BEAT", zh: "初始节拍" },
    emoji: "🥁",
    beats: 48,
    seed: 3,
    diff: 1,
  },
  {
    id: 1,
    name: { bg: "КОНФРОНТАЦИЯ", en: "SHOWDOWN", zh: "巅峰对决" },
    emoji: "⚡",
    beats: 72,
    seed: 9,
    diff: 2,
  },
  {
    id: 2,
    name: { bg: "ФИНАЛЕН ДРОП", en: "FINAL DROP", zh: "终焉乐段" },
    emoji: "🔥",
    beats: 96,
    seed: 17,
    diff: 3,
  },
];

const BASS_TABLE = [0, 0, 7, 12, 0, 0, 5, 10];

const COPY = {
  tagline: {
    bg: "РИТМЪТ Е ОРЪЖИЕ — ДУЕЛ В БИТА",
    en: "RHYTHM IS THE WEAPON — A DUEL IN THE BEAT",
    zh: "节奏即武器 — 节拍中的对决",
  },
  desc: {
    bg: "Ти си ДЖЕЙ, уличен бийтбоксър. РОКС хвърля ръкавица — удряй нотите, когато стигнат целта (← ↓ ↑ → или WASD), събаряй лентата му и не остави своята да свърши. ПЕРФЕКТНИ уцелвания рушат повече.",
    en: "You are JAY, an underground beatboxer. ROX throws down the gauntlet — hit the notes as they reach the line (← ↓ ↑ → or WASD), drain his bar and never let yours hit zero. PERFECT hits deal more damage.",
    zh: "你是街头的节奏斗士杰伊。罗克斯向你发起挑战——当音符到达判定线时敲击按键（← ↓ ↑ → 或 WASD），耗尽他的血槽，不能让你的血槽归零。完美命中伤害更高。",
  },
  player: { bg: "ТИ / ДЖЕЙ", en: "YOU / JAY", zh: "你 / 杰伊" },
  rival: { bg: "СЪПЕРНИК / РОКС", en: "RIVAL / ROX", zh: "对手 / 罗克斯" },
  score: { bg: "ТОЧКИ", en: "SCORE", zh: "得分" },
  combo: { bg: "КОМБО", en: "COMBO", zh: "连击" },
  best: { bg: "РЕКОРД", en: "BEST", zh: "纪录" },
  play: { bg: "СТАРТ", en: "PLAY", zh: "开始" },
  retry: { bg: "ОТНОВО", en: "RETRY", zh: "重新挑战" },
  home: { bg: "МЕНЮ", en: "HOME", zh: "返回" },
  win: { bg: "ПОБЕДА!", en: "YOU WIN!", zh: "胜利！" },
  lose: { bg: "ПОРАЖЕНИЕ", en: "DEFEAT", zh: "落败" },
  accuracy: { bg: "ТОЧНОСТ", en: "ACCURACY", zh: "精确度" },
  hints: {
    bg: "Натискай ← ↓ ↑ → или A S W D, когато стрелката докосне лентата. Пълен хит — „PERFECT“, почти — „GOOD“, пропусната — „MISS“.",
    en: "Press ← ↓ ↑ → or A S W D as each arrow touches the line. On the beat — PERFECT, near it — GOOD, missed — MISS.",
    zh: "当箭头触碰到判定线时按下 ← ↓ ↑ → 或 A S W D。精确命中为 PERFECT，接近为 GOOD，未评为 MISS。",
  },
  perfect: { bg: "ПЕРФЕКТ", en: "PERFECT", zh: "完美" },
  good: { bg: "ДОБРЕ", en: "GOOD", zh: "不错" },
  miss: { bg: "ПРОПУСК", en: "MISS", zh: "失误" },
  select: { bg: "ИЗБЕРИ ПЕСЕН", en: "SELECT A SONG", zh: "选择歌曲" },
};

function buildChart(song: Song): Note[] {
  const notes: Note[] = [];
  let id = 0;
  for (let i = 0; i < song.beats; i += 1) {
    if ((i + song.seed) % 8 === 6) continue;
    const lane = ((i * 7 + song.seed * 3 + (i >> 2)) % 4) as Lane;
    notes.push({ id: id++, lane, at: i * BEAT_MS, judged: null });
    if (song.diff >= 2 && i % 4 === 2) {
      notes.push({ id: id++, lane: ((lane + 2) % 4) as Lane, at: i * BEAT_MS, judged: null });
    }
    if (song.diff >= 3 && i % 8 === 7) {
      notes.push({ id: id++, lane: ((lane + 1) % 4) as Lane, at: i * BEAT_MS, judged: null });
    }
  }
  return notes;
}

function BeatBattlePage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const t = (text: Text) => text[lang];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<{ ctx: AudioContext | null }>({ ctx: null });
  const notesRef = useRef<Note[]>([]);
  const songRef = useRef<Song>(SONGS[0] as Song);
  const startAtRef = useRef(0);
  const timeRef = useRef(0);
  const phaseRef = useRef<Phase>("title");
  const langRef = useRef(lang);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const endedRef = useRef(false);
  const lastHalfRef = useRef(-1);
  const statsRef = useRef({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 });
  const barsRef = useRef({ player: 100, rival: 100 });
  const laneFlashRef = useRef<number[]>([0, 0, 0, 0]);
  const popupsRef = useRef<Popup[]>([]);
  const needsCanvasDrawRef = useRef(true);

  const [phase, setPhase] = useState<Phase>("title");
  const [songId, setSongId] = useState(0);
  const [bars, setBars] = useState({ player: 100, rival: 100 });
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [best, setBest] = useState(0);
  const [result, setResult] = useState({
    win: false,
    grade: "C",
    accuracy: 0,
  });

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

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

  const syncStates = useCallback(() => {
    const s = statsRef.current;
    const b = barsRef.current;
    setBars({
      player: Math.max(0, Math.min(100, b.player)),
      rival: Math.max(0, Math.min(100, b.rival)),
    });
    setScore(s.score);
    setCombo(s.combo);
    dirtyRef.current = false;
  }, []);

  const finishRun = useCallback(
    (win: boolean) => {
      if (endedRef.current) return;
      endedRef.current = true;
      phaseRef.current = "result";
      needsCanvasDrawRef.current = true;
      const s = statsRef.current;
      const total = s.perfect + s.good + s.miss;
      const accuracy = total === 0 ? 0 : (s.perfect + s.good * 0.6) / total;
      const grade = accuracy >= 0.95 ? "S" : accuracy >= 0.88 ? "A" : accuracy >= 0.75 ? "B" : "C";
      setResult({
        win,
        grade,
        accuracy: Math.round(accuracy * 100),
      });
      setPhase("result");
      let newBest = 0;
      try {
        newBest = Number(window.localStorage.getItem("beat-battle-best") || "0");
      } catch {
        // ignore
      }
      if (s.score > newBest) {
        newBest = s.score;
        try {
          window.localStorage.setItem("beat-battle-best", String(newBest));
        } catch {
          // ignore
        }
      }
      setBest(newBest);
      if (win) {
        tone(523, 0.1, "square", 0.05);
        tone(659, 0.1, "square", 0.05, undefined, 0.12);
        tone(784, 0.1, "square", 0.05, undefined, 0.24);
        tone(1047, 0.32, "square", 0.05, undefined, 0.36);
      } else {
        tone(220, 0.5, "sawtooth", 0.06, 80);
      }
    },
    [tone],
  );

  const judgeMiss = useCallback(
    (note: Note) => {
      note.judged = "miss";
      const s = statsRef.current;
      const b = barsRef.current;
      s.combo = 0;
      s.miss += 1;
      b.player = Math.max(0, b.player - 6);
      statsRef.current = s;
      barsRef.current = b;
      const x = note.lane * LANE_W + LANE_W / 2;
      popupsRef.current.push({
        x,
        y: TARGET_Y - 4,
        text: COPY.miss[langRef.current],
        color: "#f87171",
        born: timeRef.current,
      });
      tone(150, 0.18, "sawtooth", 0.05, 90);
      dirtyRef.current = true;
      if (b.player <= 0) finishRun(false);
    },
    [finishRun, tone],
  );

  const handlePress = useCallback(
    (lane: Lane) => {
      if (phaseRef.current !== "play" || endedRef.current) return;
      const now = performance.now();
      const t = now - startAtRef.current;
      timeRef.current = t;
      let best: Note | null = null;
      let bestDiff = Infinity;
      for (const note of notesRef.current) {
        if (note.judged || note.lane !== lane) continue;
        const diff = Math.abs(t - note.at);
        if (t >= note.at - HIT_EARLY && t <= note.at + HIT_LATE && diff < bestDiff) {
          best = note;
          bestDiff = diff;
        }
      }
      if (!best) return;
      const timing = t - best.at;
      const judge: Judgment = Math.abs(timing) <= 72 ? "perfect" : "good";
      best.judged = judge;
      laneFlashRef.current[lane] = performance.now();
      const s = statsRef.current;
      const b = barsRef.current;
      if (judge === "perfect") {
        s.perfect += 1;
        s.combo += 1;
        s.score += 100 + s.combo * 10;
        b.rival = Math.max(0, b.rival - 4.8);
        popupsRef.current.push({
          x: lane * LANE_W + LANE_W / 2,
          y: TARGET_Y - 10,
          text: COPY.perfect[langRef.current],
          color: "#86efac",
          born: timeRef.current,
        });
        tone(880, 0.09, "square", 0.045);
        tone(1320, 0.09, "square", 0.03, undefined, 0.04);
      } else {
        s.good += 1;
        s.combo += 1;
        s.score += 60 + s.combo * 5;
        b.rival = Math.max(0, b.rival - 2.4);
        popupsRef.current.push({
          x: lane * LANE_W + LANE_W / 2,
          y: TARGET_Y - 10,
          text: COPY.good[langRef.current],
          color: "#fde68a",
          born: timeRef.current,
        });
        tone(660, 0.07, "sine", 0.05);
      }
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      statsRef.current = s;
      barsRef.current = b;
      dirtyRef.current = true;
      if (b.rival <= 0) finishRun(true);
    },
    [finishRun, tone],
  );

  const startRun = useCallback(
    (song: Song) => {
      ensureAudio();
      const notes = buildChart(song);
      notesRef.current = notes;
      songRef.current = song;
      barsRef.current = { player: 100, rival: 100 };
      statsRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 };
      popupsRef.current = [];
      laneFlashRef.current = [0, 0, 0, 0];
      lastHalfRef.current = -1;
      endedRef.current = false;
      startAtRef.current = performance.now();
      timeRef.current = 0;
      phaseRef.current = "play";
      setPhase("play");
      setSongId(song.id);
      dirtyRef.current = true;
      needsCanvasDrawRef.current = true;
      syncStates();
    },
    [ensureAudio, syncStates],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBest(Number(window.localStorage.getItem("beat-battle-best") || "0"));
    phaseRef.current = "title";
    needsCanvasDrawRef.current = true;
  }, []);

  useEffect(() => {
    const draw = (ctx: CanvasRenderingContext2D, t: number) => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, "#0b0f14");
      grad.addColorStop(1, "#131a24");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      for (let lane = 0; lane < 4; lane += 1) {
        const x = lane * LANE_W;
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x, 0, LANE_W, CANVAS_H);
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.fillRect(x, 0, 1, CANVAS_H);
        const color = LANE_COLORS[lane] ?? "#ffffff";
        const flashed = performance.now() - (laneFlashRef.current[lane] ?? 0) < 150;
        ctx.lineWidth = 2;
        ctx.strokeStyle = flashed ? "#ffffff" : color;
        ctx.globalAlpha = flashed ? 1 : 0.45;
        ctx.strokeRect(x + 8, TARGET_Y - 26, LANE_W - 16, 52);
        ctx.globalAlpha = flashed ? 1 : 0.25;
        ctx.fillStyle = color;
        ctx.font = "36px 'Segoe UI', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(LANE_GLYPHS[lane] ?? "", x + LANE_W / 2, TARGET_Y + 6);
        ctx.globalAlpha = 1;
      }

      ctx.font = "34px 'Segoe UI', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const note of notesRef.current) {
        const dy = (note.at - t) * SPEED;
        if (dy < -16 || dy > CANVAS_H + 40) continue;
        const x = note.lane * LANE_W + LANE_W / 2;
        const y = TARGET_Y - dy;
        const color = LANE_COLORS[note.lane] ?? "#ffffff";
        ctx.globalAlpha = note.judged ? 0.22 : 1;
        ctx.fillStyle = color;
        ctx.fillRect(x - 22, y - 20, 44, 40);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 22, y - 20, 44, 40);
        ctx.fillStyle = "#0b0f14";
        ctx.font = "26px 'Segoe UI', monospace";
        ctx.fillText(LANE_GLYPHS[note.lane] ?? "", x, y + 2);
      }

      const now = performance.now();
      popupsRef.current = popupsRef.current.filter((p) => now - p.born < 650);
      for (const p of popupsRef.current) {
        const age = now - p.born;
        const rise = age * 0.035;
        ctx.globalAlpha = Math.max(0, 1 - age / 650);
        ctx.fillStyle = p.color;
        ctx.font = "bold 19px 'Segoe UI', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.text, p.x, p.y - rise);
      }
      ctx.globalAlpha = 1;

      const progress = songRef.current.beats * BEAT_MS;
      if (progress > 0) {
        const p = Math.min(1, t / progress);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(0, 0, CANVAS_W, 3);
        ctx.fillStyle = "#4ade80";
        ctx.fillRect(0, 0, CANVAS_W * p, 3);
      }
    };

    const step = () => {
      rafRef.current = requestAnimationFrame(step);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      if (phaseRef.current === "play" && !endedRef.current) {
        const t = performance.now() - startAtRef.current;
        timeRef.current = t;

        const halfIdx = Math.floor(t / (BEAT_MS / 2));
        while (lastHalfRef.current < halfIdx) {
          lastHalfRef.current += 1;
          const h = lastHalfRef.current;
          const beat = Math.floor(h / 2);
          if (h % 2 === 0) {
            tone(90, 0.13, "sine", 0.1);
            const semi = BASS_TABLE[beat % BASS_TABLE.length] ?? 0;
            tone(55 * 2 ** (semi / 12), 0.16, "triangle", 0.05);
            tone(6000, 0.03, "square", 0.012);
          } else {
            tone(6000, 0.025, "square", 0.016);
          }
        }

        for (const note of notesRef.current) {
          if (!note.judged && t > note.at + MISS_AFTER) {
            judgeMiss(note);
          }
        }

        if (t > songRef.current.beats * BEAT_MS + 600 && !endedRef.current) {
          finishRun(barsRef.current.player > barsRef.current.rival);
        }
      }

      if (dirtyRef.current) syncStates();

      if (
        phaseRef.current === "play" ||
        needsCanvasDrawRef.current ||
        popupsRef.current.length > 0
      ) {
        needsCanvasDrawRef.current = false;
        draw(ctx, timeRef.current);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [judgeMiss, finishRun, syncStates, tone]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const lane = KEY_TO_LANE[e.key];
      if (lane !== undefined) {
        e.preventDefault();
        if (phaseRef.current === "title" || phaseRef.current === "result") {
          if (!e.repeat) startRun(songRef.current);
        } else if (!e.repeat) {
          handlePress(lane);
        }
      }
    };
    const start = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        if (phaseRef.current !== "play") startRun(songRef.current);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keydown", start);
    };
  }, [handlePress, startRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.scale(dpr, dpr);
  }, [phase]);

  const pickSong = (song: Song) => {
    setSongId(song.id);
    startRun(song);
  };

  const toTitle = () => {
    endedRef.current = true;
    phaseRef.current = "title";
    needsCanvasDrawRef.current = true;
    setPhase("title");
  };

  const currentSong = (SONGS[songId] ?? SONGS[0]) as Song;

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1280px] px-6 pb-28 pt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="label-mono text-brand">16 /</span>
            <span className="label-mono">
              {isBg ? "РИТЪМ ДУЕЛ В СТИЛ FNF" : isZh ? "FNF 式节奏对决" : "FNF-STYLE RHYTHM DUEL"}
            </span>
          </div>
          <Link
            to="/games"
            className="label-mono text-[0.62rem] transition-colors hover:text-brand"
          >
            {COPY.home[lang]}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            BEAT <span className="text-foreground">BATTLE</span>
          </h1>
          <span className="label-mono text-[0.62rem]">{COPY.tagline[lang]}</span>
        </div>

        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{COPY.desc[lang]}</p>

        <div className="mx-auto mt-10 w-full max-w-[520px]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="label-mono text-[0.6rem] text-cyan-300">{"💠 " + COPY.player[lang]}</p>
              <div className="mt-1 h-3 overflow-hidden rounded-full border border-border bg-surface-2">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-[width] duration-150"
                  style={{
                    width: `${bars.player}%`,
                    boxShadow: "0 0 10px rgba(34,211,238,0.6)",
                  }}
                />
              </div>
            </div>
            <div className="flex w-24 flex-col items-center rounded-2xl border border-border bg-card px-2 py-2">
              <span className="font-display text-lg leading-none text-brand">
                {score.toLocaleString()}
              </span>
              <span className="mt-1 text-[0.55rem] font-mono tracking-[0.15em] text-muted-foreground uppercase">
                {COPY.score[lang]}
              </span>
              <span className="mt-1 flex items-center gap-1 text-[0.6rem] text-amber-300">
                <Star className="size-3" />
                {combo}
                <span className="hidden text-muted-foreground sm:inline">{COPY.combo[lang]}</span>
              </span>
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="label-mono text-[0.6rem] text-pink-300">{"🎸 " + COPY.rival[lang]}</p>
              <div className="mt-1 h-3 overflow-hidden rounded-full border border-border bg-surface-2">
                <div
                  className="ml-auto h-full rounded-full bg-pink-400 transition-[width] duration-150"
                  style={{
                    width: `${bars.rival}%`,
                    boxShadow: "0 0 10px rgba(244,114,182,0.6)",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-border bg-black">
            <canvas
              ref={canvasRef}
              className="block h-auto w-full"
              style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
            />

            {phase === "title" ? (
              <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
                <div className="w-full max-w-sm px-4 text-center">
                  <p className="font-display text-3xl font-bold">
                    BEAT <span className="text-brand">BATTLE</span>
                  </p>
                  <p className="mb-4 mt-1 text-[0.65rem] font-mono tracking-[0.2em] text-muted-foreground uppercase">
                    {COPY.select[lang]}
                  </p>
                  <div className="space-y-2">
                    {SONGS.map((song) => (
                      <button
                        key={song.id}
                        type="button"
                        onClick={() => pickSong(song)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 font-mono text-[0.7rem] tracking-[0.18em] transition-all ${
                          songId === song.id
                            ? "border-brand-dim bg-brand/10 text-brand"
                            : "border-border bg-surface text-muted-foreground hover:border-brand-dim hover:text-foreground"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{song.emoji}</span>
                          <span>{song.name[lang]}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {song.beats} ♪ ×{song.diff}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => startRun(currentSong)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-mono text-[0.8rem] font-bold tracking-[0.2em] text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    <Play className="size-4" />
                    {COPY.play[lang]}
                  </button>
                  <p className="mt-3 text-[0.6rem] text-muted-foreground">{COPY.hints[lang]}</p>
                </div>
              </div>
            ) : null}

            {phase === "result" ? (
              <div className="absolute inset-0 grid place-items-center bg-background/75 backdrop-blur-sm">
                <div className="w-full max-w-sm px-4 py-6 text-center">
                  <p
                    className={`font-display text-4xl font-bold ${result.win ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {result.win ? COPY.win[lang] : COPY.lose[lang]}
                  </p>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <div className="rounded-2xl border border-border bg-card p-2">
                      <p className="font-mono text-sm font-bold text-brand">{result.grade}</p>
                      <p className="label-mono text-[0.5rem]">
                        {isBg ? "КЛАСА" : isZh ? "评级" : "GRADE"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-2">
                      <p className="font-mono text-sm font-bold text-cyan-300">
                        {result.accuracy}%
                      </p>
                      <p className="label-mono text-[0.5rem]">{COPY.accuracy[lang]}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-2">
                      <p className="font-mono text-sm font-bold">{score.toLocaleString()}</p>
                      <p className="label-mono text-[0.5rem]">{COPY.score[lang]}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-2">
                      <p className="flex items-center justify-center gap-1 font-mono text-sm font-bold text-amber-300">
                        <Trophy className="size-3" />
                        {best.toLocaleString()}
                      </p>
                      <p className="label-mono text-[0.5rem]">{COPY.best[lang]}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-3 font-mono text-[0.65rem]">
                    <span className="text-green-300">P {statsRef.current.perfect}</span>
                    <span className="text-amber-300">G {statsRef.current.good}</span>
                    <span className="text-red-400">M {statsRef.current.miss}</span>
                    <span className="text-muted-foreground">×{statsRef.current.maxCombo}</span>
                  </div>
                  <div className="mt-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startRun(currentSong)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-mono text-[0.75rem] font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5"
                    >
                      <RotateCcw className="size-4" />
                      {COPY.retry[lang]}
                    </button>
                    <button
                      type="button"
                      onClick={toTitle}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-mono text-[0.75rem] font-bold tracking-[0.18em] text-foreground transition-transform hover:-translate-y-0.5"
                    >
                      <Home className="size-4" />
                      {COPY.home[lang]}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {LANE_GLYPHS.map((glyph, lane) => (
              <button
                key={glyph}
                type="button"
                aria-label={`Lane ${lane + 1}`}
                onPointerDown={() => handlePress(lane as Lane)}
                className="grid h-14 place-items-center rounded-2xl border border-border bg-surface-2 font-mono text-2xl text-muted-foreground transition-colors hover:border-brand-dim hover:text-brand active:bg-brand/15"
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
