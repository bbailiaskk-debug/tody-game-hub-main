import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Calendar,
  Check,
  Flame,
  Mail,
  Music,
  Play,
  Share2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useSiteSettings } from "../components/site/theme";
import {
  EMAILJS_CONTACT_PUBLIC_KEY,
  EMAILJS_CONTACT_SERVICE_ID,
  EMAILJS_CONTACT_TEMPLATE_ID,
} from "../lib/emailjs-config";
import { sendEmailJsWithFallback } from "../lib/emailjs-send";

export const Route = createFileRoute("/info")({
  head: () => ({
    meta: [
      { title: "Зад канала — Todor Khristov Gaming" },
      {
        name: "description",
        content:
          "Кой е Todor Khristov Gaming: игри за забавление, обработени видеа, график на качване и всички канали за следване.",
      },
      { property: "og:title", content: "Зад канала — Todor Khristov Gaming" },
      {
        property: "og:description",
        content: "Профил на създателя, канали за следване и график на новите видеа.",
      },
      { name: "twitter:title", content: "Зад канала — Todor Khristov Gaming" },
      {
        name: "twitter:description",
        content: "Профил на създателя, канали за следване и график на новите видеа.",
      },
      { property: "og:url", content: "https://tody-game-hub.bbailiaskk.workers.dev/info" },
      {
        property: "og:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/profile-photo.jpg",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/profile-photo.jpg",
      },
    ],
    links: [
      { rel: "canonical", href: "https://tody-game-hub.bbailiaskk.workers.dev/info" },
      {
        rel: "alternate",
        hrefLang: "bg",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/info",
      },
      {
        rel: "alternate",
        hrefLang: "en",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/info?lang=en",
      },
      {
        rel: "alternate",
        hrefLang: "zh",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/info?lang=zh",
      },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/info",
      },
    ],
  }),
  component: InfoPage,
});

const socials = [
  {
    name: "YouTube",
    href: "https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ",
    className: "bg-youtube text-primary-foreground",
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@todorkhristovgmaing",
    className: "bg-surface-2 text-foreground",
  },
  {
    name: "Spotify",
    href: "https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20g",
    className: "bg-spotify text-primary-foreground",
  },
  {
    name: "Discord",
    href: "https://discord.gg/uRNGhKf7vC",
    className: "bg-discord text-primary-foreground",
  },
];

const schedule = {
  bg: [
    { day: "ПН", up: false },
    { day: "ВТ", up: true },
    { day: "СР", up: false },
    { day: "ЧТ", up: false },
    { day: "ПТ", up: true },
    { day: "СБ", up: false },
    { day: "НД", up: false },
  ],
  en: [
    { day: "MON", up: false },
    { day: "TUE", up: true },
    { day: "WED", up: false },
    { day: "THU", up: false },
    { day: "FRI", up: true },
    { day: "SAT", up: false },
    { day: "SUN", up: false },
  ],
  zh: [
    { day: "周一", up: false },
    { day: "周二", up: true },
    { day: "周三", up: false },
    { day: "周四", up: false },
    { day: "周五", up: true },
    { day: "周六", up: false },
    { day: "周日", up: false },
  ],
} as const;

const artImages = [
  "/cute-gamer-girl-making-heart-gesture-artwork-vector.jpg",
  "/cartoon-gamer-girl-mascot-logo-with-anime-style-for-esport-use-vector.jpg",
] as const;

const contentItems = {
  bg: [
    { label: "ПОСЛЕДНИ ЮТУБ ВИДЕА", hint: "Виж последните клипове", target: "youtube-videos" },
    { label: "ГЕЙМИНГ АКЦЕНТИ", hint: "Виж гейминг клипове", target: "highlights" },
    { label: "ОБЩНОСТНИ НОВИНИ", hint: "Виж последните новини", target: "community-news" },
    { label: "МУЗИКАЛНИ ПЛЕЙЛИСТИ", hint: "Виж музиката", target: "music-playlists" },
  ],
  en: [
    { label: "LATEST YOUTUBE VIDEOS", hint: "Watch the latest clips", target: "youtube-videos" },
    { label: "GAMING HIGHLIGHTS", hint: "Watch gaming clips", target: "highlights" },
    { label: "COMMUNITY NEWS", hint: "See the latest news", target: "community-news" },
    { label: "MUSIC PLAYLISTS", hint: "Watch the music", target: "music-playlists" },
  ],
  zh: [
    { label: "最新 YouTube 视频", hint: "观看最新视频", target: "youtube-videos" },
    { label: "游戏精彩片段", hint: "观看游戏片段", target: "highlights" },
    { label: "社区新闻", hint: "查看最新消息", target: "community-news" },
    { label: "音乐播放列表", hint: "观看音乐", target: "music-playlists" },
  ],
} as const;

function InfoPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [activeArt, setActiveArt] = useState(0);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveArt((current) => (current + 1) % artImages.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  const handleContactSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactStatus("sending");

    try {
      await sendEmailJsWithFallback(
        EMAILJS_CONTACT_SERVICE_ID,
        EMAILJS_CONTACT_TEMPLATE_ID,
        {
          email: contactEmail.trim(),
          name: contactName.trim(),
          to_email: contactEmail.trim(),
          to_name: contactName.trim(),
          message: contactMessage.trim(),
          title: "Contact Us",
        },
        EMAILJS_CONTACT_PUBLIC_KEY,
      );

      setContactName("");
      setContactEmail("");
      setContactMessage("");
      setContactStatus("success");
    } catch (error) {
      console.error("Contact email failed.", error);
      setContactStatus("error");
    }
  };

  return (
    <main className="grid-bg min-h-screen">
      <section className="mx-auto max-w-[1000px] px-6 pb-28 pt-20">
        <div className="flex items-center gap-4">
          <span className="label-mono text-brand">03 /</span>
          <span className="label-mono">
            {isBg ? "ПРОФИЛ НА СЪЗДАТЕЛЯ" : isZh ? "创作者简介" : "CREATOR PROFILE"}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-brand text-[clamp(2.5rem,7vw,4.5rem)] leading-none">
            {isBg ? "ЗАД КАНАЛА" : isZh ? "频道背后" : "BEHIND THE CHANNEL"}
          </h1>
        </div>

        <div className="mt-10 grid gap-6 items-start md:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col rounded-3xl border border-border bg-card p-6">
              <div className="relative grid h-[320px] overflow-hidden rounded-2xl bg-surface/70 p-3 sm:h-[360px]">
                <div
                  aria-hidden="true"
                  className={`art-image-${activeArt} absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] rounded-xl bg-cover bg-center`}
                />
              </div>
              <p className="label-mono mt-5 text-[0.6rem]">
                {isBg ? "СЪЗДАТЕЛ / ГЕЙМЪР" : isZh ? "创作者 / 游戏玩家" : "CREATOR / GAMER"}
              </p>
              <div className="mt-8 border-t border-border pt-6">
                <p className="label-mono text-[0.6rem]">
                  {isBg ? "ОФИЦИАЛЕН КАНАЛ" : isZh ? "官方频道" : "OFFICIAL CHANNEL"}
                </p>
                <p className="mt-2 font-display text-xl leading-tight">
                  TODOR KHRISTOV <span className="text-brand">GAMING</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(isBg
                    ? ["ИГРИ", "LIVE", "BG"]
                    : isZh
                      ? ["游戏", "直播", "中文"]
                      : ["GAMES", "LIVE", "BG"]
                  ).map((tag) => (
                    <span
                      key={tag}
                      className="label-mono rounded-md bg-surface-2 px-3 py-1.5 text-[0.58rem]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#1DB954]/20 bg-[#161B16] p-5">
              <h2 className="label-mono text-brand text-[0.7rem]">
                {isBg ? "СЪДЪРЖАНИЕ" : isZh ? "内容" : "CONTENT"}
              </h2>
              <ul className="mt-4 space-y-1">
                {contentItems[lang].map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => {
                        document
                          .getElementById(item.target)
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="group flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="flex flex-col">
                        <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                          {item.label}
                        </span>
                        <span className="mt-0.5 text-xs text-muted-foreground">{item.hint}</span>
                      </span>
                      <span className="text-brand transition-transform group-hover:translate-x-1">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className="rounded-3xl border border-border bg-card p-7"
            style={{ paddingLeft: "2rem", paddingRight: "2rem" }}
          >
            <h2
              className="mb-2 block text-4xl leading-snug sm:text-5xl font-rotwimch"
              style={{
                fontFamily: '"LIGHTZ", system-ui, sans-serif',
                fontWeight: 900,
                letterSpacing: "-0.05em",
                display: "block",
                width: "100%",
                maxWidth: "100%",
                lineHeight: 1.05,
                margin: 0,
                marginBottom: "0.35rem",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                paddingLeft: "1rem",
                paddingRight: "1rem",
              }}
            >
              {isBg ? (
                <>
                  Добре дошли в официалния свят на{" "}
                  <span className="text-brand">Todor Khristov Gaming!</span>
                </>
              ) : isZh ? (
                <>
                  欢迎来到 <span className="text-brand">Todor Khristov Gaming</span> 的官方世界！
                </>
              ) : (
                <>
                  Welcome to the official world of{" "}
                  <span className="text-brand">Todor Khristov Gaming!</span>
                </>
              )}
            </h2>
            <div
              className="space-y-2 text-muted-foreground font-rotwimch"
              style={{
                fontFamily: '"LIGHTZ", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: "1.26rem",
                lineHeight: 1.5,
                letterSpacing: "-0.018em",
                paddingLeft: "1.5rem",
                paddingRight: "1.5rem",
                paddingBottom: "1.5rem",
              }}
            >
              <p>
                {isBg
                  ? "Тук забавлението е на първо място. Влизам в най-различни виртуални светове, за да споделя с вас незабравими гейминг емоции, епични моменти и много смях. Зад всеки кадър стои старателна обработка, използване на виртуална стая и професионален софтуер като NVIDIA Broadcast, за да ви осигуря най-доброто и качествено изживяване."
                  : isZh
                    ? "这里把乐趣放在第一位。我会进入各种虚拟世界，与大家分享难忘的游戏体验、史诗般的时刻和许多笑声。每一帧背后都有细致的剪辑、虚拟工作室和 NVIDIA Broadcast 等专业工具，为你带来最优质的体验。"
                    : "This is where the fun comes first. I dive into all kinds of virtual worlds to share unforgettable gaming emotions, epic moments, and plenty of laughter with you. Behind every frame is careful editing, a virtual room setup, and professional tools like NVIDIA Broadcast to give you the best possible experience."}
              </p>
              <p>
                {isBg
                  ? "Направете си абонамент, станете част от нашата страхотна общност и не пропускайте новите епизоди, които излизат всеки вторник и петък. Пригответе се за яко гейминг преживяване!"
                  : isZh
                    ? "订阅频道，加入我们精彩的社区，不要错过每周二和周五更新的新节目。准备好迎接精彩的游戏体验吧！"
                    : "Subscribe, become part of our amazing community, and don’t miss the new episodes released every Tuesday and Friday. Get ready for a seriously awesome gaming experience!"}
              </p>
              <p>
                {isBg
                  ? "Каналът е създаден да събира игри, музика, атмосфера и личен стил в едно пространство, като изграждам чувство за общност, в което всеки зрител може да се почувства част от историята, да споделя емоции и да е част от следващото приключение."
                  : isZh
                    ? "这个频道将游戏、音乐、氛围和个人风格汇聚在一起。这里不只是官方直播，也在建立一个社区，让每位观众都能成为故事的一部分，分享情绪并参与下一次冒险。"
                    : "The channel is built to bring games, music, atmosphere, and personality together in one space. It is not only about official streams; it is also about creating a community where every viewer feels part of the story, shares the excitement, and joins the next adventure."}
              </p>
              <p>
                {isBg
                  ? "От експерименти в игри с различни жанрове до музикални моменти и визуално оформени кадри, целта е да се създаде усещане за енергия, създаване и безкрайна забавна рутина. Всяка публикация е направена, за да поддържа атмосферата жива, интерактивна и винаги готова за нови игри."
                  : isZh
                    ? "从不同类型游戏的尝试，到音乐时刻和精心设计的画面，我们希望保持能量、创意和持续不断的乐趣。每次发布都让氛围保持活力与互动，并始终为新游戏做好准备。"
                    : "From experiments across different game genres to music moments and visually styled content, the goal is to keep the energy alive, creative, and always ready for the next session. Every upload is designed to maintain a fun, interactive atmosphere and a strong connection with the audience."}
              </p>
            </div>
          </div>
        </div>

        <div
          id="youtube-videos"
          className="mt-14 scroll-mt-28 rounded-3xl border border-border bg-card p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <Play className="size-4 text-brand" />
            <span className="label-mono">
              {isBg ? "ПОСЛЕДНИ ЮТУБ ВИДЕА" : isZh ? "最新 YouTube 视频" : "LATEST YOUTUBE VIDEOS"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "НАЙ-НОВИТЕ КЛИПОВЕ" : isZh ? "最新视频" : "THE LATEST CLIPS"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg
                    ? "Свежи видеа всяка седмица"
                    : isZh
                      ? "每周更新的新鲜视频"
                      : "Fresh videos every week"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ/live"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "СТРИЙМОВЕ" : isZh ? "直播" : "STREAMS"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg ? "Гледай на живо" : isZh ? "观看直播" : "Watch live"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        <div
          id="highlights"
          className="mt-8 scroll-mt-28 rounded-3xl border border-border bg-card p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <Flame className="size-4 text-brand" />
            <span className="label-mono">
              {isBg ? "ГЕЙМИНГ АКЦЕНТИ" : isZh ? "游戏精彩片段" : "GAMING HIGHLIGHTS"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "ЕПИЧНИ МОМЕНТИ" : isZh ? "精彩时刻" : "EPIC MOMENTS"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg
                    ? "Най-запомнящите се кадри"
                    : isZh
                      ? "最难忘的画面"
                      : "The most memorable frames"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ/shorts"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "ШОРТИ" : isZh ? "短视频" : "SHORTS"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg ? "Кратки гейминг кадри" : isZh ? "简短游戏片段" : "Short gaming clips"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        <div
          id="community-news"
          className="mt-8 scroll-mt-28 rounded-3xl border border-border bg-card p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <Users className="size-4 text-brand" />
            <span className="label-mono">
              {isBg ? "ОБЩНОСТНИ НОВИНИ" : isZh ? "社区新闻" : "COMMUNITY NEWS"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <a
              href="https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ/community"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "ОБЯВИ В ОБЩНОСТТА" : isZh ? "社区公告" : "COMMUNITY POSTS"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg
                    ? "Следвай директно от канала"
                    : isZh
                      ? "直接关注频道"
                      : "Follow straight from the channel"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://discord.com/invite/uRNGhKf7vC"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "DISCORD СЪРВЪР" : isZh ? "Discord 服务器" : "DISCORD SERVER"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg ? "Присъедини се към общността" : isZh ? "加入社区" : "Join the community"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        <div
          id="music-playlists"
          className="mt-8 scroll-mt-28 rounded-3xl border border-border bg-card p-6 md:p-8"
        >
          <div className="flex items-center gap-3">
            <Music className="size-4 text-brand" />
            <span className="label-mono">
              {isBg ? "МУЗИКАЛНИ ПЛЕЙЛИСТИ" : isZh ? "音乐播放列表" : "MUSIC PLAYLISTS"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <a
              href="https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20g"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "SPOTIFY" : isZh ? "Spotify" : "SPOTIFY"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg
                    ? "Слушай оригиналните парчета"
                    : isZh
                      ? "收听原创歌曲"
                      : "Listen to the official tracks"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <Link
              to="/music"
              className="group flex items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[0.7rem] tracking-[0.14em] text-foreground">
                  {isBg ? "МУЗИКАЛЕН ПЛЕЪР" : isZh ? "音乐播放器" : "MUSIC PLAYER"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isBg
                    ? "Отвори страницата с музика"
                    : isZh
                      ? "打开音乐页面"
                      : "Open the music page"}
                </span>
              </span>
              <ArrowUpRight className="size-4 text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <div className="mt-14 flex items-center gap-3">
          <Share2 className="size-4 text-brand" />
          <span className="label-mono">
            {isBg
              ? "АБОНИРАЙТЕ СЕ И МЕ ПОСЛЕДВАЙТЕ"
              : isZh
                ? "订阅并关注我"
                : "SUBSCRIBE AND FOLLOW ME"}
          </span>
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {socials.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-between rounded-full px-7 py-5 text-lg font-bold transition-transform hover:-translate-y-0.5 ${s.className}`}
            >
              {s.name}
              <ArrowUpRight className="size-4" />
            </a>
          ))}
        </div>

        <div className="mt-14 flex items-center gap-3">
          <Calendar className="size-4 text-brand" />
          <span className="label-mono">
            {isBg ? "ГРАФИК НА КАЧВАНЕ" : isZh ? "上传日程" : "UPLOAD SCHEDULE"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {schedule[lang].map((d) => (
            <div
              key={d.day}
              className={`flex flex-col items-center gap-3 rounded-2xl border px-3 py-6 text-center ${
                d.up ? "border-brand-dim bg-accent/40" : "border-border bg-card"
              }`}
            >
              <span className="label-mono text-[0.6rem]">{d.day}</span>
              {d.up ? (
                <Check className="size-4 text-brand" />
              ) : (
                <X className="size-4 text-muted-foreground" />
              )}
              <span className={`label-mono text-[0.55rem] ${d.up ? "text-brand" : ""}`}>
                {d.up
                  ? isBg
                    ? "НОВО ВИДЕО"
                    : isZh
                      ? "新视频"
                      : "NEW VIDEO"
                  : isBg
                    ? "ПОЧИВКА"
                    : isZh
                      ? "休息"
                      : "OFF"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-14 flex items-center gap-3">
          <Mail className="size-4 text-brand" />
          <span className="label-mono">
            {isBg ? "ПИШЕТЕ МИ" : isZh ? "联系我" : "GET IN TOUCH"}
          </span>
        </div>
        <form
          onSubmit={handleContactSubmit}
          className="mt-4 grid gap-4 rounded-3xl border border-border bg-card p-6 md:grid-cols-2"
        >
          <Input
            required
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            placeholder={isBg ? "Име" : isZh ? "姓名" : "Name"}
            aria-label={isBg ? "Име" : isZh ? "姓名" : "Name"}
          />
          <Input
            required
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder={isBg ? "Имейл" : isZh ? "邮箱" : "Email"}
            aria-label={isBg ? "Имейл" : isZh ? "邮箱" : "Email"}
          />
          <Textarea
            required
            value={contactMessage}
            onChange={(event) => setContactMessage(event.target.value)}
            placeholder={isBg ? "Вашето съобщение" : isZh ? "你的消息" : "Your message"}
            aria-label={isBg ? "Вашето съобщение" : isZh ? "你的消息" : "Your message"}
            className="min-h-32 md:col-span-2"
          />
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <Button type="submit" disabled={contactStatus === "sending"}>
              {contactStatus === "sending"
                ? isBg
                  ? "ИЗПРАЩАНЕ..."
                  : isZh
                    ? "发送中..."
                    : "SENDING..."
                : isBg
                  ? "ИЗПРАТИ"
                  : isZh
                    ? "发送"
                    : "SEND MESSAGE"}
            </Button>
            {contactStatus === "success" && (
              <span className="text-sm text-brand">
                {isBg ? "Съобщението е изпратено." : isZh ? "消息已发送。" : "Message sent."}
              </span>
            )}
            {contactStatus === "error" && (
              <span className="text-sm text-muted-foreground">
                {isBg ? "Грешка при изпращане." : isZh ? "发送失败。" : "Sending failed."}
              </span>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
