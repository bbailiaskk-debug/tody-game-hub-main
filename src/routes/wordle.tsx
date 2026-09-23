import { createFileRoute } from "@tanstack/react-router";
import { Delete, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/wordle")({
  head: () => {
    const seo = seoHead({
      path: "/wordle",
      title: "Wordle",
      description: "Play Wordle — guess the hidden 5-letter word in six tries.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: WordlePage,
});

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

const WORDS = [
  "about",
  "above",
  "abuse",
  "actor",
  "acute",
  "admit",
  "adopt",
  "adult",
  "after",
  "again",
  "agent",
  "agree",
  "ahead",
  "alarm",
  "album",
  "alert",
  "alien",
  "align",
  "alive",
  "allow",
  "alone",
  "along",
  "altar",
  "alter",
  "amuse",
  "angel",
  "anger",
  "angle",
  "angry",
  "ankle",
  "apple",
  "apply",
  "arena",
  "argue",
  "arise",
  "armor",
  "array",
  "arrow",
  "aside",
  "asset",
  "atlas",
  "audio",
  "audit",
  "avoid",
  "awake",
  "award",
  "aware",
  "awful",
  "bacon",
  "badge",
  "bagel",
  "baker",
  "banjo",
  "basic",
  "basil",
  "batch",
  "beach",
  "beard",
  "beast",
  "bench",
  "berry",
  "birth",
  "black",
  "blade",
  "blame",
  "blank",
  "blast",
  "blaze",
  "bleed",
  "blend",
  "bless",
  "blind",
  "blink",
  "block",
  "bloom",
  "blunt",
  "board",
  "bonus",
  "booth",
  "bound",
  "brain",
  "brave",
  "bread",
  "break",
  "breed",
  "brick",
  "bride",
  "brief",
  "bring",
  "brink",
  "broad",
  "broke",
  "broom",
  "brown",
  "brush",
  "build",
  "built",
  "bulky",
  "bunch",
  "burst",
  "cabin",
  "cable",
  "camel",
  "candy",
  "canoe",
  "cargo",
  "carve",
  "catch",
  "cause",
  "cease",
  "chain",
  "chair",
  "chaos",
  "charm",
  "chart",
  "chase",
  "cheap",
  "check",
  "cheek",
  "cheer",
  "chess",
  "chest",
  "chief",
  "child",
  "chill",
  "china",
  "choir",
  "chunk",
  "cider",
  "civil",
  "claim",
  "clamp",
  "class",
  "clean",
  "clear",
  "clerk",
  "click",
  "cliff",
  "climb",
  "cloak",
  "clock",
  "clone",
  "close",
  "cloth",
  "cloud",
  "clown",
  "coach",
  "coast",
  "cobra",
  "cocoa",
  "color",
  "comet",
  "comic",
  "coral",
  "couch",
  "could",
  "count",
  "court",
  "cover",
  "crack",
  "craft",
  "crane",
  "crash",
  "crave",
  "crawl",
  "cream",
  "creek",
  "creep",
  "crime",
  "crisp",
  "cross",
  "crowd",
  "crown",
  "crude",
  "cruel",
  "crumb",
  "crust",
  "curry",
  "cycle",
  "daily",
  "dance",
  "death",
  "decay",
  "delay",
  "delta",
  "dense",
  "depth",
  "digit",
  "dirty",
  "dodge",
  "doubt",
  "dozen",
  "drama",
  "dream",
  "dress",
  "drift",
  "drill",
  "drink",
  "drive",
  "drove",
  "drum",
  "dryer",
  "eagle",
  "early",
  "earth",
  "eight",
  "elbow",
  "elder",
  "elect",
  "elite",
  "empty",
  "enemy",
  "enjoy",
  "enter",
  "entry",
  "equal",
  "equip",
  "error",
  "essay",
  "event",
  "every",
  "exact",
  "exist",
  "extra",
  "fable",
  "facet",
  "faint",
  "fairy",
  "faith",
  "fancy",
  "fatal",
  "fault",
  "favor",
  "feast",
  "fence",
  "ferry",
  "fetch",
  "fever",
  "fiber",
  "field",
  "fifth",
  "fifty",
  "fight",
  "final",
  "first",
  "fixed",
  "flame",
  "flash",
  "fleet",
  "flesh",
  "float",
  "flood",
  "floor",
  "flour",
  "fluid",
  "flush",
  "focus",
  "force",
  "forge",
  "forth",
  "forty",
  "forum",
  "found",
  "frame",
  "fraud",
  "fresh",
  "front",
  "frost",
  "fruit",
  "funny",
  "gauge",
  "ghost",
  "giant",
  "given",
  "glass",
  "globe",
  "glory",
  "glove",
  "grace",
  "grade",
  "grain",
  "grand",
  "grant",
  "grape",
  "graph",
  "grasp",
  "grass",
  "grave",
  "great",
  "green",
  "greet",
  "grind",
  "grove",
  "group",
  "guard",
  "guess",
  "guide",
  "guilt",
  "habit",
  "happy",
  "harsh",
  "haste",
  "haunt",
  "heart",
  "heavy",
  "hello",
  "hedge",
  "hence",
  "hilly",
  "hinge",
  "hobby",
  "honey",
  "honor",
  "horse",
  "hotel",
  "house",
  "hover",
  "human",
  "humor",
  "hunt",
  "hurry",
  "ideal",
  "image",
  "imply",
  "index",
  "inner",
  "input",
  "issue",
  "jeans",
  "jelly",
  "jewel",
  "joint",
  "judge",
  "juice",
  "jumpy",
  "heavy",
  "kayak",
  "kebab",
  "kneel",
  "knife",
  "knock",
  "known",
  "label",
  "labor",
  "large",
  "laser",
  "latch",
  "later",
  "laugh",
  "layer",
  "learn",
  "lease",
  "least",
  "leave",
  "legal",
  "lemon",
  "level",
  "lever",
  "light",
  "limit",
  "linen",
  "liver",
  "local",
  "logic",
  "loose",
  "lower",
  "loyal",
  "lunch",
  "magic",
  "major",
  "maker",
  "maple",
  "march",
  "marry",
  "match",
  "maybe",
  "mayor",
  "media",
  "mercy",
  "merit",
  "metal",
  "meter",
  "metro",
  "might",
  "minor",
  "minus",
  "mixed",
  "model",
  "money",
  "month",
  "moral",
  "motif",
  "motor",
  "mouse",
  "mouth",
  "movie",
  "music",
  "naive",
  "naked",
  "naval",
  "nerve",
  "never",
  "newly",
  "night",
  "noble",
  "noise",
  "north",
  "novel",
  "nurse",
  "ocean",
  "offer",
  "often",
  "olive",
  "onion",
  "onset",
  "opera",
  "orbit",
  "order",
  "organ",
  "other",
  "ought",
  "outer",
  "owner",
  "ozone",
  "packed",
  "pagan",
  "paint",
  "panel",
  "panic",
  "paper",
  "party",
  "pasta",
  "paste",
  "patch",
  "pause",
  "peace",
  "peach",
  "pearl",
  "pedal",
  "penny",
  "phase",
  "phone",
  "photo",
  "piano",
  "piece",
  "pilot",
  "pinch",
  "pitch",
  "pizza",
  "place",
  "plain",
  "plane",
  "plant",
  "plate",
  "plaza",
  "plead",
  "point",
  "polar",
  "porch",
  "pound",
  "power",
  "press",
  "price",
  "pride",
  "prime",
  "print",
  "prior",
  "prize",
  "probe",
  "prone",
  "proof",
  "prose",
  "proud",
  "prove",
  "prune",
  "pulse",
  "punch",
  "pupil",
  "puppy",
  "purse",
  "queen",
  "query",
  "quest",
  "queue",
  "quick",
  "quiet",
  "quite",
  "quota",
  "quote",
  "radar",
  "radio",
  "range",
  "rapid",
  "ratio",
  "reach",
  "react",
  "ready",
  "realm",
  "rebel",
  "refer",
  "reign",
  "relax",
  "reply",
  "reset",
  "rhyme",
  "ridge",
  "rifle",
  "right",
  "rigid",
  "river",
  "roast",
  "robin",
  "robot",
  "rocky",
  "rogue",
  "roman",
  "rough",
  "round",
  "route",
  "royal",
  "rugby",
  "rural",
  "salad",
  "salon",
  "salsa",
  "salty",
  "sauce",
  "scale",
  "scare",
  "scarf",
  "scene",
  "scent",
  "scope",
  "score",
  "scout",
  "scrub",
  "sense",
  "serve",
  "seven",
  "shade",
  "shaft",
  "shake",
  "shall",
  "shame",
  "shape",
  "share",
  "shark",
  "sharp",
  "sheep",
  "sheet",
  "shelf",
  "shell",
  "shift",
  "shine",
  "shiny",
  "shirt",
  "shock",
  "shoot",
  "shore",
  "short",
  "shout",
  "shown",
  "sight",
  "signal",
  "silly",
  "since",
  "sixth",
  "sixty",
  "skill",
  "skirt",
  "skull",
  "slate",
  "sleep",
  "slice",
  "slide",
  "slope",
  "small",
  "smart",
  "smell",
  "smile",
  "smoke",
  "snack",
  "snake",
  "solar",
  "solid",
  "solve",
  "sorry",
  "sound",
  "south",
  "space",
  "spare",
  "spark",
  "speak",
  "speed",
  "spell",
  "spend",
  "spice",
  "spite",
  "split",
  "spoke",
  "spoon",
  "sport",
  "spray",
  "stage",
  "stake",
  "stand",
  "stare",
  "start",
  "state",
  "steak",
  "steal",
  "steam",
  "steel",
  "steep",
  "steer",
  "stern",
  "stick",
  "sting",
  "stock",
  "stone",
  "story",
  "stove",
  "strap",
  "straw",
  "study",
  "stuff",
  "style",
  "sugar",
  "suite",
  "sunny",
  "super",
  "surge",
  "swamp",
  "sweet",
  "swift",
  "swing",
  "sword",
  "table",
  "taste",
  "tavern",
  "teach",
  "thick",
  "thief",
  "thing",
  "think",
  "third",
  "those",
  "three",
  "threw",
  "throw",
  "thumb",
  "tight",
  "timer",
  "tired",
  "title",
  "toast",
  "today",
  "token",
  "total",
  "touch",
  "tough",
  "tower",
  "toxic",
  "trace",
  "track",
  "trade",
  "trail",
  "train",
  "trait",
  "treat",
  "trend",
  "trial",
  "tribe",
  "trick",
  "tried",
  "troop",
  "truck",
  "truly",
  "trunk",
  "trust",
  "truth",
  "tumor",
  "twice",
  "twist",
  "udder",
  "ultra",
  "uncle",
  "under",
  "unfit",
  "unify",
  "union",
  "unite",
  "unity",
  "until",
  "upper",
  "upset",
  "urban",
  "usage",
  "usual",
  "utter",
  "vague",
  "valid",
  "valve",
  "vapor",
  "vault",
  "vegan",
  "venue",
  "verse",
  "video",
  "vigor",
  "villa",
  "vinyl",
  "viola",
  "virus",
  "visit",
  "vital",
  "vivid",
  "vocal",
  "voice",
  "voter",
  "wagon",
  "waist",
  "watch",
  "water",
  "weary",
  "weave",
  "weird",
  "whale",
  "wheat",
  "wheel",
  "where",
  "which",
  "while",
  "whine",
  "whirl",
  "white",
  "whole",
  "whose",
  "widen",
  "widow",
  "width",
  "witch",
  "woman",
  "women",
  "world",
  "worry",
  "worse",
  "worst",
  "worth",
  "would",
  "wound",
  "wreck",
  "wrink",
  "write",
  "wrong",
  "wrote",
  "yacht",
  "young",
  "youth",
  "zebra",
] as const;

type TileState = "correct" | "present" | "absent" | "empty";

const TILE_STATE_CLASSES: Record<TileState, string> = {
  correct: "bg-[#1DB954] border-[#1DB954] text-[#06110c]",
  present: "bg-[#f59e0b] border-[#f59e0b] text-[#1a1205]",
  absent: "bg-surface-2 border-border/60 text-muted-foreground",
  empty: "bg-surface/30 border-border/40 text-foreground",
};

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)] ?? WORDS[0] ?? "abuse";
}

function evaluateGuess(guess: string, answer: string): TileState[] {
  const result: TileState[] = new Array(WORD_LENGTH).fill("absent") as TileState[];
  const remainder: Record<string, number> = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
    } else {
      const ch = answer[i] ?? "";
      remainder[ch] = (remainder[ch] ?? 0) + 1;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    const ch = guess[i] ?? "";
    if ((remainder[ch] ?? 0) > 0) {
      result[i] = "present";
      remainder[ch] = (remainder[ch] ?? 0) - 1;
    }
  }
  return result;
}

function WordlePage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const [answer, setAnswer] = useState(() => pickWord());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [usedKeys, setUsedKeys] = useState<Record<string, TileState>>({});

  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const answerRef = useRef(answer);
  answerRef.current = answer;
  const currentRef = useRef(current);
  currentRef.current = current;
  const statusRef = useRef(status);
  statusRef.current = status;
  const guessesRef = useRef(guesses);
  guessesRef.current = guesses;

  useEffect(() => {
    setBest(Number(localStorage.getItem("wordle-best") || "0"));
    setStreak(Number(localStorage.getItem("wordle-streak") || "0"));
  }, []);

  const finishWin = useCallback(() => {
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    localStorage.setItem("wordle-streak", String(nextStreak));
    if (nextStreak > best) {
      setBest(nextStreak);
      localStorage.setItem("wordle-best", String(nextStreak));
    }
  }, [streak, best]);

  const finishLoss = useCallback(() => {
    setStreak(0);
    localStorage.setItem("wordle-streak", "0");
  }, []);

  const submitGuess = useCallback(() => {
    if (statusRef.current !== "playing") return;
    const guess = currentRef.current;
    if (guess.length < WORD_LENGTH) return;
    const result = evaluateGuess(guess, answerRef.current);
    const nextGuesses = [...guessesRef.current, guess];
    setGuesses(nextGuesses);
    setCurrent("");

    const nextUsed = { ...usedKeys };
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = guess[i] ?? "";
      const cur = nextUsed[ch];
      if (cur === "correct") continue;
      if (cur === "present" && result[i] === "absent") continue;
      nextUsed[ch] = result[i] ?? "absent";
    }
    setUsedKeys(nextUsed);

    if (guess === answerRef.current) {
      setStatus("won");
      finishWin();
    } else if (nextGuesses.length >= MAX_ATTEMPTS) {
      setStatus("lost");
      finishLoss();
    }
  }, [usedKeys, finishWin, finishLoss]);

  const resetGame = useCallback(() => {
    setAnswer(pickWord());
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setUsedKeys({});
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (statusRef.current !== "playing") {
        if (e.key === "Enter") resetGame();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        submitGuess();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setCurrent((c) => c.slice(0, -1));
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        setCurrent((c) => (c.length < WORD_LENGTH ? c + e.key.toUpperCase() : c));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [submitGuess, resetGame]);

  const gridRows = Array.from({ length: MAX_ATTEMPTS }, (_, r) => {
    const guess = guesses[r] ?? (r === guesses.length ? current : "");
    const reveal = guesses[r] ? evaluateGuess(guesses[r] ?? "", answer) : undefined;
    return { guess, reveal };
  });

  const keyClass = (key: string) => {
    const state = usedKeys[key];
    if (state === "correct")
      return "bg-[#1DB954] border-[#1DB954] text-[#06110c] hover:brightness-110";
    if (state === "present")
      return "bg-[#f59e0b] border-[#f59e0b] text-[#1a1205] hover:brightness-110";
    if (state === "absent") return "bg-surface-2 border-border/60 text-muted-foreground";
    return "bg-surface border-border/60 text-foreground hover:bg-surface-2";
  };

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[900px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">10 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">WORDLE</h1>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "СЛОВЕСНА ГАДАЧКА" : isZh ? "猜词游戏" : "WORD GAME"}
          </span>
        </div>

        <div className="night-panel relative mt-8 rounded-3xl border border-border/60 bg-[#161B16] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between px-1 py-1">
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
              {isBg ? "ПОРЕДИЦА" : isZh ? "连胜" : "STREAK"} — {streak}
            </span>
            <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
              {isBg ? "НАЙ-ДОБРА" : isZh ? "最佳" : "BEST"} — {best}
            </span>
          </div>

          <div className="mx-auto mt-4 grid w-full max-w-xs gap-1.5 sm:max-w-sm">
            {gridRows.map((row, r) => (
              <div key={r} className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: WORD_LENGTH }, (_, c) => {
                  const ch = row.guess[c] ?? "";
                  const state: TileState = row.reveal?.[c] ?? "empty";
                  return (
                    <div
                      key={c}
                      className={`grid aspect-square w-full place-items-center rounded-lg border font-mono text-xl font-bold uppercase transition-all duration-150 ${TILE_STATE_CLASSES[state]}`}
                      aria-label={ch ? `${ch} ${state}` : "empty"}
                    >
                      {ch}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mx-auto mt-6 w-full max-w-[30rem] space-y-1.5">
            {KEYBOARD_ROWS.map((row, r) => (
              <div key={row} className="flex gap-1 sm:gap-1.5">
                {r === 2 ? (
                  <button
                    type="button"
                    onClick={submitGuess}
                    className="grid h-[3.25rem] min-w-0 flex-1 place-items-center rounded-lg border border-border/60 bg-surface font-mono text-[0.6rem] font-bold tracking-widest text-foreground uppercase transition-colors hover:bg-surface-2 active:brightness-125"
                  >
                    {isBg ? "ГО" : isZh ? "搞定" : "GO"}
                  </button>
                ) : null}
                {row
                  .split("")
                  .map((key) => key.toUpperCase())
                  .map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        statusRef.current === "playing"
                          ? setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c))
                          : undefined
                      }
                      className={`grid h-[3.25rem] min-w-0 flex-1 place-items-center rounded-lg border font-mono text-sm font-bold uppercase transition-colors active:brightness-125 ${keyClass(key)}`}
                    >
                      {key}
                    </button>
                  ))}
                {r === 2 ? (
                  <button
                    type="button"
                    onClick={() => setCurrent((c) => c.slice(0, -1))}
                    className="grid h-[3.25rem] min-w-0 flex-1 place-items-center rounded-lg border border-border/60 bg-surface text-muted-foreground transition-colors hover:bg-surface-2 active:brightness-125"
                    aria-label="Backspace"
                  >
                    <Delete className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {status !== "playing" ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#161B16]/85 backdrop-blur-sm">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
                {status === "won"
                  ? isBg
                    ? "ПОБЕДА"
                    : isZh
                      ? "胜利"
                      : "VICTORY"
                  : isBg
                    ? "КРАЙ НА ИГРАТА"
                    : isZh
                      ? "游戏结束"
                      : "GAME OVER"}
              </span>
              <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                {isBg ? "Думата беше" : isZh ? "答案是" : "The word was"} —{" "}
                <span className="text-brand">{answer}</span>
              </span>
              <button
                type="button"
                onClick={resetGame}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <RotateCcw className="size-4" />
                {isBg ? "ОЩЕ ЕДНА ДУМА" : isZh ? "再来一个" : "NEW WORD"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">A–Z</span> — {isBg ? "клавиатура" : "keyboard"}
          </span>
          <span>
            <span className="text-brand">⌫</span> — {isBg ? "изтриване" : "backspace"}
          </span>
          <span>
            <span className="text-brand">GO</span> — {isBg ? "потвърди" : "submit"}
          </span>
        </div>
      </section>
    </main>
  );
}
