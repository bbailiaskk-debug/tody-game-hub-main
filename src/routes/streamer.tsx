import { createFileRoute } from "@tanstack/react-router";
import {
  Ban,
  Coins,
  Crown,
  Gift,
  Heart,
  Home,
  MessageCircle,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/streamer")({
  head: () => {
    const seo = seoHead({
      path: "/streamer",
      title: "STREAM HEART",
      description:
        "Оригинална симулация на виртуален стриймър с чат, дарения и подаръци — подкрепи Нова и отключи четири финала.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: StreamerPage,
});

type Text = { bg: string; en: string; zh: string };

type Tone = "warm" | "fun" | "mean";

type ChatOption = {
  text: Text;
  tone: Tone;
  trust: number;
  fans: number;
  strike: number;
  reply: Text;
};

type Gift = {
  id: string;
  name: Text;
  emoji: string;
  cost: number;
  trust: number;
  reply: Text;
};

type Day = {
  title: Text;
  intro: Text;
  options: ChatOption[];
};

type EndingId = "superfan" | "friend" | "lurker" | "banned";

const STREAMER = {
  name: "NOVA",
  handle: "@NovaLive",
  emoji: "🎧",
  color: "#7dd3fc",
  tagline: { bg: "ВИРТУАЛЕН СТРИЙМЪР", en: "VIRTUAL STREAMER", zh: "虚拟主播" },
};

const MOD = {
  name: "BYTE",
  emoji: "🤖",
  color: "#4ade80",
};

const DAYS: Day[] = [
  {
    title: { bg: "Ден 1 · Откриващ стрийм", en: "Day 1 · Debut Stream", zh: "第 1 天 · 首播" },
    intro: {
      bg: "Нова излиза на екран за първия си самостоятелен стрийм. Отброяването свършва и чатът избухва.",
      en: "Nova goes live for her first solo stream. The countdown ends and the chat erupts.",
      zh: "诺娃首次独自开播。倒计时结束，弹幕瞬间沸腾。",
    },
    options: [
      {
        text: {
          bg: "„Здравей, Нова! Чакахме те!“",
          en: '"Hi Nova! We waited for you!"',
          zh: "“你好，诺娃！我们一直等你！”",
        },
        tone: "warm",
        trust: 2,
        fans: 1,
        strike: 0,
        reply: {
          bg: "Нова се усмихва и поглежда чата. „О... значи наистина има хора. Здравейте, всички!“",
          en: 'Nova smiles and glances at chat. "Oh... so there really are people. Hi everyone!"',
          zh: "诺娃微笑看向弹幕。“哦……真的有人在。大家好！”",
        },
      },
      {
        text: { bg: "„ПЪРВИ! ХАЙП!“", en: '"FIRST! HYPE!"', zh: "“沙发！燃起来！”" },
        tone: "fun",
        trust: 0,
        fans: 3,
        strike: 0,
        reply: {
          bg: "Чатът се залива от емотикони. Нова се смее. „Вие сте луди, харесва ми!“",
          en: 'Chat floods with emojis. Nova laughs. "You\'re all crazy, I love it!"',
          zh: "弹幕刷满表情。诺娃大笑。“你们太疯了，我喜欢！”",
        },
      },
      {
        text: {
          bg: "„скучно е, няма нищо интересно“",
          en: '"boring, nothing interesting here"',
          zh: "“好无聊，没啥看点”",
        },
        tone: "mean",
        trust: -2,
        fans: -1,
        strike: 1,
        reply: {
          bg: "Нова млъква за миг. „Добре... ще се постарая повече.“",
          en: 'Nova goes quiet for a second. "Okay... I\'ll try harder."',
          zh: "诺娃沉默了一秒。“好吧……我会更努力的。”",
        },
      },
    ],
  },
  {
    title: { bg: "Ден 2 · Караоке вечер", en: "Day 2 · Karaoke Night", zh: "第 2 天 · 卡拉OK夜" },
    intro: {
      bg: "Нова подготвя караоке сегмент. Тя е нервна, но решена да се справи.",
      en: "Nova is setting up a karaoke segment. She is nervous, but determined.",
      zh: "诺娃正在准备卡拉OK环节。她很紧张，却下定决心。",
    },
    options: [
      {
        text: {
          bg: "„Песента беше невероятна! Браво!“",
          en: '"That song was amazing! Bravo!"',
          zh: "“那首歌太棒了！好厉害！”",
        },
        tone: "warm",
        trust: 2,
        fans: 1,
        strike: 0,
        reply: {
          bg: "„Наистина ли? Толкова се притеснявах... Благодаря ти!“ — гласът ѝ трепти.",
          en: '"Really? I was so nervous... Thank you!" — her voice wavers.',
          zh: "“真的吗？我好紧张……谢谢你！”——她的声音微微发颤。",
        },
      },
      {
        text: { bg: "„МОМЕНТ ЗА МЕМЕ 😂“", en: '"MEME MOMENT 😂"', zh: "“名场面预定 😂”" },
        tone: "fun",
        trust: 0,
        fans: 3,
        strike: 0,
        reply: {
          bg: "Нова вижда клипа и се превива от смях. „Това ще го слагам в highlights!“",
          en: 'Nova sees the clip and doubles over laughing. "That\'s going in the highlights!"',
          zh: "诺娃看到切片笑得直不起腰。“这个必须放进高光集锦！”",
        },
      },
      {
        text: {
          bg: "„пееш фалшиво, честно“",
          en: '"you sing off-key, honestly"',
          zh: "“说实话你唱跑调了”",
        },
        tone: "mean",
        trust: -2,
        fans: 0,
        strike: 1,
        reply: {
          bg: "Нова прекъсва песента. „...разбрах. Продължаваме.“",
          en: 'Nova cuts the song short. "...got it. Moving on."',
          zh: "诺娃中断了演唱。“……知道了。继续吧。”",
        },
      },
    ],
  },
  {
    title: {
      bg: "Ден 3 · Финалът на сезона",
      en: "Day 3 · Season Finale",
      zh: "第 3 天 · 季末终场",
    },
    intro: {
      bg: "Последният стрийм от сезона. Нова обявява голяма цел за мисията и поглежда право в камерата.",
      en: "The last stream of the season. Nova announces a big charity goal and looks straight into the camera.",
      zh: "本季最后一场直播。诺娃公布了大型公益目标，直视镜头。",
    },
    options: [
      {
        text: {
          bg: "„Ти си причината да се усмихвам след дълъг ден.“",
          en: '"You\'re the reason I smile after a long day."',
          zh: "“漫长一天后，是你让我笑起来。”",
        },
        tone: "warm",
        trust: 2,
        fans: 2,
        strike: 0,
        reply: {
          bg: "Нова притихва. „...запомних го. Благодаря, че остана с мен.“",
          en: 'Nova falls silent. "...I\'ll remember that. Thank you for staying with me."',
          zh: "诺娃安静下来。“……我会记住的。谢谢你一直陪着我。”",
        },
      },
      {
        text: {
          bg: "„Сглобих фен клип за теб! Целият чат го направи.“",
          en: '"I made a fan montage for you! The whole chat pitched in."',
          zh: "“我给你剪了粉丝混剪！整个弹幕都参与了。”",
        },
        tone: "fun",
        trust: 1,
        fans: 3,
        strike: 0,
        reply: {
          bg: "Нова гледа клипа и се просълзява. „Вие... вие наистина сте невероятни.“",
          en: 'Nova watches the montage and tears up. "You... you really are amazing."',
          zh: "诺娃看着混剪，眼眶湿润。“你们……你们真的太棒了。”",
        },
      },
      {
        text: {
          bg: "„предай канала на някого, който го заслужава“",
          en: '"hand the channel to someone who deserves it"',
          zh: "“把频道让给更该得到的人吧”",
        },
        tone: "mean",
        trust: -3,
        fans: -1,
        strike: 2,
        reply: {
          bg: "Нова се взира в чата. „...не мога да повярвам, че го казваш сега.“",
          en: "Nova stares at the chat. \"...I can't believe you're saying that now.\"",
          zh: "诺娃盯着弹幕。“……不敢相信你现在说出这种话。”",
        },
      },
    ],
  },
];

const GIFTS: Gift[] = [
  {
    id: "rose",
    name: { bg: "Роза", en: "Rose", zh: "玫瑰" },
    emoji: "🌹",
    cost: 50,
    trust: 1,
    reply: {
      bg: "„Роза! Ще я сложа до монитора, благодаря!“",
      en: '"A rose! I\'ll keep it by my monitor, thank you!"',
      zh: "“玫瑰！我会放在显示器旁边，谢谢！”",
    },
  },
  {
    id: "plush",
    name: { bg: "Плюшено животинче", en: "Plushie", zh: "玩偶" },
    emoji: "🧸",
    cost: 120,
    trust: 2,
    reply: {
      bg: "„О, пухкаво е! Обичам го вече.“",
      en: '"Oh, it\'s so fluffy! I love it already."',
      zh: "“哇，好软！我马上爱上了。”",
    },
  },
  {
    id: "mic",
    name: { bg: "Про микрофон", en: "Pro Microphone", zh: "专业麦克风" },
    emoji: "🎤",
    cost: 250,
    trust: 3,
    reply: {
      bg: "„Това ще промени качеството ми! Наистина ли? Благодаря!“",
      en: '"This will upgrade my whole sound! Really? Thank you!"',
      zh: "“这会让我的音质全面升级！真的吗？谢谢你！”",
    },
  },
];

const ENDINGS: Record<EndingId, { emoji: string; title: Text; color: string; text: Text }> = {
  superfan: {
    emoji: "👑",
    title: { bg: "ЛЮБИМ ФЕН", en: "TOP FAN", zh: "头号粉丝" },
    color: "#fbbf24",
    text: {
      bg: "Нова те спомена в края на сезона и ти подари раменна емблема. Приятелството ви издържа дълго след последния стрийм.",
      en: "Nova shouted you out at the season finale and gave you a shoulder badge. Your friendship lasted long after the last stream.",
      zh: "诺娃在季末点名感谢你，还送了你一枚肩章。你们的友谊在最后一场直播后长久延续。",
    },
  },
  friend: {
    emoji: "💞",
    title: { bg: "ПРИЯТЕЛ", en: "FRIEND", zh: "朋友" },
    color: "#f9a8d4",
    text: {
      bg: "Ти беше сред първите, които тя разпознаваше в чата. Скромно, но истинско приятелство.",
      en: "You were one of the first names she recognized in chat. A quiet, but genuine friendship.",
      zh: "你是她最先认出的名字之一。低调却真挚的友谊。",
    },
  },
  lurker: {
    emoji: "🌫️",
    title: { bg: "НЕЗАБЕЛЯЗАН", en: "LURKER", zh: "潜水者" },
    color: "#94a3b8",
    text: {
      bg: "Ти гледаше, но рядко се включваше. Нова така и не научи името ти. Може би следващия сезон?",
      en: "You watched, but rarely joined in. Nova never learned your name. Maybe next season?",
      zh: "你看了直播，却很少参与。诺娃始终没记住你的名字。也许下一季吧？",
    },
  },
  banned: {
    emoji: "🚫",
    title: { bg: "БЛОКИРАН", en: "BANNED", zh: "被拉黑" },
    color: "#f87171",
    text: {
      bg: "Модераторът Байт най-накрая натисна бутона. Чатът остана без теб — и всички забелязаха колко е спокойно.",
      en: "Moderator Byte finally hit the button. Chat carried on without you — and everyone noticed how peaceful it got.",
      zh: "管理员比特终于按下了按钮。弹幕继续滚动——大家都发现安静了许多。",
    },
  },
};

const SAVE_KEY = "stream-heart-progress";
const ENDINGS_KEY = "stream-heart-endings";

type ChatLine = { id: number; user: string; color: string; text: string; you?: boolean };

const CHATTERS: { user: string; color: string }[] = [
  { user: "PogPaul", color: "#f472b6" },
  { user: "MissCheer", color: "#c4b5fd" },
  { user: "NightOwl", color: "#7dd3fc" },
  { user: "Byte", color: "#4ade80" },
  { user: "Lurker_77", color: "#94a3b8" },
  { user: "Kuma", color: "#fbbf24" },
];

const CHAT_POOL: Text[] = [
  { bg: "Нова, ти си най-добрата! 💙", en: "Nova, you're the best! 💙", zh: "诺娃你最棒了！💙" },
  { bg: "нов аватар? изглежда страхотно", en: "new avatar? looks great", zh: "换头像了？好看" },
  { bg: "кой ден сме днес", en: "what day is it today", zh: "今天第几天了" },
  { bg: "звукът се чува идеално", en: "audio is perfect", zh: "声音很清楚" },
  { bg: "ПЪРВИ ТУК", en: "FIRST HERE", zh: "前排！" },
  { bg: "хахах този момент", en: "hahaha that moment", zh: "哈哈哈那个瞬间" },
  { bg: "може ли пак онази песен", en: "can you sing that song again", zh: "能再唱那首歌吗" },
  { bg: "направих клип, ще го кача", en: "made a clip, uploading it", zh: "我剪了片段，传上去了" },
  { bg: "Нова заслужава повече фенове", en: "Nova deserves more fans", zh: "诺娃值得更多粉丝" },
  {
    bg: "добър вечер от европейския часови пояс",
    en: "good evening from EU timezone",
    zh: "欧洲时区发来晚安",
  },
  { bg: "чакаме голямата цел 👀", en: "waiting for the big goal 👀", zh: "等着大目标 👀" },
  { bg: "подкрепям с каквото мога", en: "supporting however I can", zh: "尽我所能支持" },
];

const MOD_WARNINGS: Text = {
  bg: "Моля, спазвай правилата на чата.",
  en: "Please follow the chat rules.",
  zh: "请遵守直播间规则。",
};

function randomChatLine(id: number, lang: "bg" | "en" | "zh"): ChatLine | null {
  const chatter = CHATTERS[Math.floor(Math.random() * CHATTERS.length)];
  const line = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)];
  if (!chatter || !line) return null;
  return { id, user: chatter.user, color: chatter.color, text: line[lang] };
}

function endingFor(trust: number, fans: number, strikes: number): EndingId {
  if (strikes >= 2) return "banned";
  if (trust >= 9 && fans >= 10) return "superfan";
  if (trust >= 5) return "friend";
  return "lurker";
}

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function StatChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[0.62rem] tracking-[0.12em] uppercase">
      <span style={{ color }}>{icon}</span>
      <span className="text-foreground/40">{label}</span>
      <span style={{ color }}>{value}</span>
    </span>
  );
}

function StreamerPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const audioRef = useRef<{ ctx: AudioContext | null }>({ ctx: null });

  const [phase, setPhase] = useState<"title" | "live" | "ending">("title");
  const [day, setDay] = useState(0);
  const [step, setStep] = useState<"chat" | "gift" | "reaction">("chat");
  const [trust, setTrust] = useState(0);
  const [fans, setFans] = useState(0);
  const [coins, setCoins] = useState(350);
  const [strikes, setStrikes] = useState(0);
  const [message, setMessage] = useState<ChatOption | null>(null);
  const [gift, setGift] = useState<Gift | null>(null);
  const [lastEnding, setLastEnding] = useState<EndingId | null>(null);
  const [unlocked, setUnlocked] = useState<EndingId[]>([]);
  const [freshUnlock, setFreshUnlock] = useState<EndingId | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const chatIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = loadJSON<{
      day: number;
      trust: number;
      fans: number;
      coins: number;
      strikes: number;
    } | null>(SAVE_KEY, null);
    setHasSave(Boolean(saved));
    setUnlocked(loadJSON<EndingId[]>(ENDINGS_KEY, []));
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    setChat([]);
    chatIdRef.current = 0;
    const seed = () => {
      const line = randomChatLine(chatIdRef.current++, lang);
      if (line) setChat((prev) => [...prev, line].slice(-40));
    };
    for (let i = 0; i < 4; i += 1) seed();
    const timer = window.setInterval(seed, 2200);
    return () => window.clearInterval(timer);
  }, [day, lang, phase]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  const tone = useCallback(
    (freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) => {
      if (typeof window === "undefined") return;
      let ctx = audioRef.current.ctx;
      if (!ctx) {
        try {
          ctx = new AudioContext();
          audioRef.current.ctx = ctx;
        } catch {
          return;
        }
      }
      void ctx.resume?.();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    },
    [],
  );

  const continueRun = useCallback(() => {
    const saved = loadJSON<{
      day: number;
      trust: number;
      fans: number;
      coins: number;
      strikes: number;
    } | null>(SAVE_KEY, null);
    if (saved) {
      setDay(saved.day);
      setTrust(saved.trust);
      setFans(saved.fans);
      setCoins(saved.coins);
      setStrikes(saved.strikes);
      setStep("chat");
      setMessage(null);
      setGift(null);
      setPhase("live");
    }
  }, []);

  const startRun = useCallback(() => {
    tone(523, 0.1, "square", 0.04);
    setDay(0);
    setTrust(0);
    setFans(0);
    setCoins(350);
    setStrikes(0);
    setStep("chat");
    setMessage(null);
    setGift(null);
    setPhase("live");
    saveJSON(SAVE_KEY, { day: 0, trust: 0, fans: 0, coins: 350, strikes: 0 });
  }, [tone]);

  const pickMessage = useCallback(
    (option: ChatOption) => {
      tone(784, 0.08, "square", 0.04);
      tone(988, 0.14, "square", 0.04);
      setTrust((t) => t + option.trust);
      setFans((f) => f + option.fans);
      setStrikes((s) => s + option.strike);
      setMessage(option);
      setChat((prev) =>
        [
          ...prev,
          {
            id: chatIdRef.current++,
            user: isBg ? "ТИ" : isZh ? "你" : "YOU",
            color: "#7dd3fc",
            text: option.text[lang],
            you: true,
          },
          ...(option.strike > 0
            ? [
                {
                  id: chatIdRef.current++,
                  user: MOD.name,
                  color: MOD.color,
                  text: MOD_WARNINGS[lang],
                },
              ]
            : []),
        ].slice(-40),
      );
      setStep("gift");
    },
    [isBg, isZh, lang, tone],
  );

  const pickGift = useCallback(
    (selected: Gift | null) => {
      if (selected) {
        tone(659, 0.12, "triangle", 0.05);
        setCoins((c) => c - selected.cost);
        setTrust((t) => t + selected.trust);
      }
      setGift(selected);
      setStep("reaction");
    },
    [tone],
  );

  const finishRun = useCallback(
    (finalTrust: number, finalFans: number, finalStrikes: number) => {
      saveJSON(SAVE_KEY, null);
      const end = endingFor(finalTrust, finalFans, finalStrikes);
      setLastEnding(end);
      setPhase("ending");
      const current = loadJSON<EndingId[]>(ENDINGS_KEY, []);
      if (!current.includes(end)) {
        const updated = [...current, end];
        saveJSON(ENDINGS_KEY, updated);
        setUnlocked(updated);
        setFreshUnlock(end);
        tone(659, 0.12, "square", 0.05);
        window.setTimeout(() => tone(784, 0.12, "square", 0.05), 120);
        window.setTimeout(() => tone(1047, 0.3, "square", 0.05), 240);
      }
    },
    [tone],
  );

  const advance = useCallback(() => {
    tone(440, 0.08, "triangle", 0.03);
    const nextDay = day + 1;
    const coinsWithBonus = coins + 100;
    if (nextDay >= DAYS.length) {
      finishRun(trust, fans, strikes);
      return;
    }
    setDay(nextDay);
    setCoins(coinsWithBonus);
    setStep("chat");
    setMessage(null);
    setGift(null);
    saveJSON(SAVE_KEY, {
      day: nextDay,
      trust,
      fans,
      coins: coinsWithBonus,
      strikes,
    });
  }, [coins, day, fans, finishRun, strikes, trust, tone]);

  const backToTitle = useCallback(() => {
    setPhase("title");
    setMessage(null);
    setGift(null);
    setHasSave(false);
  }, []);

  const resetAll = useCallback(() => {
    saveJSON(SAVE_KEY, null);
    setHasSave(false);
    setDay(0);
    setTrust(0);
    setFans(0);
    setCoins(350);
    setStrikes(0);
    setStep("chat");
    setMessage(null);
    setGift(null);
    setPhase("title");
  }, []);

  const currentDay = DAYS[day];
  const end = lastEnding ? ENDINGS[lastEnding] : null;
  const viewers = 412 + fans * 137;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b1020]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-[#7dd3fc]/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-[#a78bfa]/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-56 w-56 rounded-full bg-[#f472b6]/15 blur-3xl" />
        <span className="absolute left-[14%] top-[20%] animate-pulse text-lg text-[#7dd3fc]/60">
          ●
        </span>
        <span className="absolute right-[18%] top-[14%] animate-pulse text-sm text-[#f472b6]/60 [animation-delay:700ms]">
          ●
        </span>
        <span className="absolute left-[24%] bottom-[20%] animate-pulse text-sm text-[#a78bfa]/60 [animation-delay:1200ms]">
          ●
        </span>
      </div>

      <section className="relative mx-auto max-w-2xl px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">15 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : isZh ? "游戏" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[clamp(2.2rem,7vw,4rem)] font-bold leading-none text-[#7dd3fc] drop-shadow-[0_0_18px_rgba(125,211,252,0.45)]">
            STREAM HEART
          </h1>
          <span className="label-mono text-[0.62rem]">
            {isBg
              ? "СТРИЙМ СИМУЛАЦИЯ · ВИЗУАЛЕН РОМАН"
              : isZh
                ? "主播模拟 · 视觉小说"
                : "STREAMER SIM · VISUAL NOVEL"}
          </span>
        </div>

        <div className="mt-8 rounded-3xl border border-[#7dd3fc]/25 bg-[#0f1730]/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.45)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-mono text-[0.62rem] tracking-[0.2em] uppercase">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-[#f87171] opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-[#f87171]" />
              </span>
              <span className="text-[#f87171]">{isBg ? "НА ЖИВО" : isZh ? "直播中" : "LIVE"}</span>
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <StatChip
                icon={<Users className="size-3.5" />}
                label={isBg ? "фенове" : isZh ? "粉丝" : "hype"}
                value={fans}
                color="#a78bfa"
              />
              <StatChip
                icon={<Heart className="size-3.5" />}
                label={isBg ? "доверие" : isZh ? "信任" : "trust"}
                value={trust}
                color="#f9a8d4"
              />
              <StatChip
                icon={<Coins className="size-3.5" />}
                label={isBg ? "монети" : isZh ? "金币" : "coins"}
                value={coins}
                color="#fbbf24"
              />
            </div>
          </div>

          {phase === "title" ? (
            <div className="mt-6 flex flex-col items-center gap-5 text-center">
              <span className="text-5xl">🎧💬</span>
              <p className="max-w-md text-sm leading-relaxed text-foreground/85">
                {isBg
                  ? "Ти си зрител в чата на Нова — виртуален стриймър, който се опитва да си пробие път. Три вечери, три съобщения и три подаръка решават дали ще станеш любимият ѝ фен, приятел, незабелязан зрител... или блокиран."
                  : isZh
                    ? "你是诺娃直播间的观众——一位努力闯出自己道路的虚拟主播。三个夜晚、三条留言和三份礼物，决定你成为她的头号粉丝、朋友、潜水路人……还是被拉黑。"
                    : "You're a viewer in Nova's chat — a virtual streamer trying to make it. Three nights, three messages and three gifts decide whether you become her top fan, a friend, a lurker... or get banned."}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[0.6rem] font-mono tracking-[0.15em] uppercase">
                <span className="inline-flex items-center gap-1 text-[#a78bfa]">
                  <Users className="size-3" /> {isBg ? "фенове" : isZh ? "粉丝" : "hype"}
                </span>
                <span className="text-foreground/30">·</span>
                <span className="inline-flex items-center gap-1 text-[#f9a8d4]">
                  <Heart className="size-3" /> {isBg ? "доверие" : isZh ? "信任" : "trust"}
                </span>
                <span className="text-foreground/30">·</span>
                <span className="text-[#fbbf24]">
                  {isBg ? "3 вечери" : isZh ? "3 晚" : "3 nights"}
                </span>
                <span className="text-foreground/30">·</span>
                <span className="text-muted-foreground">
                  {isBg ? "4 финала" : isZh ? "4 种结局" : "4 endings"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {hasSave ? (
                  <button
                    type="button"
                    onClick={continueRun}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7dd3fc] to-[#a78bfa] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#08111f] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(125,211,252,0.55)] active:translate-y-0.5"
                  >
                    <Radio className="size-4" />
                    {isBg ? "Продължи" : isZh ? "继续" : "CONTINUE"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={startRun}
                  className={
                    hasSave
                      ? "inline-flex items-center gap-2 rounded-full border border-[#7dd3fc]/40 bg-[#12203c] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#bae6fd] uppercase transition-all duration-200 hover:bg-[#7dd3fc]/15 active:translate-y-0.5"
                      : "inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7dd3fc] to-[#a78bfa] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#08111f] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(125,211,252,0.55)] active:translate-y-0.5"
                  }
                >
                  <Send className="size-4" />
                  {isBg ? "Влез в чата" : isZh ? "进入弹幕" : "ENTER CHAT"}
                </button>
              </div>

              {unlocked.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <span className="font-mono text-[0.55rem] tracking-[0.2em] text-muted-foreground uppercase">
                    {isBg ? "отключени финали" : isZh ? "已解锁结局" : "unlocked endings"}
                  </span>
                  {unlocked.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[0.55rem] tracking-[0.1em] uppercase"
                      style={{ borderColor: `${ENDINGS[id].color}66`, color: ENDINGS[id].color }}
                    >
                      {ENDINGS[id].emoji} {ENDINGS[id].title[lang]}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "live" && currentDay ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.62rem] tracking-[0.2em] text-[#7dd3fc] uppercase">
                  {currentDay.title[lang]}
                </span>
                <span className="inline-flex items-center gap-2 font-mono text-[0.55rem] tracking-[0.15em] text-muted-foreground uppercase">
                  <Users className="size-3" />
                  {viewers.toLocaleString(isBg ? "bg-BG" : isZh ? "zh-CN" : "en-US")}
                </span>
              </div>

              <p className="mt-3 font-serif text-sm italic leading-relaxed text-foreground/70">
                {currentDay.intro[lang]}
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="min-w-0">
                  <div
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-black/25 px-4 py-3"
                    style={{ borderColor: `${STREAMER.color}55` }}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/5 text-2xl">
                      {STREAMER.emoji}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="font-mono text-xs font-bold tracking-[0.2em]"
                        style={{ color: STREAMER.color }}
                      >
                        {STREAMER.name}{" "}
                        <span className="text-foreground/40">{STREAMER.handle}</span>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                        {step === "reaction" && message
                          ? message.reply[lang]
                          : step === "gift"
                            ? isBg
                              ? "„Благодаря за подкрепата! А сега — искаш ли да пратиш нещо?“"
                              : isZh
                                ? "“谢谢支持！现在——要不要送我一份礼物？”"
                                : '"Thanks for the support! Now — want to send something?"'
                            : isBg
                              ? "„Добре дошли в чата! Кажете нещо, ако сте тук 👀“"
                              : isZh
                                ? "“欢迎来到直播间！在的话说句话 👀”"
                                : '"Welcome to chat! Say something if you\'re here 👀"'}
                      </p>
                    </div>
                  </div>

                  {step === "chat" ? (
                    <div className="mt-5 space-y-2.5">
                      {currentDay.options.map((option) => (
                        <button
                          key={option.text.en}
                          type="button"
                          onClick={() => pickMessage(option)}
                          className="group flex w-full items-start gap-2 rounded-2xl border border-[#7dd3fc]/30 bg-black/25 px-4 py-3 text-left font-display text-sm text-foreground transition-all duration-200 hover:border-[#7dd3fc]/70 hover:bg-[#7dd3fc]/10 hover:shadow-[0_0_16px_rgba(125,211,252,0.2)] active:translate-y-0.5"
                        >
                          <MessageCircle className="mt-0.5 size-4 shrink-0 text-[#7dd3fc]" />
                          <span>
                            {option.text[lang]}
                            <span className="mt-1.5 flex items-center gap-3 font-mono text-[0.55rem] tracking-[0.15em] uppercase">
                              <span className="text-[#a78bfa]">
                                hype {option.fans >= 0 ? "+" : ""}
                                {option.fans}
                              </span>
                              <span className="text-[#f9a8d4]">
                                trust {option.trust >= 0 ? "+" : ""}
                                {option.trust}
                              </span>
                              {option.strike > 0 ? (
                                <span className="text-[#f87171]">
                                  <Ban className="inline size-3" /> warn
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {step === "gift" ? (
                    <div className="mt-5">
                      <p className="font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase">
                        {isBg ? "Прати подарък" : isZh ? "送出礼物" : "Send a gift"}
                      </p>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                        {GIFTS.map((item) => {
                          const affordable = coins >= item.cost;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={!affordable}
                              onClick={() => pickGift(item)}
                              className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#a78bfa]/30 bg-black/25 px-3 py-4 text-center transition-all duration-200 enabled:hover:border-[#a78bfa]/70 enabled:hover:bg-[#a78bfa]/10 enabled:active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <span className="text-2xl">{item.emoji}</span>
                              <span className="font-display text-xs text-foreground">
                                {item.name[lang]}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono text-[0.55rem] tracking-[0.1em] text-[#fbbf24]">
                                <Coins className="size-3" /> {item.cost}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => pickGift(null)}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 font-mono text-[0.6rem] tracking-[0.15em] text-muted-foreground uppercase transition-colors hover:text-foreground"
                      >
                        {isBg ? "без подарък" : isZh ? "不送礼物" : "no gift"}
                      </button>
                    </div>
                  ) : null}

                  {step === "reaction" ? (
                    <div className="mt-5 rounded-2xl border border-[#a78bfa]/40 bg-[#a78bfa]/10 p-5">
                      {gift ? (
                        <p className="font-serif text-base italic leading-relaxed text-foreground/90">
                          {gift.reply[lang]}
                        </p>
                      ) : (
                        <p className="font-serif text-base italic leading-relaxed text-foreground/70">
                          {isBg
                            ? "Нова кимва на чата и продължава с програмата."
                            : isZh
                              ? "诺娃向弹幕点头，继续流程。"
                              : "Nova nods at chat and carries on with the show."}
                        </p>
                      )}
                      {message && message.strike > 0 ? (
                        <p
                          className="mt-3 inline-flex items-center gap-2 font-mono text-xs tracking-[0.15em]"
                          style={{ color: MOD.color }}
                        >
                          <span>{MOD.emoji}</span> {MOD.name}:
                          <span className="text-foreground/80">
                            {isBg
                              ? "Моля, спазвай правилата на чата."
                              : isZh
                                ? "请遵守直播间规则。"
                                : "Please follow the chat rules."}
                          </span>
                        </p>
                      ) : null}
                      <div className="mt-5 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={advance}
                          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7dd3fc] to-[#a78bfa] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#08111f] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(125,211,252,0.55)] active:translate-y-0.5"
                        >
                          {day >= DAYS.length - 1
                            ? isBg
                              ? "Край на сезона"
                              : isZh
                                ? "季末结算"
                                : "SEASON FINALE"
                            : isBg
                              ? "Следваща вечер"
                              : isZh
                                ? "下一晚"
                                : "NEXT NIGHT"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <aside className="flex min-h-[16rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/30 lg:min-h-0">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <span className="font-mono text-[0.55rem] tracking-[0.2em] text-muted-foreground uppercase">
                      {isBg ? "чат на живо" : isZh ? "实时弹幕" : "live chat"}
                    </span>
                    <MessageCircle className="size-3.5 text-[#7dd3fc]" />
                  </div>
                  <div className="flex max-h-64 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2 lg:max-h-72">
                    {chat.map((line) => (
                      <p key={line.id} className="text-[0.7rem] leading-snug">
                        <span
                          className="font-mono font-bold tracking-wide"
                          style={{ color: line.color }}
                        >
                          {line.user}
                        </span>
                        <span className="text-foreground/30">: </span>
                        <span
                          className={
                            line.you ? "font-semibold text-foreground" : "text-foreground/80"
                          }
                        >
                          {line.text}
                        </span>
                      </p>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </aside>
              </div>
            </div>
          ) : null}

          {phase === "ending" && end ? (
            <div className="mt-6 flex flex-col items-center gap-4 text-center">
              {freshUnlock ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#fde68a]/50 bg-[#fde68a]/10 px-4 py-1.5 font-mono text-[0.6rem] font-bold tracking-[0.2em] text-[#fde68a] uppercase">
                  <Trophy className="size-3.5" />
                  {isBg ? "Нов финал!" : isZh ? "已解锁新结局！" : "NEW ENDING UNLOCKED!"}
                </span>
              ) : null}

              <span className="text-6xl">{end.emoji}</span>
              <h2
                className="font-display text-2xl font-bold tracking-wide"
                style={{ color: end.color }}
              >
                {end.title[lang]}
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-5 font-mono text-[0.65rem] tracking-[0.15em] uppercase">
                <span className="inline-flex items-center gap-1.5 text-[#f9a8d4]">
                  <Heart className="size-4" /> {isBg ? "доверие" : isZh ? "信任" : "trust"} {trust}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#a78bfa]">
                  <Users className="size-4" /> {isBg ? "фенове" : isZh ? "粉丝" : "hype"} {fans}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[#f87171]">
                  <Ban className="size-4" /> {isBg ? "предупреждения" : isZh ? "警告" : "warns"}{" "}
                  {strikes}
                </span>
              </div>

              <p className="max-w-md font-serif text-base italic leading-relaxed text-foreground/90">
                {end.text[lang]}
              </p>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={startRun}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7dd3fc] to-[#a78bfa] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#08111f] uppercase transition-all duration-200 hover:shadow-[0_0_22px_rgba(125,211,252,0.55)] active:translate-y-0.5"
                >
                  <RotateCcw className="size-4" />
                  {isBg ? "Играй отново" : isZh ? "再玩一次" : "PLAY AGAIN"}
                </button>
                <button
                  type="button"
                  onClick={backToTitle}
                  className="inline-flex items-center gap-2 rounded-full border border-[#7dd3fc]/40 bg-[#12203c] px-6 py-3 font-mono text-xs font-bold tracking-[0.2em] text-[#bae6fd] uppercase transition-all duration-200 hover:bg-[#7dd3fc]/15 active:translate-y-0.5"
                >
                  <Home className="size-4" />
                  {isBg ? "Заглавие" : isZh ? "标题画面" : "TITLE"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-[#7dd3fc]">{isBg ? "чат" : isZh ? "弹幕" : "chat"}</span> —{" "}
            {isBg ? "оформя репутацията ти" : isZh ? "塑造你的名声" : "shapes your reputation"}
          </span>
          <span>
            <span className="text-[#7dd3fc]">{GIFTS.length}</span> —{" "}
            {isBg ? "подаръка" : isZh ? "份礼物" : "gifts"}
          </span>
          <span>
            <span className="text-[#7dd3fc]">4</span> —{" "}
            {isBg ? "различни финала" : isZh ? "种不同结局" : "different endings"}
          </span>
        </div>
      </section>
    </main>
  );
}
