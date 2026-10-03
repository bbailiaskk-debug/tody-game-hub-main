import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { giphyApiKey, giphyConfigured, resetGiphyCache, searchGiphy } from "./giphy";

const STICKER_PAYLOAD = {
  data: [
    {
      id: "abc123",
      title: "Happy dance",
      images: {
        fixed_height: {
          url: "https://media.giphy.com/media/abc123/giphy.gif",
          width: "200",
          height: "200",
        },
        fixed_height_small: { url: "https://media.giphy.com/media/abc123/200w_s.gif" },
      },
    },
  ],
};

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe("the giphy client", () => {
  beforeEach(() => {
    resetGiphyCache();
    vi.stubEnv("VITE_GIPHY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads the key from the build", () => {
    expect(giphyApiKey()).toBe("test-key");
    expect(giphyConfigured()).toBe(true);
  });

  it("asks for the trending stickers with no query", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(STICKER_PAYLOAD));
    const stickers = await searchGiphy({ fetchImpl });

    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("https://api.giphy.com/v1/stickers/trending?");
    expect(url).toContain("api_key=test-key");
    expect(url).not.toContain("q=");
    expect(stickers).toHaveLength(1);
    expect(stickers[0]!.url).toBe("https://media.giphy.com/media/abc123/giphy.gif");
    expect(stickers[0]!.preview).toBe("https://media.giphy.com/media/abc123/200w_s.gif");
    expect(stickers[0]!.title).toBe("Happy dance");
    expect(stickers[0]!.width).toBe(200);
  });

  it("searches when a query is given", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(STICKER_PAYLOAD));
    await searchGiphy({ query: "cat", fetchImpl });

    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("/v1/stickers/search?");
    expect(url).toContain("q=cat");
  });

  it("reaches the gif collection, which is a different endpoint", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(STICKER_PAYLOAD));
    await searchGiphy({ collection: "gifs", fetchImpl });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(
      "https://api.giphy.com/v1/gifs/trending?",
    );

    await searchGiphy({ collection: "gifs", query: "cat", fetchImpl });
    expect(String(fetchImpl.mock.calls[1]![0])).toContain("https://api.giphy.com/v1/gifs/search?");
  });

  it("keeps the two collections apart in the cache", async () => {
    // Without this, switching tabs would show the stickers answer for gifs.
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(STICKER_PAYLOAD));
    await searchGiphy({ collection: "stickers", fetchImpl });
    await searchGiphy({ collection: "gifs", fetchImpl });
    await searchGiphy({ collection: "stickers", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("drops results that would put an empty src on an image", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: "no-images", title: "broken" },
          { id: "no-url", images: { fixed_height: { url: "http://insecure.example/x.gif" } } },
          ...STICKER_PAYLOAD.data,
        ],
      }),
    );
    const stickers = await searchGiphy({ fetchImpl });
    expect(stickers.map((sticker) => sticker.id)).toEqual(["abc123"]);
  });
  it("falls back to the full image when there is no small preview", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ id: "x", images: { fixed_height: { url: "https://a.example/b.gif" } } }],
      }),
    );
    const stickers = await searchGiphy({ fetchImpl });
    expect(stickers[0]!.preview).toBe("https://a.example/b.gif");
    expect(stickers[0]!.title).toBe("Sticker");
  });

  it("returns nothing without a key, so the picker can show a setup hint", async () => {
    vi.stubEnv("VITE_GIPHY_API_KEY", "");
    const fetchImpl = vi.fn(async () => jsonResponse(STICKER_PAYLOAD));
    expect(giphyConfigured()).toBe(false);
    expect(await searchGiphy({ fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns nothing when giphy answers with an error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429 }) as Response);
    expect(await searchGiphy({ fetchImpl })).toEqual([]);
  });

  it("reuses an answer instead of asking twice for the same query", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(STICKER_PAYLOAD));
    await searchGiphy({ query: "cat", fetchImpl });
    await searchGiphy({ query: "CAT", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed query, so the reader can retry", async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce(jsonResponse(STICKER_PAYLOAD));
    expect(await searchGiphy({ query: "cat", fetchImpl })).toEqual([]);
    expect(await searchGiphy({ query: "cat", fetchImpl })).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
