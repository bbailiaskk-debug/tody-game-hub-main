import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Lock } from "lucide-react";
import { useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { playableGames } from "../components/site/game-catalog";
import { useUserPlan } from "../lib/plan-access";
import { isGameLocked } from "../lib/plans";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/games")({
  head: () => {
    const seo = seoHead({
      path: "/games",
      title: "Игри",
      description:
        "Играй онлайн безплатно: шах, 2048, Tic Tac Toe, Chrome Dinosaur, въздушен хокей, Wordle, судоку, Candy Crush, DDLC, Crystal Realm, Prism Heart, Stream Heart, Beat Battle и Tetris. Игри на Todor Khristov Gaming — директно в браузъра.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: GamesPage,
});

function GamesPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const { plan: activePlan } = useUserPlan();
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
              const gameLocked = isGameLocked(game.to, activePlan);
              const className =
                "group rounded-3xl border border-border bg-card p-6 transition-all duration-200 hover:border-brand-dim hover:shadow-[0_0_24px_rgba(29,185,84,0.15)]";
              const card = (
                <>
                  <div className="flex items-start justify-between">
                    <span className="label-mono text-[0.6rem] text-brand">{game.tag[lang]}</span>
                    {gameLocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-1 font-mono text-[0.55rem] font-bold tracking-[0.1em] text-brand">
                        <Lock className="size-3" />
                        {isBg ? "ПЛАТЕНА" : isZh ? "付费" : "PREMIUM"}
                      </span>
                    ) : (
                      <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-brand" />
                    )}
                  </div>
                  <h3 className="mt-10 text-2xl">{game.title[lang]}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{game.note[lang]}</p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/30 bg-[#161B16] px-4 py-2 font-mono text-[0.65rem] font-bold tracking-[0.15em] text-[var(--brand-bright)] uppercase transition-all duration-200 group-hover:bg-[#1DB954]/10 group-hover:shadow-[0_0_12px_rgba(29,185,84,0.2)]">
                    {gameLocked
                      ? isBg
                        ? "ОТКЛЮЧИ"
                        : isZh
                          ? "解锁"
                          : "UNLOCK"
                      : isBg
                        ? "ИГРАЙ"
                        : isZh
                          ? "开始"
                          : "PLAY"}
                    <span className="text-[0.8rem]">›</span>
                  </span>
                </>
              );
              return (
                <Link key={game.to} to={game.to} className={className}>
                  {card}
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
