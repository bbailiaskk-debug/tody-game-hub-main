import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Disc3,
  Home,
  ImagePlus,
  Library,
  ListMusic,
  Pause,
  Play,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSiteSettings } from "../components/site/theme";
import { createCompressedImageDataUrl } from "../lib/image-utils";
import { readPersistedAuthSession } from "../lib/local-persistence";

export const Route = createFileRoute("/music")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !readPersistedAuthSession()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Музика — Todor Khristov Gaming" },
      {
        name: "description",
        content: "Слушай музиката на Todor Khristov Gaming. Оригинални песни и любими парчета.",
      },
      { property: "og:title", content: "Музика — Todor Khristov Gaming" },
      {
        property: "og:description",
        content: "Слушай музиката на Todor Khristov Gaming. Оригинални песни и любими парчета.",
      },
      { property: "og:url", content: "https://tody-game-hub.bbailiaskk.workers.dev/music" },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/images/og-image.jpg",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/jpeg" },
      { name: "twitter:title", content: "Музика — Todor Khristov Gaming" },
      {
        name: "twitter:description",
        content: "Слушай музиката на Todor Khristov Gaming. Оригинални песни и любими парчета.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/images/og-image.jpg",
      },
    ],
    links: [
      { rel: "canonical", href: "https://tody-game-hub.bbailiaskk.workers.dev/music" },
      {
        rel: "alternate",
        hrefLang: "bg",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/music",
      },
      {
        rel: "alternate",
        hrefLang: "en",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/music?lang=en",
      },
      {
        rel: "alternate",
        hrefLang: "zh",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/music?lang=zh",
      },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/music",
      },
    ],
  }),
  component: MusicPage,
});

const libraryTracks: Track[] = [
  "Аз обичам живота Mix.mp3",
  "В природата MIX.mp3",
  "Всеки ден качвам Mix.mp3",
  "Всеки ден с приятелка mix.mp3",
  "Вторник и петък натискай play сега! MIX.mp3",
  "Джойстикът ми знае Mix.mp3",
  "Кола и пиксели (Nightcore Mix).mp3",
  "Копая към края MIX.mp3",
  "саламът бяга Mix.mp3",
  "Световно на победата Mix.mp3",
  "Тодор е тук.mp3",
].map((name) => ({
  id: name,
  name: name.replace(/\.[^/.]+$/, ""),
  url: `/мойта музика/${encodeURIComponent(name)}`,
}));

function MusicPage() {
  const { lang, backgroundImage, setBackgroundImage } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [tracks] = useState<Track[]>(libraryTracks);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(libraryTracks[0] ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [backgroundError, setBackgroundError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const mediaActionsRef = useRef({
    play: () => {},
    pause: () => {},
    previoustrack: () => {},
    nexttrack: () => {},
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (selectedTrack && audio.getAttribute("src") !== selectedTrack.url) {
      audio.src = selectedTrack.url;
    }

    const handleTimeUpdate = () => setProgress(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      setIsPlaying(false);
      if (!selectedTrack) return;
      let nextTrack = selectedTrack;
      if (!isRepeat && tracks.length > 1) {
        if (isShuffle) {
          const choices = tracks.filter((track) => track.id !== selectedTrack.id);
          nextTrack = choices[Math.floor(Math.random() * choices.length)] ?? selectedTrack;
        } else {
          const currentIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
          nextTrack = tracks[(currentIndex + 1) % tracks.length] ?? selectedTrack;
        }
      }
      audio.src = nextTrack.url;
      audio.load();
      setSelectedTrack(nextTrack);
      setProgress(0);
      setDuration(0);
      const playNext = () => {
        audio.removeEventListener("canplay", playNext);
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      };
      if (audio.readyState >= 3) playNext();
      else audio.addEventListener("canplay", playNext);
    };
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isRepeat, isShuffle, selectedTrack, tracks]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const selectTrack = async (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = track.url;
    audio.load();
    setSelectedTrack(track);
    setProgress(0);
    setDuration(0);

    const playWhenReady = () => {
      audio.removeEventListener("canplay", playWhenReady);
      return audio.play();
    };

    try {
      await (audio.readyState >= 3
        ? playWhenReady()
        : new Promise<void>((resolve, reject) => {
            audio.addEventListener(
              "canplay",
              () => {
                playWhenReady().then(resolve).catch(reject);
              },
              { once: true },
            );
          }));
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !selectedTrack) return;
    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const stepTrack = (direction: number) => {
    if (!selectedTrack || tracks.length < 2) return;
    const currentIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
    const nextIndex = (currentIndex + direction + tracks.length) % tracks.length;
    selectTrack(tracks[nextIndex]!);
  };

  const shuffleTrack = () => {
    if (tracks.length < 2) return;
    const choices = tracks.filter((track) => track.id !== selectedTrack?.id);
    const nextTrack = choices[Math.floor(Math.random() * choices.length)];
    if (nextTrack) void selectTrack(nextTrack);
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextProgress = Number(event.target.value);
    setProgress(nextProgress);
    if (audioRef.current) audioRef.current.currentTime = nextProgress;
  };

  mediaActionsRef.current = {
    play: togglePlayback,
    pause: togglePlayback,
    previoustrack: () => stepTrack(-1),
    nexttrack: () => stepTrack(1),
  };

  useEffect(() => {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession) return;

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => mediaActionsRef.current.play()],
      ["pause", () => mediaActionsRef.current.pause()],
      ["previoustrack", () => mediaActionsRef.current.previoustrack()],
      ["nexttrack", () => mediaActionsRef.current.nexttrack()],
    ];

    handlers.forEach(([action, handler]) => mediaSession.setActionHandler(action, handler));

    return () => {
      handlers.forEach(([action]) => mediaSession.setActionHandler(action, null));
    };
  }, []);

  useEffect(() => {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession || typeof MediaMetadata === "undefined" || !selectedTrack) return;

    mediaSession.metadata = new MediaMetadata({
      title: selectedTrack.name,
      artist: "Todor Khristov Gaming",
      album: "Todor Khristov Gaming",
    });
    mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [selectedTrack, isPlaying]);

  const visibleTracks = tracks.filter((track) =>
    track.name.toLowerCase().includes(search.toLowerCase()),
  );
  const progressPercent = duration ? (progress / duration) * 100 : 0;

  return (
    <main className="min-h-[calc(100vh-68px)] bg-cover bg-center pb-24">
      <div className="grid min-h-[calc(100vh-164px)] grid-cols-[64px_minmax(0,1fr)] lg:grid-cols-[72px_minmax(0,1fr)_280px]">
        <aside className="border-r border-border bg-surface/70 px-2 py-5">
          <div className="flex flex-col items-center gap-4">
            <Link
              to="/"
              aria-label={isBg ? "Начало" : "Home"}
              className="grid size-11 place-items-center rounded-md bg-background text-muted-foreground hover:text-brand"
            >
              <Home className="size-5" />
            </Link>
            <button
              type="button"
              aria-label={isBg ? "Търсене" : "Search"}
              className="grid size-11 place-items-center rounded-md text-brand"
            >
              <Search className="size-5" />
            </button>
            <button
              type="button"
              aria-label={isBg ? "Библиотека" : "Library"}
              className="grid size-11 place-items-center rounded-md bg-brand text-primary-foreground"
            >
              <Library className="size-5" />
            </button>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden bg-background/35 px-5 py-7 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-end justify-between gap-5">
              <div>
                <span className="label-mono text-brand">TK / MUSIC LIBRARY</span>
                <h1 className="mt-3 font-display text-[clamp(2rem,5vw,4.4rem)] leading-none">
                  {isBg ? "Tодор Христов" : isZh ? "Todor Khristov" : "Todor Khristov"}
                </h1>
              </div>
              <Disc3 className="mb-1 hidden size-10 text-brand sm:block" />
              <div className="flex items-center gap-2">
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    setBackgroundError(false);
                    const maxFileSize = 17.1 * 1024 * 1024;
                    if (!file || file.size > maxFileSize) {
                      setBackgroundError(true);
                      return;
                    }

                    try {
                      const compressedImage = await createCompressedImageDataUrl(file, {
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxBytes: 450_000,
                        quality: 0.68,
                      });
                      setBackgroundImage(compressedImage);
                    } catch {
                      setBackgroundError(true);
                    } finally {
                      event.target.value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => backgroundInputRef.current?.click()}
                  className="flex items-center gap-2 border border-brand px-3 py-2 font-mono text-[0.6rem] text-brand transition-colors hover:bg-accent/40 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <ImagePlus className="size-4" />
                  {isBg ? "КАЧИ СНИМКА" : isZh ? "上传图片" : "UPLOAD IMAGE"}
                </button>
                {backgroundImage && (
                  <button
                    type="button"
                    onClick={() => setBackgroundImage(null)}
                    className="border border-border px-3 py-2 font-mono text-[0.6rem] text-muted-foreground hover:text-foreground"
                  >
                    {isBg ? "ПРЕМАХНИ" : isZh ? "移除" : "REMOVE"}
                  </button>
                )}
              </div>
            </div>
            <div className="mt-8 flex h-12 max-w-2xl items-center border border-border bg-surface px-4">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  isBg
                    ? "Да намерим нещо за вашия плейлист"
                    : isZh
                      ? "在播放列表中查找内容"
                      : "Let's find something for your playlist"
                }
                className="ml-3 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                  <X className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {isBg
                ? "Този плейлист събира музиката на Todor Khristov Gaming на едно място. Избери песен, използвай търсенето и остави player-а да продължи автоматично със следващия трак. Можеш да променяш силата на звука, да включиш Shuffle или да повториш любимата си песен."
                : isZh
                  ? "这个播放列表汇集了 Todor Khristov Gaming 的音乐。选择一首歌曲，使用搜索功能，让播放器自动播放下一首。你也可以调节音量、开启随机播放或循环喜欢的歌曲。"
                  : "This playlist brings Todor Khristov Gaming music together in one place. Choose a track, use search, and let the player continue automatically with the next song. Adjust the volume, turn on Shuffle, or repeat your favorite track."}
            </p>
            <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              {isBg
                ? "Музиката тук е част от цялостното усещане на канала: тя допълва игровата атмосфера, дава енергия и създава перфектния фон за сесии, почивка между игри и моменти на забавление. Всеки запис е подбран да носи характер, настроение и личен стил, така че слушането да се чувствa като естествено продължение на изживяването от канала."
                : isZh
                  ? "这里的音乐是频道体验的一部分：它补充游戏氛围，带来能量，并为游戏、休息和欢乐时刻创造完美背景。每首歌曲都经过挑选，带有个性、情绪和风格，让聆听成为频道体验的自然延续。"
                  : "The music here is part of the entire channel experience: it complements the gaming atmosphere, adds energy, and creates the perfect backdrop for sessions, breaks, and fun moments. Every track is selected to carry character, mood, and personal style so listening feels like a natural continuation of the channel experience."}
            </p>
            <div className="mt-7 grid max-w-4xl gap-5 border-y border-border/60 py-6 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
              <p>
                {isBg
                  ? "Плейлистът съдържа подбрани песни от папката „Моята музика“. Всеки запис се зарежда локално от сайта, а избраната песен се показва едновременно в основния списък, десния информационен панел и долния player."
                  : isZh
                    ? "播放列表包含“我的音乐”文件夹中的精选歌曲。每首歌曲都从网站本地加载，当前歌曲会同时显示在主列表、详情面板和底部播放器中。"
                    : "The playlist contains selected tracks from the My Music collection. Each song loads locally from the site, while the active track is shown in the main list, the details panel, and the bottom player."}
              </p>
              <p>
                {isBg
                  ? "Използвай лентата за търсене, когато искаш бързо да намериш песен. Бутоните за предишна и следваща песен, Shuffle, Repeat, прогресът и контролът за звука са достъпни от долната лента на всяко устройство."
                  : isZh
                    ? "使用搜索框快速找到歌曲。底部播放器在所有设备上都提供上一首、下一首、随机播放、循环、进度和音量控制。"
                    : "Use the search field to find a song quickly. Previous and next controls, Shuffle, Repeat, progress, and volume are available from the bottom player on every device."}
              </p>
            </div>
            <div className="mt-8 flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-display text-lg">{isBg ? "Песни" : isZh ? "歌曲" : "Songs"}</h2>
              <span className="label-mono text-[0.58rem]">{visibleTracks.length} TRACKS</span>
            </div>
            <div className="mt-2 space-y-1">
              {visibleTracks.map((track, index) => (
                <button
                  type="button"
                  key={track.id}
                  onPointerDown={(event) => {
                    if (event.button === 0) void selectTrack(track);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") void selectTrack(track);
                  }}
                  className={`group flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-surface ${selectedTrack?.id === track.id ? "bg-surface text-brand" : "text-foreground"}`}
                >
                  <span className="w-5 font-mono text-xs text-muted-foreground group-hover:text-brand">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Disc3 className="size-4 text-brand" />
                  <span className="min-w-0 flex-1 truncate text-sm">{track.name}</span>
                  {selectedTrack?.id === track.id && <Volume2 className="size-4 text-brand" />}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-border bg-surface/50 p-6 lg:block">
          <span className="label-mono text-brand">
            {isBg ? "СЕГА СВИРИ" : isZh ? "正在播放" : "NOW PLAYING"}
          </span>
          <div className="mt-5 aspect-square rounded-md bg-gradient-to-br from-brand/80 via-surface-2 to-background p-5">
            <div className="grid h-full place-items-center rounded-full border-[18px] border-background/80">
              <span className="font-display text-4xl text-brand">TK</span>
            </div>
          </div>
          <h2 className="mt-6 truncate font-display text-xl">{selectedTrack?.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Todor Khristov Gaming</p>
          <div className="mt-8 border-t border-border pt-5">
            <span className="label-mono text-[0.58rem]">
              {isBg ? "ИЗПЪЛНИТЕЛ" : isZh ? "艺术家" : "ARTIST"}
            </span>
            <p className="mt-3 text-sm">Todor Khristov</p>
          </div>
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface px-4 py-3 shadow-2xl sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4">
          <div className="hidden min-w-0 w-56 sm:block">
            <p className="truncate text-sm font-bold">{selectedTrack?.name}</p>
            <p className="truncate text-xs text-muted-foreground">Todor Khristov Gaming</p>
          </div>
          <div className="flex flex-1 flex-col items-center gap-2">
            <div className="flex items-center gap-5">
              <button
                type="button"
                aria-label="Shuffle"
                aria-pressed={isShuffle}
                onClick={() => {
                  setIsShuffle((active) => !active);
                  if (!isShuffle) shuffleTrack();
                }}
                className={`hidden hover:text-brand sm:block ${isShuffle ? "text-brand" : "text-muted-foreground"}`}
              >
                <Shuffle className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Previous track"
                onClick={() => stepTrack(-1)}
                className="text-muted-foreground hover:text-foreground"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={togglePlayback}
                className="grid size-9 place-items-center rounded-full bg-foreground text-background"
              >
                <span>
                  {isPlaying ? (
                    <Pause className="size-4 fill-current" />
                  ) : (
                    <Play className="ml-0.5 size-4 fill-current" />
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label="Next track"
                onClick={() => stepTrack(1)}
                className="text-muted-foreground hover:text-foreground"
              >
                <SkipForward className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Repeat"
                aria-pressed={isRepeat}
                onClick={() => setIsRepeat((active) => !active)}
                className={`hidden hover:text-brand sm:block ${isRepeat ? "text-brand" : "text-muted-foreground"}`}
              >
                <Repeat2 className="size-4" />
              </button>
            </div>
            <div className="flex w-full max-w-2xl items-center gap-3">
              <span className="font-mono text-[0.58rem] text-muted-foreground">
                {formatTime(progress)}
              </span>
              <input
                type="range"
                min="0"
                max={duration || 1}
                value={Math.min(progress, duration || 1)}
                onChange={handleSeek}
                aria-label="Track progress"
                className="h-1 flex-1 accent-brand"
                style={{
                  background: `linear-gradient(to right, var(--brand) ${progressPercent}%, var(--border) ${progressPercent}%)`,
                }}
              />
              <span className="font-mono text-[0.58rem] text-muted-foreground">
                -{formatTime(Math.max(duration - progress, 0))}
              </span>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Volume2 className="size-4 text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label={isBg ? "Сила на звука" : "Volume"}
              className="w-24 accent-brand"
              style={{
                background: `linear-gradient(to right, var(--brand) ${volume * 100}%, var(--border) ${volume * 100}%)`,
              }}
            />
          </div>
        </div>
      </div>
      <audio ref={audioRef} preload="none" />
    </main>
  );
}

type Track = { id: string; name: string; url: string };

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}
