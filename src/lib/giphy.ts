/**
 * A small Giphy client for the sticker tray.
 *
 * Giphy answers with a big nested payload and a `fixed_height` image per
 * result, so the module maps that down to the three fields the picker actually
 * draws and throws the rest away. Nothing is fetched until a sticker panel is
 * opened, and identical queries reuse the first answer, because the trending
 * list is requested every time the panel opens.
 *
 * The key comes from the build, so it is a public Giphy key by design and must
 * never be anything secret.
 */

/**
 * Giphy keeps stickers and gif loops in two separate collections, each with its
 * own trending list and its own search. They answer the same shape, so one
 * client serves both and the picker only chooses the collection.
 */
export type GiphyCollection = "stickers" | "gifs";

/** A single Giphy sticker, reduced to what a grid tile and a bubble need. */
export type GiphySticker = {
  /** Giphy's own id, kept for keys and for a stable title. */
  id: string;
  /** The animated file, what a sent sticker points at. */
  url: string;
  /** A smaller still for the grid, so a long list stays cheap. */
  preview: string;
  /** What the sticker depicts, for the button label and the alt text. */
  title: string;
  width: number;
  height: number;
};

const API_ROOT = "https://api.giphy.com/v1";
const LIMIT = 24;
const CACHE_LIMIT = 48;

type GiphyImages = {
  fixed_height?: { url?: string; width?: string; height?: string };
  fixed_height_small?: { url?: string };
};

type GiphyResult = {
  id?: string;
  title?: string;
  images?: GiphyImages;
};

const cache = new Map<string, GiphySticker[]>();

/**
 * The configured key, or an empty string. Read through `import.meta.env` in a
 * guard so the module also loads under a plain node test runner.
 */
export const giphyApiKey = () => {
  const env = typeof import.meta === "object" ? import.meta.env : undefined;
  const key = (env?.["VITE_GIPHY_API_KEY"] as string | undefined) ?? "";
  return key.trim();
};

/** The picker shows a setup hint instead of an empty grid when there is no key. */
export const giphyConfigured = () => giphyApiKey().length > 0;

const positiveInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

/** Keeps a malformed result from putting an empty `src` on an image. */
const toSticker = (result: GiphyResult | null): GiphySticker | null => {
  const id = String(result?.id ?? "").trim();
  const url = String(result?.images?.fixed_height?.url ?? "").trim();
  if (!id || !url.startsWith("https://")) return null;
  const preview = String(result?.images?.fixed_height_small?.url ?? "").trim();
  return {
    id,
    url,
    preview: preview.startsWith("https://") ? preview : url,
    title: String(result?.title ?? "").trim() || "Sticker",
    width: positiveInt(result?.images?.fixed_height?.width),
    height: positiveInt(result?.images?.fixed_height?.height),
  };
};

/**
 * Fetches one page of a collection. Returns an empty list for a missing key or
 * a failed request, because the picker shows the same hint either way and the
 * user can always retry by typing.
 */
export const searchGiphy = async (options?: {
  query?: string;
  collection?: GiphyCollection;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}) => {
  const apiKey = giphyApiKey();
  if (!apiKey) return [];

  const query = (options?.query ?? "").trim();
  const collection = options?.collection ?? "stickers";
  // No query means the trending list, which Giphy names per collection.
  const path = query ? `${collection}/search` : `${collection}/trending`;
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(LIMIT),
    // Chat stickers should stay tame, the same rating Discord and WhatsApp use.
    rating: "g",
    // The lang param is what Giphy calls a content filter.
    lang: "en",
  });
  if (query) params.set("q", query);

  const request = async () => {
    const doFetch = options?.fetchImpl ?? fetch;
    const response = await doFetch(`${API_ROOT}/${path}?${params.toString()}`, {
      ...(options?.signal ? { signal: options.signal } : {}),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`giphy ${response.status}`);
    const body = (await response.json()) as { data?: GiphyResult[] };
    return (Array.isArray(body?.data) ? body.data : [])
      .map(toSticker)
      .filter((sticker): sticker is GiphySticker => sticker !== null);
  };

  // The collection is part of the key, so switching tabs never shows the
  // stickers answer for the gif tab.
  const cacheKey = `${collection}:${path}:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const stickers = await request();
    // Only successful answers are cached, so a dropped connection can be retried.
    if (stickers.length > 0) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(cacheKey, stickers);
    }
    return stickers;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return [];
  }
};

/** Clears the memo, used by the tests to keep each case independent. */
export const resetGiphyCache = () => cache.clear();
