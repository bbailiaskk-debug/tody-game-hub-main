/**
 * The YouTube Data API v3 client, server side.
 *
 * The key never leaves the server. Everything here runs in the worker, so the
 * key is read from the environment at request time rather than being baked into
 * the bundle the visitor downloads.
 *
 * Two things drive the shape of this file.
 *
 * The first is the quota. A Data API key is metered in units per day — 10 000
 * by default — and `search.list` alone costs 100 units a call. So every
 * question this file answers is asked at most once per cache window and then
 * shared by everybody.
 *
 * The second is that the cache has to be *global*. An in-memory map lives in
 * one worker isolate, and a site with traffic runs many of them; each isolate
 * would spend the quota on its own. The cache therefore lives in KV, which
 * every isolate shares, with the memory kept only as a first level that saves
 * the round trip.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  buildEmbedUrl,
  buildWatchUrl,
  DEFAULT_CHANNEL_ID,
  isYoutubeVideoId,
  parseCommunityPosts,
  parseIsoDuration,
  pickThumbnail,
  readNumber,
  readString,
  type YoutubeChannel,
  type YoutubeFeed,
  type YoutubeFeedResult,
  type YoutubePlaylist,
  type YoutubePost,
  type YoutubeThumbnail,
  type YoutubeVideo,
} from "./youtube-api";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** How many uploads are pulled for the gallery. */
const VIDEO_LIMIT = 50;

/** How many playlists are listed. */
const PLAYLIST_LIMIT = 24;

/** How many community posts are read. */
const POST_LIMIT = 12;

/**
 * The lifetimes of the cached pieces, and what each one costs.
 *
 * The expensive calls are the `search.list` ones, so their windows are long:
 *
 *   search (long + short)  100 units each, twice a day      ~200
 *   search (live)          100 units, every two hours       ~1200
 *   playlistItems + videos  1 + 1 units, every five minutes ~600
 *   channel + playlists    1 + 1 units, every six hours     ~8
 *
 * That is roughly 2 000 units a day against a 10 000 unit allowance, with
 * room for a busy week. The cheap calls are refreshed often because they are
 * what a visitor actually notices: a new upload should show up within
 * minutes. The expensive ones can wait, because a video never changes which
 * side of the long/short line it is on.
 */
const CHANNEL_TTL_MS = 6 * 60 * 60 * 1_000;
const UPLOADS_TTL_MS = 5 * 60 * 1_000;
const SEARCH_TTL_MS = 12 * 60 * 60 * 1_000;
const LIVE_TTL_MS = 2 * 60 * 60 * 1_000;
const PLAYLISTS_TTL_MS = 6 * 60 * 60 * 1_000;
const POSTS_TTL_MS = 30 * 60 * 1_000;

/* -------------------------------------------------------------------------- */
/* The environment.                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Reads a deployment variable the same way the rest of the server does: the
 * worker's own bindings first, then the process environment that a local build
 * fills from `.env`.
 */
function readEnv(name: string): string {
  const cloudflareEnv = (globalThis as typeof globalThis & { CF_ENV?: Record<string, unknown> })
    .CF_ENV;
  const cloudflareValue = cloudflareEnv?.[name];
  if (typeof cloudflareValue === "string" && cloudflareValue.trim()) {
    return cloudflareValue.trim();
  }

  try {
    return globalThis.process?.env?.[name]?.trim() ?? "";
  } catch {
    return "";
  }
}

type KvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

/**
 * The KV namespace the cache lives in.
 *
 * `GEMINI_CACHE_KV` is the one the site already has bound; the names are an
 * accident of history, not a description of what is inside it.
 */
function readCacheKv(): KvNamespace | null {
  const cloudflareEnv = (
    globalThis as typeof globalThis & {
      CF_ENV?: { GEMINI_CACHE_KV?: KvNamespace; AUTH_USERS_KV?: KvNamespace };
    }
  ).CF_ENV;

  if (cloudflareEnv?.GEMINI_CACHE_KV) return cloudflareEnv.GEMINI_CACHE_KV;
  if (cloudflareEnv?.AUTH_USERS_KV) return cloudflareEnv.AUTH_USERS_KV;
  return null;
}

function readApiKey(): string {
  return readEnv("YOUTUBE_API_KEY");
}

function readChannelId(): string {
  return readEnv("YOUTUBE_CHANNEL_ID") || DEFAULT_CHANNEL_ID;
}

/* -------------------------------------------------------------------------- */
/* The cache.                                                                   */
/* -------------------------------------------------------------------------- */

type CacheEntry<T> = { value: T; expiresAt: number };

/** The first level: this isolate's memory. */
const memoryCache = new Map<string, CacheEntry<unknown>>();

/** The second level: the KV namespace every isolate shares. */
const kvCache = new Map<string, CacheEntry<unknown>>();

/** One in-flight request per key, so twenty visitors cost one call. */
const inflight = new Map<string, Promise<unknown>>();

const KV_PREFIX = "youtube:v2:";

function readMemory<T>(key: string): CacheEntry<T> | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry as CacheEntry<T>;
}

function writeMemory<T>(key: string, value: T, expiresAt: number): void {
  memoryCache.set(key, { value, expiresAt });
}

/** Test helper to reset caches between tests. */
export function __resetYoutubeCacheForTests(): void {
  memoryCache.clear();
  kvCache.clear();
  inflight.clear();
}

async function readKv<T>(key: string): Promise<CacheEntry<T> | undefined> {
  const kv = readCacheKv();
  if (!kv) return undefined;

  try {
    const raw = await kv.get(KV_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed?.expiresAt !== "number") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function writeKv<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  const kv = readCacheKv();
  if (!kv) return;

  try {
    // The KV entry is kept for a day past its own expiry so that a stale value
    // can still be served while it is being refreshed.
    await kv.put(KV_PREFIX + key, JSON.stringify(entry), { expirationTtl: 86_400 });
  } catch {
    // A cache that cannot be written is not a reason to fail the page.
  }
}

/**
 * A cached read that is shared by every isolate.
 *
 * Three levels, in order: this isolate's memory, the shared KV, and only then
 * the API. A value that has expired but is still in KV is served as it is
 * while it is refreshed in the background — stale content for a moment beats
 * a hundred visitors each spending a hundred units of quota.
 */
async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const fromMemory = readMemory<T>(key);
  if (fromMemory) return fromMemory.value;

  const alreadyFlying = inflight.get(key);
  if (alreadyFlying) return alreadyFlying as Promise<T>;

  const fromKv = await readKv<T>(key);
  if (fromKv && fromKv.expiresAt > Date.now()) {
    writeMemory(key, fromKv.value, fromKv.expiresAt);
    return fromKv.value;
  }

  if (fromKv) {
    // Stale but usable: hand it over now and refresh behind the visitor.
    writeMemory(key, fromKv.value, fromKv.expiresAt);
    void refreshInBackground(key, ttlMs, loader);
    return fromKv.value;
  }

  return refreshInBackground(key, ttlMs, loader);
}

/**
 * Fetches, stores and returns — the only path that spends quota.
 */
async function refreshInBackground<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const alreadyFlying = inflight.get(key);
  if (alreadyFlying) return alreadyFlying as Promise<T>;

  const request = loader()
    .then(async (value) => {
      const expiresAt = Date.now() + ttlMs;
      writeMemory(key, value, expiresAt);
      await writeKv(key, { value, expiresAt });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

class YoutubeApiError extends Error {
  readonly reason: "not-configured" | "network" | "not-found" | "unknown";

  constructor(reason: YoutubeApiError["reason"], message: string) {
    super(message);
    this.name = "YoutubeApiError";
    this.reason = reason;
  }
}

async function youtubeGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = readApiKey();
  if (!key) {
    throw new YoutubeApiError("not-configured", "YOUTUBE_API_KEY is not set on the server.");
  }

  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("key", key);

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new YoutubeApiError(
      "network",
      error instanceof Error ? error.message : "The request to YouTube failed.",
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
      detail = payload?.error?.message ?? "";
      const reason = payload?.error?.errors?.[0]?.reason;
      if (reason === "dailyLimitExceeded" || reason === "quotaExceeded") {
        throw new YoutubeApiError("unknown", "The YouTube API quota for today is used up.");
      }
      if (reason === "keyInvalid" || reason === "badRequest") {
        throw new YoutubeApiError("not-configured", "The YouTube API key was refused.");
      }
    } catch (error) {
      if (error instanceof YoutubeApiError) throw error;
    }

    if (response.status === 404) {
      throw new YoutubeApiError("not-found", "The YouTube channel was not found.");
    }
    throw new YoutubeApiError("unknown", detail || `YouTube answered with ${response.status}.`);
  }

  return (await response.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* The raw shapes the API answers with.                                        */
/* -------------------------------------------------------------------------- */

type RawThumbnailSet = Record<string, YoutubeThumbnail | undefined>;

type RawChannelItem = {
  id?: unknown;
  snippet?: {
    title?: unknown;
    description?: unknown;
    thumbnails?: RawThumbnailSet;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: unknown } };
  statistics?: {
    subscriberCount?: unknown;
    videoCount?: unknown;
    viewCount?: unknown;
  };
};

type RawPlaylistItem = {
  snippet?: {
    title?: unknown;
    publishedAt?: unknown;
    thumbnails?: RawThumbnailSet;
    liveBroadcastContent?: unknown;
    resourceId?: { videoId?: unknown };
  };
  contentDetails?: { videoId?: unknown };
};

type RawVideoItem = {
  id?: unknown;
  snippet?: {
    title?: unknown;
    description?: unknown;
    publishedAt?: unknown;
    thumbnails?: RawThumbnailSet;
    liveBroadcastContent?: unknown;
  };
  contentDetails?: { duration?: unknown; liveBroadcastContent?: unknown };
  statistics?: { viewCount?: unknown; likeCount?: unknown };
};

type RawPlaylistListItem = {
  id?: unknown;
  snippet?: { title?: unknown; thumbnails?: RawThumbnailSet };
  contentDetails?: { itemCount?: unknown };
};

type RawSearchItem = {
  id?: { videoId?: unknown };
  snippet?: {
    title?: unknown;
    description?: unknown;
    publishedAt?: unknown;
    thumbnails?: RawThumbnailSet;
    liveBroadcastContent?: unknown;
  };
};

/* -------------------------------------------------------------------------- */
/* The pieces of the feed.                                                     */
/* -------------------------------------------------------------------------- */

async function fetchChannel(channelId: string): Promise<{
  channel: YoutubeChannel;
  uploadsPlaylistId: string;
}> {
  const payload = await youtubeGet<{ items?: RawChannelItem[] }>("channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId,
  });

  const item = payload.items?.[0];
  if (!item) {
    throw new YoutubeApiError("not-found", "The YouTube channel was not found.");
  }

  const id = readString(item.id) || channelId;
  const uploadsPlaylistId = readString(item.contentDetails?.relatedPlaylists?.uploads) || "";

  const channel: YoutubeChannel = {
    id,
    title: readString(item.snippet?.title) || "YouTube",
    description: readString(item.snippet?.description),
    thumbnail: pickThumbnail(item.snippet?.thumbnails),
    subscriberCount: readNumber(item.statistics?.subscriberCount),
    videoCount: readNumber(item.statistics?.videoCount),
    viewCount: readNumber(item.statistics?.viewCount),
    url: `https://www.youtube.com/channel/${id}`,
  };

  return { channel, uploadsPlaylistId };
}

async function fetchPlaylists(channelId: string): Promise<YoutubePlaylist[]> {
  const payload = await youtubeGet<{ items?: RawPlaylistListItem[] }>("playlists", {
    part: "snippet,contentDetails",
    channelId,
    maxResults: String(PLAYLIST_LIMIT),
  });

  const playlists: YoutubePlaylist[] = [];
  for (const item of payload.items ?? []) {
    const id = readString(item.id);
    if (!id) continue;
    playlists.push({
      id,
      title: readString(item.snippet?.title) || "Плейлист",
      thumbnail: pickThumbnail(item.snippet?.thumbnails),
      itemCount: readNumber(item.contentDetails?.itemCount),
      url: `https://www.youtube.com/playlist?list=${id}`,
    });
  }
  return playlists;
}

/**
 * The ids of the videos in the uploads playlist, newest first.
 *
 * One unit, and the only call that has to be fresh: it is what makes a new
 * upload show up within minutes.
 */
async function fetchUploadIds(uploadsPlaylistId: string): Promise<string[]> {
  if (!uploadsPlaylistId) return [];

  const payload = await youtubeGet<{ items?: RawPlaylistItem[] }>("playlistItems", {
    part: "contentDetails,snippet",
    playlistId: uploadsPlaylistId,
    maxResults: String(VIDEO_LIMIT),
  });

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of payload.items ?? []) {
    const videoId =
      readString(item.snippet?.resourceId?.videoId) || readString(item.contentDetails?.videoId);
    if (!isYoutubeVideoId(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    ids.push(videoId);
  }
  return ids;
}

/**
 * The details of a set of videos — lengths, view counts, broadcast state.
 *
 * `videos.list` takes fifty ids at a time and costs one unit however many are
 * asked for, so a hundred and fifty ids is three calls.
 */
async function fetchVideoDetails(videoIds: string[]): Promise<YoutubeVideo[]> {
  const unique = Array.from(new Set(videoIds.filter(isYoutubeVideoId)));
  if (unique.length === 0) return [];

  const details: YoutubeVideo[] = [];
  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const payload = await youtubeGet<{ items?: RawVideoItem[] }>("videos", {
      part: "snippet,contentDetails,statistics",
      id: batch.join(","),
    });

    for (const item of payload.items ?? []) {
      const id = readString(item.id);
      if (!id) continue;

      const liveBroadcastContent = readString(
        item.contentDetails?.liveBroadcastContent ?? item.snippet?.liveBroadcastContent,
      );
      const isLive = liveBroadcastContent === "live";
      const isUpcoming = liveBroadcastContent === "upcoming";

      details.push({
        id,
        title: readString(item.snippet?.title) || "Видео",
        description: readString(item.snippet?.description),
        thumbnail: pickThumbnail(item.snippet?.thumbnails),
        publishedAt: readString(item.snippet?.publishedAt),
        // A broadcast has no length, and neither has a video the API has not
        // finished measuring — both are shown without a badge rather than as 0:00.
        durationSeconds: isLive
          ? null
          : parseIsoDuration(readString(item.contentDetails?.duration)),
        viewCount: readNumber(item.statistics?.viewCount),
        likeCount: readNumber(item.statistics?.likeCount),
        isLive,
        isUpcoming,
        watchUrl: buildWatchUrl(id),
        embedUrl: buildEmbedUrl(id),
      });
    }
  }

  return details;
}

/**
 * The ids of the channel's videos on one side of the long/short line.
 *
 * `videoDuration=short` is YouTube's own classification of a Short, which is
 * not quite the same thing as "shorter than three minutes" — the rule changed
 * over the years and some clips count on either side of it. Asking YouTube
 * is the only way to get the answer the visitor would see on the channel.
 *
 * A hundred units a call, which is why this is cached for half a day: a video
 * never changes sides, so there is nothing to be gained by asking again.
 */
async function fetchSearchIds(
  channelId: string,
  params: { videoDuration?: "short" | "long"; eventType?: "live" | "upcoming" },
): Promise<string[]> {
  const query: Record<string, string> = {
    part: "snippet",
    channelId,
    type: "video",
    maxResults: String(VIDEO_LIMIT),
  };
  // `eventType` has to be used together with `type`, which is why the type is
  // not dropped here — the API refuses a lone `eventType`.
  if (params["videoDuration"]) query["videoDuration"] = params.videoDuration;
  if (params["eventType"]) query["eventType"] = params.eventType;
  else query["order"] = "date";

  const payload = await youtubeGet<{ items?: RawSearchItem[] }>("search", query);

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of payload.items ?? []) {
    const videoId = readString(item.id?.videoId);
    if (!isYoutubeVideoId(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    ids.push(videoId);
  }
  return ids;
}

/**
 * The community posts, read from the channel's own community page.
 *
 * The Data API has no endpoint for these. The page is public, the request is
 * one every half hour, and a failure here costs nothing but an empty tab —
 * which is also what a channel that has never posted looks like.
 */
async function fetchPosts(channelId: string): Promise<YoutubePost[]> {
  let response: Response;
  try {
    response = await fetch(`https://www.youtube.com/channel/${channelId}/community`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let html: string;
  try {
    html = await response.text();
  } catch {
    return [];
  }

  return parseCommunityPosts(html).slice(0, POST_LIMIT);
}

/* -------------------------------------------------------------------------- */
/* The whole feed, assembled.                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sorts by the date the video went up, newest first.
 */
function byNewest(a: YoutubeVideo, b: YoutubeVideo): number {
  const left = Date.parse(a.publishedAt) || 0;
  const right = Date.parse(b.publishedAt) || 0;
  return right - left;
}

export async function loadYoutubeFeed(): Promise<YoutubeFeed> {
  const channelId = readChannelId();

  const { channel, uploadsPlaylistId } = await cached(
    `channel:${channelId}`,
    CHANNEL_TTL_MS,
    () => fetchChannel(channelId),
  );

  const playlists = await cached(`playlists:${channelId}`, PLAYLISTS_TTL_MS, () =>
    fetchPlaylists(channelId),
  );

  // The fresh half: the newest uploads, with their details.
  const recent = await cached(`uploads:${uploadsPlaylistId}`, UPLOADS_TTL_MS, async () => {
    const ids = await fetchUploadIds(uploadsPlaylistId);
    const details = await fetchVideoDetails(ids);
    return { ids, details };
  });

  // The slow half: the whole history, split the way YouTube splits it.
  const long = await cached(`long:${channelId}`, SEARCH_TTL_MS, async () => {
    const ids = await fetchSearchIds(channelId, { videoDuration: "long" });
    return fetchVideoDetails(ids);
  }).catch(() => [] as YoutubeVideo[]);

  const shorts = await cached(`shorts:${channelId}`, SEARCH_TTL_MS, async () => {
    const ids = await fetchSearchIds(channelId, { videoDuration: "short" });
    return fetchVideoDetails(ids);
  }).catch(() => [] as YoutubeVideo[]);

  const liveFromSearch = await cached(`live:${channelId}`, LIVE_TTL_MS, async () => {
    const ids = await fetchSearchIds(channelId, { eventType: "live" });
    return fetchVideoDetails(ids);
  }).catch(() => [] as YoutubeVideo[]);

  const posts = await cached(`posts:${channelId}`, POSTS_TTL_MS, () =>
    fetchPosts(channelId),
  ).catch(() => [] as YoutubePost[]);

  /* -- The live streams, from both sides. ---------------------------------- */

  const liveById = new Map<string, YoutubeVideo>();

  // The uploads list is fresh and free of charge, and it flags a broadcast
  // that has been scheduled as well as one that is on air. This is the path
  // that catches a stream within minutes of it starting.
  for (const video of recent.details) {
    if (video.isLive || video.isUpcoming) liveById.set(video.id, video);
  }

  // The search catches a stream the uploads list has not published yet.
  for (const video of liveFromSearch) {
    liveById.set(video.id, { ...video, isLive: true, durationSeconds: null });
  }

  const live = Array.from(liveById.values()).sort(byNewest);

  /* -- The shorts. ---------------------------------------------------------- */

  // The search is the authority on what counts as a Short. The fresh uploads
  // are added on top, so a Short that was published five minutes ago is not
  // waiting half a day for the search to be asked again.
  const shortById = new Map<string, YoutubeVideo>();
  for (const video of shorts) shortById.set(video.id, video);
  for (const video of recent.details) {
    if (video.durationSeconds !== null && video.durationSeconds <= 180 && !video.isLive) {
      shortById.set(video.id, video);
    }
  }
  const shortList = Array.from(shortById.values()).sort(byNewest);

  const shortIds = new Set(shortList.map((video) => video.id));

  /* -- The long videos. ---------------------------------------------------- */

  const videoById = new Map<string, YoutubeVideo>();
  for (const video of long) videoById.set(video.id, video);
  for (const video of recent.details) videoById.set(video.id, video);

  const videos = Array.from(videoById.values())
    .filter((video) => !shortIds.has(video.id))
    .filter((video) => !video.isLive && !video.isUpcoming)
    .sort(byNewest);

  return {
    channel,
    videos,
    shorts: shortList,
    playlists,
    live,
    posts,
    fetchedAt: new Date().toISOString(),
  };
}

function toFeedResult(error: unknown): YoutubeFeedResult {
  if (error instanceof YoutubeApiError) {
    return { ok: false, error: error.reason };
  }
  console.error("Failed to load the YouTube feed.", error);
  return { ok: false, error: "unknown" };
}

export const serverGetYoutubeFeed = createServerFn({ method: "POST" })
  .validator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<YoutubeFeedResult> => {
    try {
      const feed = await loadYoutubeFeed();
      const limit = Math.min(
        Math.max(Number(data.limit ?? VIDEO_LIMIT) || VIDEO_LIMIT, 1),
        VIDEO_LIMIT,
      );
      return {
        ok: true,
        feed: {
          ...feed,
          videos: feed.videos.slice(0, limit),
          shorts: feed.shorts.slice(0, limit),
        },
      };
    } catch (error) {
      return toFeedResult(error);
    }
  });
