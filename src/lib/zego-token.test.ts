// The ZEGOCLOUD token, checked against the format their own reference
// implementation writes.
//
// A token is not something a person can look at and see whether it is right: it
// is a claim about one user, encrypted, that ZEGOCLOUD checks before it opens a
// room. So the checks here are the ones a wrong implementation would fail — the
// version prefix, the header widths, and above all that the cipher opens with the
// ServerSecret and says exactly who it is about. A token that verifies here is a
// token ZEGOCLOUD can read; one that does not is a call that never connects and no
// explanation why.

import { describe, expect, it } from "vitest";

import { readZegoToken04, zegoToken04, ZegoTokenError, ZEGO_TOKEN_SECONDS } from "./zego-token";

const APP_ID = 1523622791;
const SECRET = "0123456789abcdef0123456789abcdef";

const NOW = 1_762_000_000_000;

const mint = (over: Partial<Parameters<typeof zegoToken04>[0]> = {}) =>
  zegoToken04({ appId: APP_ID, serverSecret: SECRET, userId: "me@example.com", now: NOW, ...over });

describe("a token for one person", () => {
  it("is a version 04 token, which is the string ZEGOCLOUD looks for first", async () => {
    const token = await mint();
    expect(token.startsWith("04")).toBe(true);
    // "04" then base64 of a header (28 bytes), an IV (16) and the cipher.
    expect(token.length).toBeGreaterThan(2 + 40);
  });

  it("opens with the ServerSecret and says who it is about", async () => {
    const read = await readZegoToken04(await mint(), SECRET);
    expect(read.version).toBe("04");
    expect(read.claim).toMatchObject({
      app_id: APP_ID,
      user_id: "me@example.com",
      ctime: Math.floor(NOW / 1000),
      expire: Math.floor(NOW / 1000) + ZEGO_TOKEN_SECONDS,
    });
  });

  it("does not open with anything else", async () => {
    const token = await mint();
    // The whole reason the secret stays on the server: a token read with a guess
    // must not come apart, or the AppSign would have been enough.
    await expect(readZegoToken04(token, "ffffffffffffffffffffffffffffffff")).rejects.toThrow();
  });

  it("names a different person in a different token", async () => {
    const mine = await readZegoToken04(await mint({ userId: "me@example.com" }), SECRET);
    const theirs = await readZegoToken04(await mint({ userId: "you@example.com" }), SECRET);
    expect(mine.claim?.user_id).toBe("me@example.com");
    expect(theirs.claim?.user_id).toBe("you@example.com");
  });

  it("carries the expiry in the header, for the client to read without the key", async () => {
    const token = await mint({ seconds: 3600 });
    const expected = Math.floor(NOW / 1000) + 3600;
    // Without a secret: the SDK and the app can both see when it dies, which is
    // what makes renewing it before it expires possible at all.
    expect((await readZegoToken04(token)).expire).toBe(expected);
    expect((await readZegoToken04(token, SECRET)).claim?.expire).toBe(expected);
  });

  it("is never the same string twice, so a captured one cannot be replayed", async () => {
    const tokens = new Set<string>();
    for (let attempt = 0; attempt < 8; attempt += 1) tokens.add(await mint());
    expect(tokens.size).toBe(8);
  });

  it("carries a payload through when one is asked for", async () => {
    const read = await readZegoToken04(
      await mint({ payload: { room_id: "guild-1", privilege: 1 } }),
      SECRET,
    );
    expect(read.claim?.payload).toEqual({ room_id: "guild-1", privilege: 1 });
  });

  it("has no payload by default, which is a general token rather than a restricted one", async () => {
    const read = await readZegoToken04(await mint(), SECRET);
    expect(read.claim?.payload).toBe("");
  });
});

describe("refusing what would make a token that cannot work", () => {
  it("will not accept an AppID that is not the project's number", async () => {
    // The AppID travels in the claim as a number, so a string that looks like one
    // would produce a claim ZEGOCLOUD rejects at the far end.
    await expect(mint({ appId: Number.NaN })).rejects.toThrow(ZegoTokenError);
    await expect(mint({ appId: 0 })).rejects.toThrow(ZegoTokenError);
  });

  it("will not accept a ServerSecret of the wrong length", async () => {
    // AES takes 16, 24 or 32 bytes. Anything else is a different key, and a token
    // that does not verify is a call that never connects.
    await expect(mint({ serverSecret: "too short" })).rejects.toThrow(ZegoTokenError);
    await expect(mint({ serverSecret: `${SECRET}extra` })).rejects.toThrow(ZegoTokenError);
  });

  it("takes the 24 character secret too, because that is a valid AES key", async () => {
    const token = await mint({ serverSecret: "0123456789abcdef01234567" });
    expect((await readZegoToken04(token, "0123456789abcdef01234567")).claim?.user_id).toBe(
      "me@example.com",
    );
  });

  it("will not mint a token for nobody", async () => {
    await expect(mint({ userId: "" })).rejects.toThrow(ZegoTokenError);
  });

  it("will not mint one valid for longer than ZEGOCLOUD allows", async () => {
    // Over 24 days is refused by them, so refusing it here turns a call that
    // silently cannot authenticate into a loud configuration error.
    await expect(mint({ seconds: 25 * 24 * 60 * 60 })).rejects.toThrow(ZegoTokenError);
    await expect(mint({ seconds: 0 })).rejects.toThrow(ZegoTokenError);
  });
});

describe("reading a token back", () => {
  it("says so when it is handed something that is not one", async () => {
    await expect(readZegoToken04("nonsense")).rejects.toThrow(ZegoTokenError);
    // A version 03 token is a different scheme entirely, so it must not be read
    // as though it were this one.
    await expect(readZegoToken04("03abc")).rejects.toThrow(ZegoTokenError);
  });

  it("refuses a token too short to carry its own header", async () => {
    await expect(readZegoToken04(`04${btoa("short")}`)).rejects.toThrow(ZegoTokenError);
  });
});
