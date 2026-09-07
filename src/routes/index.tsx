import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Gamepad2, Info } from "lucide-react";
import { copy, useSiteSettings } from "../components/site/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Todor Khristov Gaming — Яки игри и забавление" },
      {
        name: "description",
        content:
          "Игри, моменти и енергия директно от командния център на Todor Khristov Gaming. Виж какви игри играя и се присъедини към общността.",
      },
      { property: "og:title", content: "Яки игри и забавление — Todor Khristov Gaming" },
      {
        property: "og:description",
        content: "Игри, моменти и енергия директно от командния център на Todor Khristov Gaming.",
      },
      { property: "og:url", content: "https://tody-game-hub.bbailiaskk.workers.dev/" },
      {
        property: "og:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/profile-photo.jpg",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/profile-photo.jpg",
      },
    ],
    links: [
      { rel: "canonical", href: "https://tody-game-hub.bbailiaskk.workers.dev/" },
      { rel: "alternate", hrefLang: "bg", href: "https://tody-game-hub.bbailiaskk.workers.dev/" },
      {
        rel: "alternate",
        hrefLang: "en",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/?lang=en",
      },
      {
        rel: "alternate",
        hrefLang: "zh",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/?lang=zh",
      },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/",
      },
    ],
  }),
  component: Index,
});

const bars = [3, 6, 4, 9, 5, 12, 7, 16, 10, 22, 14, 26, 18, 12, 8, 14, 6, 10, 20, 13, 7, 4];

const games = {
  bg: [
    { title: "Minecraft", tag: "СЪРВАЙВЪЛ", note: "Серии и проекти на живо" },
    { title: "GTA V", tag: "ОТВОРЕН СВЯТ", note: "Мисии и лудории" },
    { title: "Counter-Strike 2", tag: "ШУТЪР", note: "Класирани мачове" },
    { title: "Fortnite", tag: "БАТЪЛ РОЯЛ", note: "Игра с общността" },
    { title: "Mobile Legends", tag: "МОБА", note: "Ранкед битки 5v5" },
    { title: "Bloons TD 6", tag: "СТРАТЕГИЯ", note: "Тауър дифенс рундове" },
    { title: "Among Us", tag: "ПАРТИ", note: "Импостър или креумаейт – кой лъже?" },
  ],
  en: [
    { title: "Minecraft", tag: "SURVIVAL", note: "Live series and builds" },
    { title: "GTA V", tag: "OPEN WORLD", note: "Missions and chaos" },
    { title: "Counter-Strike 2", tag: "SHOOTER", note: "Ranked matches" },
    { title: "Fortnite", tag: "BATTLE ROYALE", note: "Playing with the community" },
    { title: "Mobile Legends", tag: "MOBA", note: "Ranked 5v5 battles" },
    { title: "Bloons TD 6", tag: "STRATEGY", note: "Tower defense rounds" },
    { title: "Among Us", tag: "PARTY", note: "Impostor or crewmate - who is lying?" },
  ],
  zh: [
    { title: "Minecraft", tag: "生存", note: "直播系列与建造" },
    { title: "GTA V", tag: "开放世界", note: "任务与冒险" },
    { title: "Counter-Strike 2", tag: "射击", note: "排位比赛" },
    { title: "Fortnite", tag: "大逃杀", note: "与社区一起游戏" },
    { title: "Mobile Legends", tag: "MOBA", note: "5v5 排位战斗" },
    { title: "Bloons TD 6", tag: "策略", note: "塔防回合" },
    { title: "Among Us", tag: "派对", note: "谁是冒充者？" },
  ],
} as const;

function Index() {
  const { lang } = useSiteSettings();
  const t = copy[lang];
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto grid max-w-[1400px] items-center gap-14 px-6 pb-24 pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:pt-28">
        <div>
          <div className="flex items-center gap-4">
            <span className="h-px w-10 bg-brand" />
            <span className="label-mono">
              {isBg ? "ДОБРЕ ДОШЪЛ В СИГНАЛА" : isZh ? "欢迎来到信号" : "WELCOME TO THE SIGNAL"}
            </span>
          </div>

          <h1 className="mt-8 text-brand text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.92]">
            {isBg ? (
              <>
                ЯКИ ИГРИ
                <br />И
                <br />
                ЗАБАВЛЕНИЕ
              </>
            ) : isZh ? (
              <>
                精彩游戏
                <br />与
                <br />
                美好时光
              </>
            ) : (
              <>
                EPIC GAMES
                <br />
                AND
                <br />
                GOOD TIMES
              </>
            )}
          </h1>

          <p className="mt-8 max-w-lg text-lg text-muted-foreground">
            {isBg
              ? "Игри, моменти и енергия директно от командния център на Todor Khristov. Тук се събират епични мисии, живи сесии, забавни заглавия и атмосфера, която държи общността в движение."
              : isZh
                ? "游戏、精彩时刻与能量，直接来自 Todor Khristov 的指挥中心。史诗任务、直播体验、有趣的游戏和以社区为核心的氛围都汇聚于此。"
                : "Games, moments and energy straight from Todor Khristov's command center. This is where epic missions, live sessions, fun titles, and a community-first vibe come together in one place."}
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {isBg
              ? "От гейминг сесиите и челленджите до музиката и атмосферата около канала, всичко е подготвено да влезе в ежедневието ви като усещане за свобода, лудост и стабилна емоция. Ако обичаш добро настроение, четене на нови игри и неочаквани моменти, това е мястото, където се случва всичко."
              : isZh
                ? "从游戏体验和挑战，到频道周围的音乐与氛围，一切都为你的日常带来自由、乐趣和肾上腺素。如果你喜欢积极的能量、新游戏和难忘时刻，这里就是精彩不断的地方。"
                : "From gameplay sessions and challenges to music and the atmosphere around the channel, everything is built to feel like a daily dose of freedom, fun, and adrenaline. If you like good energy, new games, and memorable moments, this is the place where the signal never really stops."}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              to="/info"
              className="inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 font-mono text-xs tracking-[0.15em] text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5"
            >
              <Info className="size-4" />
              {isBg ? "ПРОФИЛ НА СЪЗДАТЕЛЯ" : isZh ? "了解频道背后" : "WHO IS BEHIND THE SIGNAL"}
              <ArrowUpRight className="size-4" />
            </Link>
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full bg-youtube px-6 py-4 font-mono text-xs tracking-[0.15em] text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              {isBg ? "YOUTUBE КАНАЛ" : isZh ? "YouTube 频道" : "YOUTUBE CHANNEL"}
              <ArrowUpRight className="size-4" />
            </a>
            <Link
              to="/"
              hash="games"
              className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.15em] text-foreground transition-colors hover:text-brand"
            >
              {isBg ? "КЪМ ИГРИТЕ" : isZh ? "探索游戏" : "TO THE GAMES"}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-14 flex items-center gap-4">
            <div className="flex -space-x-3">
              <span className="grid size-9 place-items-center rounded-full bg-surface-2 font-mono text-[0.6rem]">
                TK
              </span>
              <span className="grid size-9 place-items-center rounded-full bg-accent font-mono text-[0.6rem] text-accent-foreground">
                TK
              </span>
              <span className="grid size-9 place-items-center rounded-full bg-surface font-mono text-[0.6rem]">
                +
              </span>
            </div>
            <div>
              <p className="label-mono text-[0.62rem] text-foreground">
                {isBg ? "2 847 В ОБЩНОСТТА" : isZh ? "社区成员 2,847" : "2,847 IN THE COMMUNITY"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-4xl border border-border bg-card/70 p-5">
          <p className="label-mono text-[0.62rem] text-brand-dim">
            TK / {isBg ? "НА ЖИВО" : isZh ? "直播" : "LIVE"}
          </p>
          <div className="mt-4 flex aspect-square flex-col items-center justify-center rounded-3xl bg-surface/60">
            <Gamepad2 className="size-7 text-brand" />
            <span className="mt-4 font-display text-5xl text-brand">TK</span>
            <span className="label-mono mt-3 text-[0.6rem]">{t.online}</span>
            <div className="mt-10 flex h-16 items-end gap-1.5">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-brand"
                  style={{ height: `${h * 2.4}px`, opacity: 0.5 + (h / 26) * 0.5 }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="games" className="mx-auto max-w-[1400px] px-6 pb-28">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">02 /</span>
          <span className="label-mono">
            {isBg ? "КАКВО ИГРАЯ" : isZh ? "我在玩什么" : "WHAT I PLAY"}
          </span>
        </div>
        <h2 className="mt-5 text-brand text-[clamp(2rem,5vw,3.6rem)] leading-none">
          {isBg ? "ИГРИ В РОТАЦИЯ" : isZh ? "游戏轮换" : "GAMES IN ROTATION"}
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {games[lang].map((g) => (
            <article
              key={g.title}
              className="group rounded-3xl border border-border bg-card p-6 transition-colors hover:border-brand-dim"
            >
              <div className="flex items-start justify-between">
                <span className="label-mono text-[0.6rem] text-brand">{g.tag}</span>
                <Gamepad2 className="size-4 text-muted-foreground transition-colors group-hover:text-brand" />
              </div>
              <h3 className="mt-10 text-2xl">{g.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{g.note}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
