import { createFileRoute, Link } from "@tanstack/react-router";
import { ChessKnight, ChevronDown, Gamepad2, Grid3x3, Puzzle } from "lucide-react";
import { useState } from "react";
import { useSiteSettings } from "../components/site/theme";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Игри — Todor Khristov Gaming" },
      {
        name: "description",
        content: "Страница с игри от Todor Khristov Gaming.",
      },
    ],
    links: [{ rel: "canonical", href: "https://tody-game-hub.bbailiaskk.workers.dev/games" }],
  }),
  component: GamesPage,
});

const playableGames = [
  {
    to: "/chess" as const,
    title: { bg: "ШАХ", en: "CHESS", zh: "国际象棋" },
    tag: { bg: "НАСТОЛНА", en: "BOARD", zh: "棋盘" },
    note: {
      bg: "Класически шах срещу приятел — рокада, ан пасан и промоция.",
      en: "Classic chess against a friend — castling, en passant, and promotion.",
      zh: "与朋友对弈经典国际象棋 — 王车易位、吃过路兵和升变。",
    },
    icon: ChessKnight,
    color: "#1DB954",
  },
  {
    to: "/game2048" as const,
    title: { bg: "2048", en: "2048", zh: "2048" },
    tag: { bg: "ПЪЗЗЛ", en: "PUZZLE", zh: "拼图" },
    note: {
      bg: "Плъзгай и съединявай плочките, за да стигнеш до 2048.",
      en: "Slide and merge tiles to reach 2048.",
      zh: "滑动并合并方块，达到 2048。",
    },
    icon: Puzzle,
    color: "#1DB954",
  },
  {
    to: "/tictactoe" as const,
    title: { bg: "TIC TAC TOE", en: "TIC TAC TOE", zh: "井字棋" },
    tag: { bg: "КЛАСИКА", en: "CLASSIC", zh: "经典" },
    note: {
      bg: "Морски шах срещу компютъра или приятел.",
      en: "Play against the computer or a friend.",
      zh: "与电脑或朋友对战。",
    },
    icon: Grid3x3,
    color: "#3b82f6",
  },
  {
    to: "/dino" as const,
    title: { bg: "CHROME DINOSAUR", en: "CHROME DINOSAUR", zh: "Chrome 恐龙" },
    tag: { bg: "АРКАДА", en: "ARCADE", zh: "街机" },
    note: {
      bg: "Класическата игра на динозавра — безкрайно бягане.",
      en: "The classic dinosaur game — endless runner.",
      zh: "经典的恐龙游戏 — 无尽跑酷。",
    },
    icon: Gamepad2,
    color: "#f59e0b",
  },
];

function GamesPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [gamesOpen, setGamesOpen] = useState(true);

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1280px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">02 /</span>
          <span className="label-mono">{isBg ? "ИГРИ" : isZh ? "游戏" : "GAMES"}</span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
              {isBg ? "ИГРАЙ СЕГА" : isZh ? "立即游玩" : "PLAY NOW"}
            </h1>
            <button
              type="button"
              onClick={() => setGamesOpen((current) => !current)}
              aria-expanded={gamesOpen}
              aria-controls="playable-games-list"
              aria-label={
                isBg
                  ? "Скрий или покажи игрите"
                  : isZh
                    ? "隐藏或显示游戏"
                    : "Hide or show the games"
              }
              className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-brand transition-colors hover:border-brand-dim hover:bg-surface-2"
            >
              <ChevronDown
                className={`size-5 transition-transform duration-300 ${
                  gamesOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "ГЕЙМ ХЪБ" : isZh ? "游戏中心" : "GAME HUB"}
          </span>
        </div>

        {gamesOpen ? (
          <div id="playable-games-list" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {playableGames.map((game) => {
              const Icon = game.icon;
              return (
                <Link
                  key={game.to}
                  to={game.to}
                  className="group rounded-3xl border border-border bg-card p-6 transition-all duration-200 hover:border-brand-dim hover:shadow-[0_0_24px_rgba(29,185,84,0.15)]"
                >
                  <div className="flex items-start justify-between">
                    <span className="label-mono text-[0.6rem] text-brand">{game.tag[lang]}</span>
                    <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-brand" />
                  </div>
                  <h3 className="mt-10 text-2xl">{game.title[lang]}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{game.note[lang]}</p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/30 bg-[#161B16] px-4 py-2 font-mono text-[0.65rem] font-bold tracking-[0.15em] text-brand uppercase transition-all duration-200 group-hover:bg-[#1DB954]/10 group-hover:shadow-[0_0_12px_rgba(29,185,84,0.2)]">
                    {isBg ? "ИГРАЙ" : isZh ? "开始" : "PLAY"}
                    <span className="text-[0.8rem]">›</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
