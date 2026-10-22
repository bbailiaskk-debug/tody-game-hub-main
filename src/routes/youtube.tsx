import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  ListVideo,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  Search,
  Users,
  X,
  Youtube as YoutubeIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSiteSettings } from "../components/site/theme";
import { cachedRead } from "../lib/remote-cache";
import { seoHead } from "../lib/seo";
import {
  formatCount,
  formatDuration,
  formatRelativeDate,
  type YoutubeFeed,
  type YoutubePlaylist,
  type YoutubePost,
  type YoutubeVideo,
} from "../lib/youtube-api";
import { serverGetYoutubeFeed } from "../lib/youtube-functions";

export const Route = createFileRoute("/youtube")({
  loader: async () => {
    try {
      return await serverGetYoutubeFeed({ data: {} });
    } catch {
      return null;
    }
  },
  head: () => {
    const seo = seoHead({
      path: "/youtube",
      title: "Видеа и стриймове",
      description:
        "Най-новите клипове, Shorts, стриймове, плейлисти и публикации от канала на Todor Khristov Gaming — гледани директно в сайта.",
    });
    return { meta: seo.meta, links: seo.links };
  },
  component: YoutubePage,
});

type Lang = "bg" | "en" | "zh";

/**
 * The tabs of the channel, in the order a channel page shows them.
 */
type Tab = "home" | "videos" | "shorts" | "live" | "playlists" | "posts";

const TABS: Tab[] = ["home", "videos", "shorts", "live", "playlists", "posts"];

const labels: Record<
  Lang,
  {
    section: string;
    home: string;
    videos: string;
    shorts: string;
    live: string;
    playlists: string;
    posts: string;
    liveNow: string;
    watchLive: string;
    openOnYoutube: string;
    subscribers: string;
    videosCount: string;
    views: string;
    loading: string;
    empty: string;
    emptyHint: string;
    retry: string;
    errorNotConfigured: string;
    errorNotFound: string;
    errorNetwork: string;
    errorUnknown: string;
    updated: string;
    justNow: string;
    playlistItems: string;
    watchOnYoutube: string;
    backToChannel: string;
    upNext: string;
    close: string;
    search: string;
    searchPlaceholder: string;
    searchResults: string;
    searchEmpty: string;
    searchEmptyHint: string;
    latestVideos: string;
    latestShorts: string;
    latestPosts: string;
    community: string;
    noLive: string;
    noLiveHint: string;
    noPosts: string;
    noPostsHint: string;
    postBy: string;
    scheduled: string;
    soon: string;
  }
> = {
  bg: {
    section: "КАНАЛ",
    home: "НАЧАЛО",
    videos: "ВИДЕА",
    shorts: "SHORTS",
    live: "НА ЖИВО",
    playlists: "ПЛЕЙЛИСТИ",
    posts: "ПУБЛИКАЦИИ",
    liveNow: "НА ЖИВО",
    watchLive: "Гледай на живо",
    openOnYoutube: "Отвори в YouTube",
    subscribers: "абонирани",
    videosCount: "видеа",
    views: "гледания",
    loading: "Зареждане на канала…",
    empty: "Още няма видеа в този канал.",
    emptyHint: "Качи първото си видео и то ще се появи тук.",
    retry: "Опитай отново",
    errorNotConfigured:
      "YouTube ключът не е настроен на сървъра. Добави YOUTUBE_API_KEY и рестартирай приложението.",
    errorNotFound: "Каналът не е намерен. Провери YOUTUBE_CHANNEL_ID.",
    errorNetwork: "YouTube не отговори. Провери връзката и опитай пак.",
    errorUnknown: "Нещо се обърка при зареждането на канала.",
    updated: "Обновено",
    justNow: "току-що",
    playlistItems: "клипа",
    watchOnYoutube: "Гледай в YouTube",
    backToChannel: "Назад към канала",
    upNext: "Следващи видеа",
    close: "Затвори",
    search: "Търсене",
    searchPlaceholder: "Търси във видеата си",
    searchResults: "Резултати",
    searchEmpty: "Нищо не се намери за",
    searchEmptyHint: "Опитай с друга дума.",
    latestVideos: "Последни видеа",
    latestShorts: "Shorts",
    latestPosts: "Последни публикации",
    community: "Общност",
    noLive: "Няма стрийм в момента.",
    noLiveHint: "Когато започне излъчване, ще се появи тук.",
    noPosts: "Още няма публикации.",
    noPostsHint: "Публикациите от общността на канала ще се появят тук.",
    postBy: "Публикувано",
    scheduled: "Планирано",
    soon: "ОЧАКВА СЕ",
  },
  en: {
    section: "CHANNEL",
    home: "HOME",
    videos: "VIDEOS",
    shorts: "SHORTS",
    live: "LIVE",
    playlists: "PLAYLISTS",
    posts: "POSTS",
    liveNow: "LIVE NOW",
    watchLive: "Watch live",
    openOnYoutube: "Open on YouTube",
    subscribers: "subscribers",
    videosCount: "videos",
    views: "views",
    loading: "Loading the channel…",
    empty: "This channel has no videos yet.",
    emptyHint: "Upload your first video and it will show up here.",
    retry: "Try again",
    errorNotConfigured:
      "The YouTube key is not configured on the server. Add YOUTUBE_API_KEY and restart the app.",
    errorNotFound: "Channel not found. Check YOUTUBE_CHANNEL_ID.",
    errorNetwork: "YouTube did not answer. Check the connection and try again.",
    errorUnknown: "Something went wrong while loading the channel.",
    updated: "Updated",
    justNow: "just now",
    playlistItems: "videos",
    watchOnYoutube: "Watch on YouTube",
    backToChannel: "Back to channel",
    upNext: "Up next",
    close: "Close",
    search: "Search",
    searchPlaceholder: "Search your videos",
    searchResults: "Results",
    searchEmpty: "Nothing found for",
    searchEmptyHint: "Try a different word.",
    latestVideos: "Latest videos",
    latestShorts: "Shorts",
    latestPosts: "Latest posts",
    community: "Community",
    noLive: "Nothing is live right now.",
    noLiveHint: "The stream will show up here as soon as it starts.",
    noPosts: "No posts yet.",
    noPostsHint: "The channel's community posts will show up here.",
    postBy: "Posted",
    scheduled: "Scheduled",
    soon: "SOON",
  },
  zh: {
    section: "频道",
    home: "首页",
    videos: "视频",
    shorts: "短视频",
    live: "直播",
    playlists: "播放列表",
    posts: "帖子",
    liveNow: "正在直播",
    watchLive: "观看直播",
    openOnYoutube: "在 YouTube 打开",
    subscribers: "订阅者",
    videosCount: "视频",
    views: "次观看",
    loading: "正在加载频道…",
    empty: "这个频道还没有视频。",
    emptyHint: "上传第一个视频后它就会出现在这里。",
    retry: "重试",
    errorNotConfigured: "服务器未配置 YouTube 密钥。请添加 YOUTUBE_API_KEY 并重启应用。",
    errorNotFound: "未找到频道。请检查 YOUTUBE_CHANNEL_ID。",
    errorNetwork: "YouTube 没有响应。请检查网络后重试。",
    errorUnknown: "加载频道时出错。",
    updated: "更新于",
    justNow: "刚刚",
    playlistItems: "个视频",
    watchOnYoutube: "在 YouTube 观看",
    backToChannel: "返回频道",
    upNext: "接下来播放",
    close: "关闭",
    search: "搜索",
    searchPlaceholder: "在你的视频中搜索",
    searchResults: "搜索结果",
    searchEmpty: "没有找到",
    searchEmptyHint: "换个词试试。",
    latestVideos: "最新视频",
    latestShorts: "短视频",
    latestPosts: "最新帖子",
    community: "社区",
    noLive: "当前没有直播。",
    noLiveHint: "直播开始后会出现在这里。",
    noPosts: "还没有帖子。",
    noPostsHint: "频道的社区帖子会出现在这里。",
    postBy: "发布于",
    scheduled: "已安排",
    soon: "即将开始",
  },
};

type FeedResult = Awaited<ReturnType<typeof serverGetYoutubeFeed>>;
type Labels = (typeof labels)["bg"];

function YoutubePage() {
  const { lang } = useSiteSettings();
  const t = labels[lang as Lang] ?? labels.bg;

  const loaderData = Route.useLoaderData();
  const [result, setResult] = useState<FeedResult | null>(loaderData ?? null);
  const [activeVideo, setActiveVideo] = useState<YoutubeVideo | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await cachedRead(
        "youtube-feed",
        async () => serverGetYoutubeFeed({ data: {} }),
        { ttlMs: 30_000, persist: true },
      );
      setResult(next);
    } catch {
      setResult((current) => current ?? { ok: false, error: "unknown" });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  const feed: YoutubeFeed | null = result?.ok ? result.feed : null;
  const allVideos = feed ? [...feed.videos, ...feed.shorts, ...feed.live] : [];

  const trimmedQuery = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!feed || !trimmedQuery) return null;

    const matches = (text: string) => text.toLowerCase().includes(trimmedQuery);

    const videos = [...feed.videos, ...feed.shorts, ...feed.live].filter((video) =>
      matches(video.title),
    );
    const playlists = feed.playlists.filter((playlist) => matches(playlist.title));
    const posts = feed.posts.filter((post) => matches(post.text));

    return { videos, playlists, posts };
  }, [feed, trimmedQuery]);

  const selectTab = (next: Tab) => {
    setTab(next);
    setQuery("");
    setSearchOpen(false);
  };

  const liveVideos = feed?.live ?? [];

  return (
    <main className="min-h-[calc(100vh-68px)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
        {activeVideo ? (
          <VideoWatchPage
            video={activeVideo}
            videos={allVideos}
            channelTitle={feed?.channel.title ?? "YouTube"}
            t={t}
            lang={lang as Lang}
            onBack={() => setActiveVideo(null)}
            onSelect={setActiveVideo}
          />
        ) : (
          <>
            <ChannelHeader
              feed={feed}
              t={t}
              onRefresh={() => void load()}
              refreshing={refreshing}
            />

            <ChannelNav
              tab={tab}
              t={t}
              searchOpen={searchOpen}
              query={query}
              searchInput={searchInput}
              onSelect={selectTab}
              onToggleSearch={() => {
                setSearchOpen((open) => !open);
                if (searchOpen) setQuery("");
              }}
              onQueryChange={setQuery}
            />

            {result && !result.ok ? (
              <p
                role="alert"
                className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive"
              >
                {result.error === "not-configured"
                  ? t.errorNotConfigured
                  : result.error === "not-found"
                    ? t.errorNotFound
                    : result.error === "network"
                      ? t.errorNetwork
                      : t.errorUnknown}
              </p>
            ) : null}

            {!result && !feed ? (
              <p className="mt-8 font-mono text-xs tracking-[0.18em] text-muted-foreground">
                {t.loading}
              </p>
            ) : null}

            {searchResults ? (
              <SearchResults
                results={searchResults}
                t={t}
                lang={lang as Lang}
                query={query}
                onSelect={setActiveVideo}
              />
            ) : null}

            {!searchResults && feed ? (
              <>
                {tab === "home" ? (
                  <HomeView
                    feed={feed}
                    t={t}
                    lang={lang as Lang}
                    onSelect={setActiveVideo}
                    onOpenTab={selectTab}
                  />
                ) : null}

                {tab === "videos" ? (
                  <VideoGrid
                    videos={feed.videos}
                    t={t}
                    lang={lang as Lang}
                    onSelect={setActiveVideo}
                    emptyTitle={t.empty}
                    emptyHint={t.emptyHint}
                  />
                ) : null}

                {tab === "shorts" ? (
                  <ShortGrid
                    shorts={feed.shorts}
                    t={t}
                    lang={lang as Lang}
                    onSelect={setActiveVideo}
                    emptyTitle={t.empty}
                    emptyHint={t.emptyHint}
                  />
                ) : null}

                {tab === "live" ? (
                  <LiveView live={feed.live} t={t} lang={lang as Lang} onSelect={setActiveVideo} />
                ) : null}

                {tab === "playlists" ? <PlaylistGrid playlists={feed.playlists} t={t} /> : null}

                {tab === "posts" ? <PostList posts={feed.posts} t={t} lang={lang as Lang} /> : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* The channel header.                                                          */
/* -------------------------------------------------------------------------- */

function ChannelHeader({
  feed,
  t,
  onRefresh,
  refreshing,
}: {
  feed: YoutubeFeed | null;
  t: Labels;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="rounded-[2rem] border border-border bg-card p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-5">
        {feed?.channel.thumbnail ? (
          <img
            src={feed.channel.thumbnail}
            alt={feed.channel.title}
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            className="size-20 shrink-0 rounded-2xl border border-border object-cover"
          />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-2xl border border-border bg-surface text-muted-foreground">
            <YoutubeIcon className="size-8" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <span className="label-mono flex items-center gap-2 text-brand">
            <YoutubeIcon className="size-4" />
            {t.section}
          </span>
          <h1 className="mt-2 truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {feed?.channel.title ?? "YouTube"}
          </h1>

          {feed ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                {formatCount(feed.channel.subscriberCount)} {t.subscribers}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Play className="size-3.5" />
                {formatCount(feed.channel.videoCount)} {t.videosCount}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="size-3.5" />
                {formatCount(feed.channel.viewCount)} {t.views}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={t.retry}
            className="grid size-11 place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <a
            href={feed?.channel.url ?? "https://www.youtube.com"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-youtube px-5 py-3 font-mono text-[0.7rem] font-semibold tracking-[0.18em] text-white transition-transform duration-200 hover:-translate-y-0.5"
          >
            {t.openOnYoutube}
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* The channel tabs.                                                            */
/* -------------------------------------------------------------------------- */

function ChannelNav({
  tab,
  t,
  searchOpen,
  query,
  searchInput,
  onSelect,
  onToggleSearch,
  onQueryChange,
}: {
  tab: Tab;
  t: Labels;
  searchOpen: boolean;
  query: string;
  searchInput: React.RefObject<HTMLInputElement | null>;
  onSelect: (tab: Tab) => void;
  onToggleSearch: () => void;
  onQueryChange: (value: string) => void;
}) {
  const labelFor = (item: Tab): string => {
    if (item === "home") return t.home;
    if (item === "videos") return t.videos;
    if (item === "shorts") return t.shorts;
    if (item === "live") return t.live;
    if (item === "playlists") return t.playlists;
    return t.posts;
  };

  return (
    <nav
      aria-label={t.section}
      className="sticky top-[68px] z-30 -mx-4 mt-6 border-b border-border/70 bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
    >
      <div className="flex items-center gap-1 overflow-x-auto">
        {TABS.map((item) => {
          const active = tab === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onSelect(item)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border-b-2 px-4 py-3 font-mono text-[0.72rem] font-semibold tracking-[0.2em] transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labelFor(item)}
            </button>
          );
        })}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
          {searchOpen ? (
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
                className="w-36 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground sm:w-56"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  aria-label={t.close}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleSearch}
              aria-label={t.search}
              className="grid size-10 place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* The home tab.                                                                */
/* -------------------------------------------------------------------------- */

function HomeView({
  feed,
  t,
  lang,
  onSelect,
  onOpenTab,
}: {
  feed: YoutubeFeed;
  t: Labels;
  lang: Lang;
  onSelect: (video: YoutubeVideo) => void;
  onOpenTab: (tab: Tab) => void;
}) {
  return (
    <div className="mt-8 space-y-12">
      {feed.live.length > 0 ? <LiveBanner videos={feed.live} t={t} onSelect={onSelect} /> : null}

      {feed.shorts.length > 0 ? (
        <Shelf title={t.latestShorts} onMore={() => onOpenTab("shorts")}>
          {feed.shorts.slice(0, 12).map((video) => (
            <ShortCard key={video.id} video={video} lang={lang} onSelect={onSelect} />
          ))}
        </Shelf>
      ) : null}

      {feed.videos.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="label-mono flex items-center gap-2">
              <Play className="size-4 text-brand" />
              {t.latestVideos}
            </h2>
            <button
              type="button"
              onClick={() => onOpenTab("videos")}
              className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.videos} →
            </button>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {feed.videos.slice(0, 8).map((video) => (
              <VideoCard key={video.id} video={video} t={t} lang={lang} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ) : null}

      {feed.playlists.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="label-mono flex items-center gap-2">
              <ListVideo className="size-4 text-brand" />
              {t.playlists}
            </h2>
            <button
              type="button"
              onClick={() => onOpenTab("playlists")}
              className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.playlists} →
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {feed.playlists.slice(0, 4).map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {feed.posts.length > 0 ? (
        <section>
          <div className="flex items-end justify-between gap-4">
            <h2 className="label-mono flex items-center gap-2">
              <MessageSquare className="size-4 text-brand" />
              {t.latestPosts}
            </h2>
            <button
              type="button"
              onClick={() => onOpenTab("posts")}
              className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.posts} →
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {feed.posts.slice(0, 2).map((post) => (
              <PostCard key={post.id} post={post} t={t} lang={lang} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shelves and grids.                                                           */
/* -------------------------------------------------------------------------- */

function Shelf({
  title,
  children,
  onMore,
}: {
  title: string;
  children: React.ReactNode;
  onMore?: () => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <h2 className="label-mono flex items-center gap-2">
          <YoutubeIcon className="size-4 text-brand" />
          {title}
        </h2>
        {onMore ? (
          <button
            type="button"
            onClick={onMore}
            className="font-mono text-[0.68rem] tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            →
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}

function VideoGrid({
  videos,
  t,
  lang,
  onSelect,
  emptyTitle,
  emptyHint,
}: {
  videos: YoutubeVideo[];
  t: Labels;
  lang: Lang;
  onSelect: (video: YoutubeVideo) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (videos.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <section className="mt-8">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} t={t} lang={lang} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function ShortGrid({
  shorts,
  t,
  lang,
  onSelect,
  emptyTitle,
  emptyHint,
}: {
  shorts: YoutubeVideo[];
  t: Labels;
  lang: Lang;
  onSelect: (video: YoutubeVideo) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (shorts.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <section className="mt-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {shorts.map((video) => (
          <ShortCard key={video.id} video={video} lang={lang} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function PlaylistGrid({ playlists, t }: { playlists: YoutubePlaylist[]; t: Labels }) {
  if (playlists.length === 0) {
    return <EmptyState title={t.empty} hint={t.emptyHint} />;
  }

  return (
    <section className="mt-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {playlists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} t={t} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The live tab.                                                                */
/* -------------------------------------------------------------------------- */

function LiveView({
  live,
  t,
  lang,
  onSelect,
}: {
  live: YoutubeVideo[];
  t: Labels;
  lang: Lang;
  onSelect: (video: YoutubeVideo) => void;
}) {
  if (live.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState title={t.noLive} hint={t.noLiveHint} icon={<Radio className="size-6" />} />
      </div>
    );
  }

  return (
    <section className="mt-8 space-y-6">
      {live.map((video) => (
        <article
          key={video.id}
          className="overflow-hidden rounded-[2rem] border border-red-500/40 bg-card"
        >
          <button
            type="button"
            onClick={() => onSelect(video)}
            aria-label={video.title}
            className="grid w-full gap-0 text-left md:grid-cols-[minmax(0,22rem)_1fr]"
          >
            <div className="relative aspect-video w-full overflow-hidden bg-black md:aspect-auto md:h-full">
              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt=""
                  width={480}
                  height={270}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : null}
              <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 font-mono text-[0.62rem] font-bold tracking-[0.18em] text-white">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-white" />
                </span>
                {video.isLive ? t.liveNow : t.scheduled}
              </span>
            </div>

            <div className="flex flex-col justify-center gap-3 p-5 sm:p-7">
              <h2 className="font-display text-lg font-semibold leading-snug sm:text-xl">
                {video.title}
              </h2>
              <p className="font-mono text-[0.68rem] tracking-[0.14em] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="size-3.5" />
                  {formatCount(video.viewCount)} {t.views}
                </span>
                {video.publishedAt ? ` · ${formatRelativeDate(video.publishedAt, lang)}` : ""}
              </p>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-mono text-[0.68rem] font-semibold tracking-[0.16em] text-white">
                <Radio className="size-3.5" />
                {t.watchLive}
              </span>
            </div>
          </button>
        </article>
      ))}
    </section>
  );
}

function LiveBanner({
  videos,
  t,
  onSelect,
}: {
  videos: YoutubeVideo[];
  t: Labels;
  onSelect: (video: YoutubeVideo) => void;
}) {
  const primary = videos[0];
  if (!primary) return null;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-red-500/40 bg-red-500/10">
      <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 font-mono text-[0.7rem] font-bold tracking-[0.2em] text-white shadow-[0_0_18px_rgba(220,38,38,0.45)]">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-white" />
          </span>
          {t.liveNow}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold sm:text-lg">
            {primary.title}
          </p>
          <p className="mt-1 font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground">
            {formatCount(primary.viewCount)} {t.views}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onSelect(primary)}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 font-mono text-[0.7rem] font-semibold tracking-[0.18em] text-white transition-transform duration-200 hover:-translate-y-0.5"
        >
          <Radio className="size-3.5" />
          {t.watchLive}
        </button>
      </div>

      {videos.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-t border-red-500/25 px-5 py-3 sm:px-6">
          {videos.slice(1).map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onSelect(video)}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-red-500/30 bg-background/60 px-3 py-1.5 font-mono text-[0.65rem] tracking-[0.12em] text-foreground transition-colors hover:bg-background"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
              <span className="truncate">{video.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The posts.                                                                   */
/* -------------------------------------------------------------------------- */

function PostList({ posts, t, lang }: { posts: YoutubePost[]; t: Labels; lang: Lang }) {
  if (posts.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          title={t.noPosts}
          hint={t.noPostsHint}
          icon={<MessageSquare className="size-6" />}
        />
      </div>
    );
  }

  return (
    <section className="mt-8 space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} t={t} lang={lang} />
      ))}
    </section>
  );
}

function PostCard({ post, t, lang }: { post: YoutubePost; t: Labels; lang: Lang }) {
  const when = post.publishedAt ? formatRelativeDate(post.publishedAt, lang) : post.publishedLabel;

  return (
    <article className="rounded-3xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground">
          <MessageSquare className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-line text-sm leading-relaxed">{post.text}</p>
          <p className="mt-3 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground">
            {t.postBy} {when}
          </p>
        </div>

        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.community}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[0.62rem] tracking-[0.14em] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {t.community}
          <ExternalLink className="size-3" />
        </a>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* The search.                                                                  */
/* -------------------------------------------------------------------------- */

function SearchResults({
  results,
  t,
  lang,
  query,
  onSelect,
}: {
  results: { videos: YoutubeVideo[]; playlists: YoutubePlaylist[]; posts: YoutubePost[] };
  t: Labels;
  lang: Lang;
  query: string;
  onSelect: (video: YoutubeVideo) => void;
}) {
  const total = results.videos.length + results.playlists.length + results.posts.length;

  if (total === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          title={`${t.searchEmpty} “${query}”`}
          hint={t.searchEmptyHint}
          icon={<Search className="size-6" />}
        />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-10">
      <h2 className="label-mono">
        {t.searchResults} <span className="text-brand">{total}</span>
      </h2>

      {results.videos.length > 0 ? (
        <section>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.videos.map((video) => (
              <VideoCard key={video.id} video={video} t={t} lang={lang} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ) : null}

      {results.playlists.length > 0 ? (
        <section>
          <h3 className="label-mono flex items-center gap-2">
            <ListVideo className="size-4 text-brand" />
            {t.playlists}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {results.posts.length > 0 ? (
        <section>
          <h3 className="label-mono flex items-center gap-2">
            <MessageSquare className="size-4 text-brand" />
            {t.posts}
          </h3>
          <div className="mt-4 space-y-3">
            {results.posts.map((post) => (
              <PostCard key={post.id} post={post} t={t} lang={lang} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The cards.                                                                   */
/* -------------------------------------------------------------------------- */

function VideoCard({
  video,
  t,
  lang,
  onSelect,
}: {
  video: YoutubeVideo;
  t: Labels;
  lang: Lang;
  onSelect: (video: YoutubeVideo) => void;
}) {
  const duration = formatDuration(video.durationSeconds);

  return (
    <article className="group overflow-hidden rounded-3xl border border-border bg-card transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={() => onSelect(video)}
        aria-label={video.title}
        className="block w-full text-left"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              width={480}
              height={270}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : null}

          <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-red-600/90 text-white shadow-lg">
              <Play className="size-5 fill-current" />
            </span>
          </span>

          {duration ? (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[0.65rem] text-white">
              {duration}
            </span>
          ) : null}

          {video.isUpcoming ? (
            <span className="absolute left-2 top-2 rounded-md bg-black/80 px-2 py-1 font-mono text-[0.6rem] tracking-[0.16em] text-white">
              SOON
            </span>
          ) : null}
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug">
            {video.title}
          </h3>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.65rem] tracking-[0.12em] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {formatCount(video.viewCount)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeDate(video.publishedAt, lang)}</span>
          </p>
        </div>
      </button>
    </article>
  );
}

function ShortCard({
  video,
  lang,
  onSelect,
}: {
  video: YoutubeVideo;
  lang: Lang;
  onSelect: (video: YoutubeVideo) => void;
}) {
  const duration = formatDuration(video.durationSeconds);

  return (
    <article className="group w-[9.5rem] shrink-0 sm:w-[11rem]">
      <button
        type="button"
        onClick={() => onSelect(video)}
        aria-label={video.title}
        className="block w-full text-left"
      >
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-surface-2">
          {video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              width={270}
              height={480}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.06]"
            />
          ) : null}

          <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="grid size-11 place-items-center rounded-full bg-red-600/90 text-white shadow-lg">
              <Play className="size-4 fill-current" />
            </span>
          </span>

          {duration ? (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[0.6rem] text-white">
              {duration}
            </span>
          ) : null}
        </div>

        <h3 className="mt-2 line-clamp-2 font-display text-xs font-semibold leading-snug">
          {video.title}
        </h3>
        <p className="mt-1 inline-flex items-center gap-1 font-mono text-[0.6rem] tracking-[0.12em] text-muted-foreground">
          <Eye className="size-3" />
          {formatCount(video.viewCount)}
          {video.publishedAt ? ` · ${formatRelativeDate(video.publishedAt, lang)}` : ""}
        </p>
      </button>
    </article>
  );
}

function PlaylistCard({ playlist, t }: { playlist: YoutubePlaylist; t: Labels }) {
  return (
    <a
      href={playlist.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-3xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      {playlist.thumbnail ? (
        <img
          src={playlist.thumbnail}
          alt=""
          width={112}
          height={63}
          loading="lazy"
          decoding="async"
          className="size-16 shrink-0 rounded-xl border border-border object-cover"
        />
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground">
          <ListVideo className="size-5" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-sm font-semibold leading-snug">
          {playlist.title}
        </span>
        <span className="mt-1 block font-mono text-[0.65rem] tracking-[0.12em] text-muted-foreground">
          {formatCount(playlist.itemCount)} {t.playlistItems}
        </span>
      </span>

      <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}

function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card px-6 py-12 text-center">
      {icon ? (
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-surface text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <p className="mt-3 font-display text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function VideoWatchPage({
  video,
  videos,
  channelTitle,
  t,
  lang,
  onBack,
  onSelect,
}: {
  video: YoutubeVideo | null;
  videos: YoutubeVideo[];
  channelTitle: string;
  t: Labels;
  lang: Lang;
  onBack: () => void;
  onSelect: (video: YoutubeVideo) => void;
}) {
  if (!video) return null;

  const recommendations = videos.filter((item) => item.id !== video.id).slice(0, 12);

  return (
    <VideoWatchPageContent
      key={video.id}
      video={video}
      recommendations={recommendations}
      channelTitle={channelTitle}
      t={t}
      lang={lang}
      onBack={onBack}
      onSelect={onSelect}
    />
  );
}

function VideoWatchPageContent({
  video,
  recommendations,
  channelTitle,
  t,
  lang,
  onBack,
  onSelect,
}: {
  video: YoutubeVideo;
  recommendations: YoutubeVideo[];
  channelTitle: string;
  t: Labels;
  lang: Lang;
  onBack: () => void;
  onSelect: (video: YoutubeVideo) => void;
}) {
  return (
    <section className="mt-2">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 font-mono text-xs tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.backToChannel}
      </button>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <iframe
              key={video.id}
              src={video.embedUrl}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 size-full border-0"
            />
          </div>

          <div className="mt-5">
            <h1 className="font-display text-xl font-bold leading-snug sm:text-2xl">
              {video.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full border border-primary/30 bg-surface text-sm font-bold text-brand">
                  {channelTitle.slice(0, 1)}
                </span>
                <div>
                  <p className="font-display text-sm font-semibold">{channelTitle}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {formatCount(video.viewCount)} {t.views}
                    {video.publishedAt ? ` · ${formatRelativeDate(video.publishedAt, lang)}` : ""}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end border-y border-border py-3">
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 font-mono text-xs tracking-wide text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {t.watchOnYoutube}
                <ExternalLink className="size-3.5" />
              </a>
            </div>
            {video.description ? (
              <p className="mt-5 whitespace-pre-line rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
                {video.description}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0">
          <h2 className="mb-4 font-display text-sm font-semibold">{t.upNext}</h2>
          {recommendations.length ? (
            <div className="flex flex-col gap-3">
              {recommendations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="group flex w-full gap-3 rounded-2xl border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-card"
                >
                  <span className="relative aspect-video w-[42%] shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        width={240}
                        height={135}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : null}
                    {formatDuration(item.durationSeconds) ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[0.6rem] text-white">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 block font-display text-xs font-semibold leading-snug">
                      {item.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {channelTitle}
                    </span>
                    <span className="mt-1 block font-mono text-[0.62rem] text-muted-foreground">
                      {formatCount(item.viewCount)} {t.views}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              {t.empty}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
