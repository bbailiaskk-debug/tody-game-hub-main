// @vitest-environment jsdom

// A reaction, from the press of the button to the row on the other phone.
//
// This is the one change either side may make to a message they did not send, so
// the whole chain is worth pinning: the toggle that turns a press into a change, the
// object's route that applies it to somebody else's message, the mirror into the
// other object, and the rule that a reaction may not name its own author.
//
// The order is the thing that is easy to get wrong and hard to see. A reaction
// stored on one side only is a reaction the other person never sees, and that reads
// as the feature being broken rather than as half of it being missing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesDO } from "../../exports.cloudflare";
import { messagesStore } from "./messages-store";
import {
  MAX_REACTIONS_PER_EMOJI,
  MAX_REACTIONS_PER_MESSAGE,
  isMineOn,
  isUsableReaction,
  reactionSummary,
  setReaction,
  toggleReaction,
  type ChatMessage,
  type MessageChat,
  type MessagesProfile,
  type MessagesSnapshot,
} from "./messages-protocol";

const ME = "me@example.com";
const PEER = "peer@example.com";
const CHAT = "chat-1";
const THUMBS = "👍";
const PARTY = "🎉";

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

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  fromMe: false,
  text: "здравей",
  at: 1,
  status: "read",
  ...over,
});

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

/** An object holding one conversation with one message in it. */
const seedObject = (initial: ChatMessage) => {
  const storage = memoryStorage();
  const chat: MessageChat = {
    id: CHAT,
    peerEmail: PEER,
    pinned: false,
    muted: false,
    updatedAt: 1,
    messages: [initial],
  };
  storage.map.set("profile", { ...profile, email: ME });
  storage.map.set(`chat:${CHAT}`, chat);
  storage.map.set("chatIndex", [CHAT]);
  const object = new MessagesDO(
    {
      storage,
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
      waitUntil: () => {},
      getWebSockets: () => [],
    } as never,
    {} as never,
  );
  return {
    object,
    /** The one message in it, with its type: what the assertions below are about is
     * what is on the row, and a missing field has to be readable as missing rather
     * than as a crash halfway through a test. */
    stored: () => (storage.map.get(`chat:${CHAT}`) as MessageChat).messages[0] as ChatMessage,
  };
};

/** The reactions on the seeded message, or nothing if there are none. */
const reactionsOn = (seeded: { stored: () => ChatMessage }) => seeded.stored().reactions;

/**
 * The write as the gateway makes it: the author's address in the body, the resolved
 * one in the header, and the mirror marker on the copy that goes into the peer's
 * object.
 */
const press = (
  object: MessagesDO,
  emoji: string,
  options: {
    as?: string;
    author?: string;
    messageId?: string;
    mirrored?: boolean;
    on?: boolean;
  } = {},
) => {
  const as = options.as ?? ME;
  return object.fetch(
    new Request("https://messages-do/message/react", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-messages-secret": "1",
        "x-messages-email": as,
        ...(options.mirrored ? { "x-messages-mirror": "1" } : {}),
      },
      body: JSON.stringify({
        chatId: CHAT,
        id: options.messageId ?? "m1",
        emoji,
        // On or off, never a toggle. Defaulting to on here is the point: the object
        // has to be told which, because it cannot work it out.
        on: options.on ?? true,
        // Present on every write, and the only thing a mirror trusts — which is why
        // the test below checks that it cannot be used on its own.
        authorEmail: options.author ?? as,
      }),
    }),
  );
};

describe("turning a press into a change", () => {
  it("puts the address on the emoji", () => {
    expect(toggleReaction(message(), THUMBS, ME)).toEqual([{ emoji: THUMBS, by: [ME] }]);
  });

  it("takes it off on a second press, and leaves no empty row behind", () => {
    const withOne = message({ reactions: toggleReaction(message(), THUMBS, ME) ?? [] });
    // A message nobody has reacted to carries no field at all, rather than an array
    // with nothing in it on every row for ever.
    expect(toggleReaction(withOne, THUMBS, ME)).toEqual([]);
  });

  it("is asked for as on or off rather than toggled, so a mirror can be retried", () => {
    const on = setReaction(message(), THUMBS, ME, true) ?? [];
    // The same request arriving twice must leave the same thing on the message. A
    // toggle would answer the second copy by taking the reaction off, which is how a
    // reaction somebody can see appear then quietly vanishes.
    expect(setReaction(message({ reactions: on }), THUMBS, ME, true)).toBeNull();
    // And pressing it again — the person changing their mind — is `off`, not a second
    // `on`.
    expect(setReaction(message({ reactions: on }), THUMBS, ME, false)).toEqual([]);
  });

  it("counts a person once however they spell their address", () => {
    const once = toggleReaction(message(), THUMBS, ME) ?? [];
    const again = toggleReaction(message({ reactions: once }), THUMBS, "ME@Example.com ");
    // The same person in another case is the same person, so this is their second
    // press and not a second name on the row.
    expect(again).toEqual([]);
  });

  it("keeps two people on one emoji apart, and one person on two emoji", () => {
    const mine = toggleReaction(message(), THUMBS, ME) ?? [];
    const theirs = toggleReaction(message({ reactions: mine }), THUMBS, PEER) ?? [];
    expect(theirs).toEqual([{ emoji: THUMBS, by: [ME, PEER] }]);
    expect(toggleReaction(message({ reactions: theirs }), PARTY, ME)).toEqual([
      { emoji: THUMBS, by: [ME, PEER] },
      { emoji: PARTY, by: [ME] },
    ]);
  });

  it("refuses a row with no room left on it", () => {
    const emoji = [THUMBS, "🎯", "😍", "😂", "🙂", "🚀", "👏", "🧪"];
    let full = message();
    for (const one of emoji) full = { ...full, reactions: toggleReaction(full, one, ME) ?? [] };
    expect(full.reactions).toHaveLength(MAX_REACTIONS_PER_MESSAGE);
    // A ninth is not stored, and a press on one of the eight still is.
    expect(toggleReaction(full, "🧑‍🚀", PEER)).toBeNull();
    expect(toggleReaction(full, THUMBS, PEER)).not.toBeNull();
  });

  it("refuses a row with too many people on one emoji", () => {
    let row = message();
    for (let index = 0; index < MAX_REACTIONS_PER_EMOJI; index += 1) {
      row = { ...row, reactions: toggleReaction(row, THUMBS, `p${index}@example.com`) ?? [] };
    }
    expect(toggleReaction(row, THUMBS, "one-more@example.com")).toBeNull();
  });

  it("says which way the press goes, from the row in front of the reader", () => {
    // The question the composer asks before it writes anything, and the only place
    // it is answered: the composer and the optimistic update have to agree about it
    // or the button would flip back the moment the sync lands.
    const bare = message();
    expect(isMineOn(bare, THUMBS, ME)).toBe(false);
    const withOne = { ...bare, reactions: setReaction(bare, THUMBS, ME, true) ?? [] };
    expect(isMineOn(withOne, THUMBS, ME)).toBe(true);
    // Somebody else's press is not this account's, which is the whole difference
    // between the two buttons on the same emoji.
    expect(isMineOn(withOne, THUMBS, PEER)).toBe(false);
  });

  it("will not store prose, a control character or nothing", () => {
    expect(isUsableReaction("")).toBe(false);
    expect(isUsableReaction("   ")).toBe(false);
    expect(isUsableReaction("здравей")).toBe(false);
    expect(isUsableReaction(`a${THUMBS}`)).toBe(false);
    // Inside the string rather than at the end of it: what is stored is trimmed, so
    // a trailing newline is not a reason to refuse anything.
    expect(isUsableReaction(`${THUMBS}\n${PARTY}`)).toBe(false);
    expect(isUsableReaction(THUMBS)).toBe(true);
    // Flags are several code points each, which is why the limit counts points and
    // not bytes: a flag is still one button.
    expect(isUsableReaction("🇧🇬")).toBe(true);
    expect(isUsableReaction(THUMBS.repeat(MAX_REACTIONS_PER_EMOJI))).toBe(false);
  });

  it("leaves a deleted message alone, whatever is pressed on it", () => {
    expect(toggleReaction(message({ deletedAt: 5 }), THUMBS, ME)).toBeNull();
  });

  it("reports the count and whether this account is one of them", () => {
    const withThree = message({
      reactions: [
        { emoji: THUMBS, by: [ME, PEER, "third@example.com"] },
        { emoji: PARTY, by: [PEER] },
      ],
    });
    expect(reactionSummary(withThree, ME)).toEqual([
      { emoji: THUMBS, count: 3, mine: true },
      { emoji: PARTY, count: 1, mine: false },
    ]);
    // The same row read by the other person, which is the other half of the point.
    expect(reactionSummary(withThree, PEER)).toEqual([
      { emoji: THUMBS, count: 3, mine: true },
      { emoji: PARTY, count: 1, mine: true },
    ]);
  });

  it("shows nothing for a message nobody has reacted to", () => {
    expect(reactionSummary(message(), ME)).toEqual([]);
  });
});

describe("the object applying one", () => {
  it("accepts a reaction to somebody else's message", async () => {
    const seeded = seedObject(message());
    const response = await press(seeded.object, THUMBS);
    expect(response.status).toBe(200);
    expect(reactionsOn(seeded)).toEqual([{ emoji: THUMBS, by: [ME] }]);
    // And it answers with the peer, which is how the gateway knows where to mirror.
    expect(await response.json()).toMatchObject({ peerEmail: PEER });
  });

  it("takes the author from the session, never from the body", async () => {
    const seeded = seedObject(message());
    // The session here is the peer while the body names this account. The reaction
    // must land under the account that pressed it, or one person could answer for
    // another.
    await press(seeded.object, THUMBS, { as: PEER, author: ME });
    expect(reactionsOn(seeded)).toEqual([{ emoji: THUMBS, by: [PEER] }]);
  });

  it("mirrors what the reacter's address says, and only for a mirror", async () => {
    const peerSide = seedObject(message());
    // Marked as a mirror, so the reacter is the one the gateway named rather than
    // this object's own owner.
    await press(peerSide.object, PARTY, { as: PEER, mirrored: true, author: PEER });
    expect(reactionsOn(peerSide)).toEqual([{ emoji: PARTY, by: [PEER] }]);

    const direct = seedObject(message());
    await press(direct.object, PARTY, { as: PEER, author: ME });
    // Same body, no mirror marker: the session decides, and the session here is the
    // object's own owner. This is the branch a client cannot reach itself.
    expect(reactionsOn(direct)).toEqual([{ emoji: PARTY, by: [PEER] }]);
  });

  it("says nothing happened when the same request is repeated", async () => {
    const seeded = seedObject(message());
    await press(seeded.object, THUMBS, { on: true });
    const again = await press(seeded.object, THUMBS, { on: true });
    const result = (await again.json()) as { silent?: boolean };
    // Quiet means no revision and no broadcast: a retried request after a dropped
    // connection must not read as a change — and must not take the reaction off,
    // which is what a toggle would have done with the second copy.
    expect(result.silent).toBe(true);
    expect(reactionsOn(seeded)).toEqual([{ emoji: THUMBS, by: [ME] }]);
  });

  it("takes it off when the press says off", async () => {
    const seeded = seedObject(message());
    await press(seeded.object, THUMBS, { on: true });
    await press(seeded.object, THUMBS, { on: false });
    expect(reactionsOn(seeded)).toEqual([]);
  });

  it("refuses a reaction to a message that is not there", async () => {
    const seeded = seedObject(message());
    const response = await press(seeded.object, THUMBS, { messageId: "nope" });
    expect((await response.json()) as { silent?: boolean }).toMatchObject({ silent: true });
  });

  it("refuses prose, and leaves the message as it was", async () => {
    const seeded = seedObject(message());
    await press(seeded.object, "здравей как си");
    expect(reactionsOn(seeded)).toBeUndefined();
  });

  it("refuses a reaction to a deleted message", async () => {
    const seeded = seedObject(message({ deletedAt: 5 }));
    await press(seeded.object, THUMBS);
    expect(reactionsOn(seeded)).toBeUndefined();
  });
});

/**
 * The composer's side of the same press.
 *
 * The row is updated under the finger and the cloud is told which way it went, and
 * both of those are decisions this object does not get to check: by the time the
 * write lands, the reader has already seen the emoji appear. So what is worth
 * pinning here is that the request says `on` rather than leaving it to the far end,
 * and that the second press of the same emoji asks for `off` rather than repeating
 * `on`.
 */
describe("the store applying one", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  const row = () => messagesStore.getState().data?.chats[0]?.messages[0] as ChatMessage;

  const snapshotWith = (reactions?: ChatMessage["reactions"], over: Partial<ChatMessage> = {}) =>
    ({
      profile: { ...profile, email: ME },
      contacts: [],
      chats: [
        {
          id: CHAT,
          peerEmail: PEER,
          pinned: false,
          muted: false,
          updatedAt: 1,
          messages: [message({ ...over, ...(reactions ? { reactions } : {}) })],
        },
      ],
      rev: 1,
      serverTime: 1,
      typing: [],
    }) satisfies MessagesSnapshot;

  /** A cloud that keeps what it is told, the way the real object does. */
  const cloud = (reactions?: ChatMessage["reactions"], over: Partial<ChatMessage> = {}) => {
    const asked: Array<{ url: string; body: unknown }> = [];
    let current: MessagesSnapshot = snapshotWith(reactions, over);
    const json = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input).replace(
          /^https?:\/\/[^/]+/,
          "",
        );
        const body = init?.body
          ? (JSON.parse(String(init.body)) as { emoji: string; on: boolean })
          : null;
        asked.push({ url, body });
        if (url.startsWith("/api/messages/session"))
          return json({ ok: true, email: ME, name: "Me" });
        if (url === "/api/messages/friend/list") {
          return json({
            ok: true,
            friends: { incoming: [], outgoing: [], friends: [], declined: [] },
          });
        }
        if (url === "/api/messages/message/react" && body) {
          // The object has it now, so the snapshot the following sync reads says so
          // too, instead of arriving blank and wiping what the reader is looking at.
          const chat = current.chats[0] as MessageChat;
          current = {
            ...current,
            chats: [
              {
                ...chat,
                messages: [
                  { ...row(), reactions: setReaction(row(), body.emoji, ME, body.on) ?? [] },
                ],
              },
            ],
          };
          return json({ ok: true });
        }
        if (url === "/api/messages/") return json({ ok: true, snapshot: current });
        return json({ ok: true });
      }),
    );
    return asked;
  };

  const boot = async () => {
    await messagesStore.start();
    await vi.waitFor(() => expect(messagesStore.getState().status).toBe("ready"));
  };

  it("puts the emoji on the row under the finger, and asks for it to be on", async () => {
    const asked = cloud();
    await boot();

    const pending = messagesStore.toggleReaction({
      chatId: CHAT,
      messageId: row().id,
      emoji: THUMBS,
    });

    // Optimistic: the row is already carrying it while the request is in the air,
    // which is the whole reason this reads as a button rather than as a form.
    expect(row().reactions?.[0]?.by).toEqual([ME]);

    expect(await pending).toEqual({ ok: true });
    expect(asked.find((call) => call.url === "/api/messages/message/react")?.body).toMatchObject({
      id: "m1",
      chatId: CHAT,
      emoji: THUMBS,
      on: true,
    });
  });

  it("asks for it to be off on the second press, not for the same thing again", async () => {
    const asked = cloud([{ emoji: THUMBS, by: [ME] }]);
    await boot();

    expect(
      await messagesStore.toggleReaction({ chatId: CHAT, messageId: "m1", emoji: THUMBS }),
    ).toEqual({
      ok: true,
    });
    // A toggle here would send the same request twice and the object would have to
    // guess; this says what the reader meant, and a mirror can then be retried.
    expect(asked.find((call) => call.url === "/api/messages/message/react")?.body).toMatchObject({
      on: false,
    });
    expect(row().reactions).toEqual([]);
  });

  it("says no rather than guessing, for a message that is not there", async () => {
    const asked = cloud();
    await boot();

    expect(
      await messagesStore.toggleReaction({ chatId: CHAT, messageId: "nope", emoji: THUMBS }),
    ).toEqual({ ok: false, reason: "unknown-message" });
    // Nothing was asked of the cloud, because there was nothing to ask about.
    expect(asked.some((call) => call.url === "/api/messages/message/react")).toBe(false);
  });

  it("refuses a reaction to somebody's deleted message", async () => {
    // The row arrives already deleted, which is what the other side sees once the
    // tombstone has travelled: there is nothing on screen to be reacting to, so the
    // button says no rather than writing a reaction nobody will ever see.
    const asked = cloud(undefined, { deletedAt: 5 });
    await boot();

    expect(
      await messagesStore.toggleReaction({ chatId: CHAT, messageId: "m1", emoji: THUMBS }),
    ).toEqual({ ok: false, reason: "gone" });
    expect(asked.some((call) => call.url === "/api/messages/message/react")).toBe(false);
  });
});
