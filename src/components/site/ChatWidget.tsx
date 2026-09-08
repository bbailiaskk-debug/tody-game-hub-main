import { Link } from "@tanstack/react-router";
import { Bot, ChevronDown, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { memo, useCallback, useState, type FormEvent } from "react";

type ChatMessage = {
  id: number;
  from: "bot" | "user";
  text: string;
  links?: Array<"contact" | "discord" | "socials" | "music">;
};

const discordUrl = "https://discord.gg/uRNGhKf7vC";
const socialLinks = [
  { label: "YouTube", href: "https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ" },
  { label: "TikTok", href: "https://www.tiktok.com/@todorkhristovgmaing" },
  { label: "Spotify", href: "https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20g" },
] as const;
const musicLinks = [socialLinks[0], socialLinks[2]] as const;
const suggestions = ["График", "Discord", "Лаг / Проблем", "Линкове"];

function getBotReply(question: string, musicContext: boolean): Omit<ChatMessage, "id" | "from"> {
  const normalized = question.toLocaleLowerCase("bg-BG");

  if (normalized.includes("линкове") || normalized.includes("социални мрежи")) {
    return {
      text: "Ето официалните ни канали за последване:",
      links: ["socials"],
    };
  }

  if (
    musicContext &&
    (normalized.includes("песен") ||
      normalized.includes("трак") ||
      normalized.includes("плейлист") ||
      normalized.includes("spotify") ||
      normalized.includes("youtube"))
  ) {
    return {
      text: "В Music секцията ще намериш траковете и плейлиста на Todor Khristov Gaming. Можеш да слушаш песните директно от сайта или да продължиш към официалните ни музикални канали:",
      links: ["music"],
    };
  }

  if (normalized.includes("discord")) {
    return {
      text: "Ела в Discord сървъра на Todor Khristov Gaming и се включи в разговора.",
      links: ["discord"],
    };
  }

  if (normalized.includes("монтаж") || normalized.includes("видео")) {
    return {
      text: "За видео монтаж използвай контактната форма в секция Информация. Там можеш да изпратиш всички детайли за проекта.",
      links: ["contact"],
    };
  }

  if (
    normalized.includes("лаг") ||
    normalized.includes("проблем") ||
    normalized.includes("насич") ||
    normalized.includes("техничес")
  ) {
    return {
      text: "Ако имаш лаг, насичане на клипа в YouTube или друг технически проблем със видео и контактите, моля пишете ни директно през формата за контакти или в нашия Discord сървър, за да го съобщите!",
      links: ["contact", "discord"],
    };
  }

  if (
    normalized.includes("график") ||
    normalized.includes("кач") ||
    normalized.includes("втор") ||
    normalized.includes("пет")
  ) {
    return {
      text: "Ново съдържание излиза всеки вторник и петък. Включи известията, за да не изпускаш следващия клип в YouTube.",
    };
  }

  return {
    text: "Аз съм TK-Bot, асистентът на Todor Khristov Gaming. Мога да помогна с графика за качване, Discord или заявка за видео монтаж.",
  };
}

export function ChatWidget({
  embedded = false,
  musicContext = false,
}: {
  embedded?: boolean;
  musicContext?: boolean;
}) {
  const [open, setOpen] = useState(embedded);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      from: "bot",
      text: musicContext
        ? "Здравей! Аз съм TK-Bot. Питай ме за траковете, плейлиста или музикалните линкове в Music секцията."
        : "Здравей! Аз съм TK-Bot. Питай ме за новите видеа, Discord или видео монтаж.",
    },
  ]);

  const sendMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      setMessages((current) => [
        ...current,
        { id: Date.now(), from: "user", text: trimmed },
        { id: Date.now() + 1, from: "bot", ...getBotReply(trimmed, musicContext) },
      ]);
      setInput("");
    },
    [musicContext],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage],
  );

  const handleQuickAction = useCallback((message: string) => sendMessage(message), [sendMessage]);
  const handleInputChange = useCallback((value: string) => setInput(value), []);

  const panel = (
    <section
      aria-label="TK-Bot чат"
      className={`${embedded ? "w-full" : "w-[min(22rem,calc(100vw-2rem))]"} overflow-hidden rounded-2xl border border-brand/60 bg-background/95 shadow-[0_0_24px_color-mix(in_srgb,var(--brand)_22%,transparent),0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl`}
    >
      <div className="flex items-center justify-between border-b border-brand/25 bg-brand/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg border border-brand/60 bg-brand/15 text-brand shadow-[0_0_14px_color-mix(in_srgb,var(--brand)_35%,transparent)]">
            <Bot className="size-5" />
          </span>
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.2em] text-brand">TK-BOT</p>
            <p className="font-mono text-[0.6rem] tracking-[0.12em] text-muted-foreground">
              ONLINE / GAMING ASSISTANT
            </p>
          </div>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Затвори TK-Bot"
            className="text-muted-foreground transition-colors hover:text-brand"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="max-h-[min(22rem,50vh)] space-y-3 overflow-y-auto p-4">
        <MessageList messages={messages} />
      </div>

      <QuickActions onSelect={handleQuickAction} />

      <ChatComposer value={input} onChange={handleInputChange} onSubmit={handleSubmit} />
    </section>
  );

  if (embedded) return panel;
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && panel}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Затвори TK-Bot" : "Отвори TK-Bot"}
        aria-expanded={open}
        className="group grid size-14 place-items-center rounded-full border border-brand bg-background text-brand shadow-[0_0_22px_color-mix(in_srgb,var(--brand)_48%,transparent)] transition-transform hover:scale-105"
      >
        {open ? <ChevronDown className="size-6" /> : <MessageCircle className="size-6" />}
        <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md border border-brand/40 bg-background px-2 py-1 font-mono text-[0.6rem] tracking-[0.12em] text-brand opacity-0 transition-opacity group-hover:opacity-100">
          TK-BOT ONLINE
        </span>
      </button>
    </div>
  );
}

export function ChatIcon() {
  return <Sparkles className="size-4" />;
}

const MessageList = memo(function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed ${message.from === "user" ? "bg-brand text-primary-foreground" : "border border-border bg-surface text-foreground"}`}
          >
            <p>{message.text}</p>
            {message.links?.includes("contact") && (
              <Link
                to="/info"
                className="mt-2 mr-3 inline-flex font-mono text-[0.65rem] font-bold tracking-[0.08em] text-brand underline underline-offset-4"
              >
                Към контактната форма
              </Link>
            )}
            {message.links?.includes("discord") && (
              <a
                href={discordUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex font-mono text-[0.65rem] font-bold tracking-[0.08em] text-brand underline underline-offset-4"
              >
                Discord сървър
              </a>
            )}
            {message.links?.includes("socials") && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {socialLinks.map((socialLink) => (
                  <a
                    key={socialLink.label}
                    href={socialLink.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[0.65rem] font-bold tracking-[0.08em] text-brand underline underline-offset-4"
                  >
                    {socialLink.label}
                  </a>
                ))}
              </div>
            )}
            {message.links?.includes("music") && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <Link
                  to="/music"
                  className="font-mono text-[0.65rem] font-bold tracking-[0.08em] text-brand underline underline-offset-4"
                >
                  Music секция
                </Link>
                {musicLinks.map((musicLink) => (
                  <a
                    key={musicLink.label}
                    href={musicLink.href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[0.65rem] font-bold tracking-[0.08em] text-brand underline underline-offset-4"
                  >
                    {musicLink.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
});

const QuickActions = memo(function QuickActions({
  onSelect,
}: {
  onSelect: (message: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto border-t border-border/60 px-3 py-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="shrink-0 rounded-full border border-brand/35 px-2.5 py-1 font-mono text-[0.6rem] text-brand transition-colors hover:bg-brand/10"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
});

const ChatComposer = memo(function ChatComposer({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2 border-t border-border/60 p-3">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Пиши на TK-Bot..."
        aria-label="Съобщение до TK-Bot"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-1 focus:ring-brand"
      />
      <button
        type="submit"
        aria-label="Изпрати съобщение"
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-primary-foreground transition-transform hover:-translate-y-0.5"
      >
        <Send className="size-4" />
      </button>
    </form>
  );
});
