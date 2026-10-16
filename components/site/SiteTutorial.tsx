import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Menu as MenuIcon, Timer, X } from "lucide-react";

import { useSiteSettings } from "./theme";

const ENTER_DELAY_MS = 800;
const AUTO_HIDE_SECONDS = 10;
const EXIT_ANIMATION_MS = 350;

const copy = {
  bg: {
    title: "Къде са правилата?",
    steps: "Отвори менюто (☰) горе вдясно → изберете ПРАВИЛА",
    autoHide: "скрива се след {n}s",
    cta: "Отвори правилата",
    closeLabel: "Затвори туториала",
  },
  en: {
    title: "Where are the rules?",
    steps: "Open the menu (☰) top right → pick RULES",
    autoHide: "hides in {n}s",
    cta: "Open the rules",
    closeLabel: "Close tutorial",
  },
  zh: {
    title: "规则在哪里？",
    steps: "打开右上角菜单（☰）→ 选择「规则」",
    autoHide: "{n} 秒后自动关闭",
    cta: "打开规则",
    closeLabel: "关闭教程",
  },
} as const;

export function SiteTutorial() {
  const { lang } = useSiteSettings();

  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [seconds, setSeconds] = useState(AUTO_HIDE_SECONDS);

  const leaveTimer = useRef<number | null>(null);

  const hide = useCallback(() => {
    setLeaving(true);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setVisible(false);
      setLeaving(false);
    }, EXIT_ANIMATION_MS);
  }, []);

  useEffect(() => {
    const enter = window.setTimeout(() => setVisible(true), ENTER_DELAY_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(enter);
      document.removeEventListener("keydown", onKey);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, [hide]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [visible]);

  useEffect(() => {
    if (visible && seconds <= 0) hide();
  }, [visible, seconds, hide]);

  if (!visible) return null;

  const c = copy[lang];
  const autoHideLabel = c.autoHide.replace("{n}", String(seconds));

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[76px] z-50 flex justify-center px-3 sm:px-4 lg:left-[var(--sidebar-w)]">
      <div
        role="dialog"
        aria-label={c.title}
        className={`pointer-events-auto w-full max-w-2xl rounded-3xl border border-brand/30 bg-surface/95 p-4 text-foreground shadow-2xl backdrop-blur-xl transition-all duration-300 sm:p-7 ${
          leaving ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <BookOpen className="size-5 text-brand sm:size-6" />
            <h2 className="font-display text-lg font-bold sm:text-2xl">{c.title}</h2>
          </div>
          <button
            type="button"
            onClick={hide}
            aria-label={c.closeLabel}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground sm:size-10"
          >
            <X className="size-4 sm:size-5" />
          </button>
        </div>

        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground sm:mt-4 sm:gap-3 sm:text-lg">
          <MenuIcon className="mt-0.5 size-5 shrink-0 text-brand sm:mt-1 sm:size-6" />
          <span>{c.steps}</span>
        </p>

        <div className="mt-3 flex items-center justify-between gap-2 sm:mt-6 sm:gap-4">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 font-mono text-xs text-brand sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
            <Timer className="size-3.5 sm:size-4" />
            {autoHideLabel}
          </span>
          <Link
            href="/rules"
            onClick={hide}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-mono text-xs font-bold tracking-[0.14em] text-primary-foreground transition-transform hover:-translate-y-0.5 sm:gap-2 sm:px-6 sm:py-3 sm:text-base"
          >
            {c.cta}
            <ArrowRight className="size-3.5 sm:size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
