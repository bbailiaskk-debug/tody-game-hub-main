import { createFileRoute } from "@tanstack/react-router";
import { BookHeart, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/ddlc")({
  head: () => {
    const seo = seoHead({
      path: "/ddlc",
      title: "DDLC Poetry Club",
      description:
        "Write poems in the Literature Club. Pick the words that match each club member — Sayori, Natsuki, Yuri and Monika.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: DdlcPage,
});

type Category = "happy" | "sweet" | "books" | "dark" | "nature" | "love";
type Lang = "bg" | "en" | "zh";
type GirlId = "sayori" | "natsuki" | "yuri" | "monika";

interface Word {
  key: string;
  bg: string;
  en: string;
  zh: string;
  cat: Category;
}

const POOL: Word[] = [
  { key: "sun", bg: "слънце", en: "sunshine", zh: "阳光", cat: "happy" },
  { key: "grin", bg: "смях", en: "laughter", zh: "笑声", cat: "happy" },
  { key: "bow", bg: "дъга", en: "rainbow", zh: "彩虹", cat: "happy" },
  { key: "smile", bg: "усмивка", en: "smile", zh: "微笑", cat: "happy" },
  { key: "hop", bg: "подскок", en: "bounce", zh: "蹦跳", cat: "happy" },
  { key: "joy", bg: "радост", en: "joy", zh: "快乐", cat: "happy" },
  { key: "cake", bg: "кексче", en: "cupcake", zh: "小蛋糕", cat: "sweet" },
  { key: "berry", bg: "ягода", en: "strawberry", zh: "草莓", cat: "sweet" },
  { key: "sugar", bg: "захар", en: "sugar", zh: "糖", cat: "sweet" },
  { key: "pudding", bg: "пудинг", en: "pudding", zh: "布丁", cat: "sweet" },
  { key: "cookie", bg: "бисквитка", en: "cookie", zh: "饼干", cat: "sweet" },
  { key: "melt", bg: "топене", en: "melt", zh: "融化", cat: "sweet" },
  { key: "lib", bg: "библиотека", en: "library", zh: "图书馆", cat: "books" },
  { key: "newl", bg: "роман", en: "novel", zh: "小说", cat: "books" },
  { key: "chap", bg: "глава", en: "chapter", zh: "章节", cat: "books" },
  { key: "ink", bg: "мастило", en: "ink", zh: "墨水", cat: "books" },
  { key: "poem", bg: "стих", en: "poetry", zh: "诗歌", cat: "books" },
  { key: "tale", bg: "приказка", en: "story", zh: "故事", cat: "books" },
  { key: "shadow", bg: "сянка", en: "shadow", zh: "影子", cat: "dark" },
  { key: "night", bg: "нощ", en: "night", zh: "夜晚", cat: "dark" },
  { key: "gloom", bg: "мрак", en: "gloom", zh: "昏暗", cat: "dark" },
  { key: "whisper", bg: "шепот", en: "whisper", zh: "低语", cat: "dark" },
  { key: "rain", bg: "дъжд", en: "rain", zh: "雨", cat: "dark" },
  { key: "deep", bg: "дълбина", en: "depth", zh: "深处", cat: "dark" },
  { key: "cherry", bg: "череша", en: "cherry", zh: "樱花", cat: "nature" },
  { key: "petal", bg: "листенца", en: "petals", zh: "花瓣", cat: "nature" },
  { key: "breeze", bg: "ветрец", en: "breeze", zh: "微风", cat: "nature" },
  { key: "meadow", bg: "ливада", en: "meadow", zh: "草地", cat: "nature" },
  { key: "river", bg: "река", en: "river", zh: "河流", cat: "nature" },
  { key: "sky", bg: "небе", en: "sky", zh: "天空", cat: "nature" },
  { key: "heart", bg: "сърце", en: "heart", zh: "心", cat: "love" },
  { key: "blush", bg: "руменина", en: "blush", zh: "脸红", cat: "love" },
  { key: "dear", bg: "мил", en: "dear", zh: "亲爱的", cat: "love" },
  { key: "together", bg: "заедно", en: "together", zh: "一起", cat: "love" },
  { key: "forever", bg: "завинаги", en: "forever", zh: "永远", cat: "love" },
  { key: "bloom", bg: "разцъфва", en: "blossom", zh: "绽放", cat: "love" },
];

const PICK = 8;
const DAYS = 3;

const WEIGHTS: Record<GirlId, Record<Category, number>> = {
  sayori: {
    happy: 3,
    sweet: 1,
    books: 0,
    dark: -2,
    nature: 2,
    love: 1,
  },
  natsuki: {
    happy: 1,
    sweet: 3,
    books: 2,
    dark: -2,
    nature: 0,
    love: 0,
  },
  yuri: {
    happy: -1,
    sweet: -1,
    books: 3,
    dark: 3,
    nature: 1,
    love: 0,
  },
  monika: {
    happy: 1,
    sweet: 1,
    books: 2,
    dark: 0,
    nature: 1,
    love: 2,
  },
};

const GIRLS: Record<
  GirlId,
  {
    name: { bg: string; en: string; zh: string };
    color: string;
    emoji: string;
  }
> = {
  sayori: { name: { bg: "Сайори", en: "Sayori", zh: "纱世里" }, color: "#f472b6", emoji: "🎀" },
  natsuki: { name: { bg: "Нацуки", en: "Natsuki", zh: "夏树" }, color: "#fda4af", emoji: "🍰" },
  yuri: { name: { bg: "Юри", en: "Yuri", zh: "优里" }, color: "#a78bfa", emoji: "📚" },
  monika: { name: { bg: "Моника", en: "Monika", zh: "莫妮卡" }, color: "#4ade80", emoji: "🎹" },
};

const REACTIONS: Record<GirlId, Record<"top" | "mid" | "low", Record<Lang, string>>> = {
  sayori: {
    top: {
      bg: "„Уау! Точно тази светлина търсех в стиховете ти – днес е най-хубавият ден!“",
      en: '"Wow! That\'s the sunshine I needed — today is the best day!"',
      zh: '"哇！这正是我想要的阳光——今天是最棒的一天！"',
    },
    mid: {
      bg: "„Мило стихотворение, макар че някак не ми е в тон с настроението… нали ще се видим утре?“",
      en: "\"Cute poem, even if it's not quite my mood… we'll see each other tomorrow, right?\"",
      zh: '"很可爱的诗，虽然不太合我的心情……明天还会见面吧？"',
    },
    low: {
      bg: "„Хей… толкова тъмно ли е всичко? Сигурен ли си, че всичко е наред? Иди си почини!“",
      en: '"Hey… is everything so dark? Are you okay? You should go rest!"',
      zh: '"嘿……一切都这么阴暗吗？你还好吗？去休息吧！"',
    },
  },
  natsuki: {
    top: {
      bg: "„Хъф! Е, не е зле… Всъщност е почти сладичко. Ще те хваля само веднъж – стига толкова!“",
      en: '"Hmph! Not bad… actually almost sweet. Consider this your one compliment — that\'s it!"',
      zh: '"哼！还行吧……其实几乎很甜了。算是我唯一一次夸奖——就这一次！"',
    },
    mid: {
      bg: "„Можеше и по-добре, знаеш. Къде са милите думи? Толкова трудно ли е?“",
      en: '"You could do better, you know. Where are the sweet words? Is it that hard?"',
      zh: '"你知道的，你还能写得更好。甜蜜的词去哪了？有那么难吗？"',
    },
    low: {
      bg: "„Ох, колко зловещо. Не е ли по-забавно да пишеш за кексчета и захар?“",
      en: '"Ugh, so creepy. Isn\'t it more fun to write about cupcakes and sugar?"',
      zh: '"啊，真可怕。写关于小蛋糕和糖的东西不是更有趣吗？"',
    },
  },
  yuri: {
    top: {
      bg: "„Думите ти проникват в самия мрак… Искам да ги прочета още веднъж. И още хиляда пъти.“",
      en: '"Your words reach into the very dark… I want to read them again. And a thousand more times."',
      zh: '"你的词语深入到黑暗之中……我想再读一遍。再读一千遍。"',
    },
    mid: {
      bg: "„Приятно четиво, макар че ми се стори леко повърхностно. Догодина – по-дълбоко?“",
      en: '"Pleasant to read, though it felt a little shallow. Tomorrow — deeper?"',
      zh: '"读起来很愉快，只是感觉有点浅。明天——更深一点？"',
    },
    low: {
      bg: "„Слично е… но няма тъмната дълбочина, която обичам. Можем да поговорим за това по-късно.“",
      en: '"It\'s lovely… but it lacks the dark depth I enjoy. We can discuss it later."',
      zh: '"很可爱……但没有我所喜欢的深邃黑暗。之后我们可以聊聊。"',
    },
  },
  monika: {
    top: {
      bg: "„Прекрасно, мили клубен член! Изглежда, разбираш литературата точно както го правя аз.“",
      en: '"Wonderful, dear club member! It seems you understand literature exactly as I do."',
      zh: '"太棒了，亲爱的社团成员！看来你对文学的理解和我一模一样。"',
    },
    mid: {
      bg: "„Солидно стихотворение, не съвсем в моя стил. Утре ще ти покажа как да го надминеш.“",
      en: '"A solid poem, not quite my style. Tomorrow I\'ll show you how to surpass it."',
      zh: '"不错的诗，不太是我的风格。明天我会教你如何超越它。"',
    },
    low: {
      bg: "„Хм, интересно… Но знаеш ли какво би го направило по-добро? Малко повече Моника.“",
      en: '"Hmm, interesting… But you know what would make it better? A little more Monika."',
      zh: '"嗯，有意思……但你知道怎样能更好吗？再多一点莫妮卡。"',
    },
  },
};

const ENDINGS: Record<GirlId, Record<Lang, string>> = {
  sayori: {
    bg: "Сайори те прегръща силно: „Клубът е най-добър, когато си тук! Не спирай да пишеш, приятелю!“",
    en: "Sayori hugs you tightly: \"The club is best when you're here! Don't stop writing, friend!\"",
    zh: '纱世里紧紧抱住你："你在这里时社团最棒了！不要停止写作，朋友！"',
  },
  natsuki: {
    bg: "Нацуки ти подава мъфин: „За теб. Искам да кажа… от апетит! Не ме карай да го повтарям!“",
    en: 'Natsuki hands you a cupcake: "For you. I mean… out of appet… don\'t make me say it again!"',
    zh: '夏树递给你一个小蛋糕："给你的。我是说……出于食欲！别让我再说一遍！"',
  },
  yuri: {
    bg: "Юри ти подава любима книга: „Тази… исках да я споделя с теб. Никога не съм го правила преди.“",
    en: 'Yuri hands you her favorite book: "This… I wanted to share it with you. I\'ve never done that before."',
    zh: '优里把她最喜欢的书递给你："这本……我想和你分享。我以前从没这样做过。"',
  },
  monika: {
    bg: "Моника ти се усмихва: „Знаеш ли, от всички членове ти разбираш естетиката ми най-добре. Запомни това.“",
    en: 'Monika smiles at you: "You know, of all the members, you understand my aesthetic best. Remember that."',
    zh: '莫妮卡对你微笑："你知道吗，在所有成员中，你最懂我的美学。记住这一点。"',
  },
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

function tier(score: number): "top" | "mid" | "low" {
  if (score >= 8) return "top";
  if (score <= 0) return "low";
  return "mid";
}

function wordDisplay(lang: Lang, w: Word): string {
  if (lang === "bg") return w.bg;
  if (lang === "zh") return w.zh;
  return w.en;
}

function DdlcPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";

  const [day, setDay] = useState(1);
  const [pool, setPool] = useState<Word[]>(() => shuffle(POOL));
  const [picked, setPicked] = useState<Word[]>([]);
  const [affection, setAffection] = useState<Record<GirlId, number>>({
    sayori: 0,
    natsuki: 0,
    yuri: 0,
    monika: 0,
  });
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const scores = (list: Word[]): Record<GirlId, number> => {
    const acc: Record<GirlId, number> = { sayori: 0, natsuki: 0, yuri: 0, monika: 0 };
    for (const w of list) {
      for (const id of Object.keys(acc) as GirlId[]) {
        acc[id] += WEIGHTS[id][w.cat] ?? 0;
      }
    }
    return acc;
  };

  const toggleWord = useCallback(
    (w: Word) => {
      if (locked) return;
      setPicked((prev) => {
        if (prev.some((p) => p.key === w.key)) {
          return prev.filter((p) => p.key !== w.key);
        }
        if (prev.length >= PICK) return prev;
        return [...prev, w];
      });
    },
    [locked],
  );

  const finishDay = useCallback(() => {
    const s = scores(picked);
    setAffection((a) => {
      const next: Record<GirlId, number> = { ...a };
      for (const id of Object.keys(next) as GirlId[]) {
        next[id] += s[id];
      }
      return next;
    });
    setLocked(true);
  }, [picked]);

  const nextDay = useCallback(() => {
    if (day >= DAYS) {
      setDone(true);
      return;
    }
    setDay((d) => d + 1);
    setPool(shuffle(POOL));
    setPicked([]);
    setLocked(false);
  }, [day]);

  const resetAll = useCallback(() => {
    setDay(1);
    setPool(shuffle(POOL));
    setPicked([]);
    setAffection({ sayori: 0, natsuki: 0, yuri: 0, monika: 0 });
    setLocked(false);
    setDone(false);
    setReplayKey((k) => k + 1);
  }, []);

  const winner: GirlId =
    (Object.keys(affection) as GirlId[]).sort((a, b) => affection[b] - affection[a])[0] ?? "sayori";

  const catLabel = (cat: Category): string => {
    const map: Record<Category, { bg: string; en: string; zh: string }> = {
      happy: { bg: "радост", en: "joy", zh: "欢乐" },
      sweet: { bg: "сладост", en: "sweet", zh: "甜蜜" },
      books: { bg: "книги", en: "books", zh: "书籍" },
      dark: { bg: "мрак", en: "dark", zh: "幽暗" },
      nature: { bg: "природа", en: "nature", zh: "自然" },
      love: { bg: "обич", en: "love", zh: "爱意" },
    };
    return map[cat][lang];
  };

  const girlsOrder = Object.keys(GIRLS) as GirlId[];

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-3xl px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">13 /</span>
          <span className="label-mono">{isBg ? "ИГРА" : "GAME"}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(1.8rem,6vw,3.4rem)] leading-none">
            {isBg ? "ЛИТЕРАТУРЕН КЛУБ" : isZh ? "文学社" : "LITERATURE CLUB"}
          </h1>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "ДЕН" : isZh ? "天" : "DAY"} {day} / {DAYS}
          </span>
        </div>

        {!done ? (
          <div className="night-panel relative mt-8 rounded-3xl border border-border/60 bg-[#161B16] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
              <span className="font-mono text-[0.65rem] tracking-[0.2em] text-brand uppercase">
                {locked
                  ? isBg
                    ? "ПИСМОТО ПРИКЛЮЧИ"
                    : isZh
                      ? "诗句完成"
                      : "POEM DONE"
                  : isBg
                    ? "ИЗБЕРИ ДУМИ"
                    : isZh
                      ? "选择词语"
                      : "PICK WORDS"}
              </span>
              <span className="font-mono text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
                {picked.length} / {PICK}
              </span>
            </div>

            {!locked ? (
              <>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {pool.map((w, i) => {
                    const on = picked.some((p) => p.key === w.key);
                    return (
                      <button
                        key={`${replayKey}-${i}`}
                        type="button"
                        onClick={() => toggleWord(w)}
                        className={`rounded-xl border px-4 py-2.5 font-mono text-sm transition-all duration-150 active:translate-y-0.5 ${
                          on
                            ? "border-[#1DB954] bg-[#1DB954]/15 text-[var(--brand-bright)] shadow-[0_0_12px_rgba(29,185,84,0.3)]"
                            : "border-border/70 bg-black/20 text-foreground hover:border-brand/60"
                        }`}
                      >
                        {wordDisplay(lang, w)}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
                    {isBg
                      ? "Избрани: " + picked.map((w) => wordDisplay(lang, w)).join(", ")
                      : isZh
                        ? "已选: " + picked.map((w) => wordDisplay(lang, w)).join("、")
                        : "Picked: " + picked.map((w) => wordDisplay(lang, w)).join(", ")}
                  </p>
                </div>

                {picked.length === PICK && (
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={finishDay}
                      className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-8 py-3.5 font-mono text-sm font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
                    >
                      <BookHeart className="size-4" />
                      {isBg ? "ПРОЧЕТИ СТИХОВЕТЕ" : isZh ? "朗读诗歌" : "READ THE POEM"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="mb-4 rounded-2xl bg-black/25 p-4 text-center">
                  <p className="font-serif text-lg italic text-foreground/90">
                    {picked.map((w) => wordDisplay(lang, w)).join(" · ")}
                  </p>
                </div>

                {girlsOrder.map((id) => {
                  const s = scores(picked)[id];
                  const t = tier(s);
                  const girl = GIRLS[id];
                  const hearts = Math.max(1, Math.min(5, 3 + Math.round(s / 12)));
                  return (
                    <div key={id} className="rounded-2xl border border-border/50 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[0.15em] uppercase"
                          style={{ color: girl.color }}
                        >
                          {girl.emoji} {girl.name[lang]}
                        </span>
                        <span
                          className="font-mono text-xs tracking-[0.15em]"
                          style={{ color: girl.color }}
                        >
                          {"♥".repeat(hearts)}
                          {s >= 12 ? " ♥" : ""}
                        </span>
                      </div>
                      <p className="mt-2 text-sm italic leading-relaxed text-foreground/85">
                        {REACTIONS[id][t][lang]}
                      </p>
                    </div>
                  );
                })}

                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={nextDay}
                    className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-8 py-3.5 font-mono text-sm font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
                  >
                    {day >= DAYS
                      ? isBg
                        ? "ВИЖ РЕЗУЛТАТА"
                        : isZh
                          ? "查看结果"
                          : "SEE THE RESULT"
                      : isBg
                        ? "СЛЕДВАЩ ДЕН"
                        : isZh
                          ? "下一天"
                          : "NEXT DAY"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="night-panel relative mt-8 rounded-3xl border border-border/60 bg-[#161B16] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
            <div className="grid gap-3 sm:grid-cols-2">
              {girlsOrder
                .slice()
                .sort((a, b) => affection[b] - affection[a])
                .map((id, idx) => {
                  const girl = GIRLS[id];
                  return (
                    <div
                      key={id}
                      className={`rounded-2xl border p-4 ${
                        idx === 0
                          ? "border-[#1DB954]/60 bg-[#1DB954]/10"
                          : "border-border/50 bg-black/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-[0.15em] uppercase"
                          style={{ color: girl.color }}
                        >
                          {idx === 0 ? "👑 " : ""}
                          {girl.emoji} {girl.name[lang]}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {affection[id]} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="mt-6 rounded-2xl border border-[#1DB954]/40 bg-[#1DB954]/5 p-5 text-center">
              <p className="font-serif text-base italic leading-relaxed text-[var(--brand-bright)]">
                {ENDINGS[winner][lang]}
              </p>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-full border border-[#1DB954]/50 bg-[#161B16] px-8 py-3.5 font-mono text-sm font-bold tracking-[0.2em] text-[var(--brand-bright)] uppercase transition-all duration-200 hover:bg-[#1DB954]/10 hover:shadow-[0_0_18px_rgba(29,185,84,0.25)] active:translate-y-0.5"
              >
                <RotateCcw className="size-4" />
                {isBg ? "НОВ ПОЕТ" : isZh ? "新诗人" : "NEW POET"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[0.62rem] tracking-[0.15em] text-muted-foreground uppercase">
          <span>
            <span className="text-brand">{isBg ? "клик" : isZh ? "点击" : "click"}</span> —{" "}
            {isBg ? "избери думите" : isZh ? "选择词语" : "pick the words"}
          </span>
          {!locked && !done && (
            <span>
              <span className="text-brand">{PICK}</span> —{" "}
              {isBg ? "минимум думи на стих" : isZh ? "每首诗最少词数" : "words minimum"}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
