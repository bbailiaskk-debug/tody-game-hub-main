import { createFileRoute } from "@tanstack/react-router";
import { Heart, RotateCcw, Sparkles, Swords, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/crystalrealm")({
  head: () => {
    const seo = seoHead({
      path: "/crystalrealm",
      title: "Crystal Realm",
      description:
        "Оригинална 8-bit action-adventure игра — събирай кристалните шърдове и върни светлината, преди тъмнината да погълне Аталия.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: CrystalRealmPage,
});

const TILE = 16;
const VIEW_W = 16;
const VIEW_H = 15;
const CANVAS_W = VIEW_W * TILE;
const CANVAS_H = VIEW_H * TILE;

const PLAYER_SPEED = 52;
const ENEMY_SPEED = 18;
const ENEMY_AGGRO = 6.5;
const ATTACK_TIME = 0.24;
const INVINCIBLE_TIME = 1.4;
const EXIT_DELAY = 1.9;
const MAX_HP = 5;

type WorldName = "overworld" | "dungeon";
type Dir = "up" | "down" | "left" | "right";

type Stamp = { ch: string; cells: ReadonlyArray<readonly [number, number]> };

const OVERWORLD_SIZE = { w: 32, h: 24 } as const;
const DUNGEON_SIZE = { w: 16, h: 15 } as const;

const OVERWORLD_STAMPS: Stamp[] = [
  {
    ch: "#",
    cells: [
      [8, 8],
      [9, 2],
      [19, 5],
      [22, 19],
      [2, 18],
      [29, 15],
      [21, 3],
      [30, 8],
      [7, 12],
      [22, 4],
    ],
  },
  {
    ch: "C",
    cells: [
      [4, 4],
      [27, 5],
      [13, 16],
      [22, 20],
      [19, 9],
    ],
  },
  {
    ch: "H",
    cells: [
      [6, 21],
      [28, 11],
    ],
  },
  { ch: "D", cells: [[11, 11]] },
  { ch: "P", cells: [[4, 15]] },
  {
    ch: "E",
    cells: [
      [12, 5],
      [24, 7],
      [7, 14],
      [21, 17],
      [28, 20],
    ],
  },
  {
    ch: "o",
    cells: [
      [18, 3],
      [15, 13],
      [9, 21],
      [26, 14],
      [29, 6],
    ],
  },
  { ch: "~", cells: cellsFromRect(14, 7, 17, 9) },
  { ch: "~", cells: cellsFromRect(1, 10, 2, 12) },
];

const DUNGEON_STAMPS: Stamp[] = [
  {
    ch: "E",
    cells: [
      [4, 6],
      [12, 8],
      [6, 12],
      [11, 3],
    ],
  },
  { ch: "C", cells: [[8, 7]] },
  {
    ch: "H",
    cells: [
      [14, 6],
      [1, 6],
    ],
  },
  { ch: "D", cells: [[3, 13]] },
  {
    ch: "o",
    cells: [
      [13, 10],
      [2, 4],
    ],
  },
  {
    ch: "#",
    cells: [
      [5, 5],
      [5, 6],
      [5, 7],
      [9, 5],
      [9, 6],
      [5, 11],
      [5, 12],
      [11, 12],
      [12, 12],
      [13, 12],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
      [7, 3],
    ],
  },
];

function cellsFromRect(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      cells.push([x, y]);
    }
  }
  return cells;
}

function buildGrid(size: { w: number; h: number }, stamps: Stamp[]): string[][] {
  const grid = Array.from({ length: size.h }, () => Array.from({ length: size.w }, () => "."));
  for (let x = 0; x < size.w; x += 1) {
    grid[0]![x] = "#";
    grid[size.h - 1]![x] = "#";
  }
  for (let y = 0; y < size.h; y += 1) {
    grid[y]![0] = "#";
    grid[y]![size.w - 1] = "#";
  }
  for (const stamp of stamps) {
    for (const [x, y] of stamp.cells) {
      grid[y]![x] = stamp.ch;
    }
  }
  return grid;
}

type Crystal = { x: number; y: number; taken: boolean };
type HeartPick = { x: number; y: number; taken: boolean };
type Enemy = {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  dir: "left" | "right";
  alive: boolean;
};
type InputState = { up: boolean; down: boolean; left: boolean; right: boolean; attack: boolean };
type CollectedSets = {
  crystals: Record<WorldName, Set<string>>;
  hearts: Record<WorldName, Set<string>>;
  enemies: Record<WorldName, Set<string>>;
};

type WorldState = {
  grid: string[][];
  name: WorldName;
  crystals: Crystal[];
  hearts: HeartPick[];
  enemies: Enemy[];
  spawn: { px: number; py: number } | null;
};

type GameData = {
  world: WorldState;
  px: number;
  py: number;
  dir: Dir;
  moving: boolean;
  frame: number;
  hp: number;
  maxHp: number;
  shards: number;
  totalShards: number;
  anim: number;
  invincible: number;
  attack: number;
  pendingExit: number;
  won: boolean;
  events: string[];
  collected: CollectedSets;
  portalX: number;
  portalY: number;
};

const SOLID = new Set(["#", "~", "o"]);

function unionKey(x: number, y: number): string {
  return `${x},${y}`;
}

function canStand(grid: string[][], px: number, py: number): boolean {
  const left = Math.floor((px + 2) / TILE);
  const right = Math.floor((px + 9) / TILE);
  const top = Math.floor((py + 4) / TILE);
  const bottom = Math.floor((py + 13) / TILE);
  for (let ty = top; ty <= bottom; ty += 1) {
    for (let tx = left; tx <= right; tx += 1) {
      const cell = grid[ty]?.[tx] ?? "#";
      if (SOLID.has(cell)) return false;
    }
  }
  return true;
}

function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerBox(g: GameData) {
  return { x: g.px + 2, y: g.py + 4, w: 8, h: 10 };
}

function enemyBox(en: Enemy) {
  return { x: en.x + 2, y: en.y + 4, w: 8, h: 8 };
}

function crystalBox(c: Crystal) {
  return { x: c.x * TILE + 3, y: c.y * TILE + 3, w: 10, h: 10 };
}

function heartBox(h: HeartPick) {
  return { x: h.x * TILE + 3, y: h.y * TILE + 3, w: 10, h: 10 };
}

function portalBox(g: GameData) {
  return { x: g.portalX * TILE, y: g.portalY * TILE, w: TILE, h: TILE };
}

function attackBox(g: GameData) {
  const px = g.px;
  const py = g.py;
  if (g.dir === "right") return { x: px + 10, y: py + 2, w: 13, h: 8 };
  if (g.dir === "left") return { x: px - 13, y: py + 2, w: 13, h: 8 };
  if (g.dir === "down") return { x: px + 2, y: py + 13, w: 8, h: 11 };
  return { x: px + 2, y: py - 11, w: 8, h: 11 };
}

function makeWorld(name: WorldName, collected: CollectedSets): WorldState {
  const size = name === "overworld" ? OVERWORLD_SIZE : DUNGEON_SIZE;
  const stamps = name === "overworld" ? OVERWORLD_STAMPS : DUNGEON_STAMPS;
  const grid = buildGrid(size, stamps);
  const w = size.w;
  const h = size.h;
  const crystals: Crystal[] = [];
  const hearts: HeartPick[] = [];
  const enemies: Enemy[] = [];
  let spawn: { px: number; py: number } | null = null;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ch = grid[y]?.[x] ?? "";
      const key = unionKey(x, y);
      if (ch === "C") {
        crystals.push({ x, y, taken: collected.crystals[name].has(key) });
      } else if (ch === "H") {
        hearts.push({ x, y, taken: collected.hearts[name].has(key) });
      } else if (ch === "E") {
        enemies.push({
          x,
          y,
          homeX: x,
          homeY: y,
          dir: "left",
          alive: !collected.enemies[name].has(key),
        });
      } else if (ch === "P") {
        spawn = { px: x * TILE + 2, py: y * TILE + 2 };
      }
    }
  }

  return { grid, name, crystals, hearts, enemies, spawn };
}

function countCrystals(grid: string[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === "C") count += 1;
    }
  }
  return count;
}

function buildGame(
  prev: GameData | null,
  world: WorldState,
  spawn: { px: number; py: number } | null,
): GameData {
  const collected: CollectedSets = prev?.collected ?? {
    crystals: { overworld: new Set(), dungeon: new Set() },
    hearts: { overworld: new Set(), dungeon: new Set() },
    enemies: { overworld: new Set(), dungeon: new Set() },
  };
  const totalShards =
    prev?.totalShards ??
    countCrystals(buildGrid(OVERWORLD_SIZE, OVERWORLD_STAMPS)) +
      countCrystals(buildGrid(DUNGEON_SIZE, DUNGEON_STAMPS));
  const portal = findPortal(world.grid);

  return {
    world,
    px: spawn?.px ?? prev?.px ?? world.spawn?.px ?? 4 * TILE + 2,
    py: spawn?.py ?? prev?.py ?? world.spawn?.py ?? 15 * TILE + 2,
    dir: prev?.dir ?? "down",
    moving: false,
    frame: 0,
    hp: prev?.hp ?? MAX_HP,
    maxHp: MAX_HP,
    shards: prev?.shards ?? 0,
    totalShards,
    anim: 0,
    invincible: prev?.invincible ?? 0,
    attack: 0,
    pendingExit: 0,
    won: prev?.won ?? false,
    events: [],
    collected,
    portalX: portal.x,
    portalY: portal.y,
  };
}

function findPortal(grid: string[][]): { x: number; y: number } {
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "D") return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

function startNewGame(): GameData {
  const collected: CollectedSets = {
    crystals: { overworld: new Set(), dungeon: new Set() },
    hearts: { overworld: new Set(), dungeon: new Set() },
    enemies: { overworld: new Set(), dungeon: new Set() },
  };
  return buildGame(null, makeWorld("overworld", collected), null);
}

function switchToDungeon(g: GameData): void {
  const dungeon = makeWorld("dungeon", g.collected);
  const spawn = { px: 3 * TILE + 2, py: 12 * TILE + 2 };
  const next = buildGame(g, dungeon, spawn);
  g.world = next.world;
  g.px = next.px;
  g.py = next.py;
  g.portalX = next.portalX;
  g.portalY = next.portalY;
  g.totalShards = next.totalShards;
  g.events.push("enter");
}

function exitToOverworld(g: GameData): void {
  const over = makeWorld("overworld", g.collected);
  const entryWhy = findPortal(over.grid);
  const spawn = { px: (entryWhy.x - 1) * TILE + 2, py: entryWhy.y * TILE + 2 };
  const next = buildGame(g, over, spawn);
  g.world = next.world;
  g.px = next.px;
  g.py = next.py;
  g.hp = next.hp;
  g.shards = next.shards;
  g.totalShards = next.totalShards;
  g.portalX = next.portalX;
  g.portalY = next.portalY;
  g.won = next.won;
  g.events.push("exit");
}

function update(g: GameData, dt: number, input: InputState): void {
  g.anim += dt;

  const vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  if (vx !== 0 || vy !== 0) {
    if (vx > 0) g.dir = "right";
    else if (vx < 0) g.dir = "left";
    else if (vy > 0) g.dir = "down";
    else g.dir = "up";
    g.moving = true;
    g.frame += dt;
    if (vx !== 0) {
      const nx = g.px + vx * PLAYER_SPEED * dt;
      if (canStand(g.world.grid, nx, g.py)) g.px = nx;
    }
    if (vy !== 0) {
      const ny = g.py + vy * PLAYER_SPEED * dt;
      if (canStand(g.world.grid, g.px, ny)) g.py = ny;
    }
    g.px = Math.max(0, Math.min((g.world.grid[0]?.length ?? 0) * TILE - 16, g.px));
    g.py = Math.max(0, Math.min(g.world.grid.length * TILE - 16, g.py));
  } else {
    g.moving = false;
  }

  if (g.attack > 0) g.attack -= dt;
  if (input.attack) {
    input.attack = false;
    if (g.attack <= 0) {
      g.attack = ATTACK_TIME;
      g.events.push("swing");
    }
  }

  if (g.invincible > 0) g.invincible -= dt;

  for (const en of g.world.enemies) {
    if (!en.alive) continue;
    const dx = g.px + 6 - (en.x + 6);
    const dy = g.py + 8 - (en.y + 8);
    const dist = Math.hypot(dx, dy);
    let mx = 0;
    let my = 0;
    if (dist < ENEMY_AGGRO * TILE) {
      mx = Math.sign(dx);
      my = Math.sign(dy);
    } else {
      const homePx = en.homeX * TILE + 2;
      if (en.x < homePx - TILE * 0.6) en.dir = "right";
      else if (en.x > homePx + TILE * 0.6) en.dir = "left";
      mx = en.dir === "right" ? 1 : -1;
    }
    if (mx !== 0) {
      const nx = en.x + mx * ENEMY_SPEED * dt;
      if (canStandEnemy(g.world.grid, nx, en.y)) en.x = nx;
      else en.dir = mx > 0 ? "left" : "right";
    }
    if (my !== 0) {
      const ny = en.y + my * ENEMY_SPEED * dt;
      if (canStandEnemy(g.world.grid, en.x, ny)) en.y = ny;
    }

    if (g.invincible <= 0 && boxesOverlap(playerBox(g), enemyBox(en))) {
      g.hp -= 1;
      g.invincible = INVINCIBLE_TIME;
      const bumpX = Math.abs(dx) > 1 ? 10 * Math.sign(dx) : 0;
      const bumpY = Math.abs(dy) > 1 ? 10 * Math.sign(dy) : 0;
      g.px -= bumpX;
      g.py -= bumpY;
      g.events.push("hurt");
      if (g.hp <= 0) {
        g.hp = 0;
        g.events.push("dead");
      }
    }
  }

  if (g.attack > 0) {
    const atk = attackBox(g);
    for (const en of g.world.enemies) {
      if (en.alive && boxesOverlap(atk, enemyBox(en))) {
        en.alive = false;
        g.collected.enemies[g.world.name].add(unionKey(en.homeX, en.homeY));
        g.events.push("defeat");
      }
    }
  }

  for (const c of g.world.crystals) {
    if (!c.taken && boxesOverlap(playerBox(g), crystalBox(c))) {
      c.taken = true;
      g.collected.crystals[g.world.name].add(unionKey(c.x, c.y));
      g.shards += 1;
      if (g.world.name === "dungeon") {
        g.events.push("core");
        g.pendingExit = EXIT_DELAY;
      } else {
        g.events.push("collect");
      }
    }
  }

  for (const h of g.world.hearts) {
    if (!h.taken && g.hp < g.maxHp && boxesOverlap(playerBox(g), heartBox(h))) {
      h.taken = true;
      g.collected.hearts[g.world.name].add(unionKey(h.x, h.y));
      g.hp += 1;
      g.events.push("heal");
    }
  }

  if (boxesOverlap(playerBox(g), portalBox(g))) {
    if (g.world.name === "overworld") {
      switchToDungeon(g);
    } else {
      exitToOverworld(g);
    }
  }

  if (g.pendingExit > 0) {
    g.pendingExit -= dt;
    if (g.pendingExit <= 0) {
      exitToOverworld(g);
      g.pendingExit = 0;
    }
  }

  if (g.shards >= g.totalShards && !g.won) {
    g.won = true;
    g.events.push("victory");
  }
}

function canStandEnemy(grid: string[][], x: number, y: number): boolean {
  return canStand(grid, x, y);
}

const COPY = {
  title: { bg: "CRYSTAL REALM", en: "CRYSTAL REALM", zh: "水晶王国" },
  subtitle: { bg: "8-BIT ADVENTURE", en: "8-BIT ADVENTURE", zh: "8 位冒险" },
  start: { bg: "СТАРТ", en: "START", zh: "开始" },
  playAgain: { bg: "ИГРАЙ ОТНОВО", en: "PLAY AGAIN", zh: "再玩一次" },
  gameOver: { bg: "ТЪМНИНАТА ПОБЕДИ", en: "THE DARKNESS WON", zh: "黑暗胜利了" },
  victory: { bg: "СВЕТЛИНАТА СЕ ВЪРНА!", en: "LIGHT RETURNS!", zh: "光明回归！" },
  area: { bg: "ЗОНA", en: "AREA", zh: "区域" },
  overworld: { bg: "АТАЛИЯ", en: "ATALIA", zh: "阿塔利亚" },
  dungeon: { bg: "ПОДЗЕМИЕ", en: "DUNGEON", zh: "地牢" },
  hearts: { bg: "СЪРЦА", en: "HEARTS", zh: "心" },
  shards: { bg: "ШЪРДОВЕ", en: "SHARDS", zh: "碎片" },
  toast: {
    collect: { bg: "+1 кристален шърд", en: "Crystal shard found", zh: "发现水晶碎片" },
    core: {
      bg: "Кристалното ядро е твое!",
      en: "You claimed the crystal core!",
      zh: "你得到了水晶核心！",
    },
    hurt: { bg: "Тъмнина те нарани!", en: "The darkness hurt you!", zh: "黑暗伤害了你！" },
    heal: { bg: "+1 сърце възстановено", en: "Heart restored", zh: "恢复了一颗心" },
    enter: { bg: "Тъмно подземие...", en: "A dark dungeon...", zh: "黑暗的地牢……" },
    exit: { bg: "Обратно в Аталия", en: "Back in Atalia", zh: "回到阿塔利亚" },
  },
} as const;

type Toast = { text: string; key: number } | null;

function CrystalRealmPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const gRef = useRef<GameData | null>(null);
  const inputRef = useRef<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    attack: false,
  });
  const toastTimerRef = useRef<number | null>(null);
  const audioRef = useRef<{ ctx: AudioContext | null }>({ ctx: null });

  const [phase, setPhase] = useState<"start" | "playing" | "over" | "won">("start");
  const [hp, setHp] = useState(MAX_HP);
  const [shards, setShards] = useState(0);
  const [total, setTotal] = useState(6);
  const [area, setArea] = useState<WorldName>("overworld");
  const [toast, setToast] = useState<Toast>(null);
  const [isTouch, setIsTouch] = useState(false);

  const hpRef = useRef(hp);
  hpRef.current = hp;
  const shardsRef = useRef(shards);
  shardsRef.current = shards;
  const totalRef = useRef(total);
  totalRef.current = total;
  const areaRef = useRef(area);
  areaRef.current = area;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
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
    (freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) => {
      const ctx = ensureAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    },
    [ensureAudio],
  );

  const showToast = useCallback((text: string, duration = 1.7) => {
    setToast({ text, key: Date.now() });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), duration * 1000);
  }, []);

  const handleEvents = useCallback(
    (g: GameData) => {
      for (const event of g.events) {
        if (event === "collect") {
          showToast(COPY.toast.collect[lang]);
          tone(660, 0.09, "square", 0.04);
          tone(990, 0.12, "square", 0.04);
        } else if (event === "core") {
          showToast(COPY.toast.core[lang], 2.2);
          tone(523, 0.1, "square", 0.05);
          tone(659, 0.1, "square", 0.05);
          tone(784, 0.24, "square", 0.05);
        } else if (event === "hurt") {
          showToast(COPY.toast.hurt[lang]);
          tone(220, 0.18, "sawtooth", 0.05, 110);
        } else if (event === "heal") {
          showToast(COPY.toast.heal[lang]);
          tone(440, 0.12, "sine", 0.05);
          tone(660, 0.14, "sine", 0.05);
        } else if (event === "defeat") {
          tone(990, 0.08, "square", 0.04);
          tone(660, 0.14, "square", 0.04, 330);
        } else if (event === "enter") {
          showToast(COPY.toast.enter[lang]);
          tone(392, 0.2, "square", 0.05, 196);
        } else if (event === "exit") {
          showToast(COPY.toast.exit[lang]);
          tone(196, 0.2, "square", 0.05, 392);
        } else if (event === "swing") {
          tone(1400, 0.06, "triangle", 0.02);
        } else if (event === "dead") {
          tone(180, 0.5, "sawtooth", 0.06, 60);
        } else if (event === "victory") {
          showToast(COPY.victory[lang], 3);
          tone(523, 0.12, "square", 0.05);
          window.setTimeout(() => tone(659, 0.12, "square", 0.05), 120);
          window.setTimeout(() => tone(784, 0.12, "square", 0.05), 240);
          window.setTimeout(() => tone(1047, 0.3, "square", 0.05), 360);
        }
      }
      g.events.length = 0;
    },
    [lang, showToast, tone],
  );

  const resetGame = useCallback(() => {
    ensureAudio();
    const g = startNewGame();
    gRef.current = g;
    setHp(g.hp);
    setShards(0);
    setTotal(g.totalShards);
    setArea("overworld");
    setPhase("playing");
  }, [ensureAudio]);

  const draw = useCallback((g: GameData) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    const grid = g.world.grid;
    const mapW = grid[0]?.length ?? 0;
    const mapH = grid.length;

    let camX = Math.floor(g.px / TILE) - Math.floor(VIEW_W / 2);
    let camY = Math.floor(g.py / TILE) - Math.floor(VIEW_H / 2);
    camX = Math.max(0, Math.min(mapW - VIEW_W, camX));
    camY = Math.max(0, Math.min(mapH - VIEW_H, camY));

    for (let ty = 0; ty < VIEW_H; ty += 1) {
      for (let tx = 0; tx < VIEW_W; tx += 1) {
        const cell = grid[camY + ty]?.[camX + tx] ?? "#";
        drawTile(ctx, cell, tx * TILE, ty * TILE, g.world.name, g.anim);
      }
    }

    for (const h of g.world.hearts) {
      if (!h.taken) drawHeart(ctx, h.x * TILE - camX * TILE, h.y * TILE - camY * TILE);
    }
    for (const c of g.world.crystals) {
      if (!c.taken) drawCrystal(ctx, c.x * TILE - camX * TILE, c.y * TILE - camY * TILE, g.anim);
    }
    for (const en of g.world.enemies) {
      if (en.alive) drawEnemy(ctx, en.x - camX * TILE, en.y - camY * TILE);
    }
    drawPortal(ctx, g.portalX * TILE - camX * TILE, g.portalY * TILE - camY * TILE, g.anim);

    drawPlayer(ctx, g);
    if (g.attack > 0) drawAttack(ctx, g);
  }, []);

  useEffect(() => {
    if (phase === "playing") return;
    const g = gRef.current;
    if (!g) return;
    draw(g);
  }, [phase, draw]);

  useEffect(() => {
    if (phase !== "playing" || !gRef.current) return;

    let last = 0;
    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step);
      const g = gRef.current;
      if (!g) return;
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      update(g, dt, inputRef.current);
      handleEvents(g);
      if (g.hp <= 0) {
        setPhase("over");
        return;
      }
      if (g.won) {
        setPhase("won");
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem("crystal-realm-won", "1");
          } catch {
            // ignore
          }
        }
        return;
      }
      if (g.hp !== hpRef.current) {
        hpRef.current = g.hp;
        setHp(g.hp);
      }
      if (g.shards !== shardsRef.current) {
        shardsRef.current = g.shards;
        setShards(g.shards);
      }
      if (g.totalShards !== totalRef.current) {
        totalRef.current = g.totalShards;
        setTotal(g.totalShards);
      }
      if (g.world.name !== areaRef.current) {
        areaRef.current = g.world.name;
        setArea(g.world.name);
      }
      draw(g);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, handleEvents, draw]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)) {
        e.preventDefault();
      }
      if (key === "ArrowUp" || key === "w" || key === "W") inputRef.current.up = true;
      else if (key === "ArrowDown" || key === "s" || key === "S") inputRef.current.down = true;
      else if (key === "ArrowLeft" || key === "a" || key === "A") inputRef.current.left = true;
      else if (key === "ArrowRight" || key === "d" || key === "D") inputRef.current.right = true;
      else if (key === " ") {
        if (phase === "start" || phase === "over" || phase === "won") {
          if (!e.repeat) resetGame();
        } else if (!e.repeat) {
          inputRef.current.attack = true;
        }
      } else if (key === "Enter") {
        if (phase === "start" || phase === "over" || phase === "won") {
          if (!e.repeat) resetGame();
        } else if (!e.repeat) {
          inputRef.current.attack = true;
        }
      } else if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "W",
          "a",
          "A",
          "s",
          "S",
          "d",
          "D",
        ].includes(key)
      ) {
        if (phase === "start" || phase === "over" || phase === "won") resetGame();
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key;
      if (key === "ArrowUp" || key === "w" || key === "W") inputRef.current.up = false;
      else if (key === "ArrowDown" || key === "s" || key === "S") inputRef.current.down = false;
      else if (key === "ArrowLeft" || key === "a" || key === "A") inputRef.current.left = false;
      else if (key === "ArrowRight" || key === "d" || key === "D") inputRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase, resetGame]);

  const bindVirtual = (dir: keyof InputState, active: boolean) => {
    inputRef.current[dir] = active;
  };

  const areaLabel = area === "overworld" ? COPY.overworld[lang] : COPY.dungeon[lang];

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[820px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">06 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : isZh ? "游戏" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            {COPY.title[lang]}
          </h1>
          <span className="label-mono text-[0.62rem]">{COPY.subtitle[lang]}</span>
        </div>

        <div className="relative mt-8 overflow-hidden rounded-3xl border border-border/60 bg-[#0d1220] shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-3 bg-[#0a0f1c] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="label-mono text-[0.6rem] text-muted-foreground uppercase">
                {COPY.area[lang]}
              </span>
              <span className="label-mono text-[0.6rem] text-brand uppercase">{areaLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="label-mono text-[0.6rem] text-muted-foreground uppercase">
                {COPY.hearts[lang]}
              </span>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: MAX_HP }, (_, index) => (
                  <Heart
                    key={index}
                    className={`size-3.5 ${index < hp ? "text-[#e5465a]" : "text-[#3a2a32]"}`}
                    fill={index < hp ? "#e5465a" : "#3a2a32"}
                  />
                ))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-[#4fd6e0]" />
              <span className="font-mono text-[0.7rem] font-bold tracking-[0.15em] text-[#4fd6e0]">
                {shards}/{total}
              </span>
            </div>
          </div>

          <div className="relative select-none">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ imageRendering: "pixelated", aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
              className="block h-auto w-full"
            />

            {toast ? (
              <div
                key={toast.key}
                className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-[#4fd6e0]/40 bg-[#0a0f1c]/90 px-4 py-1.5 font-mono text-[0.62rem] tracking-[0.18em] text-[#b2f4f7] uppercase backdrop-blur-sm"
              >
                {toast.text}
              </div>
            ) : null}

            {phase === "start" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#0a0f1c]/80 backdrop-blur-sm">
                <span className="font-mono text-sm tracking-[0.3em] text-muted-foreground uppercase">
                  {isBg
                    ? "Събери кристалите, преди тъмнината да победи"
                    : isZh
                      ? "在黑暗获胜前收集水晶碎片"
                      : "Collect the shards before the darkness wins"}
                </span>
                <button
                  type="button"
                  onClick={resetGame}
                  className="inline-flex items-center gap-2 rounded-full border border-[#4fd6e0]/50 bg-[#0d1220] px-7 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#b2f4f7] uppercase transition-all duration-200 hover:bg-[#4fd6e0]/10 hover:shadow-[0_0_18px_rgba(79,214,224,0.25)] active:translate-y-0.5"
                >
                  <Swords className="size-4" />
                  {COPY.start[lang]}
                </button>
              </div>
            ) : null}

            {phase === "over" ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0f1c]/85 backdrop-blur-sm">
                <span className="font-mono text-xl font-bold tracking-[0.2em] text-[#e5465a] uppercase">
                  {COPY.gameOver[lang]}
                </span>
                <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
                  {shards}/{total} {COPY.shards[lang].toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={resetGame}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#4fd6e0]/50 bg-[#0d1220] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#b2f4f7] uppercase transition-all duration-200 hover:bg-[#4fd6e0]/10 hover:shadow-[0_0_18px_rgba(79,214,224,0.25)] active:translate-y-0.5"
                >
                  <RotateCcw className="size-4" />
                  {COPY.playAgain[lang]}
                </button>
              </div>
            ) : null}

            {phase === "won" ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0f1c]/85 backdrop-blur-sm">
                <Trophy className="size-10 text-[#facc15]" />
                <span className="font-mono text-xl font-bold tracking-[0.2em] text-[#4fd6e0] uppercase">
                  {COPY.victory[lang]}
                </span>
                <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
                  {shards}/{total} {COPY.shards[lang].toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={resetGame}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#4fd6e0]/50 bg-[#0d1220] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#b2f4f7] uppercase transition-all duration-200 hover:bg-[#4fd6e0]/10 hover:shadow-[0_0_18px_rgba(79,214,224,0.25)] active:translate-y-0.5"
                >
                  <Trophy className="size-4" />
                  {COPY.playAgain[lang]}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">WASD / ↑↓←→</span> —{" "}
            {isBg ? "движение" : isZh ? "移动" : "move"}
          </span>
          <span>
            <span className="text-brand">SPACE</span> — {isBg ? "атака" : isZh ? "攻击" : "attack"}
          </span>
          <span>
            <span className="text-brand">ПОРТАЛ</span> —{" "}
            {isBg ? "влез в подземието" : isZh ? "进入地牢" : "enter dungeon"}
          </span>
        </div>

        {isTouch && phase === "playing" ? (
          <div className="mt-6 grid select-none grid-cols-3 gap-2 sm:hidden">
            <div className="grid grid-cols-3 gap-1.5">
              <span />
              <button
                type="button"
                aria-label="up"
                onPointerDown={() => bindVirtual("up", true)}
                onPointerUp={() => bindVirtual("up", false)}
                onPointerLeave={() => bindVirtual("up", false)}
                onPointerCancel={() => bindVirtual("up", false)}
                className="grid size-14 place-items-center rounded-xl border border-border bg-surface text-xl text-foreground active:bg-[#4fd6e0]/20"
              >
                ▲
              </button>
              <span />
              <button
                type="button"
                aria-label="left"
                onPointerDown={() => bindVirtual("left", true)}
                onPointerUp={() => bindVirtual("left", false)}
                onPointerLeave={() => bindVirtual("left", false)}
                onPointerCancel={() => bindVirtual("left", false)}
                className="grid size-14 place-items-center rounded-xl border border-border bg-surface text-xl text-foreground active:bg-[#4fd6e0]/20"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label="down"
                onPointerDown={() => bindVirtual("down", true)}
                onPointerUp={() => bindVirtual("down", false)}
                onPointerLeave={() => bindVirtual("down", false)}
                onPointerCancel={() => bindVirtual("down", false)}
                className="grid size-14 place-items-center rounded-xl border border-border bg-surface text-xl text-foreground active:bg-[#4fd6e0]/20"
              >
                ▼
              </button>
              <button
                type="button"
                aria-label="right"
                onPointerDown={() => bindVirtual("right", true)}
                onPointerUp={() => bindVirtual("right", false)}
                onPointerLeave={() => bindVirtual("right", false)}
                onPointerCancel={() => bindVirtual("right", false)}
                className="grid size-14 place-items-center rounded-xl border border-border bg-surface text-xl text-foreground active:bg-[#4fd6e0]/20"
              >
                ▶
              </button>
            </div>
            <span />
            <button
              type="button"
              aria-label="attack"
              onPointerDown={() => bindVirtual("attack", true)}
              onPointerUp={() => bindVirtual("attack", false)}
              onPointerLeave={() => bindVirtual("attack", false)}
              onPointerCancel={() => bindVirtual("attack", false)}
              className="grid size-20 place-items-center self-end rounded-full border border-[#4fd6e0]/50 bg-surface text-xl font-bold text-[#4fd6e0] active:bg-[#4fd6e0]/20"
            >
              ⚔
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  world: WorldName,
  anim: number,
) {
  const dungeon = world === "dungeon";
  if (ch === "#") {
    if (dungeon) {
      ctx.fillStyle = "#242b3a";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#39445c";
      ctx.fillRect(x, y + 4, TILE, 4);
      ctx.fillRect(x + 6, y, 4, TILE);
    } else {
      ctx.fillStyle = "#204a2c";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#123a20";
      ctx.fillRect(x, y, TILE, 5);
      ctx.fillStyle = "#2b6b3e";
      ctx.fillRect(x + 1, y + 4, 14, 12);
      ctx.fillStyle = "#3b8a54";
      ctx.fillRect(x + 3, y + 5, 6, 6);
      ctx.fillRect(x + 8, y + 5, 4, 4);
      ctx.fillStyle = "#6b4a26";
      ctx.fillRect(x + 5, y + 12, 5, 4);
    }
    return;
  }
  if (ch === "~") {
    ctx.fillStyle = "#16305c";
    ctx.fillRect(x, y, TILE, TILE);
    const wave = Math.floor(anim * 2) % 2 === 0;
    ctx.fillStyle = wave ? "#2c5aa0" : "#24508f";
    ctx.fillRect(x, y + 5, TILE, 3);
    ctx.fillRect(x, y + 12, TILE, 3);
    return;
  }
  if (ch === "o") {
    ctx.fillStyle = "#3a3f47";
    ctx.fillRect(x + 1, y + 7, 14, 8);
    ctx.fillRect(x + 3, y + 5, 10, 4);
    ctx.fillRect(x + 5, y + 3, 6, 3);
    ctx.fillStyle = "#555c66";
    ctx.fillRect(x + 3, y + 6, 3, 3);
    return;
  }
  if (ch === ",") {
    ctx.fillStyle = (x / TILE + y / TILE) % 2 === 0 ? "#1d2b18" : "#20301b";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#e2635a";
    ctx.fillRect(x + 4, y + 4, 2, 2);
    ctx.fillStyle = "#f0d06a";
    ctx.fillRect(x + 10, y + 10, 2, 2);
    return;
  }
  if (ch === "^") {
    ctx.fillStyle = "#1a2714";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#26401f";
    ctx.fillRect(x + 2, y + 2, 3, 12);
    ctx.fillRect(x + 6, y, 3, 14);
    ctx.fillRect(x + 10, y + 3, 3, 11);
    return;
  }
  if (ch === "D") {
    ctx.fillStyle = dungeon ? "#141a26" : "#1d2b18";
    ctx.fillRect(x, y, TILE, TILE);
    return;
  }
  ctx.fillStyle = (x / TILE + y / TILE) % 2 === 0 ? "#1d2b18" : "#20301b";
  ctx.fillRect(x, y, TILE, TILE);
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, anim: number) {
  const pulse = Math.floor(anim * 2.5) % 2 === 0;
  ctx.fillStyle = pulse ? "rgba(79,214,224,0.25)" : "rgba(79,214,224,0.1)";
  ctx.fillRect(x - 1, y - 1, TILE + 2, TILE + 2);
  ctx.fillStyle = "#3f9aa8";
  ctx.fillRect(x + 4, y + 3, 8, 10);
  ctx.fillStyle = "#4fd6e0";
  ctx.fillRect(x + 5, y + 1, 6, 12);
  ctx.fillRect(x + 4, y + 4, 8, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 6, y + 2, 2, 3);
  ctx.fillStyle = "#b2f4f7";
  ctx.fillRect(x + 6, y + 5, 3, 3);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#e5465a";
  ctx.fillRect(x + 3, y + 2, 10, 8);
  ctx.fillRect(x + 1, y + 5, 14, 5);
  ctx.fillStyle = "#ff8fa0";
  ctx.fillRect(x + 4, y + 3, 2, 2);
  ctx.fillRect(x + 11, y + 3, 2, 2);
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#3b1d4f";
  ctx.fillRect(x + 1, y + 4, 14, 10);
  ctx.fillRect(x + 3, y + 2, 10, 4);
  ctx.fillStyle = "#241030";
  ctx.fillRect(x + 3, y + 6, 10, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 5, y + 8, 3, 3);
  ctx.fillRect(x + 9, y + 8, 3, 3);
}

function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, anim: number) {
  ctx.fillStyle = "rgba(167,139,250,0.14)";
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = "#6b21a8";
  ctx.fillRect(x + 3, y + 3, 10, 10);
  ctx.fillStyle = "#a855f7";
  const offset = Math.floor(anim * 3) % 2 === 0;
  ctx.fillRect(x + (offset ? 5 : 7), y + (offset ? 6 : 5), 4, 4);
  ctx.fillRect(x + (offset ? 8 : 9), y + (offset ? 4 : 7), 3, 3);
  ctx.fillStyle = "#e9d5ff";
  ctx.fillRect(x + 5, y + 5, 2, 2);
}

function drawPlayer(ctx: CanvasRenderingContext2D, g: GameData) {
  const px = g.px;
  const py = g.py;
  const blink = g.invincible > 0 && Math.floor(g.invincible * 12) % 2 === 0;
  if (blink) return;

  const step = g.moving ? (Math.floor(g.frame * 5) % 2 === 0 ? 0 : 1) : 0;
  ctx.fillStyle = "#6b4226";
  ctx.fillRect(px + 3, py, 6, 2);
  ctx.fillRect(px + 2 + step, py + 1, 8, 2);
  ctx.fillStyle = "#f2c894";
  ctx.fillRect(px + 3, py + 2, 6, 3);
  ctx.fillStyle = "#222222";
  if (g.dir === "right") ctx.fillRect(px + 7, py + 3, 1, 1);
  else if (g.dir === "left") ctx.fillRect(px + 4, py + 3, 1, 1);
  else ctx.fillRect(px + 4, py + 3, 1, 1);
  ctx.fillStyle = "#1f7a5c";
  ctx.fillRect(px + 2, py + 5, 8, 6);
  ctx.fillStyle = "#3b2f2f";
  ctx.fillRect(px + 2, py + 9, 8, 1);
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(px + 2 + step, py + 10, 3, 4);
  ctx.fillRect(px + 7 - step, py + 10, 3, 4);
  ctx.fillStyle = "#e8b98a";
  ctx.fillRect(px + 2 + step, py + 6, 2, 4);
  ctx.fillRect(px + 8 - step, py + 6, 2, 4);
}

function drawAttack(ctx: CanvasRenderingContext2D, g: GameData) {
  const box = attackBox(g);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#e8f6f8";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = "#4fd6e0";
  ctx.fillRect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
  ctx.restore();
}
