// The object storage side of an attachment.
//
// A file used to travel as base64 inside the message body and be kept in the
// object as a string. At four gigabytes that is not a thing anybody can do, so
// the bytes live in a bucket and this object keeps the pointer — which is also
// what makes it the authority on who may read them: a key can only be resolved
// by an account holding a record naming it, and a record only exists here for
// the two people in a conversation.
//
// These tests drive the real class through fetch against an in-memory storage.

import { describe, expect, it } from "vitest";

import { MessagesDO } from "../../exports.cloudflare";
import {
  attachmentObjectKey,
  filesTravelInBucket,
  MAX_ATTACHMENT_VALUE_CHARS,
  MAX_BUCKET_FILE_BYTES,
  MAX_FILE_BYTES,
  MAX_INLINE_ATTACHMENT_BYTES,
  type MessageAttachment,
  type MessageChat,
  type MessagesProfile,
} from "./messages-protocol";

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

const seedObject = () => {
  const storage = memoryStorage();
  const chat: MessageChat = {
    id: "chat-1",
    peerEmail: PEER,
    pinned: false,
    muted: false,
    updatedAt: Date.now(),
    messages: [],
  };
  storage.map.set("profile", { ...profile, email: ME });
  storage.map.set("chat:chat-1", chat);
  storage.map.set("chatIndex", ["chat-1"]);
  const object = new MessagesDO(
    {
      storage,
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
      waitUntil: () => {},
      getWebSockets: () => [],
    } as never,
    {} as never,
  );
  return { storage, object, chat: () => storage.map.get("chat:chat-1") as MessageChat };
};

const write = (object: MessagesDO, payload: Record<string, unknown>, email = ME) =>
  object.fetch(
    new Request("https://messages-do/message", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-messages-secret": "1",
        "x-messages-email": email,
      },
      body: JSON.stringify({ authorEmail: ME, ...payload }),
    }),
  );

const resolveAttachment = async (object: MessagesDO, id: string) => {
  const response = await object.fetch(
    new Request(`https://messages-do/attachment?id=${encodeURIComponent(id)}`, {
      headers: { "x-messages-secret": "1", "x-messages-email": ME },
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const FOUR_GB = 4 * 1024 * 1024 * 1024;

describe("attachments held in a bucket", () => {
  it("keeps a pointer to a four-gigabyte file rather than the file", async () => {
    const mine = seedObject();
    const key = await attachmentObjectKey(ME, "f1e2d3c4b5a69788");

    await write(mine.object, {
      id: "m1",
      chatId: "chat-1",
      text: "here it is",
      at: 1,
      attachments: [
        {
          id: "f1e2d3c4b5a69788",
          kind: "file",
          name: "recording.mkv",
          mimeType: "video/x-matroska",
          size: FOUR_GB,
          inBucket: true,
        },
      ],
    });

    // Nothing of the payload is kept. The record is a name, a type and a key, and
    // the message itself says the same. A four-gigabyte file in a Durable Object
    // value is the thing this design exists to avoid.
    const record = mine.storage.map.get("att:f1e2d3c4b5a69788") as Record<string, unknown>;
    expect(record).toMatchObject({
      id: "f1e2d3c4b5a69788",
      key,
      size: FOUR_GB,
      name: "recording.mkv",
    });
    expect(record?.["data"]).toBeUndefined();
    expect(JSON.stringify(mine.chat())).not.toContain("messages/");

    const attachment = mine.chat().messages[0]?.attachments?.[0] as MessageAttachment;
    expect(attachment).toMatchObject({ id: "f1e2d3c4b5a69788", size: FOUR_GB, stored: true });
  });

  it("works out the same key on both sides of a conversation", async () => {
    // Both objects are given the same author, because the gateway stamps it from
    // the session it verified rather than from anything either object knows. That
    // is what lets the file be stored once and read by both people.
    const sender = seedObject();
    const receiver = seedObject();
    const attachment = {
      id: "shared00000000000",
      kind: "file",
      name: "clip.mp4",
      mimeType: "video/mp4",
      size: 900,
      inBucket: true,
    };

    await write(sender.object, {
      id: "m1",
      chatId: "chat-1",
      text: "look",
      at: 1,
      attachments: [attachment],
    });
    await write(receiver.object, {
      id: "m1",
      chatId: "chat-1",
      text: "look",
      at: 1,
      fromMe: false,
      attachments: [attachment],
    });

    const here = sender.storage.map.get("att:shared00000000000") as Record<string, unknown>;
    const there = receiver.storage.map.get("att:shared00000000000") as Record<string, unknown>;
    expect(here?.["key"]).toBe(there?.["key"]);
    expect(here?.["key"]).toBe(await attachmentObjectKey(ME, "shared00000000000"));
  });

  it("answers a download request with the key and never with the bytes", async () => {
    const mine = seedObject();
    const key = await attachmentObjectKey(ME, "abc123def456abcd");
    await write(mine.object, {
      id: "m1",
      chatId: "chat-1",
      text: "",
      at: 1,
      attachments: [
        {
          id: "abc123def456abcd",
          kind: "file",
          name: "clip.mp4",
          mimeType: "video/mp4",
          size: 1234,
          inBucket: true,
        },
      ],
    });

    const resolved = await resolveAttachment(mine.object, "abc123def456abcd");

    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({
      ok: true,
      key,
      name: "clip.mp4",
      mimeType: "video/mp4",
      size: 1234,
    });
  });

  it("ignores a key the message tried to name for itself", async () => {
    const mine = seedObject();
    const someoneElse = await attachmentObjectKey(PEER, "forged00000000000");

    await write(mine.object, {
      id: "m1",
      chatId: "chat-1",
      text: "look at this",
      at: 1,
      attachments: [
        {
          id: "forged00000000000",
          kind: "file",
          name: "somebody-elses.pdf",
          mimeType: "application/pdf",
          size: 10,
          // A path into somebody else's namespace, well formed and exactly where
          // a real file would be. It is ignored: the key is derived, so there is
          // nothing here for a client to have written.
          key: someoneElse,
        },
      ],
    });

    expect(mine.storage.map.get("att:forged00000000000")).toBeUndefined();
    expect(mine.chat().messages[0]?.attachments?.[0]).toMatchObject({
      id: "forged00000000000",
      name: "somebody-elses.pdf",
      stored: false,
    });
    expect((await resolveAttachment(mine.object, "forged00000000000")).status).toBe(404);
  });

  it("still reads an attachment that was written before the bucket existed", async () => {
    const mine = seedObject();
    const base64 = Buffer.from("hello there").toString("base64");
    mine.storage.map.set("att:legacy1", {
      id: "legacy1",
      mimeType: "text/plain",
      name: "old.txt",
      size: 11,
      key: "",
      data: base64,
    });

    const resolved = await resolveAttachment(mine.object, "legacy1");

    expect(resolved.status).toBe(200);
    // The payload comes back inline for these, because there is nowhere else it
    // could come from. A conversation from before the change has to keep opening.
    expect(resolved.body["data"]).toBe(base64);
    expect(resolved.body["key"]).toBe("");
  });

  it("drops an inline payload past the size a single stored value can hold", async () => {
    const mine = seedObject();

    await write(mine.object, {
      id: "m1",
      chatId: "chat-1",
      text: "",
      at: 1,
      attachments: [
        {
          id: "toobig",
          kind: "file",
          name: "big.bin",
          mimeType: "application/octet-stream",
          size: MAX_INLINE_ATTACHMENT_BYTES + 1,
          dataUrl: `data:application/octet-stream;base64,${"A".repeat(
            MAX_ATTACHMENT_VALUE_CHARS + 1,
          )}`,
        },
      ],
    });

    expect(mine.storage.map.get("att:toobig")).toBeUndefined();
  });

  it("keeps a small inline payload, which is what a compressed picture is", async () => {
    const mine = seedObject();
    const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

    await write(mine.object, {
      id: "m1",
      chatId: "chat-1",
      text: "",
      at: 1,
      attachments: [
        {
          id: "pic1",
          kind: "image",
          name: "photo.jpg",
          mimeType: "image/jpeg",
          size: 42,
          dataUrl,
        },
      ],
    });

    const record = mine.storage.map.get("att:pic1") as Record<string, unknown>;
    expect(record?.["data"]).toBe("/9j/4AAQSkZJRg==");
    expect(record?.["key"]).toBe("");
    expect(mine.chat().messages[0]?.attachments?.[0]).toMatchObject({ id: "pic1", stored: true });
  });

  it("does not store the same attachment twice when a send is retried", async () => {
    const mine = seedObject();
    const payload = {
      id: "m1",
      chatId: "chat-1",
      text: "twice",
      at: 1,
      attachments: [
        {
          id: "retry00000000000",
          kind: "file",
          name: "a.bin",
          mimeType: "application/octet-stream",
          size: 5,
          inBucket: true,
        },
      ],
    };

    await write(mine.object, payload);
    await write(mine.object, payload);

    expect(mine.chat().messages).toHaveLength(1);
    expect(mine.storage.map.get("attachments")).toEqual(["retry00000000000"]);
  });
});

describe("which regime this build is in", () => {
  /**
   * There are two ways a file can travel and they cannot be mixed, so which one is
   * in force is a build-level fact rather than something worked out per message.
   * This is the assertion that says which one the deployed build is in, and it is
   * meant to change — deliberately, by raising the cap — when a bucket is behind
   * the worker.
   */
  it("keeps a file in the message while the cap is what a message body can hold", () => {
    // No bucket is deployed, so a file has nowhere to go but the body, and the
    // offer has to match that. A build that offered four gigabytes here would
    // accept a file it had no way to deliver.
    expect(filesTravelInBucket).toBe(false);
    expect(MAX_FILE_BYTES).toBe(MAX_INLINE_ATTACHMENT_BYTES);
  });

  it("offers a file the inline path can actually carry, base64 and all", () => {
    // This is the one that was wrong. The cap used to be a round two megabytes
    // while the value the object will hold is `MAX_ATTACHMENT_VALUE_CHARS` of
    // base64 — about six hundred and a half kilobytes. A file between the two was
    // accepted by the picker, read into the page, and then dropped on arrival: the
    // message went out carrying a file name that nothing could ever open.
    //
    // So the largest file the build offers has to fit, once encoded, inside the
    // limit that is enforced. Base64 costs four characters for every three bytes,
    // and the `data:<type>;base64,` header sits in front of them.
    const header = "data:application/octet-stream;base64,".length;
    const encoded = Math.ceil(MAX_FILE_BYTES / 3) * 4 + header;

    expect(encoded).toBeLessThanOrEqual(MAX_ATTACHMENT_VALUE_CHARS);
    // And what is left over is the header allowance and nothing more, so raising
    // the cap by a few bytes cannot push the encoded form past the limit.
    expect(MAX_ATTACHMENT_VALUE_CHARS - encoded).toBeLessThan(64);
  });

  it("is derived from the enforced limit rather than written beside it", () => {
    // Two numbers describing one thing is how they came to disagree in the first
    // place, so there is only one: changing the ceiling the object enforces moves
    // the one the picker offers with it.
    expect(MAX_INLINE_ATTACHMENT_BYTES).toBe(
      Math.floor(((MAX_ATTACHMENT_VALUE_CHARS - 64) * 3) / 4),
    );
  });

  it("still reads a conversation written by a build that had a bucket", () => {
    // The two caps are different numbers on purpose. The object is bounded by
    // what storage holds, so a message that arrived from a four-gigabyte build
    // opens correctly in this one instead of reporting a fraction of its size.
    expect(MAX_BUCKET_FILE_BYTES).toBeGreaterThan(MAX_FILE_BYTES);
  });

  it("holds a pointer to a file far larger than this build would offer", async () => {
    const mine = seedObject();
    const id = "huge0000000000000";

    await write(mine.object, {
      id: "m1",
      chatId: "chat-1",
      text: "from a bigger build",
      at: 1,
      attachments: [
        {
          id,
          kind: "file",
          name: "archive.tar",
          mimeType: "application/x-tar",
          size: MAX_BUCKET_FILE_BYTES,
          inBucket: true,
        },
      ],
    });

    expect(mine.chat().messages[0]?.attachments?.[0]).toMatchObject({
      size: MAX_BUCKET_FILE_BYTES,
      stored: true,
    });
  });
});
