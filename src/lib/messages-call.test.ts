// @vitest-environment jsdom
//
// The call as the store sees it: the frames that go out, the ones that come in,
// and the state each one leaves behind. The media itself is covered by
// call-media.test.ts; this is the conversation around it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CallMedia, type CallMediaEvents } from "./call-media";
import { messagesStore } from "./messages-store";
import type { MessageChat, MessagesSnapshot } from "./messages-protocol";

const ME = "me@example.com";
const PEER = "peer@example.com";
const CHAT = "chat-1";

const snapshot = (): MessagesSnapshot => ({
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
      name: "Todor Khristov Streams",
      initials: "TO",
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
      messages: [],
    },
  ],
  rev: 1,
  serverTime: Date.now(),
  typing: [],
});

type Frame = { chatId: string; callId: string; kind: string; [key: string]: unknown };

/** A cloud stub that records every call frame the store sends. */
const install = (extraChats: MessageChat[] = []) => {
  window.localStorage.clear();
  const frames: Frame[] = [];
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
      if (url.startsWith("/api/messages/session")) return json({ ok: true, email: ME, name: "Me" });
      if (url.startsWith("/api/messages/friend/list")) {
        return json({
          ok: true,
          friends: { incoming: [], outgoing: [], friends: [], declined: [] },
        });
      }
      if (url === "/api/messages/call" && init?.method === "POST") {
        frames.push(JSON.parse(String(init.body)) as Frame);
        return json({ ok: true, relayed: true });
      }
      if (url.startsWith("/api/messages")) {
        const whole = snapshot();
        return json({ ok: true, snapshot: { ...whole, chats: [...whole.chats, ...extraChats] } });
      }
      return json({ ok: true });
    }),
  );
  return frames;
};

/** A media layer that records the handshake without a browser. */
const fakeMedia = () => {
  const signals: Array<{ kind: string; to?: string; description?: unknown }> = [];
  let events: CallMediaEvents = {
    onSignal: () => {},
    onRemote: () => {},
    onPeer: () => {},
    onLocal: () => {},
    onScreen: () => {},
  };
  /** The stand ins this layer has handed out, so a test can move a connection. */
  const selfs: Array<{ fireState: (state: string) => void }> = [];
  const media = new CallMedia({
    media: {
      getUserMedia: async () => ({
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
      }),
      getDisplayMedia: async () => ({
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
      }),
      enumerateDevices: async () => [],
    },
    rtc: () => {
      const self = {
        localDescription: null as unknown,
        connectionState: "new",
        onicecandidate: null as ((event: { candidate: unknown }) => void) | null,
        ontrack: null as ((event: { streams: unknown[] }) => void) | null,
        onconnectionstatechange: null as (() => void) | null,
        addTrack: () => {},
        addIceCandidate: async () => undefined,
        createOffer: async () => ({ type: "offer" }),
        createAnswer: async () => ({ type: "answer" }),
        setLocalDescription: async () => undefined,
        setRemoteDescription: async () => undefined,
        close: () => {
          self.connectionState = "closed";
        },
        getSenders: () => [],
      };
      const made = {
        get connectionState() {
          return self.connectionState;
        },
        fireState: (state: string) => {
          self.connectionState = state;
          self.onconnectionstatechange?.();
        },
      };
      selfs.push(made);
      return self;
    },
  });
  // The store takes the seam over, so the handlers it installed are kept here
  // for a test to drive the connection state.
  const listen = media.listen.bind(media);
  media.listen = (next) => {
    events = next;
    listen(next);
  };
  media.listen({
    onSignal: (signal) => signals.push(signal),
    onRemote: () => {},
    onPeer: () => {},
    onLocal: () => {},
    onScreen: () => {},
  });
  return {
    media,
    signals,
    selfs,
    /** What the media layer tells the store when a connection moves. */
    report: (state: "connecting" | "connected" | "disconnected" | "failed") => {
      for (const self of selfs) self.fireState(state);
      events.onPeer("peer@example.com", state);
    },
  };
};

const boot = async () => {
  const frames = install();
  const fake = fakeMedia();
  messagesStore.attachCallMedia(fake.media);
  await messagesStore.start();
  await messagesStore.sync();
  return { frames, media: fake.media, signals: fake.signals, report: fake.report };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("placing a call", () => {
  beforeEach(() => {
    messagesStore.reset();
  });
  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("rings the peer and shows what is happening", async () => {
    const { frames } = await boot();
    const result = await messagesStore.beginCall({ chatId: CHAT, starts: "video" });

    expect(result.ok).toBe(true);
    const call = messagesStore.getState().call;
    // Ringing, not connecting: nothing is being connected yet, and a person
    // watching this screen has to be able to tell the two apart.
    expect(call.status).toBe("outgoing");
    expect(call.peerName).toBe("Todor Khristov Streams");
    expect(call.starts).toBe("video");
    expect(call.camera).toBe(true);

    // An invite first, then the offer, both through the gateway.
    await settle();
    // The call is opened on the object first, then the person is rung: a phone
    // that has not been asked for permission cannot be called on anybody's
    // behalf.
    expect(frames.map((frame) => frame.kind)).toEqual(["begin", "invite"]);
    expect(frames[1]?.chatId).toBe(CHAT);
    expect(frames[1]?.callId).toBe(call.callId);
    expect(frames[1]?.["to"]).toBe("peer@example.com");
  });

  it("refuses a second call while one is up", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const again = await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });

    expect(again.ok).toBe(false);
    expect(messagesStore.getState().call.status).toBe("outgoing");
  });

  it("says nothing about a conversation that is not there", async () => {
    await boot();
    const result = await messagesStore.beginCall({ chatId: "nope", starts: "audio" });
    expect(result.ok).toBe(false);
  });

  it("refuses a call it cannot carry, rather than ringing for ever", async () => {
    const frames = install();
    const fake = fakeMedia();
    messagesStore.attachCallMedia(fake.media);
    // The cloud cannot be reached, so the store falls back to the device data,
    // which is where somebody with three conversations and no address lands.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    await messagesStore.start();
    await messagesStore.sync();
    expect(messagesStore.getState().mode).toBe("local");

    const result = await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });

    // Nothing can carry the handshake, so a call placed here could never
    // connect. Saying so now is the difference between an answer and a screen
    // that spins for ever.
    expect(result).toMatchObject({ ok: false, reason: "offline" });
    expect(messagesStore.getState().call.status).toBe("idle");
    // And nothing was sent to the object pretending otherwise.
    expect(frames.filter((frame) => ["begin", "invite"].includes(frame.kind))).toEqual([]);
  });

  it("refuses to ring a conversation that has no address", async () => {
    // A conversation that was written on a device rather than through a sign in:
    // a person, a name, and no address to ring.
    const frames = install([
      { id: "no-address", peerEmail: "", pinned: false, muted: false, updatedAt: 1, messages: [] },
    ]);
    const fake = fakeMedia();
    messagesStore.attachCallMedia(fake.media);
    await messagesStore.start();
    await messagesStore.sync();

    const result = await messagesStore.beginCall({ chatId: "no-address", starts: "audio" });

    // A conversation with nobody's address in it is a row in the history, not a
    // person to ring.
    expect(result).toMatchObject({ ok: false, reason: "no-address" });
    expect(messagesStore.getState().call.status).toBe("idle");
    expect(frames.filter((frame) => ["begin", "invite"].includes(frame.kind))).toEqual([]);
  });

  it("gives up on a call nobody answers, instead of ringing for ever", async () => {
    vi.useFakeTimers();
    try {
      const { frames } = await boot();
      await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
      await vi.advanceTimersByTimeAsync(0);
      frames.length = 0;

      await vi.advanceTimersByTimeAsync(45_000);

      // Nobody picked up, and the app says so rather than leaving a person
      // watching a spinner and wondering whether it is still trying.
      const call = messagesStore.getState().call;
      expect(call.status).toBe("ended");
      expect(call.reason).toBe("timeout");
      expect(frames.some((frame) => frame.kind === "end" && frame["reason"] === "timeout")).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);
});

describe("answering a call", () => {
  beforeEach(() => {
    messagesStore.reset();
  });
  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("rings with the peer's name and face, taken from the contact list", async () => {
    await boot();
    messagesStore.handleCallSignal({
      kind: "invite",
      callId: "call-1",
      chatId: CHAT,
      starts: "video",
    });

    const call = messagesStore.getState().call;
    expect(call.status).toBe("incoming");
    expect(call.peerName).toBe("Todor Khristov Streams");
    expect(call.peerEmail).toBe(PEER);
    expect(call.starts).toBe("video");
  });

  it("answers with the accept and the answer the media built", async () => {
    const { frames } = await boot();
    messagesStore.handleCallSignal({ kind: "invite", callId: "call-1", chatId: CHAT });
    // The caller offered before this side had media.
    messagesStore.handleCallSignal({
      kind: "offer",
      callId: "call-1",
      chatId: CHAT,
      description: { type: "offer" },
    });

    const result = await messagesStore.answerCall();
    await settle();

    expect(result.ok).toBe(true);
    // Picked up, so the call is on screen. The connection is a separate question
    // the media layer answers on its own, and holding the screen on "connecting"
    // until it does leaves a call that is being had showing as one that is not.
    expect(messagesStore.getState().call.status).toBe("active");
    expect(messagesStore.getState().call.answeredAt).toBeGreaterThan(0);
    expect(frames.map((frame) => frame.kind)).toEqual(["accept", "answer"]);
  });

  it("declines a call that is already up elsewhere", async () => {
    const { frames } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    frames.length = 0;

    messagesStore.handleCallSignal({
      kind: "invite",
      callId: "call-2",
      chatId: CHAT,
    });

    // The call in progress is not replaced, and the other side is told why.
    expect(messagesStore.getState().call.status).toBe("outgoing");
    await settle();
    expect(frames.at(-1)).toMatchObject({ kind: "decline", reason: "busy" });
  });

  it("refuses to answer a call that is not ringing", async () => {
    await boot();
    const result = await messagesStore.answerCall();
    expect(result.ok).toBe(false);
  });
});

describe("a call in progress", () => {
  beforeEach(() => {
    messagesStore.reset();
  });
  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("mirrors the switches so the other side sees them", async () => {
    const { frames } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "video" });
    frames.length = 0;

    await messagesStore.setCallMedia({ mic: false });
    await messagesStore.setCallMedia({ screen: true });

    const state = messagesStore.getState().call;
    expect(state.mic).toBe(false);
    expect(state.screen).toBe(true);
    expect(frames[0]).toMatchObject({ kind: "state", mic: false });
    expect(frames[1]).toMatchObject({ kind: "state", screen: true });
  });

  it("shows the peer's switches when they report them", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "video" });
    const callId = messagesStore.getState().call.callId;

    messagesStore.handleCallSignal({
      kind: "state",
      callId,
      chatId: CHAT,
      from: "peer@example.com",
      mic: false,
      camera: true,
    });

    // Each person carries their own switches, so a mute in a group is one
    // person's row changing and not the whole call turning quiet.
    const peer = messagesStore.getState().call.participants.find((person) => !person.isSelf);
    expect(peer?.mic).toBe(false);
    expect(peer?.camera).toBe(true);
    // A frame for a call that is not this one changes nothing.
    messagesStore.handleCallSignal({
      kind: "state",
      callId: "other",
      chatId: CHAT,
      from: "peer@example.com",
      mic: true,
    });
    const after = messagesStore.getState().call.participants.find((person) => !person.isSelf);
    expect(after?.mic).toBe(false);
  });

  it("goes active when the media layer says the connection is up", async () => {
    const { report } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    expect(messagesStore.getState().call.status).toBe("outgoing");

    report("connected");
    expect(messagesStore.getState().call.status).toBe("active");
  });

  it("ends when the connection drops, so the user is not left on a dead call", async () => {
    const { report } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    report("connected");

    report("failed");
    expect(messagesStore.getState().call.status).toBe("ended");
    expect(messagesStore.getState().call.reason).toBe("failed");
  });

  it("keeps somebody in the call through a moment of no signal", async () => {
    const { report } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    report("connected");
    const callId = messagesStore.getState().call.callId;
    messagesStore.handleCallSignal({
      kind: "accept",
      callId,
      chatId: CHAT,
      from: PEER,
    });

    // A phone in a lift reports this and comes back on its own, and the media
    // layer is already asking for new addresses. Taking the person out of the
    // call here is how a lift ride used to end a call that was about to be fine.
    report("disconnected");
    expect(messagesStore.getState().call.status).not.toBe("ended");
    const peer = messagesStore.getState().call.participants.find((person) => person.email === PEER);
    expect(peer?.status).not.toBe("left");

    // And when the signal comes back, the call is simply the call again.
    report("connected");
    expect(messagesStore.getState().call.status).toBe("active");
    expect(
      messagesStore.getState().call.participants.find((person) => person.email === PEER)?.status,
    ).not.toBe("left");
  });

  it("ends on a hang up, tells the other side why, and writes the call down", async () => {
    const { frames } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const callId = messagesStore.getState().call.callId;
    frames.length = 0;

    const result = await messagesStore.endCall();
    await settle();

    expect(result.ok).toBe(true);
    expect(messagesStore.getState().call.status).toBe("ended");
    // The end goes out to the peer, and the record follows it into the history.
    expect(frames[0]).toMatchObject({ kind: "end", callId, reason: "hangup" });
    expect(frames.at(-1)).toMatchObject({ kind: "log", callId });
  });

  it("ends when the other side hangs up", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const callId = messagesStore.getState().call.callId;

    messagesStore.handleCallSignal({ kind: "end", callId, chatId: CHAT, reason: "hangup" });
    expect(messagesStore.getState().call.status).toBe("ended");

    // A late frame from a call that already finished changes nothing.
    messagesStore.handleCallSignal({ kind: "invite", callId, chatId: CHAT });
    expect(messagesStore.getState().call.status).toBe("ended");
  });

  it("clears back to idle so the next call starts clean", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    await messagesStore.endCall();
    messagesStore.clearCall();

    const call = messagesStore.getState().call;
    expect(call.status).toBe("idle");
    expect(call.callId).toBe("");
    expect(messagesStore.getState().remoteStreams).toEqual({});
  });

  it("ignores a frame for a conversation the account does not have", async () => {
    await boot();
    messagesStore.handleCallSignal({ kind: "invite", callId: "x", chatId: "not-mine" });
    // Nothing to ring, so nothing changes: there is no peer to name.
    expect(messagesStore.getState().call.peerEmail).toBe("");
  });
});

describe("the call log", () => {
  beforeEach(() => {
    messagesStore.reset();
  });
  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  /** The calls the conversation's history holds, newest last. */
  const logged = () =>
    messagesStore.getState().data?.chats.find((chat) => chat.id === CHAT)?.calls ?? [];

  it("writes a call that ran, with how long it lasted", async () => {
    const { report } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    report("connected");
    const callId = messagesStore.getState().call.callId;

    await messagesStore.endCall();
    await settle();

    expect(logged()).toHaveLength(1);
    expect(logged()[0]).toMatchObject({ callId, outcome: "completed" });
    expect(logged()[0]?.caller).toBe(ME);
    expect(logged()[0]?.endedBy).toBe(ME);
    expect(logged()[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("writes a call nobody answered as a cancellation for the one who gave up", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "video" });

    await messagesStore.endCall();
    await settle();

    // Nobody was ever connected, so the call did not run: I gave up on it.
    expect(logged()[0]).toMatchObject({ outcome: "cancelled", durationMs: 0, starts: "video" });
  });

  it("writes a declined call, which the other side reads as missed", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const callId = messagesStore.getState().call.callId;

    messagesStore.handleCallSignal({ kind: "decline", callId, chatId: CHAT, reason: "declined" });
    await settle();

    expect(logged()[0]).toMatchObject({ callId, outcome: "declined", endedBy: PEER });
  });

  it("writes a call that fell over, because it was still a call", async () => {
    const { report } = await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    report("connected");

    report("failed");
    await settle();

    expect(logged()[0]).toMatchObject({ outcome: "failed" });
  });

  it("writes the call once, however many times it is put down", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const callId = messagesStore.getState().call.callId;

    await messagesStore.endCall();
    await settle();
    // A second frame for a call that is already over changes nothing.
    messagesStore.handleCallSignal({ kind: "end", callId, chatId: CHAT, reason: "hangup" });
    await settle();

    expect(logged()).toHaveLength(1);
  });

  it("keeps a record of a call that never got off the ground out of the next one", async () => {
    await boot();
    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const first = messagesStore.getState().call.callId;
    await messagesStore.endCall();
    messagesStore.clearCall();
    await settle();

    await messagesStore.beginCall({ chatId: CHAT, starts: "audio" });
    const second = messagesStore.getState().call.callId;
    await messagesStore.endCall();
    await settle();

    expect(second).not.toBe(first);
    expect(logged().map((entry) => entry.callId)).toEqual([first, second]);
  });

  it("does not write a call for a conversation the account does not have", async () => {
    await boot();
    messagesStore.handleCallSignal({ kind: "invite", callId: "x", chatId: "not-mine" });
    messagesStore.handleCallSignal({ kind: "end", callId: "x", chatId: "not-mine" });
    await settle();

    expect(logged()).toHaveLength(0);
  });
});
