// The Durable Object's own write path, driven through its HTTP entry point.
//
// Edit and delete have to converge on both participants' objects, and the only
// place that can be decided is the object itself: it knows which side of the
// conversation a row belongs to, so it is what refuses a change to a message
// the account did not send. These tests drive the real class against an
// in-memory storage, through fetch, so the routing, the identity check and the
// revision bump are all exercised together.

import { describe, expect, it } from "vitest";

import { MessagesDO } from "../../exports.cloudflare";
import type { MessageChat, MessagesProfile } from "../lib/messages-protocol";

const ME = "me@example.com";
const PEER = "peer@example.com";

/** The in-memory key/value store the object keeps its state in. */
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

const profile: MessagesProfile = {
  email: ME,
  name: "Me",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: Date.now(),
  status: "online",
};

/**
 * One account's object. `fromMe` on a stored message means "the owner of this
 * object sent it", which is the whole basis of the author check.
 */
const seedObject = (
  email: string,
  messages: Array<{ id: string; fromMe: boolean; text: string; at: number }>,
) => {
  const storage = memoryStorage();
  const chat: MessageChat = {
    id: "chat-1",
    peerEmail: email === ME ? PEER : ME,
    pinned: false,
    muted: false,
    updatedAt: Date.now(),
    messages: messages.map((message) => ({ ...message, status: "sent" as const })),
  };
  storage.map.set("profile", { ...profile, email });
  storage.map.set("chat:chat-1", chat);
  storage.map.set("chatIndex", ["chat-1"]);
  const frames: Array<{ type?: string; rev?: number }> = [];
  const object = new MessagesDO(
    {
      storage,
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
      waitUntil: () => {},
      // The frames the object pushes to this account's open sockets, which is how
      // the change reaches the devices that are not the one making it.
      getWebSockets: () => [{ send: (frame: string) => frames.push(JSON.parse(frame)) }],
    } as never,
    {} as never,
  );
  return { storage, object, frames, chat: () => storage.map.get("chat:chat-1") as MessageChat };
};

/** Posts a write the way the gateway does, with the identity headers it sets. */
const write = (object: MessagesDO, path: string, payload: unknown, mirror = false) =>
  object.fetch(
    new Request(`https://messages-do${path}`, {
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

const read = async (object: MessagesDO) => {
  const response = await object.fetch(
    new Request("https://messages-do/", {
      headers: { "x-messages-secret": "1", "x-messages-email": ME },
    }),
  );
  return (await response.json()) as { chats: MessageChat[]; rev: number };
};

describe("editing a message in the object", () => {
  it("rewrites the text and stamps the edit", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "teh typo", at: 1 }]);

    const response = await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "edit",
      text: "the typo",
    });
    expect(response.status).toBe(200);

    const message = mine.chat().messages[0];
    expect(message?.text).toBe("the typo");
    expect(message?.editedAt).toBeGreaterThan(0);
    expect(message?.deletedAt).toBeUndefined();
  });

  it("answers with the peer from storage, so the caller cannot name another", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);

    const response = await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "delete",
      // A client trying to redirect the mirror somewhere else.
      peerEmail: "victim@example.com",
    });
    const body = (await response.json()) as { ok: boolean; peerEmail: string };
    expect(body.peerEmail).toBe(PEER);
  });

  it("refuses a change to a message this account did not send", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: false, text: "theirs", at: 1 }]);

    const response = await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "delete",
    });
    expect((await response.json()).ok).toBe(false);
    expect(mine.chat().messages[0]?.text).toBe("theirs");
  });

  it("leaves the conversation where it was, so a typo fix is not new activity", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 5 }]);
    const before = mine.chat().updatedAt;

    await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "edit",
      text: "hey",
    });
    expect(mine.chat().updatedAt).toBe(before);
  });

  it("does not move the timestamp again for a repeated change", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    const payload = { id: "m1", chatId: "chat-1", action: "edit", text: "hey" };

    await write(mine.object, "/message/change", payload);
    const first = mine.chat().messages[0]?.editedAt;
    const revAfterFirst = (await read(mine.object)).rev;

    await write(mine.object, "/message/change", payload);
    expect(mine.chat().messages[0]?.editedAt).toBe(first);
    // No revision means no sync frame, so a retry is invisible to the devices.
    expect((await read(mine.object)).rev).toBe(revAfterFirst);
  });

  it("ignores a change to a message that is not in the conversation", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    const revBefore = (await read(mine.object)).rev;

    const response = await write(mine.object, "/message/change", {
      id: "nope",
      chatId: "chat-1",
      action: "delete",
    });
    expect((await response.json()).ok).toBe(true);
    expect((await read(mine.object)).rev).toBe(revBefore);
  });

  it("rejects an action it does not know", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    const response = await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "drop-the-database",
    });
    expect((await response.json()).ok).toBe(true);
    expect(mine.chat().messages[0]?.text).toBe("hi");
  });

  it("refuses an edit that would empty the message", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "edit",
      text: "   ",
    });
    // An empty bubble is worse than a stale one, so the text stays.
    expect(mine.chat().messages[0]?.text).toBe("hi");
    expect(mine.chat().messages[0]?.editedAt).toBeUndefined();
  });

  it("trims what an edit stores", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "edit",
      text: "  hey  ",
    });
    expect(mine.chat().messages[0]?.text).toBe("hey");
  });
});

describe("deleting a message in the object", () => {
  it("keeps a tombstone rather than dropping the row", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "secret", at: 1 }]);

    await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "delete",
    });

    // The row stays, so both objects keep the same thread shape, but the
    // snapshot carries the timestamp that hides it from every reader.
    const chat = (await read(mine.object)).chats[0];
    expect(chat?.messages).toHaveLength(1);
    expect(chat?.messages[0]?.deletedAt).toBeGreaterThan(0);
  });

  it("bumps the revision so every device of the account syncs", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    const before = (await read(mine.object)).rev;

    await write(mine.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "delete",
    });
    const after = (await read(mine.object)).rev;
    expect(after).toBeGreaterThan(before);

    // The push is what makes it real time rather than a poll: the other devices
    // of this account are told to re-read the moment the change lands.
    expect(mine.frames.at(-1)).toEqual({ type: "sync", rev: after });
  });

  it("pushes nothing when the change changes nothing", async () => {
    const mine = seedObject(ME, [{ id: "m1", fromMe: true, text: "hi", at: 1 }]);
    await write(mine.object, "/message/change", {
      id: "nope",
      chatId: "chat-1",
      action: "delete",
    });
    expect(mine.frames).toHaveLength(0);
  });
});

describe("the mirrored copy in the peer's object", () => {
  // The peer's object stores the same message with fromMe: false, so the author
  // check would refuse it. The gateway's mirror marker is what lets it through,
  // and that marker is a header, never a body field a client could send.
  it("applies a change to a message the peer did not send", async () => {
    const theirs = seedObject(PEER, [{ id: "m1", fromMe: false, text: "theirs", at: 1 }]);
    const payload = { id: "m1", chatId: "chat-1", action: "edit", text: "theirs, fixed" };

    const refused = await write(theirs.object, "/message/change", payload);
    expect((await refused.json()).ok).toBe(false);

    const mirrored = await write(theirs.object, "/message/change", payload, true);
    expect((await mirrored.json()).ok).toBe(true);
    expect(theirs.chat().messages[0]?.text).toBe("theirs, fixed");
  });

  it("cannot be forged from the request body", async () => {
    const theirs = seedObject(PEER, [{ id: "m1", fromMe: false, text: "theirs", at: 1 }]);

    const response = await write(theirs.object, "/message/change", {
      id: "m1",
      chatId: "chat-1",
      action: "delete",
      // Exactly what a client would try without the header.
      mirrored: true,
    });
    expect((await response.json()).ok).toBe(false);
    expect(theirs.chat().messages[0]?.deletedAt).toBeUndefined();
  });

  it("deletes a message the account received, so both sides agree", async () => {
    const theirs = seedObject(PEER, [{ id: "m1", fromMe: false, text: "theirs", at: 1 }]);
    await write(
      theirs.object,
      "/message/change",
      { id: "m1", chatId: "chat-1", action: "delete" },
      true,
    );
    expect(theirs.chat().messages[0]?.deletedAt).toBeGreaterThan(0);
  });
});
