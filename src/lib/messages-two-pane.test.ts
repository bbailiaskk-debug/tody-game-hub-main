// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import { TYPING_TTL_MS } from "./messages-protocol";
import type { ChatMessage, MessageChat, MessagesSnapshot } from "./messages-protocol";

const A = "alice@example.com";
const B = "bob@example.com";
const CHAT = "chat-a-b";

type World = {
  /** Per-account object state, the way the Durable Object holds it. */
  objects: Map<string, MessagesSnapshot>;
};

const msg = (id: string, fromMe: boolean, text: string, at: number): ChatMessage => ({
  id,
  fromMe,
  text,
  at,
  status: "read",
});

const world = (): World => {
  const base = (email: string, peer: string): MessagesSnapshot => ({
    profile: {
      email,
      name: email === A ? "Alice" : "Bob",
      about: "",
      accent: "#1DB954",
      avatar: null,
      online: true,
      lastSeenAt: Date.now(),
      status: "online",
    },
    contacts: [
      {
        id: `c-${peer}`,
        peerEmail: peer,
        name: peer === A ? "Alice" : "Bob",
        initials: "AB",
        about: "",
        accent: "#1DB954",
        avatar: null,
        online: true,
        lastSeenAt: Date.now(),
        lastSeenLabel: "",
        linked: true,
        status: "online",
      },
    ],
    chats: [
      {
        id: CHAT,
        peerEmail: peer,
        pinned: false,
        muted: false,
        updatedAt: Date.now(),
        messages: [],
      } as MessageChat,
    ],
    rev: 1,
    serverTime: Date.now(),
    typing: [],
  });

  const objects = new Map<string, MessagesSnapshot>([
    [A, base(A, B)],
    [B, base(B, A)],
  ]);
  return { objects };
};

/** A shared cloud the two stores talk to, exactly like the real gateway. */
const installCloud = (w: World) => {
  let current = A;

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input instanceof Request ? input.url : input);
    // Tolerate absolute URLs and trailing-slash differences.
    const url = raw.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    void method;
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    const me = current;
    const mine = w.objects.get(me);

    if (url.includes("/session")) return json({ ok: true, email: me, name: "Me" });
    if (url.includes("/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }

    if (url === "/api/messages/typing" && mine) {
      mine.typing = body.typing
        ? [...mine.typing, { chatId: body.chatId, peerEmail: body.peerEmail, at: Date.now() }]
        : mine.typing.filter((e) => !(e.chatId === body.chatId && e.peerEmail === body.peerEmail));
      // The peer's object receives the relayed signal.
      const peer = w.objects.get(body.peerEmail);
      if (peer && peer !== mine) {
        peer.typing = body.typing
          ? [...peer.typing, { chatId: body.chatId, peerEmail: me, at: Date.now() }]
          : peer.typing.filter((e) => !(e.chatId === body.chatId && e.peerEmail === me));
      }
      return json({ ok: true });
    }

    if (url === "/api/messages/message" && mine) {
      const chat = mine.chats.find((c) => c.id === body.chatId);
      if (chat) {
        chat.messages = [...chat.messages, msg(body.id, true, body.text, body.at)];
        chat.updatedAt = body.at;
      }
      // Mirror to the other account, as the gateway does.
      const peer = w.objects.get(body.peerEmail);
      const peerChat = peer?.chats.find((c) => c.id === body.chatId);
      if (peer && peerChat) {
        peerChat.messages = [...peerChat.messages, msg(body.id, false, body.text, body.at)];
        peerChat.updatedAt = body.at;
      }
      return json({ ok: true });
    }

    if (url === "/api/messages/chat") return json({ ok: true });

    if (url === "/api/messages" && mine) {
      const snap = w.objects.get(me) as MessagesSnapshot;
      return json({ ok: true, snapshot: structuredClone(snap) });
    }
    return json({ ok: true });
  });

  const switchTo = (email: string) => {
    current = email;
  };

  return { fetchStub, switchTo };
};

describe("two accounts, two panes, one cloud", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("a message from the conversation pane appears in the other account's list", async () => {
    const w = world();
    const { fetchStub, switchTo } = installCloud(w);
    vi.stubGlobal("fetch", fetchStub);

    // Bob opens the hub and the conversation.
    switchTo(B);
    await messagesStore.start();
    const chatId = messagesStore.openChatWithPeer(A);
    expect(chatId).toBe(CHAT);

    // Bob types in the big pane and sends.
    await messagesStore.sendMessage({
      chatId: chatId as string,
      peerEmail: A,
      text: "hi alice",
      attachments: [],
    });

    // Alice's device syncs and must see it in her list.
    switchTo(A);
    messagesStore.reset();
    await messagesStore.start();

    const list = messagesStore.getState().data?.chats ?? [];
    const herChat = list.find((c) => c.id === CHAT);
    expect(herChat?.messages.length).toBe(1);
    expect(herChat?.messages[0]?.text).toBe("hi alice");
    // It reads as incoming on her side.
    expect(herChat?.messages[0]?.fromMe).toBe(false);
  });

  it("her unread badge and the sender's sent state both settle", async () => {
    const w = world();
    const { fetchStub, switchTo } = installCloud(w);
    vi.stubGlobal("fetch", fetchStub);

    switchTo(B);
    await messagesStore.start();
    await messagesStore.sendMessage({
      chatId: messagesStore.openChatWithPeer(A) as string,
      peerEmail: A,
      text: "ping",
      attachments: [],
    });

    switchTo(A);
    messagesStore.reset();
    await messagesStore.start();
    await messagesStore.sync();

    const herChat = (messagesStore.getState().data?.chats ?? []).find((c) => c.id === CHAT);
    expect(herChat?.messages[0]?.fromMe).toBe(false);
    expect(herChat?.messages[0]?.status).toBe("read");
  });

  it("typing shows on the other side and clears when it stops", async () => {
    const w = world();
    const { fetchStub, switchTo } = installCloud(w);
    vi.stubGlobal("fetch", fetchStub);

    // Alice is in the conversation pane.
    switchTo(A);
    await messagesStore.start();
    const chatId = messagesStore.openChatWithPeer(B) as string;

    messagesStore.notifyTyping(chatId, B);
    expect(messagesStore.isPeerTyping(chatId)).toBe(false);

    // Bob's device, the list side, must light up.
    switchTo(B);
    messagesStore.reset();
    await messagesStore.start();
    await vi.waitFor(() => expect(messagesStore.isPeerTyping(CHAT)).toBe(true));

    // Alice lifts her hands off the keyboard, from her own device.
    switchTo(A);
    await messagesStore.start();
    messagesStore.stopTyping(chatId, B);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Bob's device must see the indicator go away.
    switchTo(B);
    messagesStore.reset();
    await messagesStore.start();
    await vi.waitFor(() => expect(messagesStore.isPeerTyping(CHAT)).toBe(false));
  });

  it("a device that joins mid-compose still renders the indicator", async () => {
    const w = world();
    const { fetchStub, switchTo } = installCloud(w);
    vi.stubGlobal("fetch", fetchStub);

    switchTo(A);
    await messagesStore.start();
    messagesStore.notifyTyping(CHAT, B);

    // Bob opens a second device fresh.
    switchTo(B);
    messagesStore.reset();
    await messagesStore.start();
    await vi.waitFor(() => expect(messagesStore.isPeerTyping(CHAT)).toBe(true));
  });

  it("a stale signal is dropped by the expiry window", async () => {
    const w = world();
    const { fetchStub, switchTo } = installCloud(w);
    vi.stubGlobal("fetch", fetchStub);

    switchTo(B);
    await messagesStore.start();
    w.objects
      .get(B)
      ?.typing.push({ chatId: CHAT, peerEmail: A, at: Date.now() - TYPING_TTL_MS - 1 });
    await vi.waitFor(() => expect(messagesStore.isPeerTyping(CHAT)).toBe(false));
  });

  it("both accounts keep their own identity and contact list", async () => {
    const w = world();
    const { fetchStub, switchTo } = installCloud(w);
    vi.stubGlobal("fetch", fetchStub);

    switchTo(A);
    await messagesStore.start();
    const aliceProfile = messagesStore.getState().data?.profile;
    const alicePeer = messagesStore.getState().data?.contacts?.[0]?.peerEmail;

    switchTo(B);
    messagesStore.reset();
    await messagesStore.start();
    const bobProfile = messagesStore.getState().data?.profile;
    const bobPeer = messagesStore.getState().data?.contacts?.[0]?.peerEmail;

    expect(aliceProfile?.email).toBe(A);
    expect(bobProfile?.email).toBe(B);
    expect(alicePeer).toBe(B);
    expect(bobPeer).toBe(A);
  });
});
