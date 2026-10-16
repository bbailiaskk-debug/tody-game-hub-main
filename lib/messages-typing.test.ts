// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import { TYPING_TTL_MS, liveTyping } from "./messages-protocol";

const ME = "me@example.com";
const PEER = "friend@example.com";
const CHAT = "chat-1";

const snapshot = (typing: unknown[] = []) => ({
  profile: {
    email: ME,
    name: "Me",
    about: "",
    accent: "#1DB954",
    avatar: null,
    online: true,
    lastSeenAt: Date.now(),
  },
  contacts: [],
  chats: [
    { id: CHAT, peerEmail: PEER, pinned: false, muted: false, updatedAt: Date.now(), messages: [] },
  ],
  rev: 1,
  serverTime: Date.now(),
  typing,
});

const install = () => {
  const sent: Array<{ chatId: string; peerEmail: string; typing: boolean }> = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.includes("/session")) return json({ ok: true, email: ME, name: "Me" });
    if (url.includes("/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }
    if (url === "/api/messages/typing") {
      sent.push(JSON.parse(String(init?.body)));
      return json({ ok: true });
    }
    if (url === "/api/messages/chat") return json({ ok: true });
    if (url === "/api/messages/") return json({ ok: true, snapshot: snapshot() });
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", mock);
  return { sent, mock };
};

describe("typing indicator", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("signals typing to the peer on the first keystroke", async () => {
    const { sent } = install();
    await messagesStore.start();

    messagesStore.notifyTyping(CHAT, PEER);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ chatId: CHAT, peerEmail: PEER, typing: true });
  });

  it("throttles a fast typist to one signal per window", async () => {
    const { sent } = install();
    await messagesStore.start();

    messagesStore.notifyTyping(CHAT, PEER);
    messagesStore.notifyTyping(CHAT, PEER);
    messagesStore.notifyTyping(CHAT, PEER);

    expect(sent).toHaveLength(1);
  });

  it("never shows the sender their own outgoing signal", async () => {
    install();
    await messagesStore.start();

    expect(messagesStore.isPeerTyping(CHAT)).toBe(false);
    messagesStore.notifyTyping(CHAT, PEER);
    // state.typing only ever holds signals received from the cloud, so the
    // person typing must not see their own indicator in the header.
    expect(messagesStore.isPeerTyping(CHAT)).toBe(false);
  });

  it("stops on send and relays the stop to the peer", async () => {
    const { sent } = install();
    await messagesStore.start();

    messagesStore.notifyTyping(CHAT, PEER);
    messagesStore.stopTyping(CHAT, PEER);

    expect(sent.at(-1)).toMatchObject({ chatId: CHAT, typing: false });
    expect(messagesStore.isPeerTyping(CHAT)).toBe(false);
  });

  it("does not signal for a conversation with no linked account", async () => {
    const { sent } = install();
    await messagesStore.start();

    messagesStore.notifyTyping(CHAT, "");

    expect(sent).toHaveLength(0);
  });

  it("expires a stale signal so the bubble cannot stick", () => {
    const now = Date.now();
    const entries = [
      { chatId: "a", peerEmail: "x@y.com", at: now - 1_000 },
      { chatId: "b", peerEmail: "z@y.com", at: now - TYPING_TTL_MS - 1_000 },
    ];

    const live = liveTyping(entries, now);

    expect(live).toHaveLength(1);
    expect(live[0]?.chatId).toBe("a");
  });

  it("renders a signal that arrives in a snapshot, for a device that just joined", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/session")) return json({ ok: true, email: ME, name: "Me" });
      if (url.includes("/friend/list")) {
        return json({
          ok: true,
          friends: { incoming: [], outgoing: [], friends: [], declined: [] },
        });
      }
      if (url === "/api/messages/") {
        return json({
          ok: true,
          snapshot: snapshot([{ chatId: CHAT, peerEmail: PEER, at: Date.now() }]),
        });
      }
      return json({ ok: true });
    });
    vi.stubGlobal("fetch", mock);

    await messagesStore.start();

    expect(messagesStore.isPeerTyping(CHAT)).toBe(true);
  });
});
