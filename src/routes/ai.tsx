import { createFileRoute } from "@tanstack/react-router";
import { Bot, CalendarDays, ExternalLink } from "lucide-react";
import { useSiteSettings } from "../components/site/theme";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "TK-Bot — Todor Khristov Gaming" },
      { name: "description", content: "Изкуственият интелект асистент на Todor Khristov Gaming." },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">04 /</span>
          <span className="label-mono">
            {isBg ? "ИЗКУСТВЕН ИНТЕЛЕКТ" : "ARTIFICIAL INTELLIGENCE"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">TK-BOT</h1>
            <p className="mt-4 max-w-xl text-muted-foreground">
              {isBg
                ? "Асистентът на Todor Khristov Gaming е тук за бързи отговори за канала, общността и новото съдържание."
                : "The Todor Khristov Gaming assistant for quick answers about the channel, community, and new content."}
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs tracking-[0.15em] text-brand">
            <Bot className="size-4" /> ONLINE
          </div>
        </div>
        <div className="mt-10 grid gap-8 md:grid-cols-[1fr_22rem] md:items-start">
          <div className="space-y-4 text-muted-foreground">
            <div className="flex gap-3 border-t border-border/60 pt-4">
              <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand" />
              <p>
                {isBg
                  ? "Нови видеа всеки вторник и петък."
                  : "New videos every Tuesday and Friday."}
              </p>
            </div>
            <a
              href="https://discord.gg/uRNGhKf7vC"
              target="_blank"
              rel="noreferrer"
              className="flex gap-3 border-t border-border/60 pt-4 transition-colors hover:text-brand"
            >
              <ExternalLink className="mt-0.5 size-5 shrink-0 text-brand" />
              <p>{isBg ? "Присъедини се към Discord общността." : "Join the Discord community."}</p>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
