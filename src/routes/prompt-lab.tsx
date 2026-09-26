import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, FileText, Image as ImageIcon, Sparkles } from "lucide-react";
import { useSiteSettings } from "../components/site/theme";
import PromptInput from "../components/ui/ai-agent-input";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/prompt-lab")({
  head: () => {
    const seo = seoHead({
      path: "/prompt-lab",
      title: "AI Prompt Lab",
      description: "Избери модел и подобри prompt-а си в локалния AI Prompt Lab.",
      noindex: true,
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: PromptLabPage,
});

function PromptLabPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-6xl px-6 pb-28 pt-16 sm:pt-20">
        <Link
          to="/ai"
          search={{ chat: "" }}
          className="inline-flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {isBg ? "НАЗАД КЪМ TK-BOT" : isZh ? "返回 TK-Bot" : "BACK TO TK-BOT"}
        </Link>

        <div className="mt-14 max-w-3xl">
          <div className="flex items-center gap-4">
            <span className="h-px w-10 bg-brand" />
            <span className="label-mono text-brand">AI PROMPT LAB</span>
          </div>
          <h1 className="mt-7 text-brand text-[clamp(2.7rem,8vw,6.3rem)] leading-[0.92]">
            {isBg ? (
              <>
                ИЗБЕРИ
                <br />
                МОДЕЛ
              </>
            ) : isZh ? (
              <>
                选择
                <br />
                模型
              </>
            ) : (
              <>
                CHOOSE
                <br />A MODEL
              </>
            )}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {isBg
              ? "Избери Claude, GPT или Gemini, добави снимки и файлове, а локалният prompt enhancer ще подготви по-ясна версия."
              : isZh
                ? "选择 Claude、GPT 或 Gemini，添加图片和文件，本地提示词增强器会生成更清晰的版本。"
                : "Choose Claude, GPT, or Gemini, add images and files, and let the local prompt enhancer prepare a clearer version."}
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="rounded-4xl border border-border/80 bg-card/70 p-4 shadow-[0_24px_80px_-50px_color-mix(in_srgb,var(--brand)_70%,transparent)] sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Bot className="size-4" />
                </span>
                <div>
                  <p className="font-display text-sm font-bold">AI AGENT INPUT</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isBg
                      ? "Локален prompt enhancer"
                      : isZh
                        ? "本地提示词增强器"
                        : "Local prompt enhancer"}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 font-mono text-[0.58rem] tracking-[0.12em] text-brand">
                <Sparkles className="size-3" />
                {isBg ? "БЕЗ ВЪНШНО API" : isZh ? "无外部 API" : "NO EXTERNAL API"}
              </span>
            </div>
            <PromptInput />
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-border/80 bg-surface/60 p-5">
              <h2 className="text-sm font-bold">
                {isBg ? "Включено" : isZh ? "已包含" : "Included"}
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>Claude Opus 4.8</span>
                </li>
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>GPT-5.6</span>
                </li>
                <li className="flex gap-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>Gemini 2.5 Pro</span>
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-border/80 bg-surface/60 p-5">
              <h2 className="text-sm font-bold">
                {isBg ? "Прикачване" : isZh ? "附件" : "Attachments"}
              </h2>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-3">
                  <ImageIcon className="size-4 text-brand" />
                  {isBg ? "Снимки" : isZh ? "图片" : "Images"}
                </p>
                <p className="flex items-center gap-3">
                  <FileText className="size-4 text-brand" />
                  {isBg ? "Файлове" : isZh ? "文件" : "Files"}
                </p>
              </div>
            </div>

            <p className="rounded-3xl border border-border/80 bg-surface/60 p-5 text-sm leading-relaxed text-muted-foreground">
              {isBg
                ? "Този екран е локален UI demo. Реалният TK-Bot чат остава на /ai."
                : isZh
                  ? "这是本地界面演示。真实 TK-Bot 聊天仍位于 /ai。"
                  : "This is a local UI demo. The real TK-Bot chat remains at /ai."}
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
