import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Building2, Loader2, Lock, LogIn, Rocket, Sparkles } from "lucide-react";
import { type ComponentType, type FunctionComponent, type ReactNode } from "react";

import { useGameAccess, useCheckout } from "../../lib/plan-access";
import { PLAN_DETAILS, type PaidPlanId, type PlanId } from "../../lib/plans";
import { gameNote, gameTag } from "./game-catalog";
import { useSiteSettings } from "./theme";

const PLAN_ICONS: Record<PaidPlanId, typeof Sparkles> = {
  pro: Rocket,
  enterprise: Building2,
};

const isPaidPlan = (plan: PlanId): plan is PaidPlanId => plan !== "free";

type GameLockScreenProps = {
  gamePath: string;
  gameTitle: string;
};

export function GameLockScreen({ gamePath, gameTitle }: GameLockScreenProps) {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const { requiredPlan } = useGameAccess(gamePath);
  const { links, availability, busyPlan, error, startCheckout } = useCheckout();

  if (!isPaidPlan(requiredPlan)) return null;

  const Icon = PLAN_ICONS[requiredPlan] ?? Sparkles;
  const planName = PLAN_DETAILS[requiredPlan].name[lang];
  const planPrice = PLAN_DETAILS[requiredPlan].price;
  const canPayDirectly = availability[requiredPlan] || Boolean(links[requiredPlan]);
  const isPaying = busyPlan === requiredPlan;

  const copy = {
    kicker: isBg ? "ПЛАТЕН ДОСТЪП" : isZh ? "付费访问" : "PAID ACCESS",
    lead: isBg
      ? `Тази игра е част от пакета ${planName}. Активирай го и играй без ограничения.`
      : isZh
        ? `这款游戏属于 ${planName} 方案。激活后即可畅玩。`
        : `This game is part of the ${planName} plan. Activate it and play without limits.`,
    buy: isBg
      ? `Плати ${planPrice} / месец`
      : isZh
        ? `支付 ${planPrice} / 月`
        : `Pay ${planPrice} / month`,
    seePlans: isBg ? "Виж пакетите" : isZh ? "查看方案" : "See the plans",
    signIn: isBg ? "Влез в профила си" : isZh ? "登录你的账户" : "Sign in to your profile",
  };

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-28 pt-24 text-center">
        <span className="grid size-16 place-items-center rounded-3xl border border-brand/30 bg-brand/10 text-brand">
          <Lock className="size-7" />
        </span>
        <p className="label-mono mt-6 text-brand">{copy.kicker}</p>
        <h1 className="mt-4 text-brand text-[clamp(2.2rem,7vw,4rem)] leading-none">{gameTitle}</h1>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2">
          <Icon className="size-4 text-brand" />
          <span className="font-mono text-[0.68rem] font-bold tracking-[0.14em] text-foreground">
            {planName.toUpperCase()} · {planPrice}
          </span>
        </div>

        <p className="mt-6 max-w-md text-sm text-muted-foreground">{copy.lead}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {canPayDirectly ? (
            <button
              type="button"
              onClick={() => void startCheckout(requiredPlan)}
              disabled={isPaying}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-mono text-[0.68rem] font-bold tracking-[0.14em] text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
            >
              {isPaying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUpRight className="size-4" />
              )}
              {copy.buy}
            </button>
          ) : null}

          <Link
            to="/"
            hash="pricing"
            className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-6 py-3 font-mono text-[0.68rem] font-bold tracking-[0.14em] text-brand transition-colors hover:bg-brand/10"
          >
            {copy.seePlans}
            <ArrowUpRight className="size-4" />
          </Link>

          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 font-mono text-[0.68rem] font-bold tracking-[0.14em] text-muted-foreground transition-colors hover:border-brand-dim hover:text-brand"
          >
            <LogIn className="size-4" />
            {copy.signIn}
          </Link>
          {error ? <p className="mt-4 w-full text-center text-xs text-[#f87171]">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}

type GameAccessBoundaryProps = {
  gamePath: string;
  gameTitle: string;
  children: ReactNode;
};

export function GameAccessBoundary({ gamePath, gameTitle, children }: GameAccessBoundaryProps) {
  const { lang } = useSiteSettings();
  const { locked, loading } = useGameAccess(gamePath);

  if (loading) {
    /**
     * The game, described — rather than a grey bar.
     *
     * Whether the plan can be seen is asked on the client, so this is what the
     * server sends and therefore the whole of what a crawler reads: a page with no
     * heading on it and a handful of words on it, which is why the audit reported a
     * missing `h1` and a low word count on every game.
     *
     * The sentences are the index's own, not new ones written for a crawler. They
     * are what the game is, they are already on screen two clicks away, and a person
     * waiting the second or two before a game opens reads something true rather than
     * a spinner. The line under the title says what is happening, which is the one
     * thing the description cannot say.
     */
    const copy = lang === "bg" ? "Отваря се…" : lang === "zh" ? "正在打开…" : "Opening…";
    const note = gameNote(gamePath, lang);
    const tag = gameTag(gamePath, lang);
    return (
      <main className="grid-bg min-h-screen">
        <section className="mx-auto max-w-3xl px-6 pb-28 pt-24">
          {tag ? <p className="label-mono text-brand">{tag}</p> : null}
          <h1 className="mt-2 text-brand text-[clamp(2.2rem,7vw,4rem)] leading-none">
            {gameTitle}
          </h1>
          {note ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{note}</p>
          ) : null}
          <p className="mt-4 text-xs text-muted-foreground/80">{copy}</p>
          <div className="mt-8 h-8 w-48 animate-pulse rounded-full bg-card" />
        </section>
      </main>
    );
  }

  if (locked) {
    return <GameLockScreen gamePath={gamePath} gameTitle={gameTitle} />;
  }

  return <>{children}</>;
}

export function withGameAccess<P extends object>(
  Component: ComponentType<P>,
  options: { gamePath: string; gameTitle: string },
): FunctionComponent<P> {
  return function GameAccessGate(props: P) {
    return (
      <GameAccessBoundary gamePath={options.gamePath} gameTitle={options.gameTitle}>
        <Component {...props} />
      </GameAccessBoundary>
    );
  };
}
