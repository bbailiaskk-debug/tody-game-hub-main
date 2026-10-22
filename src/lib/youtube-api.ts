/**
 * The shapes the YouTube section works with, and the small pure functions that
 * turn raw API payloads into them.
 *
 * Nothing here talks to the network. The fetching lives in `youtube-functions.ts`
 * (server side, where the API key stays), and this file is the part that can be
 * reasoned about — and tested — on its own.
 */

export type YoutubeThumbnail = {
  url: string;
  width: number;
  height: number;
};

export type YoutubeVideo = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  /** `null` for a live stream: a broadcast has no length until it ends. */
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  isLive: boolean;
  isUpcoming: boolean;
  watchUrl: string;
  embedUrl: string;
};

export type YoutubePlaylist = {
  id: string;
  title: string;
  thumbnail: string;
  itemCount: number;
  url: string;
};

/**
 * A community post — the things that show up on a channel's "Community" tab.
 *
 * These are the one part of a channel the Data API does not hand over: the
 * `activities` resource only ever reports uploads and playlist changes, so the
 * posts are read from the channel's own public community page instead. The
 * text, the id and the date are real; the like count is not available there
 * and is therefore not on the type.
 */
export type YoutubePost = {
  id: string;
  text: string;
  /** The relative label YouTube prints on the post, e.g. "3 months ago". */
  publishedLabel: string;
  /**
   * An approximate timestamp worked out from that label, so the post can be
   * shown in the site's own language. Empty when the label cannot be read.
   */
  publishedAt: string;
  hasAttachment: boolean;
  url: string;
};

export type YoutubeChannel = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  url: string;
};

export type YoutubeFeed = {
  channel: YoutubeChannel;
  /** The long videos — the "Videos" tab and the home grid. */
  videos: YoutubeVideo[];
  /** The vertical clips, as YouTube itself classifies them. */
  shorts: YoutubeVideo[];
  playlists: YoutubePlaylist[];
  /** Streams that are on air right now, plus the ones already scheduled. */
  live: YoutubeVideo[];
  /** The community posts, newest first. */
  posts: YoutubePost[];
  /** When the payload was produced, as an ISO string. */
  fetchedAt: string;
};

export type YoutubeFeedError = "not-configured" | "network" | "not-found" | "unknown";

export type YoutubeFeedResult =
  { ok: true; feed: YoutubeFeed } | { ok: false; error: YoutubeFeedError };

/** The default quota on a YouTube Data API key is 10 000 units a day. */
export const DEFAULT_CHANNEL_ID = "UCBZMHdKCLVYkEPElCScTiFQ";

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** YouTube video ids are exactly eleven URL-safe characters. */
export function isYoutubeVideoId(value: string): boolean {
  return YOUTUBE_VIDEO_ID_PATTERN.test(value);
}

/**
 * The embeddable player url for a video.
 *
 * `youtube-nocookie.com` rather than `youtube.com` uses the privacy-enhanced
 * embed mode, while avoiding third-party cookies before playback starts.
 *
 * Muted autoplay lets browser autoplay policies honor the click that opened the
 * player; viewers can unmute it in YouTube's controls.
 */
export function buildEmbedUrl(videoId: string, opts?: { autoplay?: boolean }): string {
  const autoplay = opts?.autoplay === false ? "0" : "1";
  const params = new URLSearchParams({
    autoplay,
    mute: autoplay,
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * The thumbnail that fits a card.
 *
 * The API hands back a set of sizes and the largest of them is often absent for
 * a video that is still processing, so the sizes are walked from the biggest
 * that exists rather than assuming `maxresdefault` is there.
 */
export function pickThumbnail(
  thumbnails: Record<string, YoutubeThumbnail | undefined> | undefined,
): string {
  if (!thumbnails) return "";
  const order = ["maxres", "standard", "high", "medium", "default"];
  for (const size of order) {
    const thumbnail = thumbnails[size];
    if (thumbnail?.url) return thumbnail.url;
  }
  return "";
}

/**
 * `PT1H2M3S` — the ISO 8601 duration YouTube reports — as seconds.
 *
 * Returns `null` for a live stream, which has no duration at all, and for
 * anything that does not parse: a missing duration is not an error here, it just
 * means the card shows no length badge.
 */
export function parseIsoDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return null;
  const total =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return total > 0 ? total : null;
}

/**
 * A duration as `1:02:03` or `12:34`.
 *
 * A live stream is `null` upstream and shows as "LIVE" on the card instead of a
 * length, because a stream with a length badge is a stream that has already
 * ended.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/**
 * A view count as `1 234 567` — thin spaces, because a digit group separated by
 * a comma reads as a decimal point to half the people who see it.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return Math.floor(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

/**
 * `3 дни преди` / `3 days ago` / `3 天前`.
 *
 * The unit list stops at days on purpose: a video from last year is "a year
 * ago", not "347 days ago", and a counter that keeps counting stops being
 * information and starts being clutter.
 */
export function formatRelativeDate(iso: string, lang: "bg" | "en" | "zh"): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";

  const units: Record<
    "bg" | "en" | "zh",
    { second: string; minute: string; hour: string; day: string; month: string; year: string }
  > = {
    bg: {
      second: "секунди",
      minute: "минути",
      hour: "часа",
      day: "дни",
      month: "месеца",
      year: "години",
    },
    en: {
      second: "seconds",
      minute: "minutes",
      hour: "hours",
      day: "days",
      month: "months",
      year: "years",
    },
    zh: {
      second: "秒",
      minute: "分钟",
      hour: "小时",
      day: "天",
      month: "个月",
      year: "年",
    },
  };

  const words = units[lang];
  const ago = lang === "bg" ? "назад" : lang === "zh" ? "前" : "ago";

  const elapsed = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(elapsed / 1_000);
  if (seconds < 60) return `${seconds} ${words.second} ${ago}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${words.minute} ${ago}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${words.hour} ${ago}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${words.day} ${ago}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${words.month} ${ago}`;
  const years = Math.floor(days / 365);
  return `${years} ${words.year} ${ago}`;
}

/**
 * Reads a number out of an API field that may be missing, a string, or a
 * number. YouTube sends counts as strings and quotas as numbers, depending on
 * the call.
 */
export function readNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Reads a string out of an API field, trimmed, or "" when it is absent.
 */
export function readString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/* -------------------------------------------------------------------------- */
/* The community posts.                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pulls `ytInitialData` out of a YouTube page.
 *
 * The braces are counted rather than matched with a regular expression: a post
 * may legitimately contain the text `;</script>`, and a regular expression
 * would stop there and hand back half a JSON document.
 */
export function extractYoutubeInitialData(html: string): unknown {
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const from = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = from; index < html.length; index += 1) {
    const character = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(from, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/** The fields a community post renderer carries that this page cares about. */
type RawBackstagePost = {
  postId?: unknown;
  publishedTimeText?: unknown;
  contentText?: unknown;
  backstageAttachment?: unknown;
  contentBackdropImage?: unknown;
};

/**
 * The text of a YouTube text run — either `{ runs: [...] }` or `{ simpleText }`.
 */
function readTextRuns(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { runs?: Array<{ text?: unknown }>; simpleText?: unknown };

  if (Array.isArray(node.runs)) {
    return node.runs
      .map((run) => readString(run?.text))
      .filter((text) => text.length > 0)
      .join("");
  }
  return readString(node.simpleText);
}

const RELATIVE_LABEL_PATTERN = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i;

/** How long each unit of a relative label lasts, in seconds. */
const RELATIVE_UNIT_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3_600,
  day: 86_400,
  week: 604_800,
  /** A month and a year are not fixed lengths; these are the averages. */
  month: 2_629_800,
  year: 31_557_600,
};

/**
 * "3 months ago" as an ISO timestamp.
 *
 * YouTube prints relative times rather than dates, so this is the only way to
 * get a date out of a post — and an approximate one, which is all a "3 months
 * ago" label ever promised. The site renders it in the reader's own language
 * instead of showing the English label.
 */
export function parseRelativeLabel(label: string, now: number = Date.now()): string {
  const match = RELATIVE_LABEL_PATTERN.exec(label ?? "");
  if (!match) return "";

  const amount = Number(match[1]);
  const unit = RELATIVE_UNIT_SECONDS[(match[2] ?? "").toLowerCase()];
  if (!Number.isFinite(amount) || amount <= 0 || !unit) return "";

  return new Date(now - amount * unit * 1_000).toISOString();
}

/**
 * The community posts of a channel, read out of its public community page.
 *
 * YouTube's Data API has no endpoint for these — `activities.list` reports
 * uploads and playlist changes only — so the page is read directly. The
 * result is whatever the page holds, newest first, and an empty array when the
 * page turns out to be a consent wall or the channel has never posted.
 */
export function parseCommunityPosts(html: string): YoutubePost[] {
  const data = extractYoutubeInitialData(html);
  if (!data) return [];

  const posts: YoutubePost[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    const record = node as Record<string, unknown>;
    const thread = record["backstagePostThreadRenderer"] as
      | { post?: { backstagePostRenderer?: RawBackstagePost } }
      | undefined;
    const renderer = thread?.post?.backstagePostRenderer;

    if (renderer) {
      const id = readString(renderer.postId);
      if (id && !seen.has(id)) {
        seen.add(id);
        const label = readTextRuns(renderer.publishedTimeText);
        posts.push({
          id,
          text: readTextRuns(renderer.contentText),
          publishedLabel: label,
          publishedAt: parseRelativeLabel(label),
          hasAttachment:
            Boolean(renderer.backstageAttachment) || Boolean(renderer.contentBackdropImage),
          url: `https://www.youtube.com/post/${id}`,
        });
      }
    }

    for (const value of Object.values(record)) visit(value);
  };

  visit(data);
  return posts;
}
