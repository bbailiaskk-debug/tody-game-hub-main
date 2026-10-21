import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetYoutubeCacheForTests, loadYoutubeFeed } from "./youtube-functions";

type FetchHandler = (url: URL) => unknown;

const originalFetch = globalThis.fetch;
const originalCFEnv = (globalThis as typeof globalThis & { CF_ENV?: unknown }).CF_ENV;

function setEnv(values: Record<string, string>) {
  (globalThis as typeof globalThis & { CF_ENV?: Record<string, string> }).CF_ENV = values;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Routes a fake YouTube API by endpoint name. Anything not answered is a 404,
 * so a call that was not meant to happen fails loudly rather than passing.
 */
function installFetch(handlers: Record<string, FetchHandler>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const endpoint = url.pathname.split("/").pop() ?? "";
    calls.push(endpoint);
    const handler = handlers[endpoint];
    if (!handler) return jsonResponse({ error: { message: "not mocked" } }, 404);
    const result = handler(url);
    // A handler may answer with a status of its own, for the calls the api
    // refuses rather than the ones it serves.
    if (result && typeof result === "object" && "status" in result && "body" in result) {
      const failure = result as { status: number; body: unknown };
      return jsonResponse(failure.body, failure.status);
    }
    return jsonResponse(result);
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { calls, fetchMock };
}

const thumbnails = {
  default: { url: "https://i.ytimg.com/vi/x/default.jpg", width: 120, height: 90 },
  high: { url: "https://i.ytimg.com/vi/x/hqdefault.jpg", width: 480, height: 360 },
};

/**
 * A channel whose uploads playlist id is derived from the channel id, so two
 * tests never share a cache entry.
 */
function channelHandler(channelId: string): FetchHandler {
  return () => ({
    items: [
      {
        id: channelId,
        snippet: {
          title: "Test Channel",
          description: "A channel",
          thumbnails: { high: { url: "https://yt3.example/avatar.jpg", width: 800, height: 800 } },
        },
        contentDetails: { relatedPlaylists: { uploads: `UU_${channelId}` } },
        statistics: { subscriberCount: "48", videoCount: "84", viewCount: "12202" },
      },
    ],
  });
}

const playlistsHandler: FetchHandler = () => ({
  items: [
    {
      id: "PL_ONE",
      snippet: { title: "Playlist One", thumbnails: { default: thumbnails.default } },
      contentDetails: { itemCount: 5 },
    },
  ],
});

function playlistItemsHandler(videoIds: string[], liveIds: string[] = []): FetchHandler {
  return () => ({
    items: videoIds.map((videoId, index) => ({
      snippet: {
        title: `Video ${index + 1}`,
        publishedAt: "2026-10-14T00:32:58Z",
        thumbnails: { high: thumbnails.high },
        liveBroadcastContent: liveIds.includes(videoId) ? "live" : "none",
        resourceId: { kind: "youtube#video", videoId },
      },
      contentDetails: { videoId },
    })),
  });
}

function videosHandler(
  entries: Array<{ id: string; duration: string; views: string; live?: boolean }>,
): FetchHandler {
  return () => ({
    items: entries.map((entry) => ({
      id: entry.id,
      snippet: {
        title: `Title ${entry.id}`,
        description: "",
        publishedAt: "2026-10-14T00:32:58Z",
        thumbnails: { high: thumbnails.high },
        liveBroadcastContent: entry.live ? "live" : "none",
      },
      contentDetails: {
        duration: entry.duration,
        liveBroadcastContent: entry.live ? "live" : "none",
      },
      statistics: { viewCount: entry.views, likeCount: "3" },
    })),
  });
}

beforeEach(() => {
  __resetYoutubeCacheForTests();
  setEnv({ YOUTUBE_API_KEY: "test-key", YOUTUBE_CHANNEL_ID: "UC_TEST_CHANNEL" });
});

afterEach(() => {
  __resetYoutubeCacheForTests();
  globalThis.fetch = originalFetch;
  if (originalCFEnv === undefined) {
    delete (globalThis as typeof globalThis & { CF_ENV?: unknown }).CF_ENV;
  } else {
    (globalThis as typeof globalThis & { CF_ENV?: unknown }).CF_ENV = originalCFEnv;
  }
  vi.restoreAllMocks();
});

describe("loadYoutubeFeed", () => {
  it("assembles the channel, videos, playlists and live streams", async () => {
    setEnv({ YOUTUBE_API_KEY: "test-key", YOUTUBE_CHANNEL_ID: "UC_FULL_CHANNEL" });
    installFetch({
      channels: channelHandler("UC_FULL_CHANNEL"),
      playlists: playlistsHandler,
      playlistItems: playlistItemsHandler(["vid00000001"], ["vid00000001"]),
      videos: videosHandler([
        { id: "vid00000001", duration: "PT1H15M34S", views: "29", live: true },
      ]),
      search: () => ({ items: [] }),
      community: () => "<html></html>",
    });

    const feed = await loadYoutubeFeed();

    expect(feed.channel).toMatchObject({
      id: "UC_FULL_CHANNEL",
      title: "Test Channel",
      subscriberCount: 48,
      videoCount: 84,
      viewCount: 12202,
      thumbnail: "https://yt3.example/avatar.jpg",
    });
    expect(feed.live.map((video) => video.id)).toEqual(["vid00000001"]);
    expect(feed.live[0]).toMatchObject({
      isLive: true,
      durationSeconds: null,
      embedUrl: expect.stringContaining("youtube-nocookie.com/embed/vid00000001"),
    });
    expect(feed.playlists).toEqual([
      {
        id: "PL_ONE",
        title: "Playlist One",
        thumbnail: thumbnails.default.url,
        itemCount: 5,
        url: "https://www.youtube.com/playlist?list=PL_ONE",
      },
    ]);
  });

  it("keeps the feed whole when the live search fails", async () => {
    setEnv({ YOUTUBE_API_KEY: "test-key", YOUTUBE_CHANNEL_ID: "UC_BROKEN_SEARCH" });
    installFetch({
      channels: channelHandler("UC_BROKEN_SEARCH"),
      playlists: playlistsHandler,
      playlistItems: playlistItemsHandler(["vid00000003"]),
      videos: videosHandler([{ id: "vid00000003", duration: "PT2M", views: "10" }]),
      search: () => ({ error: { message: "quota exceeded" } }),
      community: () => "<html></html>",
    });

    const feed = await loadYoutubeFeed();

    expect(feed.videos.map((video) => video.id)).toEqual(["vid00000003"]);
    expect(feed.live).toEqual([]);
  });

  it("answers from the cache instead of spending the quota again", async () => {
    setEnv({ YOUTUBE_API_KEY: "test-key", YOUTUBE_CHANNEL_ID: "UC_CACHED_CHANNEL" });
    const { calls } = installFetch({
      channels: channelHandler("UC_CACHED_CHANNEL"),
      playlists: playlistsHandler,
      playlistItems: playlistItemsHandler(["vid00000004"]),
      videos: videosHandler([{ id: "vid00000004", duration: "PT1M", views: "1" }]),
      search: () => ({ items: [] }),
      community: () => "<html></html>",
    });

    await loadYoutubeFeed();
    const firstPass = [...calls];
    await loadYoutubeFeed();
    const secondPass = calls.slice(firstPass.length);

    expect(firstPass.sort()).toEqual(
      ["channels", "community", "playlistItems", "playlists", "search", "search", "search", "videos"].sort(),
    );
    expect(secondPass).toEqual([]);
  });

  it("reports a missing key rather than calling the api", async () => {
    setEnv({ YOUTUBE_CHANNEL_ID: "UC_NO_KEY_CHANNEL" });
    const { calls } = installFetch({});

    await expect(loadYoutubeFeed()).rejects.toMatchObject({ reason: "not-configured" });
    expect(calls).toEqual([]);
  });

  it("reports a channel that does not exist", async () => {
    setEnv({ YOUTUBE_API_KEY: "test-key", YOUTUBE_CHANNEL_ID: "UC_MISSING_CHANNEL" });
    installFetch({ channels: () => ({ items: [] }) });

    await expect(loadYoutubeFeed()).rejects.toMatchObject({ reason: "not-found" });
  });

  it("reports a key the api refused", async () => {
    setEnv({ YOUTUBE_API_KEY: "bad-key", YOUTUBE_CHANNEL_ID: "UC_BAD_KEY_CHANNEL" });
    installFetch({
      channels: () => ({
        status: 403,
        body: { error: { message: "bad key", errors: [{ reason: "keyInvalid" }] } },
      }),
    });

    await expect(loadYoutubeFeed()).rejects.toMatchObject({ reason: "not-configured" });
  });

  it("reports a key that ran out of quota", async () => {
    setEnv({ YOUTUBE_API_KEY: "tired-key", YOUTUBE_CHANNEL_ID: "UC_TIRED_KEY_CHANNEL" });
    installFetch({
      channels: () => ({
        status: 403,
        body: { error: { message: "quota", errors: [{ reason: "dailyLimitExceeded" }] } },
      }),
    });

    await expect(loadYoutubeFeed()).rejects.toMatchObject({ reason: "unknown" });
  });
});
