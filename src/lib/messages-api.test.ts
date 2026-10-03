// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesApiError, messagesApi } from "./messages-api";
import { messagesStore } from "./messages-store";

type FetchCall = { url: string; init: RequestInit | undefined };

const installFetch = (handler: (url: string, init?: RequestInit) => Promise<Response>) => {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    return handler(url, init);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("messages api client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a typed error for a rejected response", async () => {
    installFetch(async () => json({ error: "unauthorized" }, 401));
    await expect(messagesApi.session()).rejects.toBeInstanceOf(MessagesApiError);
  });

  /**
   * The last edge of the press, at the only place it can be checked without standing
   * up the gateway: the request itself.
   *
   * `on` is the field the whole chain rests on. It is not a toggle, so the value in
   * the body is what the reader pressed, and the far end has to be handed it rather
   * than left to work it out from what it happens to be holding. A client that
   * dropped the field would not fail loudly anywhere in the product: it would send
   * the same request for putting a reaction on and taking one off, and the object
   * would answer both with whatever the first one said.
   */
  it("says which way a reaction went, rather than asking for it to be toggled", async () => {
    const calls: FetchCall[] = [];
    installFetch(async (url, init) => {
      calls.push({ url, init });
      return json({ ok: true });
    });

    await messagesApi.react({ id: "m1", chatId: "chat-1", emoji: "👍", on: true });
    await messagesApi.react({ id: "m1", chatId: "chat-1", emoji: "👍", on: false });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toContain("/api/messages/message/react");
      // True and false are both sent as themselves, never as the same word twice.
      expect(typeof JSON.parse(String(call.init?.body)).on).toBe("boolean");
    }
    expect(JSON.parse(String(calls[0]?.init?.body)).on).toBe(true);
    expect(JSON.parse(String(calls[1]?.init?.body)).on).toBe(false);
  });

  /**
   * The whole friendship list goes in one request.
   *
   * Named rather than repeated because this is the difference between a new server
   * and fifty of them: the addresses are not in the body, so there is nothing to
   * repeat. A test that only checked "it posts" would pass just as happily on a
   * client that posted once per friend, which is the thing that must not happen.
   */
  it("asks for the friends to be walked in with one call, naming nobody", async () => {
    const calls: FetchCall[] = [];
    installFetch(async (url, init) => {
      calls.push({ url, init });
      return json({ ok: true, added: 50, wanted: 50 });
    });

    const result = await messagesApi.guildMembers({ guildId: "g-hub" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/guild/members");
    // The body names the server and nothing else. Who walks in is the server's
    // reading of this account's friendship list, so a client cannot point it at a
    // stranger.
    expect(JSON.parse(String(calls[0]?.init?.body ?? "{}"))).toEqual({ guildId: "g-hub" });
    expect(result).toEqual({ ok: true, added: 50, wanted: 50 });
  });

  it("reports a failed walk-in rather than throwing at the person who made the server", async () => {
    installFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(messagesApi.guildMembers({ guildId: "g-hub" })).resolves.toEqual({
      ok: false,
      reason: "network",
    });
  });

  it("flags 401 as unauthorized", async () => {
    installFetch(async () => json({ error: "unauthorized" }, 401));
    const error = await messagesApi.session().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MessagesApiError);
    expect((error as MessagesApiError).isUnauthorized).toBe(true);
  });

  it("reports a network failure as status 0 rather than throwing a raw TypeError", async () => {
    installFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await messagesApi.sync().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MessagesApiError);
    expect((error as MessagesApiError).status).toBe(0);
    expect((error as MessagesApiError).reason).toBe("network");
  });

  it("sends credentials so the HttpOnly session cookie rides along", async () => {
    const calls: FetchCall[] = [];
    installFetch(async (url, init) => {
      calls.push({ url, init });
      return json({
        ok: true,
        snapshot: { profile: {}, contacts: [], chats: [], rev: 1, serverTime: 1 },
      });
    });

    await messagesApi.sync();
    expect(calls[0]?.init?.credentials).toBe("same-origin");
  });

  it("posts the session handshake as JSON", async () => {
    const calls: FetchCall[] = [];
    installFetch(async (url, init) => {
      calls.push({ url, init });
      return json({ ok: true, email: "a@b.com", name: "A" });
    });

    await messagesApi.authenticate("a@b.com", "pw");
    expect(calls[0]?.url).toBe("/api/messages/session");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(String(calls[0]?.init?.body)).toContain("a@b.com");
  });
});

describe("messages store lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("leaves the loading state when the gateway rejects the request", async () => {
    installFetch(async () => json({ error: "unauthorized" }, 401));

    await messagesStore.start();

    expect(messagesStore.getState().status).toBe("needs-auth");
  });

  it("never hangs when the request fails outright", async () => {
    installFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await messagesStore.start();

    const state = messagesStore.getState();
    expect(state.status).not.toBe("loading");
    // With no cache and no backend the store degrades to the local fallback.
    expect(state.mode).toBe("local");
    expect(state.data).not.toBeNull();
  });

  it("does not stay on loading when a request never settles", async () => {
    vi.useFakeTimers();
    installFetch(() => new Promise<Response>(() => {}));

    const boot = messagesStore.start();
    await vi.advanceTimersByTimeAsync(15_000);
    await boot;

    expect(messagesStore.getState().status).not.toBe("loading");
  }, 20_000);

  it("moves to ready once the session and snapshot resolve", async () => {
    installFetch(async (url) => {
      if (url.includes("/session")) return json({ ok: true, email: "a@b.com", name: "A" });
      return json({
        ok: true,
        snapshot: {
          profile: {
            email: "a@b.com",
            name: "A",
            about: "",
            accent: "#1DB954",
            avatar: null,
            online: true,
            lastSeenAt: Date.now(),
          },
          contacts: [],
          chats: [],
          rev: 3,
          serverTime: Date.now(),
        },
      });
    });

    await messagesStore.start();

    const state = messagesStore.getState();
    expect(state.status).toBe("ready");
    expect(state.email).toBe("a@b.com");
    expect(state.data?.profile.name).toBe("A");
  });

  it("keeps cached conversations and reports offline when the sync fails", async () => {
    window.localStorage.setItem(
      "tk-messages-cache:a@b.com",
      JSON.stringify({
        profile: {
          email: "a@b.com",
          name: "A",
          about: "",
          accent: "#1DB954",
          avatar: null,
          online: false,
          lastSeenAt: 0,
        },
        contacts: [],
        chats: [],
      }),
    );

    installFetch(async (url) => {
      if (url.includes("/session")) return json({ ok: true, email: "a@b.com", name: "A" });
      throw new TypeError("Failed to fetch");
    });

    await messagesStore.start();

    const state = messagesStore.getState();
    expect(state.status).toBe("offline");
    expect(state.data).not.toBeNull();
  });
});

describe("messages store offline fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const failEverything = () =>
    installFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

  it("falls back to the local store instead of erroring out", async () => {
    failEverything();

    await messagesStore.start();

    const state = messagesStore.getState();
    expect(state.status).not.toBe("loading");
    expect(state.mode).toBe("local");
    expect(state.data).not.toBeNull();
    // Seeded conversations keep the UI usable with no backend at all.
    expect(state.data?.chats.length).toBeGreaterThan(0);
    expect(state.data?.contacts.length).toBeGreaterThan(0);
  });

  it("stays usable in local mode: sending, contacts and profile all work offline", async () => {
    failEverything();
    await messagesStore.start();
    expect(messagesStore.getState().mode).toBe("local");

    const chatId = messagesStore.getState().data?.chats[0]?.id ?? "";
    const sent = await messagesStore.sendMessage({
      chatId,
      peerEmail: "",
      text: "изпратено офлайн",
      attachments: [],
    });
    expect(sent.ok).toBe(true);

    const contact = await messagesStore.addContact({ name: "Нов приятел" });
    expect(contact.ok).toBe(true);

    const profile = await messagesStore.updateProfile({ name: "Офлайн потребител" });
    expect(profile.ok).toBe(true);

    const state = messagesStore.getState();
    expect(state.data?.chats[0]?.messages.at(-1)?.text).toBe("изпратено офлайн");
    expect(state.data?.contacts.some((item) => item.name === "Нов приятел")).toBe(true);
    expect(state.data?.profile.name).toBe("Офлайн потребител");
  });

  it("queues offline messages for a later cloud upload", async () => {
    failEverything();
    await messagesStore.start();

    const chatId = messagesStore.getState().data?.chats[0]?.id ?? "";
    await messagesStore.sendMessage({
      chatId,
      peerEmail: "",
      text: "ще се качи по-късно",
      attachments: [],
    });

    const queued = JSON.parse(
      window.localStorage.getItem("tk-messages-local-pending") ?? "[]",
    ) as Array<{ text: string }>;
    expect(queued).toHaveLength(1);
    expect(queued[0]?.text).toBe("ще се качи по-късно");
  });

  it("recovers automatically when the cloud answers again", async () => {
    failEverything();
    await messagesStore.start();
    expect(messagesStore.getState().mode).toBe("local");

    installFetch(async (url) => {
      if (url.includes("/session")) return json({ ok: true, email: "a@b.com", name: "A" });
      return json({
        ok: true,
        snapshot: {
          profile: {
            email: "a@b.com",
            name: "A",
            about: "",
            accent: "#1DB954",
            avatar: null,
            online: true,
            lastSeenAt: Date.now(),
          },
          contacts: [],
          chats: [],
          rev: 9,
          serverTime: Date.now(),
        },
      });
    });

    await messagesStore.promoteToCloud();

    const state = messagesStore.getState();
    expect(state.mode).toBe("cloud");
    expect(state.status).toBe("ready");
    expect(state.data?.profile.email).toBe("a@b.com");
  });

  it("uploads the offline queue once the cloud is back", async () => {
    failEverything();
    await messagesStore.start();

    const chatId = messagesStore.getState().data?.chats[0]?.id ?? "";
    await messagesStore.sendMessage({
      chatId,
      peerEmail: "",
      text: "чака за облака",
      attachments: [],
    });

    const sentBodies: string[] = [];
    installFetch(async (url, init) => {
      if (url.includes("/session")) return json({ ok: true, email: "a@b.com", name: "A" });
      if (url === "/api/messages/") {
        return json({
          ok: true,
          snapshot: {
            profile: {
              email: "a@b.com",
              name: "A",
              about: "",
              accent: "#1DB954",
              avatar: null,
              online: true,
              lastSeenAt: Date.now(),
            },
            contacts: [],
            chats: [],
            rev: 11,
            serverTime: Date.now(),
          },
        });
      }
      if (url.includes("/message")) {
        sentBodies.push(String(init?.body ?? ""));
        return json({ ok: true });
      }
      return json({ ok: true });
    });

    await messagesStore.promoteToCloud();

    expect(sentBodies.some((body) => body.includes("чака за облака"))).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem("tk-messages-local-pending") ?? "[]"),
    ).toHaveLength(0);
  });

  it("asks the server for the relay, and reads what it holds", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        seen.push(url);
        return new Response(
          JSON.stringify({
            ok: true,
            urls: ["stun:turn.example.com:3478", "turn:turn.example.com:5349"],
            username: "who",
            credential: "what",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const relay = await messagesApi.turn();

    // Asked of the server rather than read from the bundle, which is what makes
    // it a deployment decision instead of a code change.
    expect(seen[0]).toContain("/api/messages/turn");
    expect(relay).toEqual({
      urls: ["stun:turn.example.com:3478", "turn:turn.example.com:5349"],
      username: "who",
      credential: "what",
    });
  });

  it("has no relay when the server has none, and never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, urls: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    // Not an error: two devices reach each other directly on every network that
    // lets them, which is most of them.
    expect(await messagesApi.turn()).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    // And a call still has to be placeable when the question cannot be asked.
    expect(await messagesApi.turn()).toBeNull();
  });

  it("reports a rejected password instead of throwing", async () => {
    installFetch(async () => json({ ok: false, reason: "invalid-credentials" }, 401));

    const result = await messagesStore.signIn("a@b.com", "wrong");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-credentials");
  });

  it("degrades instead of crashing on a malformed snapshot", async () => {
    installFetch(async (url) => {
      if (url.includes("/session")) return json({ ok: true, email: "a@b.com", name: "A" });
      // A response that is not a snapshot at all.
      return json({ ok: true, snapshot: { nothing: true } });
    });

    await messagesStore.start();

    const state = messagesStore.getState();
    expect(state.error).toBe("invalid-snapshot");
    expect(state.status).not.toBe("loading");
    expect(state.data).not.toBeNull();
  });
});
