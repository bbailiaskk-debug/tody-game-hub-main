import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Baby,
  FileText,
  Gauge,
  HandHeart,
  Lock,
  MessageSquareWarning,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";

import { useSiteSettings } from "../components/site/theme";
import { serverGetEmailjsQuota, type EmailjsQuota } from "../lib/emailjs-quota";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/rules")({
  loader: async (): Promise<EmailjsQuota | null> => {
    try {
      return await serverGetEmailjsQuota({ data: {} });
    } catch {
      return null;
    }
  },
  head: () => {
    const seo = seoHead({
      path: "/rules",
      title: "Правила на сайта",
      description:
        "Правилата на Todor Khristov Gaming: добър тон, без спам, спазване на реда и защита на личните данни, за да е приятно на всички.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: RulesPage,
});

type RuleItem = {
  icon: typeof Users;
  id?: string;
  title: string;
  text: string;
};

const bgRules: RuleItem[] = [
  {
    icon: HandHeart,
    title: "Добър тон",
    text: "Отнасяй се с уважение към всички. Без обиди, тормоз, расова или друга дискриминация — да сме приятелска общност.",
  },
  {
    icon: MessageSquareWarning,
    id: "emailjs",
    title: "Без спам",
    text: "Не изпращай повтарящи се съобщения, масови линкове или реклами — един път е напълно достатъчно. Всеки имейл от сайта (кодове за вход, контакти, награди на победителите) минава през EmailJS с лимит от 200 заявки месечно, а в момента лимитът се изчерпва. Моля, не го прахосвай.",
  },
  {
    icon: ScrollText,
    title: "Спазвай реда",
    text: "Следвай структурата на сайта и указанията на модераторите. Не злоупотребявай с функции и не претрупвай страниците.",
  },
  {
    icon: Lock,
    title: "Лични данни",
    text: "Не споделяй чужди лични данни (адреси, телефони, пароли) без изрично съгласие.",
  },
  {
    icon: FileText,
    title: "Промени в правилата",
    text: "Правилата могат да се актуализират по всяко време. Промените влизат в сила от момента на публикуването им тук.",
  },
  {
    icon: Baby,
    title: "Деца и Styles / Регистрация",
    text: "Деца от 5 до 8 години нямат право да пипат Styles или да натискат клавиша F12. Преди да пипат каквито и да е Styles или да си направят регистрация сами, децата задължително трябва да попитат своите родители дали могат да го направят.",
  },
];

const enRules: RuleItem[] = [
  {
    icon: HandHeart,
    title: "Be respectful",
    text: "Treat everyone kindly. No harassment, hate speech, or discrimination — we are a friendly community.",
  },
  {
    icon: MessageSquareWarning,
    id: "emailjs",
    title: "No spam",
    text: "Do not send repetitive messages, mass links, or ads — once is more than enough. Every email from the site (login codes, contact messages, winners' prizes) goes through EmailJS with a monthly limit of 200 requests, and right now that limit is being used up. Please don't waste it.",
  },
  {
    icon: ScrollText,
    title: "Keep the order",
    text: "Follow the site structure and the moderators' guidance. Do not abuse features or overload pages.",
  },
  {
    icon: Lock,
    title: "Privacy",
    text: "Do not share others' personal data (addresses, phones, passwords) without explicit consent.",
  },
  {
    icon: FileText,
    title: "Rule updates",
    text: "Rules may be updated at any time. Changes take effect once published here.",
  },
  {
    icon: Baby,
    title: "Children and Styles / Registration",
    text: "Children between 5 and 8 are not allowed to touch Styles or press the F12 key. Before touching any Styles or registering on their own, children must always ask their parents whether they may do so.",
  },
];

const zhRules: RuleItem[] = [
  {
    icon: HandHeart,
    title: "保持友善",
    text: "尊重他人，不辱骂、不欺凌、不歧视——我们是一个友好的社区。",
  },
  {
    icon: MessageSquareWarning,
    id: "emailjs",
    title: "禁止刷屏",
    text: "不要重复发送消息、群发链接或广告——一次就足够了。本站的每封邮件（登录验证码、联系消息、获奖者的奖品）都通过 EmailJS 发送，每月限额为 200 次，而目前限额正在消耗中。请节约使用。",
  },
  {
    icon: ScrollText,
    title: "遵守秩序",
    text: "遵守网站结构和管理员的指引，不要滥用功能或刷爆页面。",
  },
  {
    icon: Lock,
    title: "保护隐私",
    text: "未经明确同意，不要分享他人的个人信息（地址、电话、密码）。",
  },
  {
    icon: FileText,
    title: "规则更新",
    text: "规则可能随时更新，发布后立即生效。",
  },
  {
    icon: Baby,
    title: "儿童与 Styles / 注册",
    text: "5 至 8 岁的儿童不得触碰 Styles 或按 F12 键。在触碰任何 Styles 或自行注册之前，儿童必须征得父母同意后才能进行。",
  },
];

function EmailjsQuotaNotice({
  quota,
  isBg,
  isZh,
}: {
  quota: EmailjsQuota;
  isBg: boolean;
  isZh: boolean;
}) {
  const low = quota.remaining <= 50;
  const tone = low
    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
    : "border-border/60 bg-surface/40 text-muted-foreground";

  const text = isZh
    ? low
      ? `⚠ 已发送 ${quota.used} · 只剩 ${quota.remaining} / ${quota.limit} 次了！`
      : `已发送 ${quota.used} · 剩余 ${quota.remaining} / ${quota.limit}`
    : isBg
      ? low
        ? `⚠ Изпратени ${quota.used} · остават само ${quota.remaining} от ${quota.limit}!`
        : `Изпратени ${quota.used} · остават ${quota.remaining} от ${quota.limit}`
      : low
        ? `⚠ Sent ${quota.used} · only ${quota.remaining} left of ${quota.limit}!`
        : `Sent ${quota.used} · ${quota.remaining} left of ${quota.limit}`;

  return (
    <p
      className={`mt-3 inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone}`}
    >
      <Gauge className="size-3.5" />
      {text}
    </p>
  );
}

function RulesPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const quota = Route.useLoaderData();

  const rules = isZh ? zhRules : isBg ? bgRules : enRules;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 text-center">
        <span className="label-mono mb-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-[0.6rem] tracking-[0.25em] text-brand">
          <Sparkles className="size-3" />
          TODOR KHRISTOV GAMING — {isZh ? "规则" : isBg ? "ПРАВИЛА" : "RULES"}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {isBg ? "Правила на сайта" : isZh ? "网站规则" : "Site Rules"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          {isBg
            ? "Кратко и ясно: как се държим, за да е приятно на всички. Ако нещо не е ясно — питай."
            : isZh
              ? "简单明了地说明我们如何相处，让每个人都很愉快。如有疑问，请问我。"
              : "Short and clear: how we behave so everyone enjoys it. If anything is unclear, just ask."}
        </p>
      </header>

      <ol className="space-y-3">
        {rules.map((rule, index) => {
          const Icon = rule.icon;
          return (
            <li key={rule.title}>
              <div className="flex items-start gap-4 rounded-3xl border border-border/70 bg-surface/40 p-5 transition-colors hover:border-brand/30 hover:bg-surface/70">
                <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold">
                    <span className="mr-2 text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}.
                    </span>
                    {rule.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{rule.text}</p>
                  {rule.id === "emailjs" && quota ? (
                    <EmailjsQuotaNotice quota={quota} isBg={isBg} isZh={isZh} />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 rounded-3xl border border-border/60 bg-surface/25 p-5 text-center text-sm text-muted-foreground">
        <Users className="mx-auto mb-2 size-5 text-brand" />
        {isZh ? (
          <p>
            感谢你帮助这里保持有序！请通过{" "}
            <Link to="/info" className="text-brand underline-offset-2 hover:underline">
              联系页面
            </Link>{" "}
            反馈。
          </p>
        ) : isBg ? (
          <p>
            Благодарим, че помагаш да пазим реда! За съмнения или сигнали пиши ни през{" "}
            <Link to="/info" className="text-brand underline-offset-2 hover:underline">
              информационната страница
            </Link>
            .
          </p>
        ) : (
          <p>
            Thanks for helping keep this place friendly! For questions or reports, reach out via the{" "}
            <Link to="/info" className="text-brand underline-offset-2 hover:underline">
              info page
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
