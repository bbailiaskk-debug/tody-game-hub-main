// A finished call, as the object keeps it.
//
// The record arrives from a phone, so what is checked here is that the object
// understands it, keeps one row per call, and does not mistake a call for a
// frame to push to whoever happens to be ringing. The record is the one piece of
// the call that outlives the call, so it is written to both objects by the
// gateway and read back from a snapshot.

import { describe, expect, it } from "vitest";

import { MessagesDO } from "../../exports.cloudflare";
import { MAX_CALLS_PER_CHAT, type CallRecord, type MessageChat } from "../lib/messages-protocol";

const ME = "me@example.com";
const PEER = "peer@example.com";

const memoryStorage = () => {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T = unknown>(key: string) => map.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      map.set(key, value);
    },
    delete: async (key: string) => map.delete(key),
  };
};

const profile = {
  email: ME,
  name: "Me",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: 1_700_000_000_000,
  status: "online" as const,
};

const seedObject = (email: string) => {
  const storage = memoryStorage();
  const chat: MessageChat = {
    id: "chat-1",
    peerEmail: email === ME ? PEER : ME,
    pinned: false,
    muted: false,
    updatedAt: 1_000,
    messages: [],
  };
  storage.map.set("profile", { ...profile, email });
  storage.map.set("chat:chat-1", chat);
  storage.map.set("chatIndex", ["chat-1"]);
  const frames: unknown[] = [];
  const object = new MessagesDO(
    {
      storage,
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
      waitUntil: () => {},
      getWebSockets: () => [{ send: (frame: string) => frames.push(JSON.parse(frame)) }],
    } as never,
    {} as never,
  );
  return {
    object,
    frames,
    chat: () => storage.map.get("chat:chat-1") as MessageChat,
    snapshot: async () => {
      const response = await object.fetch(
        new Request("https://messages-do/", {
          headers: { "x-messages-secret": "1", "x-messages-email": email },
        }),
      );
      return (await response.json()) as { chats: MessageChat[]; rev: number };
    },
  };
};

const write = (object: MessagesDO, payload: unknown, mirror = false) =>
  object.fetch(
    new Request("https://messages-do/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-messages-secret": "1",
        "x-messages-email": ME,
        ...(mirror ? { "x-messages-mirror": "1" } : {}),
      },
      body: JSON.stringify(payload),
    }),
  );

const record: CallRecord = {
  callId: "call-1",
  caller: PEER,
  starts: "video",
  at: 1_000,
  endedAt: 43_000,
  durationMs: 42_000,
  outcome: "completed",
  endedBy: PEER,
};

describe("a finished call in the object", () => {
  it("is written into the conversation", async () => {
    const mine = seedObject(ME);

    const response = await write(mine.object, {
      kind: "log",
      callId: record.callId,
      chatId: "chat-1",
      log: record,
    });
    expect(response.status).toBe(200);

    expect(mine.chat().calls).toEqual([record]);
  });

  it("comes back in the snapshot, so the other device sees it too", async () => {
    const mine = seedObject(ME);
    await write(mine.object, { kind: "log", callId: record.callId, chatId: "chat-1", log: record });

    const snapshot = await mine.snapshot();
    expect(snapshot.chats[0]?.calls).toEqual([record]);
  });

  it("keeps one row per call, however many times it is written", async () => {
    const mine = seedObject(ME);
    await write(mine.object, { kind: "log", callId: "call-1", chatId: "chat-1", log: record });
    await write(mine.object, {
      kind: "log",
      callId: "call-1",
      chatId: "chat-1",
      log: { ...record, outcome: "missed", durationMs: 0 },
    });

    expect(mine.chat().calls).toHaveLength(1);
    expect(mine.chat().calls?.[0]?.outcome).toBe("missed");
  });

  it("pushes nothing to the open sockets, because nobody is ringing any more", async () => {
    const mine = seedObject(ME);
    await write(mine.object, { kind: "log", callId: record.callId, chatId: "chat-1", log: record });

    expect(mine.frames).toEqual([]);
  });

  it("is written the same way into the other side's object", async () => {
    // The gateway mirrors the frame, and the row must land the same way there.
    const theirs = seedObject(PEER);
    await write(
      theirs.object,
      { kind: "log", callId: record.callId, chatId: "chat-1", log: record },
      true,
    );

    expect(theirs.chat().calls).toEqual([record]);
  });

  it("keeps only as many calls as the history holds", async () => {
    const mine = seedObject(ME);
    for (let index = 0; index < MAX_CALLS_PER_CHAT + 5; index += 1) {
      await write(mine.object, {
        kind: "log",
        callId: `call-${index}`,
        chatId: "chat-1",
        log: {
          ...record,
          callId: `call-${index}`,
          at: index * 1_000,
          endedAt: index * 1_000 + 500,
        },
      });
    }
    expect(mine.chat().calls).toHaveLength(MAX_CALLS_PER_CHAT);
  });

  it("takes nothing it cannot understand", async () => {
    const mine = seedObject(ME);

    const missing = await write(mine.object, { kind: "log", callId: "call-1", chatId: "chat-1" });
    expect(missing.status).toBe(200);
    expect(mine.chat().calls).toBeUndefined();

    await write(mine.object, {
      kind: "log",
      callId: "call-1",
      chatId: "chat-1",
      log: { callId: "call-1", outcome: "invented", durationMs: -5, startedAt: "yesterday" },
    });
    // An outcome it does not recognise becomes a miss, and a duration that makes
    // no sense becomes none, because a wrong number in the history is a lie.
    expect(mine.chat().calls?.[0]?.outcome).toBe("missed");
    expect(mine.chat().calls?.[0]?.durationMs).toBe(0);
  });

  it("writes nothing for a conversation this account does not have", async () => {
    const mine = seedObject(ME);
    const response = await write(mine.object, {
      kind: "log",
      callId: record.callId,
      chatId: "not-mine",
      log: record,
    });

    expect(await response.json()).toMatchObject({ ok: false });
    expect(mine.chat().calls).toBeUndefined();
  });
});
