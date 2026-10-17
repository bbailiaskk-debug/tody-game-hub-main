// A call with more than two people, as the object holds it.
//
// The object is a post office, not a switchboard: it keeps who is in the call
// and in what order, stamps who sent each frame, and answers with the addresses
// that are left. Everything worth being wrong about a group call is in those
// rules — a frame reaching the wrong phone, a person invited twice, a call that
// never ends.

import { describe, expect, it } from "vitest";

import { MessagesDO } from "../../exports.cloudflare";
import type { MessageChat } from "../lib/messages-protocol";

const HOST = "host@example.com";
const SECOND = "second@example.com";
const THIRD = "third@example.com";
const FOURTH = "fourth@example.com";

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

/**
 * One account's object, with a chat for every other account so the frame can be
 * answered with the peer the way the gateway does.
 */
const seedObject = (email: string, peers: string[]) => {
  const storage = memoryStorage();
  const chats = new Map<string, MessageChat>();
  peers.forEach((peer, index) => {
    chats.set(`chat-${index}`, {
      id: `chat-${index}`,
      peerEmail: peer,
      pinned: false,
      muted: false,
      updatedAt: 1_000,
      messages: [],
    });
  });
  const chatId = `chat-0`;
  storage.map.set("profile", {
    email,
    name: email,
    about: "",
    accent: "#1DB954",
    avatar: null,
    online: true,
    lastSeenAt: 1_700_000_000_000,
    status: "online",
  });
  for (const chat of chats.values()) storage.map.set(`chat:${chat.id}`, chat);
  storage.map.set("chatIndex", [...chats.keys()]);

  const frames: Array<{ type?: string; signal?: { kind: string; to?: string }; roster?: unknown }> =
    [];
  const object = new MessagesDO(
    {
      storage,
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
      waitUntil: () => {},
      getWebSockets: () => [{ send: (frame: string) => frames.push(JSON.parse(frame)) }],
    } as never,
    {} as never,
  );

  /** A frame as somebody else, which is how a stranger's would arrive. */
  const postAs = (who: string, payload: unknown, mirror = false) =>
    object.fetch(
      new Request("https://messages-do/call", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-messages-secret": "1",
          "x-messages-email": who,
          ...(mirror ? { "x-messages-mirror": "1" } : {}),
        },
        body: JSON.stringify(payload),
      }),
    );

  return {
    object,
    frames,
    /** Posts a call frame the way the gateway does, with the identity resolved. */
    post: (payload: unknown, mirror = false) => postAs(email, payload, mirror),
    postAs,
    session: (callId: string) =>
      storage.map.get(`call:${callId}`) as
        { participants: Array<{ email: string; order: number; status: string }> } | undefined,
  };
};

const answered = async (response: Response) =>
  (await response.json()) as {
    ok?: boolean;
    peers?: string[];
    roster?: { participants: Array<{ email: string; order: number; status: string }> };
    members?: string[];
  };

describe("a call with four people in the object", () => {
  it("opens a call with the person who placed it in it", async () => {
    const host = seedObject(HOST, [SECOND]);

    const result = await answered(
      await host.post({ kind: "begin", callId: "c1", chatId: "chat-0", starts: "video" }),
    );

    expect(result.ok).toBe(true);
    expect(result.roster?.participants).toEqual([{ email: HOST, order: 0, status: "active" }]);
  });

  it("adds each person once, in the order they were asked", async () => {
    const host = seedObject(HOST, [SECOND, THIRD, FOURTH]);

    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });
    const first = await answered(
      await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: SECOND }),
    );
    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: THIRD });
    // The same person twice changes nothing, so nothing is said about it: a
    // duplicate invite must not leave a phone that thinks it is in two calls,
    // and must not re-render every device in the call either.
    const again = await answered(
      await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: THIRD }),
    );
    expect(again.roster).toBeUndefined();
    expect(first.roster?.participants.map((person) => person.email)).toEqual([HOST, SECOND]);

    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: FOURTH });
    // The order is what both phones agree on for who offers the connection.
    expect(host.session("c1")?.participants.map((person) => person.order)).toEqual([0, 1, 2, 3]);
  });

  it("names the people a frame is for, and everybody for a broadcast", async () => {
    const host = seedObject(HOST, [SECOND, THIRD, FOURTH]);
    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });
    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: SECOND });
    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: THIRD });
    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: FOURTH });
    for (const who of [SECOND, THIRD, FOURTH]) {
      await host.post({ kind: "accept", callId: "c1", chatId: "chat-0", to: HOST, from: who });
    }

    // A session description is for one person: three of them are named, and only
    // the one is answered.
    const toOne = await answered(
      await host.post({
        kind: "offer",
        callId: "c1",
        chatId: "chat-0",
        to: THIRD,
        description: { type: "offer" },
      }),
    );
    expect(toOne.peers).toEqual([THIRD]);

    // A mute is for everybody, and everybody else who is still in the call.
    const toAll = await answered(
      await host.post({ kind: "state", callId: "c1", chatId: "chat-0", mic: false }),
    );
    expect(toAll.peers?.sort()).toEqual([FOURTH, SECOND, THIRD].sort());
  });

  it("pushes the roster to the sockets beside the frame that changed it", async () => {
    const host = seedObject(HOST, [SECOND, THIRD]);

    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });
    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: SECOND });

    const kinds = host.frames.map((frame) => frame.type);
    expect(kinds).toContain("roster");
    const roster = host.frames.at(-1)?.roster as { participants: Array<{ email: string }> };
    expect(roster.participants.map((person) => person.email)).toEqual([HOST, SECOND]);
  });

  it("stamps who sent the frame, so a phone can tell its own echo", async () => {
    const host = seedObject(HOST, [SECOND]);
    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });

    // Every frame comes back to the sender's own devices as well, and this is
    // how one of them knows the frame is not the other person speaking.
    const signals = host.frames.filter((frame) => frame.type === "call");
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((frame) => frame.signal?.kind === "begin")).toBe(true);
  });

  it("answers an invite for a call that is over, and says so once", async () => {
    const host = seedObject(HOST, [SECOND]);
    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });
    await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: SECOND });
    await host.post({ kind: "end", callId: "c1", chatId: "chat-0", reason: "hangup" });

    const late = await answered(
      await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: SECOND }),
    );
    // The phone that is still ringing is answered, so it stops waiting, and it
    // is not put back into a call that is over.
    expect(late.peers).toEqual([SECOND]);
  });

  it("ends the call for everybody and names who was in it", async () => {
    const host = seedObject(HOST, [SECOND, THIRD, FOURTH]);
    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });
    for (const who of [SECOND, THIRD, FOURTH]) {
      await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: who });
      await host.post({ kind: "accept", callId: "c1", chatId: "chat-0", to: HOST, from: who });
    }

    const ended = await answered(
      await host.post({ kind: "end", callId: "c1", chatId: "chat-0", reason: "hangup" }),
    );

    // Everybody still in it is reached, and the gateway is told who they were
    // so the history can be written in each of their own conversations.
    expect(ended.peers?.sort()).toEqual([FOURTH, SECOND, THIRD].sort());
    expect(ended.members?.sort()).toEqual([FOURTH, SECOND, THIRD].sort());
    expect(ended.roster?.participants.every((person) => person.status === "left")).toBe(true);
  });

  it("refuses a frame from somebody who is not in the call", async () => {
    const host = seedObject(HOST, [SECOND]);
    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });

    // One account cannot drive another account's call, which is also what keeps
    // a stranger's address from being routed to anybody.
    const stranger = await answered(
      await host.postAs(
        "stranger@example.com",
        { kind: "end", callId: "c1", chatId: "chat-0" },
        true,
      ),
    );
    expect(stranger.ok).toBe(false);
    expect(stranger.peers ?? []).toEqual([]);
    // And the call is still up, because the stranger did not end it.
    expect(host.session("c1")?.participants.some((person) => person.email === HOST)).toBe(true);
  });

  it("routes a renegotiation notice to the one device it is about", async () => {
    const host = seedObject(HOST, [SECOND, THIRD]);
    await host.post({ kind: "begin", callId: "c1", chatId: "chat-0" });
    for (const who of [SECOND, THIRD]) {
      await host.post({ kind: "invite", callId: "c1", chatId: "chat-0", to: who });
      await host.post({ kind: "accept", callId: "c1", chatId: "chat-0", to: HOST, from: who });
    }

    // A screen shared in a voice call: only the pair of devices holding that
    // link needs to hear about it, and the other pair must not be asked to
    // renegotiate a connection that is not theirs.
    const renewed = await answered(
      await host.post({ kind: "renegotiate", callId: "c1", chatId: "chat-0", to: THIRD }),
    );
    expect(renewed.ok).toBe(true);
    expect(renewed.peers).toEqual([THIRD]);
  });

  it("answers a frame for a call it has never heard of", async () => {
    const host = seedObject(HOST, [SECOND]);
    const missing = await answered(
      await host.post({ kind: "invite", callId: "no-such-call", chatId: "chat-0", to: SECOND }),
    );
    expect(missing.ok).toBe(false);
  });
});
