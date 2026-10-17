import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Check,
  Menu as MenuIcon,
  MousePointerClick,
  Sparkles,
} from "lucide-react";

import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/tutorial")({
  head: () => {
    const seo = seoHead({
      path: "/tutorial",
      title: "Туториал: къде са правилата?",
      description:
        "Кратко ръководство как се стига до правилата на сайта: отвори менюто горе вдясно и избери ПРАВИЛА.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: TutorialPage,
});

type TutorialStep = {
  icon: typeof MousePointerClick;
  title: string;
  text: string;
};

const bgSteps: TutorialStep[] = [
  {
    icon: MenuIcon,
    title: "Отвори менюто",
    text: "Натисни бутона с трите линии (☰) горе вдясно. Той отваря главното меню на сайта.",
  },
  {
    icon: MousePointerClick,
    title: "Избери ПРАВИЛА",
    text: "В менюто натисни третия ред — ПРАВИЛА. Точно там е страницата с правилата.",
  },
  {
    icon: Check,
    title: "Готово",
    text: "Прочети правилата и се дръж по тях. Забързан си? Отвори ги веднага с бутона по-долу.",
  },
];

const enSteps: TutorialStep[] = [
  {
    icon: MenuIcon,
    title: "Open the menu",
    text: "Tap the button with three lines (☰) at the top right. It opens the site's main menu.",
  },
  {
    icon: MousePointerClick,
    title: "Pick RULES",
    text: "In the menu, tap the third item — RULES. That is exactly where the rules page lives.",
  },
  {
    icon: Check,
    title: "Done",
    text: "Read the rules and follow them. In a hurry? Open them now with the button below.",
  },
];

const zhSteps: TutorialStep[] = [
  {
    icon: MenuIcon,
    title: "打开菜单",
    text: "点击右上角的按钮（☰），即可打开网站主菜单。",
  },
  {
    icon: MousePointerClick,
    title: "选择规则",
    text: "在菜单中点击第三项「规则」，规则页面就在这里。",
  },
  {
    icon: Check,
    title: "完成",
    text: "阅读并遵守规则。赶时间？用下面的按钮立即打开。",
  },
];

const navLabel = { bg: "ПРАВИЛА", en: "RULES", zh: "规则" } as const;

function TutorialPage() {
  const { lang } = useSiteSettings();

  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const steps = isZh ? zhSteps : isBg ? bgSteps : enSteps;
  const label = navLabel[lang];

  const menuMock = ["НАЧАЛО", "ИГРИ", "ПРАВИЛА", "МУЗИКА", "ИНФОРМАЦИЯ"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 text-center">
        <span className="label-mono mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-[0.6rem] tracking-[0.25em] text-brand">
          <Sparkles className="size-3" />
          TODOR KHRISTOV GAMING — {isZh ? "教程" : isBg ? "ТУТОРИАЛ" : "TUTORIAL"}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {isBg
            ? "Намери правилата за 10 секунди"
            : isZh
              ? "10 秒内找到规则"
              : "Find the rules in 10 seconds"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          {isBg
            ? "Ето къде се намира страницата с правилата — три лесни стъпки."
            : isZh
              ? "这里告诉您规则页面在哪里——只需三步。"
              : "Here is exactly where the rules page lives — three easy steps."}
        </p>
      </header>

      <ol className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title}>
              <div className="flex items-start gap-4 rounded-3xl border border-border/70 bg-surface/40 p-5 transition-colors hover:border-brand/30 hover:bg-surface/70">
                <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold">
                    <span className="mr-2 text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}.
                    </span>
                    {step.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 rounded-3xl border border-border/60 bg-surface/25 p-5">
        <p className="label-mono mb-3 flex items-center gap-2 text-[0.6rem]">
          <BookOpen className="size-3.5 text-brand" />
          {isBg ? "ТАКА ИЗГЛЕЖДА МЕНЮТО" : isZh ? "菜单是这样的" : "THIS IS HOW THE MENU LOOKS"}
        </p>
        <div className="max-w-[240px] overflow-hidden rounded-2xl border border-border bg-surface">
          {menuMock.map((item) => (
            <div
              key={item}
              className={`px-4 py-2.5 font-mono text-[0.65rem] tracking-[0.18em] ${
                item === label
                  ? "bg-brand font-bold text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {item}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {isBg
            ? "Третият ред с зелено и е ПРАВИЛА."
            : isZh
              ? "带绿色高亮的第三项就是「规则」。"
              : "The third item with the highlight is RULES."}
        </p>
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Link
          to="/rules"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-mono text-xs font-bold tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          {isBg ? "ОТВОРИ ПРАВИЛАТА" : isZh ? "打开规则" : "OPEN THE RULES"}
          <ArrowRight className="size-4" />
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          {isBg
            ? "Също така: линкът „Правила“ е и в долния край (футъра) на всяка страница."
            : isZh
              ? "另外：每页底部（页脚）也有「规则」链接。"
              : 'Tip: the "Rules" link is also in the footer at the bottom of every page.'}
        </p>
      </div>
    </div>
  );
}
