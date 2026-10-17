// @vitest-environment jsdom
//
// The store's side of an edit or a delete: applied locally first so the bubble
// answers the finger, then pushed to the object, which mirrors it to the peer.
// A refused change is undone by the sync that follows, which is what keeps the
// bubble from keeping text the cloud never accepted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import type { ChatMessage, MessagesSnapshot } from "./messages-protocol";

const ME = "me@example.com";
const PEER = "peer@example.com";
const CHAT = "chat-1";

const mine = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  fromMe: true,
  text: "teh typo",
  at: Date.now() - 60_000,
  status: "read",
  ...over,
});

const snapshot = (messages: ChatMessage[]): MessagesSnapshot => ({
  profile: {
    email: ME,
    name: "Me",
    about: "",
    accent: "#1DB954",
    avatar: null,
    online: true,
    lastSeenAt: Date.now(),
    status: "online",
  },
  contacts: [
    {
      id: "c1",
      peerEmail: PEER,
      name: "Peer",
      initials: "PE",
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
      peerEmail: PEER,
      pinned: false,
      muted: false,
      updatedAt: Date.now(),
      messages,
    },
  ],
  rev: 1,
  serverTime: Date.now(),
  typing: [],
});

/**
 * A cloud stub whose change endpoint can be told to refuse, and whose snapshot
 * is driven by the test the way the object would.
 */
const install = (messages: ChatMessage[], accept = true) => {
  window.localStorage.clear();
  const state = { snap: snapshot(messages), changes: [] as unknown[] };

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = String(input instanceof Request ? input.url : input);
      const url = raw.replace(/^https?:\/\/[^/]+/, "");

      if (url.startsWith("/api/messages/session")) return json({ ok: true, email: ME, name: "Me" });
      if (url.startsWith("/api/messages/friend/list")) {
        return json({
          ok: true,
          friends: { incoming: [], outgoing: [], friends: [], declined: [] },
        });
      }
      if (url === "/api/messages/message/change" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          id: string;
          chatId: string;
          action: "edit" | "delete";
          text?: string;
        };
        state.changes.push(body);
        if (!accept) {
          return new Response(JSON.stringify({ ok: false, reason: "not-your-message" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        // The object stores what it accepted, and the peer comes back with it.
        state.snap = snapshot(
          state.snap.chats[0]!.messages.map((message) =>
            message.id === body.id
              ? body.action === "edit"
                ? { ...message, text: body.text ?? message.text, editedAt: Date.now() }
                : { ...message, deletedAt: Date.now() }
              : message,
          ),
        );
        return json({ ok: true });
      }
      if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: state.snap });
      return json({ ok: true });
    }),
  );
  return state;
};

const message = () => messagesStore.getState().data?.chats[0]?.messages[0];

describe("editing a message", () => {
  beforeEach(() => {
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("puts the new text on screen and pushes it to the object", async () => {
    const state = install([mine()]);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.editMessage({
      chatId: CHAT,
      messageId: "m1",
      text: "  the typo  ",
    });
    expect(result.ok).toBe(true);
    expect(message()?.text).toBe("the typo");
    expect(message()?.editedAt).toBeGreaterThan(0);

    // The wire payload carries the id, the action and the trimmed text only.
    expect(state.changes[0]).toEqual({
      id: "m1",
      chatId: CHAT,
      action: "edit",
      text: "the typo",
    });
  });

  it("refuses an empty edit without asking the cloud", async () => {
    const state = install([mine()]);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.editMessage({
      chatId: CHAT,
      messageId: "m1",
      text: "   ",
    });
    expect(result.ok).toBe(false);
    expect(state.changes).toHaveLength(0);
    expect(message()?.text).toBe("teh typo");
  });

  it("puts the old text back when the object refuses", async () => {
    install([mine()], false);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.editMessage({
      chatId: CHAT,
      messageId: "m1",
      text: "the typo",
    });
    expect(result.ok).toBe(false);
    // The sync that follows overwrites the optimistic text, so the bubble can
    // never keep something the cloud did not store.
    expect(message()?.text).toBe("teh typo");
    expect(message()?.editedAt).toBeUndefined();
  });

  it("will not touch a message from the other side", async () => {
    const state = install([mine({ id: "m2", fromMe: false, text: "theirs" })]);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.editMessage({
      chatId: CHAT,
      messageId: "m2",
      text: "hijacked",
    });
    expect(result.ok).toBe(false);
    expect(state.changes).toHaveLength(0);
    expect(message()?.text).toBe("theirs");
  });

  it("says nothing about a message that is not there", async () => {
    install([mine()]);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.editMessage({
      chatId: CHAT,
      messageId: "gone",
      text: "hello",
    });
    expect(result.ok).toBe(false);
  });
});

describe("deleting a message", () => {
  beforeEach(() => {
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("marks it at once and pushes the delete", async () => {
    const state = install([mine()]);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.deleteMessage({ chatId: CHAT, messageId: "m1" });
    expect(result.ok).toBe(true);
    expect(message()?.deletedAt).toBeGreaterThan(0);
    expect(state.changes[0]).toEqual({ id: "m1", chatId: CHAT, action: "delete", text: "" });
  });

  it("brings the message back when the object refuses", async () => {
    install([mine()], false);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.deleteMessage({ chatId: CHAT, messageId: "m1" });
    expect(result.ok).toBe(false);
    expect(message()?.deletedAt).toBeUndefined();
  });

  it("keeps the thread in place, so the deletion converges", async () => {
    install([mine()]);
    await messagesStore.start();
    await messagesStore.sync();

    await messagesStore.deleteMessage({ chatId: CHAT, messageId: "m1" });
    // A row is kept rather than removed: dropping it locally would let the next
    // snapshot put the message straight back.
    expect(messagesStore.getState().data?.chats[0]?.messages).toHaveLength(1);
  });

  it("will not delete a message from the other side", async () => {
    const state = install([mine({ id: "m2", fromMe: false, text: "theirs" })]);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.deleteMessage({ chatId: CHAT, messageId: "m2" });
    expect(result.ok).toBe(false);
    expect(state.changes).toHaveLength(0);
  });

  it("is already in the cloud snapshot, so another device sees the same", async () => {
    install([mine()]);
    await messagesStore.start();
    await messagesStore.sync();

    await messagesStore.deleteMessage({ chatId: CHAT, messageId: "m1" });

    // Re-read the way a second device or the peer's copy would. The tombstone
    // has to come back from the object, not only from the optimistic state.
    await messagesStore.sync();
    expect(messagesStore.getState().data?.chats[0]?.messages[0]?.deletedAt).toBeGreaterThan(0);
  });
});
