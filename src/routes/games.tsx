import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookHeart,
  Candy,
  ChessKnight,
  ChevronDown,
  Disc3,
  Gamepad2,
  Grid3x3,
  Keyboard,
  LayoutGrid,
  Puzzle,
  Radio,
  Sparkles,
  Swords,
  Blocks,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/games")({
  head: () => {
    const seo = seoHead({
      path: "/games",
      title: "Игри",
      description:
        "Играй онлайн безплатно: шах, 2048, Tic Tac Toe, Chrome Dinosaur, въздушен хокей, Wordle, судоку, Candy Crush, Tetris и Beat Battle. Игри на Todor Khristov Gaming — директно в браузъра.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: GamesPage,
});

const playableGames = [
  {
    to: "/chess" as const,
    title: { bg: "ШАХ", en: "CHESS", zh: "国际象棋" },
    tag: { bg: "НАСТОЛНА", en: "BOARD", zh: "棋盘" },
    note: {
      bg: "Класически шах срещу приятел — рокада, ан пасан и промоция.",
      en: "Classic chess against a friend — castling, en passant, and promotion.",
      zh: "与朋友对弈经典国际象棋 — 王车易位、吃过路兵和升变。",
    },
    icon: ChessKnight,
    color: "#1DB954",
  },
  {
    to: "/game2048" as const,
    title: { bg: "2048", en: "2048", zh: "2048" },
    tag: { bg: "ПЪЗЗЛ", en: "PUZZLE", zh: "拼图" },
    note: {
      bg: "Плъзгай и съединявай плочките, за да стигнеш до 2048.",
      en: "Slide and merge tiles to reach 2048.",
      zh: "滑动并合并方块，达到 2048。",
    },
    icon: Puzzle,
    color: "#1DB954",
  },
  {
    to: "/tictactoe" as const,
    title: { bg: "TIC TAC TOE", en: "TIC TAC TOE", zh: "井字棋" },
    tag: { bg: "КЛАСИКА", en: "CLASSIC", zh: "经典" },
    note: {
      bg: "Морски шах срещу компютъра или приятел.",
      en: "Play against the computer or a friend.",
      zh: "与电脑或朋友对战。",
    },
    icon: Grid3x3,
    color: "#3b82f6",
  },
  {
    to: "/dino" as const,
    title: { bg: "CHROME DINOSAUR", en: "CHROME DINOSAUR", zh: "Chrome 恐龙" },
    tag: { bg: "АРКАДА", en: "ARCADE", zh: "街机" },
    note: {
      bg: "Класическата игра на динозавра — безкрайно бягане.",
      en: "The classic dinosaur game — endless runner.",
      zh: "经典的恐龙游戏 — 无尽跑酷。",
    },
    icon: Gamepad2,
    color: "#f59e0b",
  },
  {
    to: "/airhockey" as const,
    title: { bg: "ВЪЗДУШЕН ХОКЕЙ", en: "AIR HOCKEY", zh: "空气曲棍球" },
    tag: { bg: "СПОРТ", en: "SPORTS", zh: "体育" },
    note: {
      bg: "Мултиплейър на едно устройство — забивай шайбата срещу приятел (WASD срещу стрелки) или срещу компютъра.",
      en: "Local multiplayer on one device — slam the puck against a friend (WASD vs arrow keys) or the computer.",
      zh: "单设备本地对战 — 与朋友（WASD vs 方向键）或电脑一决高下。",
    },
    icon: Disc3,
    color: "#38bdf8",
  },
  {
    to: "/wordle" as const,
    title: { bg: "WORDLE", en: "WORDLE", zh: "单词猜谜" },
    tag: { bg: "ДУМИ", en: "WORDS", zh: "猜词" },
    note: {
      bg: "Познай скритата дума от 5 букви с максимум 6 опита.",
      en: "Guess the hidden 5-letter word in just six tries.",
      zh: "最多六次机会猜出隐藏的五个字母单词。",
    },
    icon: Keyboard,
    color: "#a78bfa",
  },
  {
    to: "/sudoku" as const,
    title: { bg: "СУДОКУ", en: "SUDOKU", zh: "数独" },
    tag: { bg: "ПЪЗЪЛ", en: "PUZZLE", zh: "拼图" },
    note: {
      bg: "Класическата логическа пъзел игра 9×9 — три нива на трудност, бележки и таймер.",
      en: "The classic 9×9 logic puzzle — three difficulty levels, notes, and a timer.",
      zh: "经典 9×9 逻辑谜题 — 三种难度、笔记和计时器。",
    },
    icon: LayoutGrid,
    color: "#fb7185",
  },
  {
    to: "/candycrush" as const,
    title: { bg: "CANDY CRUSH", en: "CANDY CRUSH", zh: "糖果粉碎" },
    tag: { bg: "МАЧ-3", en: "MATCH-3", zh: "三消" },
    note: {
      bg: "Класическото match-3 с руди от Майнкрафт — събирай по 3 въглища, желязо, злато, диамант и ермерауд.",
      en: "The classic match-3 with Minecraft ores — match three coal, iron, gold, diamond and emerald blocks.",
      zh: "经典三消游戏，使用我的世界矿石 — 匹配三个煤炭、铁、黄金、钻石和绿宝石。",
    },
    icon: Candy,
    color: "#eab308",
  },
  {
    to: "/ddlc" as const,
    title: { bg: "DDLC", en: "DDLC", zh: "文学社" },
    tag: { bg: "ПОЕЗИЯ", en: "POEM", zh: "诗歌" },
    note: {
      bg: "Литературен клуб в стил DDLC — избирай думи за стихотворението си, а Сайори, Нацуки, Юри и Моника показват своите реакции.",
      en: "A DDLC-style literature club — pick the words for your poem while Sayori, Natsuki, Yuri and Monika share their reactions.",
      zh: "心跳文学社风格——为你的诗歌挑选词语，纱世里、夏树、优里和莫妮卡会给出他们的反应。",
    },
    icon: BookHeart,
    color: "#f472b6",
  },
  {
    to: "/crystalrealm" as const,
    title: { bg: "CRYSTAL REALM", en: "CRYSTAL REALM", zh: "水晶领域" },
    tag: { bg: "ПРИКЛЮЧЕНИЕ / 8-BIT", en: "ADVENTURE / 8-BIT", zh: "冒险 / 8-bit" },
    note: {
      bg: "Оригинално 8-bit приключение в стила на класическите NES игри — събери шестте изгубени кристала и победи стражите на Глубината.",
      en: "An original 8-bit adventure in the spirit of classic NES games — collect the six lost crystals and defeat the guardians of the Deeps.",
      zh: "致敬经典红白机游戏的原创 8 位冒险——收集六颗失落的水晶并击败深渊守卫。",
    },
    icon: Swords,
    color: "#22d3ee",
  },
  {
    to: "/prismheart" as const,
    title: { bg: "PRISM HEART", en: "PRISM HEART", zh: "棱镜之心" },
    tag: {
      bg: "МАГИЧНО МОМИЧЕ / ВИЗУАЛЕН РОМАН",
      en: "MAGICAL GIRL / VISUAL NOVEL",
      zh: "魔法少女 / 视觉小说",
    },
    note: {
      bg: "Оригинален визуален роман в стила на Magical Warrior Diamond Heart — ти си Луми, последната надежда на Астралис, а изборите ти коват връзките и смелостта, водещи към четири финала.",
      en: "An original visual novel inspired by Magical Warrior Diamond Heart — you are Lumi, the last hope of Astralis, and your choices forge bonds and courage, leading to four endings.",
      zh: "受《魔法少女钻石之心》启发的原创视觉小说——你是露米，阿斯特拉利斯最后的希望，你的选择塑造友情与勇气，通往四种结局。",
    },
    icon: Sparkles,
    color: "#e879f9",
  },
  {
    to: "/streamer" as const,
    title: { bg: "STREAM HEART", en: "STREAM HEART", zh: "心跳直播" },
    tag: {
      bg: "СТРИЙМ СИМУЛАЦИЯ / ВИЗУАЛЕН РОМАН",
      en: "STREAMER SIM / VISUAL NOVEL",
      zh: "主播模拟 / 视觉小说",
    },
    note: {
      bg: "Оригинална симулация на стриймър — влизаш в чата на Нова, пишеш съобщения, пращаш подаръци и градиш доверие през три вечери към един от четири финала.",
      en: "An original streamer sim — join Nova's chat, post messages, send gifts and build trust across three nights toward one of four endings.",
      zh: "原创主播模拟——进入诺娃的直播间，发弹幕、送礼物，在三个夜晚中建立信任，走向四种结局之一。",
    },
    icon: Radio,
    color: "#38bdf8",
  },
  {
    to: "/beatbattle" as const,
    title: { bg: "BEAT BATTLE", en: "BEAT BATTLE", zh: "节拍对决" },
    tag: {
      bg: "РИТЪМ / ДУЕЛ",
      en: "RHYTHM / DUEL",
      zh: "节奏 / 对决",
    },
    note: {
      bg: "Оригинален ритъм дуел в стила на Friday Night Funkin‘ — ти си ДЖЕЙ, удряш нотите в бита (← ↓ ↑ →), събаряш лентата на съперника РОКС и не спираш да свириш.",
      en: "An original rhythm duel in the spirit of Friday Night Funkin' — you are JAY, hit the notes on the beat (← ↓ ↑ →), drain rival ROX's bar and never stop playing.",
      zh: "致敬《Friday Night Funkin'》的原创节奏对决——你是杰伊，在节拍上敲击音符（← ↓ ↑ →），耗尽对手罗克斯的血槽，永不停歇。",
    },
    icon: Zap,
    color: "#f472b6",
  },
  {
    to: "/tetris" as const,
    title: { bg: "TETRIS", en: "TETRIS", zh: "俄罗斯方块" },
    tag: { bg: "КЛАСИКА", en: "CLASSIC", zh: "经典" },
    note: {
      bg: "Класическият TETRIS — реди падащите блокове, чисти редове, оцелявай при засилващо се темпо и задържай парчета за храбри пиеси.",
      en: "The classic TETRIS — stack the falling blocks, clear rows, survive the rising tempo and hold pieces for daring plays.",
      zh: "经典俄罗斯方块——堆叠下落方块、消除整行、在加快的节奏中存活，还能暂存方块完成大胆操作。",
    },
    icon: Blocks,
    color: "#fb923c",
  },
];

function GamesPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [gamesOpen, setGamesOpen] = useState(true);

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1280px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">02 /</span>
          <span className="label-mono">{isBg ? "ИГРИ" : isZh ? "游戏" : "GAMES"}</span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
              {isBg ? "ИГРАЙ СЕГА" : isZh ? "立即游玩" : "PLAY NOW"}
            </h1>
            <button
              type="button"
              onClick={() => setGamesOpen((current) => !current)}
              aria-expanded={gamesOpen}
              aria-controls="playable-games-list"
              aria-label={
                isBg
                  ? "Скрий или покажи игрите"
                  : isZh
                    ? "隐藏或显示游戏"
                    : "Hide or show the games"
              }
              className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-brand transition-colors hover:border-brand-dim hover:bg-surface-2"
            >
              <ChevronDown
                className={`size-5 transition-transform duration-300 ${
                  gamesOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
          <span className="label-mono text-[0.62rem]">
            {isBg ? "ГЕЙМ ХЪБ" : isZh ? "游戏中心" : "GAME HUB"}
          </span>
        </div>

        {gamesOpen ? (
          <div id="playable-games-list" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {playableGames.map((game) => {
              const Icon = game.icon;
              const className =
                "group rounded-3xl border border-border bg-card p-6 transition-all duration-200 hover:border-brand-dim hover:shadow-[0_0_24px_rgba(29,185,84,0.15)]";
              const card = (
                <>
                  <div className="flex items-start justify-between">
                    <span className="label-mono text-[0.6rem] text-brand">{game.tag[lang]}</span>
                    <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-brand" />
                  </div>
                  <h3 className="mt-10 text-2xl">{game.title[lang]}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{game.note[lang]}</p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#1DB954]/30 bg-[#161B16] px-4 py-2 font-mono text-[0.65rem] font-bold tracking-[0.15em] text-[var(--brand-bright)] uppercase transition-all duration-200 group-hover:bg-[#1DB954]/10 group-hover:shadow-[0_0_12px_rgba(29,185,84,0.2)]">
                    {isBg ? "ИГРАЙ" : isZh ? "开始" : "PLAY"}
                    <span className="text-[0.8rem]">›</span>
                  </span>
                </>
              );
              return (
                <Link key={game.to} to={game.to} className={className}>
                  {card}
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
