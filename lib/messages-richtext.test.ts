import { describe, expect, it } from "vitest";

import { isStickerText, linkHost, messageLinks, splitMessageLinks } from "./messages-richtext";

describe("link handling", () => {
  it("leaves plain prose untouched", () => {
    expect(splitMessageLinks("здравей, как си?")).toEqual([
      { kind: "text", value: "здравей, как си?" },
    ]);
  });

  it("finds a bare address", () => {
    expect(messageLinks("вземи https://example.com")).toEqual(["https://example.com"]);
  });

  it("keeps the prose around the address", () => {
    const parts = splitMessageLinks("вземи https://example.com сега");
    expect(parts).toEqual([
      { kind: "text", value: "вземи " },
      { kind: "link", value: "https://example.com" },
      { kind: "text", value: " сега" },
    ]);
  });

  it("does not swallow a trailing full stop", () => {
    const parts = splitMessageLinks("виж https://example.com.");
    expect(parts[1]).toEqual({ kind: "link", value: "https://example.com" });
    expect(parts[2]).toEqual({ kind: "text", value: "." });
  });

  it("handles several addresses in one message", () => {
    expect(messageLinks("a https://one.dev b http://two.dev")).toEqual([
      "https://one.dev",
      "http://two.dev",
    ]);
  });

  it("keeps path, query and hash so the link still resolves", () => {
    const address = "https://example.com/a/b?x=1&y=2#frag";
    expect(messageLinks(`виж ${address}`)).toEqual([address]);
  });

  it("ignores a bare domain without a scheme", () => {
    expect(messageLinks("пиши на example.com")).toEqual([]);
  });

  it("does not treat an angle-bracket delimited address as wider than the tag", () => {
    expect(messageLinks("<https://example.com>")).toEqual(["https://example.com"]);
  });

  it("reads the host for the card label", () => {
    expect(linkHost("https://www.example.com/a")).toBe("example.com");
    expect(linkHost("https://sub.example.co.uk")).toBe("sub.example.co.uk");
  });
});

describe("sticker detection", () => {
  it("accepts a single pictograph", () => {
    expect(isStickerText("😀")).toBe(true);
    expect(isStickerText("🔥")).toBe(true);
    expect(isStickerText("❤️")).toBe(true);
    expect(isStickerText("👍")).toBe(true);
  });

  it("accepts a modifier sequence such as a skin tone", () => {
    expect(isStickerText("👍🏽")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isStickerText("  🎉  ")).toBe(true);
  });

  it("rejects ordinary short text", () => {
    expect(isStickerText("ok")).toBe(false);
    expect(isStickerText("да")).toBe(false);
    expect(isStickerText("хаха")).toBe(false);
  });

  it("rejects an emoji mixed with words", () => {
    expect(isStickerText("😀 добре")).toBe(false);
    expect(isStickerText("добре 😀")).toBe(false);
  });

  it("rejects a long emoji run so it does not blow up the bubble", () => {
    expect(isStickerText("😀😀😀😀😀😀😀😀😀😀😀😀😀")).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(isStickerText("")).toBe(false);
    expect(isStickerText("   ")).toBe(false);
  });

  it("rejects a link, which should render as a link", () => {
    expect(isStickerText("https://example.com")).toBe(false);
  });
});
