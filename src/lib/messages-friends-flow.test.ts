// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import type { MessagesSnapshot } from "./messages-protocol";

const ME = "me@example.com";
const PEER = "friend@example.com";

const profile = {
  email: ME,
  name: "Me",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: Date.now(),
  status: "online" as const,
};

const peerContact = {
  id: "c1",
  peerEmail: PEER,
  name: "Friend",
  initials: "FR",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: Date.now(),
  lastSeenLabel: "",
  linked: true,
  status: "online" as const,
};

const snapshot = (over: Partial<MessagesSnapshot> = {}): MessagesSnapshot => ({
  profile,
  contacts: [peerContact],
  chats: [],
  rev: 1,
  serverTime: Date.now(),
  typing: [],
  ...over,
});

/** Builds a fetch stub driven by a mutable cloud snapshot. */
const installCloud = () => {
  const state = { snap: snapshot() };
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (url.includes("/session")) return json({ ok: true, email: ME, name: "Me" });
    if (url.includes("/friend/list")) {
      return json({
        ok: true,
        friends: { incoming: [], outgoing: [], friends: [], declined: [] },
      });
    }
    // Opening a conversation persists the row, exactly like the object does.
    if (url === "/api/messages/chat" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { chatId: string; peerEmail: string };
      if (!state.snap.chats.some((chat) => chat.id === body.chatId)) {
        state.snap = {
          ...state.snap,
          chats: [
            {
              id: body.chatId,
              peerEmail: body.peerEmail,
              pinned: false,
              muted: false,
              updatedAt: Date.now(),
              messages: [],
            },
            ...state.snap.chats,
          ],
        };
      }
      return json({ ok: true });
    }
    if (url === "/api/messages/") {
      // A message write mutates the "cloud" the same way the object would.
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          id: string;
          chatId: string;
          peerEmail: string;
          text: string;
          at: number;
        };
        const chats = state.snap.chats.map((chat) =>
          chat.id === body.chatId
            ? {
                ...chat,
                updatedAt: body.at,
                messages: [
                  ...chat.messages,
                  {
                    id: body.id,
                    fromMe: true,
                    text: body.text,
                    at: body.at,
                    status: "read" as const,
                  },
                ],
              }
            : chat,
        );
        state.snap = { ...state.snap, chats };
      }
      return json({ ok: true, snapshot: state.snap });
    }
    return json({ ok: true });
  });
  vi.stubGlobal("fetch", mock);
  return { state, mock };
};

describe("friends → chat flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  const boot = async () => {
    installCloud();
    await messagesStore.start();
  };

  /** Lets the store's own fire-and-forget syncs settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("keeps a freshly opened friend chat after the next cloud sync", async () => {
    await boot();

    const chatId = messagesStore.openChatWithPeer(PEER);
    expect(chatId).toBeTruthy();
    await settle();

    // The push from the other device triggers a sync, which is where a
    // device-only chat used to disappear.
    await messagesStore.sync();

    const chats = messagesStore.getState().data?.chats ?? [];
    expect(chats.some((chat) => chat.id === chatId)).toBe(true);
    expect(chats.some((chat) => chat.peerEmail === PEER)).toBe(true);
  });

  it("survives repeated syncs without losing the open chat", async () => {
    await boot();
    const chatId = messagesStore.openChatWithPeer(PEER);
    await settle();

    await messagesStore.sync();
    await messagesStore.sync();
    await messagesStore.sync();

    expect(messagesStore.getState().data?.chats.some((c) => c.id === chatId)).toBe(true);
  });

  it("returns the same chat id when opening the same friend twice", async () => {
    await boot();
    const first = messagesStore.openChatWithPeer(PEER);
    const second = messagesStore.openChatWithPeer(PEER);
    expect(second).toBe(first);
  });

  it("reuses a chat that already exists in the cloud", async () => {
    const { state } = installCloud();
    state.snap = snapshot({
      chats: [
        {
          id: "cloud-chat",
          peerEmail: PEER,
          pinned: false,
          muted: false,
          updatedAt: Date.now(),
          messages: [{ id: "m0", fromMe: false, text: "hi", at: Date.now(), status: "read" }],
        },
      ],
    });
    await messagesStore.start();

    expect(messagesStore.openChatWithPeer(PEER)).toBe("cloud-chat");
  });

  it("persists a message into a brand new friend chat", async () => {
    await boot();
    const chatId = messagesStore.openChatWithPeer(PEER);
    expect(chatId).toBeTruthy();

    const sent = await messagesStore.sendMessage({
      chatId: chatId as string,
      peerEmail: PEER,
      text: "first message",
      attachments: [],
    });
    expect(sent.ok).toBe(true);

    await messagesStore.sync();

    const chat = messagesStore.getState().data?.chats.find((item) => item.id === chatId);
    expect(chat?.messages.length).toBe(1);
    expect(chat?.messages[0]?.text).toBe("first message");
  });

  it("keeps a local message while an outbox flush is still pending", async () => {
    await boot();
    const chatId = messagesStore.openChatWithPeer(PEER) as string;

    await messagesStore.sendMessage({
      chatId,
      peerEmail: PEER,
      text: "queued",
      attachments: [],
    });

    // Immediately after sending, before any sync lands, the bubble must render.
    const optimistic = messagesStore.getState().data?.chats.find((item) => item.id === chatId);
    expect(optimistic?.messages[0]?.text).toBe("queued");
  });
});
