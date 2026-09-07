import { createFileRoute } from "@tanstack/react-router";
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

function GamesPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1280px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">02 /</span>
          <span className="label-mono">{isBg ? "ИГРИ" : isZh ? "游戏" : "GAMES"}</span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            {isBg ? "ИГРАЙ СЕГА" : isZh ? "立即游玩" : "PLAY NOW"}
          </h1>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "ГЕЙМ ХЪБ" : isZh ? "游戏中心" : "GAME HUB"}
          </span>
        </div>
        <div className="mt-10 grid max-w-3xl gap-4 text-muted-foreground md:grid-cols-2">
          <p>
            {isBg
              ? "Разгледай игрите, които влизат в ротацията на Todor Khristov Gaming. Всяко заглавие носи различен ритъм: строене, състезание, стратегия, екшън или хаос с приятели."
              : isZh
                ? "探索 Todor Khristov Gaming 的游戏轮换。每款游戏都带来不同的节奏：建造、竞技、策略、动作或与朋友一起的混乱。"
                : "Explore the games in the Todor Khristov Gaming rotation. Every title brings a different rhythm: building, competition, strategy, action, or chaos with friends."}
          </p>
          <p>
            {isBg
              ? "Следи новите серии, избери своя фаворит и се върни за още моменти от общността. Game hub-ът е място за идеи, забавление и игри без излишна сериозност."
              : isZh
                ? "关注新的系列，选择你喜欢的游戏，回来发现更多社区精彩时刻。这里是分享想法、娱乐和游戏的地方。"
                : "Follow new series, choose your favorite, and return for more community moments. The game hub is a place for ideas, entertainment, and games without taking things too seriously."}
          </p>
        </div>
        <div className="mt-10 grid max-w-4xl gap-8 border-t border-border/60 pt-8 text-muted-foreground md:grid-cols-3">
          <div>
            <h2 className="font-display text-base text-foreground">
              {isBg ? "Различни жанрове" : isZh ? "不同类型" : "Different genres"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              {isBg
                ? "От отворени светове и сървайвъл до шутъри, MOBA и tower defense, тук има заглавия за различни настроения и стилове на игра."
                : isZh
                  ? "从开放世界和生存游戏，到射击、MOBA 和塔防，这里涵盖不同的心情与玩法。"
                  : "From open worlds and survival to shooters, MOBAs, and tower defense, this collection covers different moods and play styles."}
            </p>
          </div>
          <div>
            <h2 className="font-display text-base text-foreground">
              {isBg ? "Нови моменти" : isZh ? "精彩时刻" : "Fresh moments"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              {isBg
                ? "Ротацията се променя според новите серии, идеите на общността и игрите, които предлагат най-много неочаквани ситуации."
                : isZh
                  ? "游戏轮换会随着新系列、社区想法和最能创造意外时刻的游戏而改变。"
                  : "The rotation changes with new series, community ideas, and games that create the most unexpected situations."}
            </p>
          </div>
          <div>
            <h2 className="font-display text-base text-foreground">
              {isBg ? "Играй заедно" : isZh ? "一起游玩" : "Play together"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              {isBg
                ? "Избери игра, последвай канала и се присъедини към разговорите. Най-добрите моменти са тези, които споделяме."
                : isZh
                  ? "选择一款游戏，关注频道并加入讨论。最精彩的时刻，就是我们共同分享的时刻。"
                  : "Choose a game, follow the channel, and join the conversation. The best moments are the ones we share."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
