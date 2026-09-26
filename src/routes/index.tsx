import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  Check,
  Gamepad2,
  Info,
  Loader2,
  Lock,
  Rocket,
  Sparkles,
} from "lucide-react";
import { useSiteSettings } from "../components/site/theme";
import { confirmCheckoutSession, useCheckout, useUserPlan } from "../lib/plan-access";
import { planCovers, requiredPlanForGame } from "../lib/plans";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/")({
  head: () => {
    const seo = seoHead({
      path: "/",
      title: "Яки игри и забавление",
      description:
        "Игри, моменти и енергия директно от командния център на Todor Khristov Gaming. Виж какви игри играя и се присъедини към общността.",
      titleSuffix: " — Todor Khristov Gaming",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: Index,
});

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

const pricingPlans = [
  {
    id: "starter",
    planKey: "free",
    icon: Sparkles,
    name: { bg: "Старт", en: "Starter", zh: "入门" },
    price: "0,00 €",
    priceBgn: "0,00 лв",
    cadence: { bg: "месечно", en: "per month", zh: "每月" },
    description: {
      bg: "Три безплатни игри, личен профил и настройки — без карта.",
      en: "Three free games, your own profile and settings — no card required.",
      zh: "三款免费游戏、个人资料和设置 — 无需银行卡。",
    },
    includedGames: [
      { label: "CHESS", to: "/chess" },
      { label: "AIR HOCKEY", to: "/airhockey" },
      { label: "TIC TAC TOE", to: "/tictactoe" },
    ],
    features: {
      bg: ["3 безплатни игри", "Личен профил и настройки", "Community access"],
      en: ["3 free games", "Personal profile and settings", "Community access"],
      zh: ["3 款免费游戏", "个人资料和设置", "社区访问"],
    },
    cta: { bg: "Започни безплатно", en: "Start free", zh: "免费开始" },
    ctaTo: "/games",
    featured: false,
  },
  {
    id: "pro",
    planKey: "pro",
    icon: Rocket,
    name: { bg: "Про", en: "Pro", zh: "专业版" },
    price: "50,00 €",
    priceBgn: "97,79 лв",
    cadence: { bg: "месечно", en: "per month", zh: "每月" },
    description: {
      bg: "Повече функции за по-ангажиращо гейминг изживяване.",
      en: "More features for an immersive gaming experience.",
      zh: "更多功能，带来更沉浸的游戏体验。",
    },
    includedGames: [
      { label: "2048", to: "/game2048" },
      { label: "WORDLE", to: "/wordle" },
      { label: "SUDOKU", to: "/sudoku" },
      { label: "DDLC", to: "/ddlc" },
      { label: "PRISM HEART", to: "/prismheart" },
      { label: "STREAM HEART", to: "/streamer" },
    ],
    features: {
      bg: [
        "Всичко от Старт",
        "Разширени профилни настройки",
        "Приоритетен достъп до нови заглавия",
        "Подкрепа без реклама",
      ],
      en: [
        "Everything in Starter",
        "Advanced profile controls",
        "Priority access to new titles",
        "Ad-free experience",
      ],
      zh: ["入门版全部功能", "高级个人资料控制", "新游戏优先体验", "无广告体验"],
    },
    cta: { bg: "Избери Про", en: "Choose Pro", zh: "选择专业版" },
    ctaTo: "/info",
    featured: true,
  },
  {
    id: "enterprise",
    planKey: "enterprise",
    icon: Building2,
    name: { bg: "Enterprise", en: "Enterprise", zh: "企业版" },
    price: "150,00 €",
    priceBgn: "293,37 лв",
    cadence: { bg: "месечно", en: "per month", zh: "每月" },
    description: {
      bg: "Персонализирано решение за екипи и общности.",
      en: "A tailored solution for teams and communities.",
      zh: "为团队和社区量身定制的解决方案。",
    },
    includedGames: [
      { label: "TETRIS", to: "/tetris" },
      { label: "BEAT BATTLE", to: "/beatbattle" },
      { label: "CRYSTAL REALM", to: "/crystalrealm" },
      { label: "CANDY CRUSH", to: "/candycrush" },
      { label: "CHROME DINOSAUR", to: "/dino" },
    ],
    features: {
      bg: [
        "Всичко от Про",
        "Персонализиран dashboard",
        "Приоритетна поддръжка",
        "Интеграции за екипи",
      ],
      en: ["Everything in Pro", "Custom dashboard", "Priority support", "Team integrations"],
      zh: ["专业版全部功能", "自定义仪表板", "优先支持", "团队集成"],
    },
    cta: { bg: "Избери Enterprise", en: "Choose Enterprise", zh: "选择企业版" },
    ctaTo: "/info",
    featured: false,
  },
] as const;

function Index() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const { plan: activePlan, refresh: refreshPlan } = useUserPlan();
  const { availability, busyPlan, error: checkoutError, startCheckout } = useCheckout();
  const [checkoutState, setCheckoutState] = useState<"none" | "success" | "cancelled">("none");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    const sessionId = params.get("session_id") ?? "";

    if (status !== "success" && status !== "cancelled") return;

    setCheckoutState(status);

    if (status !== "success" || !sessionId) {
      void refreshPlan();
      return;
    }

    void confirmCheckoutSession(sessionId)
      .then((result) => {
        if (result.success) {
          window.history.replaceState({}, "", `${window.location.pathname}#pricing`);
          return;
        }
        setCheckoutState("none");
      })
      .catch(() => setCheckoutState("none"));
  }, [refreshPlan]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;

    const start = () => {
      if (video.paused) {
        video.play().catch(() => {});
      }
    };

    video.addEventListener("loadeddata", start);
    video.addEventListener("canplay", start);

    const onGesture = () => {
      start();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchstart", onGesture);

    start();

    return () => {
      video.removeEventListener("loadeddata", start);
      video.removeEventListener("canplay", start);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    };
  }, []);

  return (
    <main className="grid-bg min-h-screen">
      <section className="hero-banner mx-auto grid max-w-7xl items-center gap-10 px-6 pb-24 pt-20 sm:gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-28">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <span className="h-px w-10 bg-brand" />
            <span className="label-mono">
              {isBg ? "ДОБРЕ ДОШЪЛ В СИГНАЛА" : isZh ? "欢迎来到信号" : "WELCOME TO THE SIGNAL"}
            </span>
          </div>

          <h1 className="hero-title mt-8 text-brand text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.92]">
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
            <Link
              to="/ai"
              search={{ chat: "" }}
              className="inline-flex items-center gap-2 rounded-full border border-brand/50 bg-brand/10 px-6 py-4 font-mono text-xs tracking-[0.15em] text-brand transition-transform hover:-translate-y-0.5"
            >
              <Sparkles className="size-4" />
              {isBg ? "TK-BOT AI" : isZh ? "TK-BOT 人工智能" : "TK-BOT AI"}
            </Link>
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full bg-youtube px-6 py-4 font-mono text-xs tracking-[0.15em] text-[#ffffff] transition-transform hover:-translate-y-0.5"
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
            <Link
              to="/"
              hash="pricing"
              className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.15em] text-foreground transition-colors hover:text-brand"
            >
              {isBg ? "ЦЕНОВИ ПАКЕТИ" : isZh ? "价格方案" : "PRICING"}
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

        <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-4xl border border-border lg:justify-self-center">
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            poster="/animo-focus-shift-poster.jpg"
            aria-hidden="true"
          >
            <source src="/animo-focus-shift.webm" type="video/webm" />
            <source src="/animo-focus-shift.mp4" type="video/mp4" />
          </video>
        </div>
      </section>

      <section id="games" className="lazy-section mx-auto max-w-7xl px-6 pb-28">
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

      <section id="pricing" className="lazy-section mx-auto max-w-7xl px-6 pb-28">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">03 /</span>
          <span className="label-mono">
            {isBg ? "ЦЕНОВИ ПАКЕТИ" : isZh ? "价格方案" : "PRICING PLANS"}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-brand text-[clamp(2rem,5vw,3.6rem)] leading-none">
            {isBg ? "ИЗБЕРИ СВОЯ ПЛАН" : isZh ? "选择你的方案" : "CHOOSE YOUR PLAN"}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {isBg
              ? "Започни безплатно или избери по-голям план за повече възможности."
              : isZh
                ? "免费开始，或选择更大的方案获得更多功能。"
                : "Start free or choose a larger plan for more ways to play."}
          </p>
        </div>

        {checkoutState !== "none" ? (
          <p
            className={`mt-6 rounded-full border px-5 py-3 text-center text-xs ${
              checkoutState === "success"
                ? "border-brand/40 bg-brand/10 text-brand"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {checkoutState === "success"
              ? isBg
                ? "Плащането мина — пакетът е активиран. Приятна игра!"
                : isZh
                  ? "支付成功，方案已激活。祝你玩得开心！"
                  : "Payment went through — your plan is active. Enjoy!"
              : isBg
                ? "Плащането е отменено. Можеш да опиташ отново по-късно."
                : isZh
                  ? "支付已取消，你可以稍后再试。"
                  : "Payment cancelled. You can try again later."}
          </p>
        ) : null}

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {pricingPlans.map((plan) => {
            const Icon = plan.icon;
            const isActivePlan = activePlan === plan.planKey;
            const isPaidPlan = plan.planKey !== "free";
            const canPayDirectly = isPaidPlan && availability[plan.planKey];
            const isPaying = busyPlan === plan.planKey;
            return (
              <article
                key={plan.id}
                className="relative flex h-full flex-col rounded-3xl border border-border bg-card p-7 transition-colors hover:border-foreground/20"
              >
                {plan.featured && !isActivePlan ? (
                  <span className="label-mono absolute right-6 top-6 text-[0.58rem] text-muted-foreground">
                    {isBg ? "ПОПУЛЯРЕН" : isZh ? "热门" : "POPULAR"}
                  </span>
                ) : null}
                {isActivePlan ? (
                  <span className="label-mono absolute right-6 top-6 text-[0.58rem] text-brand">
                    {isBg ? "ТВОЯТ ПЛАН" : isZh ? "你的方案" : "YOUR PLAN"}
                  </span>
                ) : null}
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl border border-brand/30 bg-brand/10 text-brand">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="text-2xl">{plan.name[lang]}</h3>
                </div>
                <p className="mt-5 min-h-12 text-sm text-muted-foreground">
                  {plan.description[lang]}
                </p>
                <div className="mt-8 flex min-h-14 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-5xl font-bold tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-lg font-semibold text-muted-foreground">
                    / {plan.priceBgn}
                  </span>
                  <span className="label-mono w-full text-[0.6rem] text-muted-foreground">
                    {plan.cadence[lang]}
                  </span>
                </div>
                {plan.includedGames.length > 0 ? (
                  <div className="mt-8">
                    <p className="label-mono text-[0.6rem] text-brand">
                      {isBg ? "ВКЛЮЧЕНИ ИГРИ" : isZh ? "包含游戏" : "INCLUDED GAMES"}
                    </p>
                    <ul className="mt-3 flex min-h-[65px] content-start flex-wrap gap-2">
                      {plan.includedGames.map((game) => {
                        const gameLocked = !planCovers(activePlan, requiredPlanForGame(game.to));
                        return (
                          <li key={game.to}>
                            <Link
                              to={game.to}
                              className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 font-mono text-[0.6rem] font-bold tracking-[0.1em] text-brand transition-colors hover:bg-brand hover:text-primary-foreground"
                            >
                              {gameLocked ? (
                                <Lock className="size-3" />
                              ) : (
                                <Gamepad2 className="size-3" />
                              )}
                              {game.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                <ul className="mt-8 flex min-h-[7.5rem] content-start flex-col gap-3 text-sm text-muted-foreground">
                  {plan.features[lang].map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  {isPaidPlan ? (
                    <button
                      type="button"
                      onClick={() => void startCheckout(plan.planKey as "pro" | "enterprise")}
                      disabled={!canPayDirectly || isPaying}
                      className="plan-cta inline-flex w-full items-center justify-center gap-2 rounded-full bg-surface-2 px-5 py-3 font-mono text-[0.68rem] font-bold tracking-[0.14em] text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPaying ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowUpRight className="plan-cta-icon size-4" />
                      )}
                      {plan.cta[lang]}
                    </button>
                  ) : (
                    <Link
                      to={plan.ctaTo}
                      className="plan-cta inline-flex w-full items-center justify-center gap-2 rounded-full bg-surface-2 px-5 py-3 font-mono text-[0.68rem] font-bold tracking-[0.14em] text-foreground"
                    >
                      {plan.cta[lang]}
                      <ArrowUpRight className="plan-cta-icon size-4" />
                    </Link>
                  )}
                  {checkoutError ? (
                    <p className="mt-3 text-center text-xs text-[#f87171]">{checkoutError}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
