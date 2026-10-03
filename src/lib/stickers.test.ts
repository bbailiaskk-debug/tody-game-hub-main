import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  giphyStickerText,
  giphyStickerUrlFromText,
  isStickerMessageText,
  STICKER_ASSETS,
  stickerById,
  stickerFromText,
  stickerIdFromText,
  stickerText,
} from "./stickers";

describe("the sticker catalog", () => {
  it("keeps every id unique, because the id is the message payload", () => {
    expect(new Set(STICKER_ASSETS.map((asset) => asset.id)).size).toBe(STICKER_ASSETS.length);
  });

  it("keeps every name unique, because it labels the tile for a screen reader", () => {
    expect(new Set(STICKER_ASSETS.map((asset) => asset.name)).size).toBe(STICKER_ASSETS.length);
  });

  it("only uses ids a token can carry", () => {
    for (const asset of STICKER_ASSETS) {
      expect(asset.id).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(stickerIdFromText(stickerText(asset.id))).toBe(asset.id);
    }
  });

  it("points at a file that really ships in public/стикер", () => {
    const folder = fileURLToPath(new URL("../../public/стикер/", import.meta.url));
    for (const asset of STICKER_ASSETS) {
      expect(existsSync(`${folder}${asset.file}`)).toBe(true);
    }
  });

  it("encodes the url, because the file names carry spaces", () => {
    for (const asset of STICKER_ASSETS) {
      expect(asset.url).toBe(`/стикер/${encodeURIComponent(asset.file)}`);
      expect(asset.url).not.toContain(" ");
    }
  });

  it("has nothing to show for a stale id", () => {
    expect(stickerById("long-gone-sticker")).toBeNull();
  });
});

describe("sticker tokens", () => {
  it("round trips an asset through the message text", () => {
    const asset = stickerById("cuddle-love");
    expect(asset).not.toBeNull();
    expect(stickerFromText(stickerText(asset!.id))).toBe(asset);
  });

  it("ignores surrounding whitespace", () => {
    expect(stickerIdFromText(`  ${stickerText("cuddle-love")}  `)).toBe("cuddle-love");
  });

  it("rejects ordinary text so a sentence is never mistaken for a sticker", () => {
    expect(stickerIdFromText("")).toBeNull();
    expect(stickerIdFromText("здравей")).toBeNull();
    expect(stickerIdFromText("виж [sticker:cuddle-love] тук")).toBeNull();
    expect(stickerIdFromText("https://example.com")).toBeNull();
    expect(stickerIdFromText("😀")).toBeNull();
  });

  it("keeps the id of a sticker this build no longer ships", () => {
    // The reader still has to know the message was a sticker.
    expect(stickerIdFromText(stickerText("retired-sticker"))).toBe("retired-sticker");
    expect(stickerFromText(stickerText("retired-sticker"))).toBeNull();
  });
});

describe("giphy sticker tokens", () => {
  const media = "https://media.giphy.com/media/abc123/giphy.gif";

  it("round trips a media url through the message text", () => {
    expect(giphyStickerUrlFromText(giphyStickerText(media)!)).toBe(media);
  });

  it("ignores surrounding whitespace", () => {
    expect(giphyStickerUrlFromText(`  ${giphyStickerText(media)}  `)).toBe(media);
  });

  it("refuses a url that is not http, so a token can never smuggle javascript", () => {
    expect(giphyStickerText("javascript:alert(1)")).toBeNull();
    expect(giphyStickerText("data:image/svg+xml,<svg/>")).toBeNull();
    expect(giphyStickerText("   ")).toBeNull();
  });

  it("rejects a url too long to be a sticker", () => {
    expect(giphyStickerText(`https://media.giphy.com/${"a".repeat(400)}.gif`)).toBeNull();
  });

  it("does not mistake ordinary text or a sentence for a sticker", () => {
    expect(giphyStickerUrlFromText("")).toBeNull();
    expect(giphyStickerUrlFromText("здравей")).toBeNull();
    expect(giphyStickerUrlFromText(`виж ${giphyStickerText(media)} тук`)).toBeNull();
    expect(giphyStickerUrlFromText("[giphy:media.giphy.com/x.gif]")).toBeNull();
    expect(giphyStickerUrlFromText("[giphy:]")).toBeNull();
  });

  it("does not mistake a bundled sticker token for a giphy one", () => {
    expect(giphyStickerUrlFromText(stickerText("cuddle-love"))).toBeNull();
    expect(stickerIdFromText(giphyStickerText(media)!)).toBeNull();
  });

  it("tells the reader that either token is a sticker message", () => {
    expect(isStickerMessageText(giphyStickerText(media)!)).toBe(true);
    expect(isStickerMessageText(stickerText("cuddle-love"))).toBe(true);
    expect(isStickerMessageText("just a sentence")).toBe(false);
  });
});
