// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import type { FriendRequest, FriendsSnapshot } from "./messages-protocol";

const ME = "bob@example.com";
const OTHER = "alice@example.com";

const empty = (): FriendsSnapshot => ({
  incoming: [],
  outgoing: [],
  friends: [],
  declined: [],
});

const incoming = (): FriendRequest => ({
  id: "alice@example.com~bob@example.com",
  fromEmail: OTHER,
  fromName: "Alice",
  fromAvatar: null,
  toEmail: ME,
  toName: "Bob",
  status: "pending",
  createdAt: 1,
  updatedAt: 1,
});

/** Cloud stub whose friends bucket the test can drive. */
const installCloud = (start: FriendsSnapshot = empty()) => {
  const state = { friends: start };
  const respondCalls: Array<{ id: string; accept: boolean }> = [];

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (url.includes("/session")) return json({ ok: true, email: ME, name: "Bob" });
    if (url.includes("/friend/list")) return json({ ok: true, friends: state.friends });

    if (url.includes("/friend/respond")) {
      respondCalls.push({ id: body.id, accept: body.accept });
      state.friends = {
        ...empty(),
        friends: body.accept ? [{ ...incoming(), status: "accepted" }] : [],
        declined: body.accept ? [] : [{ ...incoming(), status: "rejected" }],
      };
      return json({ ok: true, status: body.accept ? "accepted" : "rejected" });
    }

    if (url.includes("/friend/remove")) {
      state.friends = empty();
      return json({ ok: true });
    }
    if (url === "/api/messages/chat") return json({ ok: true });
    if (url === "/api/messages/") {
      return json({ ok: true, snapshot: { profile: {}, contacts: [], chats: [] } });
    }
    return json({ ok: true });
  });

  vi.stubGlobal("fetch", mock);
  return { state, respondCalls, mock };
};

describe("recipient side of a friend request", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("shows an incoming request after the friends list is loaded", async () => {
    const { state } = installCloud();
    await messagesStore.start();
    // A request arrives from the other account.
    state.friends = { ...empty(), incoming: [incoming()] };
    await messagesStore.refreshFriends();

    expect(messagesStore.getState().friends.incoming).toHaveLength(1);
    expect(messagesStore.getState().friends.incoming[0]?.fromName).toBe("Alice");
  });

  it("picks the request up through a normal sync", async () => {
    const { state } = installCloud();
    await messagesStore.start();
    state.friends = { ...empty(), incoming: [incoming()] };

    await messagesStore.sync();

    expect(messagesStore.getState().friends.incoming).toHaveLength(1);
  });

  it("keeps the request visible across repeated syncs", async () => {
    const { state } = installCloud({ ...empty(), incoming: [incoming()] });
    await messagesStore.start();

    await messagesStore.sync();
    await messagesStore.sync();

    expect(messagesStore.getState().friends.incoming).toHaveLength(1);
  });

  it("accepting a request moves it into the friends list", async () => {
    const { state, respondCalls } = installCloud({ ...empty(), incoming: [incoming()] });
    await messagesStore.start();

    const result = await messagesStore.respondToFriendRequest(
      state.friends.incoming[0]?.id as string,
      true,
    );

    expect(result.ok).toBe(true);
    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0]?.accept).toBe(true);
    expect(messagesStore.getState().friends.incoming).toHaveLength(0);
    expect(messagesStore.getState().friends.friends).toHaveLength(1);
  });

  it("declining removes the request and adds no friend", async () => {
    const { state, respondCalls } = installCloud({ ...empty(), incoming: [incoming()] });
    await messagesStore.start();

    const result = await messagesStore.respondToFriendRequest(
      state.friends.incoming[0]?.id as string,
      false,
    );

    expect(result.ok).toBe(true);
    expect(respondCalls[0]?.accept).toBe(false);
    expect(messagesStore.getState().friends.incoming).toHaveLength(0);
    expect(messagesStore.getState().friends.friends).toHaveLength(0);
  });

  it("after accepting, a chat with the new friend can be opened and used", async () => {
    const { state } = installCloud({ ...empty(), incoming: [incoming()] });
    await messagesStore.start();
    await messagesStore.refreshFriends();

    await messagesStore.respondToFriendRequest(state.friends.incoming[0]?.id as string, true);

    const chatId = messagesStore.openChatWithPeer(OTHER);
    expect(chatId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 0));

    const chat = messagesStore.getState().data?.chats.find((c) => c.id === chatId);
    expect(chat).toBeTruthy();
    expect(chat?.peerEmail).toBe(OTHER);

    const sent = await messagesStore.sendMessage({
      chatId: chatId as string,
      peerEmail: OTHER,
      text: "hi alice",
      attachments: [],
    });
    expect(sent.ok).toBe(true);
  });

  it("reports the pending count so a request is not missed", async () => {
    installCloud({ ...empty(), incoming: [incoming()] });
    await messagesStore.start();
    await messagesStore.refreshFriends();

    expect(messagesStore.getState().friends.incoming.length).toBeGreaterThan(0);
  });
});
