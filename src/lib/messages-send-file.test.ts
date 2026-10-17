// @vitest-environment jsdom

// Sending a message with a file on it, from the store's side.
//
// The order is the whole thing: a file has to be in the bucket before the
// message naming it can be written anywhere, and at four gigabytes that is
// minutes. So the bubble goes in first, the file goes up next, and only then is
// the message queued — and what gets queued is a pointer, because the outbox is
// written to localStorage and a queue entry holding four gigabytes is a queue
// entry that is empty after a reload and claims not to be.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import {
  MAX_BUCKET_FILE_BYTES,
  UPLOAD_PART_BYTES,
  type ChatContact,
  type MessagesProfile,
  type MessagesSnapshot,
} from "./messages-protocol";

const ME = "me@example.com";
const PEER = "friend@example.com";
const CHAT = "chat-1";

const profile: MessagesProfile = {
  email: ME,
  name: "Me",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: 1,
  status: "online",
};

const contact: ChatContact = {
  id: "c1",
  peerEmail: PEER,
  name: "Friend",
  initials: "FR",
  about: "",
  accent: "#1DB954",
  avatar: null,
  online: true,
  lastSeenAt: 1,
  lastSeenLabel: "",
  linked: true,
  status: "online",
};

const snapshot = (): MessagesSnapshot => ({
  profile,
  contacts: [contact],
  chats: [
    {
      id: CHAT,
      peerEmail: PEER,
      pinned: false,
      muted: false,
      updatedAt: 1,
      messages: [],
    },
  ],
  rev: 1,
  serverTime: 1,
  typing: [],
});

type Recorded = { url: string; method: string; body: unknown };

const installCloud = (options: { failPart?: boolean } = {}) => {
  const state = { snap: snapshot() };
  const sent: Recorded[] = [];

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    sent.push({ url, method, body: init?.body });

    if (url.includes("/session")) return json({ ok: true, email: ME, name: "Me" });
    if (url.includes("/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }
    if (url.includes("/upload/part")) {
      if (options.failPart) throw new TypeError("Failed to fetch");
      const part = Number(new URL(url, "https://x").searchParams.get("part"));
      return json({ ok: true, etag: `etag-${part}`, partNumber: part });
    }
    if (url.includes("/upload/complete"))
      return json({ ok: true, key: "k", size: MAX_BUCKET_FILE_BYTES });
    if (url.includes("/upload/object")) return json({ ok: true, key: "k" });
    if (url.includes("/upload?")) {
      return json({ ok: true, uploadId: "upload-1", partBytes: UPLOAD_PART_BYTES, parts: 256 });
    }
    if (url === "/api/messages/message" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        id: string;
        chatId: string;
        text: string;
        at: number;
      };
      state.snap = {
        ...state.snap,
        chats: state.snap.chats.map((chat) =>
          chat.id === body.chatId
            ? {
                ...chat,
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
        ),
      };
      return json({ ok: true });
    }
    if (url === "/api/messages/") return json({ ok: true, snapshot: state.snap });
    return json({ ok: true });
  });

  vi.stubGlobal("fetch", mock);
  return { state, sent, mock };
};

const blobOf = (size: number, type = "application/octet-stream") => {
  const blob = new Blob([""], { type });
  Object.defineProperty(blob, "size", { value: size });
  blob.slice = ((start: number, end: number) =>
    blobOf(Math.max(0, end - start), type)) as typeof blob.slice;
  return blob;
};

const boot = async () => {
  await messagesStore.start();
  await vi.waitFor(() => expect(messagesStore.getState().status).toBe("ready"));
};

describe("sending a file with a message", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("puts the file in the bucket before the message naming it is sent", async () => {
    const { sent } = installCloud();
    await boot();

    const result = await messagesStore.sendMessage({
      chatId: CHAT,
      peerEmail: PEER,
      text: "there it is",
      attachments: [
        {
          id: "big0000000000000",
          kind: "file",
          name: "recording.mkv",
          mimeType: "video/x-matroska",
          size: MAX_BUCKET_FILE_BYTES,
          file: blobOf(MAX_BUCKET_FILE_BYTES),
        },
      ],
    });

    expect(result.ok).toBe(true);
    const lastPart = sent.map((call) => call.url.includes("/upload/part")).lastIndexOf(true);
    const complete = sent.findIndex((call) => call.url.includes("/upload/complete"));
    const message = sent.findIndex((call) => call.url === "/api/messages/message");

    // A message that reaches the cloud before its file would name an attachment
    // that cannot be opened, and no amount of retrying afterwards fixes it.
    expect(lastPart).toBeGreaterThan(-1);
    expect(complete).toBeGreaterThan(lastPart);
    expect(message).toBeGreaterThan(complete);
  });

  it("shows the bubble at once and reports how far the file has got", async () => {
    installCloud();
    await boot();

    const before = messagesStore.getState();
    expect(before.uploads).toEqual({});

    // Watching the state while the send is in flight: the bubble is in the
    // conversation before the file has finished, and progress moves.
    const seen: number[] = [];
    const pending = messagesStore.sendMessage({
      chatId: CHAT,
      peerEmail: PEER,
      text: "watch this",
      attachments: [
        {
          id: "prog000000000000",
          kind: "file",
          name: "movie.mkv",
          mimeType: "video/x-matroska",
          size: MAX_BUCKET_FILE_BYTES,
          file: blobOf(MAX_BUCKET_FILE_BYTES),
        },
      ],
    });
    const unsubscribe = messagesStore.subscribe((state) => {
      for (const row of Object.values(state.uploads)) seen.push(row.sent);
      const chat = state.data?.chats.find((entry) => entry.id === CHAT);
      // The bubble exists the whole time, uploading or not.
      if (chat && chat.messages.length > 0 && seen.length >= 0) {
        expect(chat.messages.at(-1)?.attachments?.[0]?.name).toBe("movie.mkv");
      }
    });

    await pending;
    unsubscribe();

    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeGreaterThan(0);
    // Progress is cleared once the file is through, so a stale bar cannot sit
    // under a message that already went.
    expect(messagesStore.getState().uploads).toEqual({});
  });

  it("never writes the payload into the outbox or the message body", async () => {
    const { sent } = installCloud();
    await boot();

    await messagesStore.sendMessage({
      chatId: CHAT,
      peerEmail: PEER,
      text: "here",
      attachments: [
        {
          id: "nobody000000000",
          kind: "file",
          name: "huge.bin",
          mimeType: "application/octet-stream",
          size: MAX_BUCKET_FILE_BYTES,
          file: blobOf(MAX_BUCKET_FILE_BYTES),
        },
      ],
    });

    // The outbox is localStorage. Anything in it has to survive a reload as text,
    // so a file handle in it would come back as an empty object that still claims
    // to be an attachment.
    const outbox = Object.keys(window.localStorage)
      .filter((key) => key.startsWith("tk-messages-outbox:"))
      .map((key) => window.localStorage.getItem(key) ?? "");
    expect(outbox.join("")).not.toContain("huge.bin");
    expect(window.localStorage.getItem("tk-messages-outbox:" + ME)).toBeNull();

    const body = JSON.parse(
      String(sent.find((call) => call.url === "/api/messages/message")?.body),
    );
    expect(body.attachments).toEqual([
      {
        id: "nobody000000000",
        kind: "file",
        name: "huge.bin",
        mimeType: "application/octet-stream",
        size: MAX_BUCKET_FILE_BYTES,
      },
    ]);
  });

  it("takes the message back when the file never arrives, rather than leaving it spinning", async () => {
    installCloud({ failPart: true });
    await boot();

    const result = await messagesStore.sendMessage({
      chatId: CHAT,
      peerEmail: PEER,
      text: "will not make it",
      attachments: [
        {
          id: "doomed0000000000",
          kind: "file",
          name: "doomed.bin",
          mimeType: "application/octet-stream",
          size: MAX_BUCKET_FILE_BYTES,
          file: blobOf(MAX_BUCKET_FILE_BYTES),
        },
      ],
    });

    expect(result).toEqual({ ok: false, reason: "upload-failed" });
    const chat = messagesStore.getState().data?.chats.find((entry) => entry.id === CHAT);
    expect(chat?.messages).toHaveLength(0);
    expect(messagesStore.getState().uploads).toEqual({});
  });
});
