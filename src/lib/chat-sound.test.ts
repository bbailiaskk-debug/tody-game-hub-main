// The chat sounds: the files really ship, and the rule about when to make a
// noise is the part worth asserting on its own.

import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { shouldAnnounce } from "./chat-sound";

const soundFolder = fileURLToPath(new URL("../../public/звук на чята/", import.meta.url));
const incomingFile = fileURLToPath(
  new URL(
    "../../public/звук на чята/universfield-message-notification-124467.mp3",
    import.meta.url,
  ),
);
const sentFile = fileURLToPath(new URL("../../public/звук на чята/изпратено.wav", import.meta.url));

describe("the chat sounds", () => {
  it("both point at files that really ship in the chat sound folder", () => {
    expect(existsSync(soundFolder)).toBe(true);
    expect(existsSync(incomingFile)).toBe(true);
    expect(existsSync(sentFile)).toBe(true);
  });

  it("keeps the received notification a real audio file", () => {
    const head = readFileSync(incomingFile).subarray(0, 4);
    // An MP3 is either an ID3 tag or a raw MPEG frame; both start with these.
    const isId3 = head.toString("ascii") === "ID3";
    const isFrame = (head[0] ?? 0) === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0;
    expect(isId3 || isFrame).toBe(true);
    expect(statSync(incomingFile).size).toBeLessThan(256 * 1024);
  });

  it("makes the sent sound a short wav, so it reads as a click", () => {
    const bytes = readFileSync(sentFile);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    // Under a quarter of a second: long enough to hear, short enough to ignore.
    expect(bytes.readUInt32LE(40) / 2 / bytes.readUInt32LE(24)).toBeLessThan(0.25);
    expect(bytes.length).toBeLessThan(32 * 1024);
  });

  it("keeps the sent sound quiet, because the user already pressed the button", () => {
    let peak = 0;
    const bytes = readFileSync(sentFile);
    for (let i = 44; i + 1 < bytes.length; i += 2) {
      peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
    }
    expect(peak / 32_767).toBeLessThan(0.4);
  });
});

describe("when a message is worth a sound", () => {
  it("is quiet for a conversation already on screen", () => {
    expect(shouldAnnounce({ chatId: "chat-1", activeChatId: "chat-1", visible: true })).toBe(false);
  });

  it("sounds for a different conversation", () => {
    expect(shouldAnnounce({ chatId: "chat-2", activeChatId: "chat-1", visible: true })).toBe(true);
  });

  it("sounds for the open conversation when the tab is in the background", () => {
    expect(shouldAnnounce({ chatId: "chat-1", activeChatId: "chat-1", visible: false })).toBe(true);
  });

  it("sounds when no conversation is open yet", () => {
    expect(shouldAnnounce({ chatId: "chat-1", activeChatId: null, visible: true })).toBe(true);
  });
});
