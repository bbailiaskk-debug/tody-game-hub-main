// @vitest-environment jsdom
//
// A voice call, from both ends at once.
//
// Everything else about calls is tested one side at a time, which can only ever
// prove that one side behaves. This runs the two participants for real: two
// stores, two identities, one cloud between them, and the frames crossing the
// same gateway the deployed app uses. What is checked is the conversation a
// person actually has — it rings, it is answered, it is heard, it is hung up,
// and it turns up in the history afterwards as a line either side can read.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CallMedia, type MediaStreamLike, type PeerLike, type TrackLike } from "./call-media";
import { MessagesStore } from "./messages-store";
import {
  callDuration,
  callSummary,
  type CallRecord,
  type MessagesSnapshot,
} from "./messages-protocol";

const ALICE = "alice@example.com";
const BOB = "bob@example.com";
const CHAT = "chat-a-b";

// ---------------------------------------------------------------- the cloud

type Frame = { kind: string; callId: string; chatId: string; [key: string]: unknown };

/**
 * The cloud both accounts share.
 *
 * It is the real gateway's shape: a call frame is answered with the peer taken
 * from the sender's own chat row, relayed to that peer's object, and pushed to
 * whoever has a socket open. Nothing here is invented for the test's benefit
 * except the socket, which jsdom does not have.
 */
const cloud = () => {
  /** Each account's own object, as the server stores it. */
  const objects = new Map<string, { chats: Map<string, Chat> }>();
  const sockets = new Map<string, (frame: unknown) => void>();
  /** The socket each account's store is currently holding, as a browser's is. */
  const opened = new Map<
    string,
    {
      onclose: (() => void) | null;
      onopen: (() => void) | null;
      onmessage: ((event: { data: string }) => void) | null;
    }
  >();
  const relayed: Frame[] = [];
  /**
   * Who the next request belongs to.
   *
   * A browser carries its identity in a cookie the login set, so a test with two
   * participants in one page has to say which account it is speaking as. Every
   * action in this file is awaited to the end, so nothing overlaps.
   */
  let current = ALICE;

  type Chat = {
    id: string;
    peerEmail: string;
    messages: Array<{ id: string; text: string; at: number; fromMe: boolean }>;
    calls: CallRecord[];
  };

  const objectFor = (email: string) => {
    let found = objects.get(email);
    if (!found) {
      found = { chats: new Map() };
      objects.set(email, found);
    }
    return found;
  };

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const snapshotFor = (email: string): MessagesSnapshot => {
    const other = objectFor(email).chats.get(CHAT)?.peerEmail ?? "";
    return {
      profile: {
        email,
        name: email === ALICE ? "Alice" : "Bob",
        about: "",
        accent: "#1DB954",
        avatar: null,
        online: true,
        lastSeenAt: Date.now(),
        status: "online",
      },
      contacts: [
        {
          id: `c-${other}`,
          peerEmail: other,
          name: other === ALICE ? "Alice" : "Bob",
          initials: "A",
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
          peerEmail: other,
          pinned: false,
          muted: false,
          updatedAt: Date.now(),
          messages: [],
          ...(objectFor(email).chats.get(CHAT)?.calls.length
            ? { calls: objectFor(email).chats.get(CHAT)!.calls }
            : {}),
        },
      ],
      rev: 1,
      serverTime: Date.now(),
      typing: [],
    };
  };

  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input).replace(
      /^https?:\/\/[^/]+/,
      "",
    );
    const email = current;
    if (url.startsWith("/api/messages/session")) {
      return json({ ok: true, email, name: email === ALICE ? "Alice" : "Bob" });
    }
    if (url.startsWith("/api/messages/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }
    if (url === "/api/messages/call" && init?.method === "POST") {
      const frame = JSON.parse(String(init.body)) as Frame;
      relayed.push(frame);
      const peer = objectFor(email).chats.get(frame.chatId)?.peerEmail ?? "";
      // The object stamps who sent the frame, which is how a phone tells that
      // echo from the other person speaking.
      const stamped = { ...frame, from: email };
      // A finished call is written to both objects and nobody is rung.
      if (frame.kind === "log") {
        const log = frame["log"] as CallRecord;
        for (const account of [email, peer]) {
          const chat = objectFor(account).chats.get(frame.chatId);
          if (!chat) continue;
          chat.calls = [...chat.calls.filter((entry) => entry.callId !== log.callId), log];
        }
        return json({ ok: true, relayed: true });
      }
      // Every other frame goes to the peer's open sockets, and to the sender's own
      // devices so a second laptop joins rather than rings again.
      for (const account of [email, peer]) {
        if (!account) continue;
        sockets.get(account)?.({ type: "call", signal: stamped });
      }
      return json({ ok: true, relayed: true });
    }
    if (url.startsWith("/api/messages")) {
      return json({ ok: true, snapshot: snapshotFor(email) });
    }
    return json({ ok: true });
  };

  return {
    relayed,
    sockets,
    /** Lets timers and promises settle, for the moments a real wait stands in. */
    settle: (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms)),
    /** Both accounts have met before, so a conversation exists on both sides. */
    introduce() {
      objectFor(ALICE).chats.set(CHAT, { id: CHAT, peerEmail: BOB, messages: [], calls: [] });
      objectFor(BOB).chats.set(CHAT, { id: CHAT, peerEmail: ALICE, messages: [], calls: [] });
    },
    calls(email: string): CallRecord[] {
      return objectFor(email).chats.get(CHAT)?.calls ?? [];
    },
    /** Speaks as one account for the length of one action. */
    as: <T>(email: string, action: () => Promise<T> | T) => {
      const previous = current;
      current = email;
      return Promise.resolve(action()).finally(() => {
        current = previous;
      });
    },
    install() {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(input, init)),
      );
      // A WebSocket that delivers straight to the other account, so the frames
      // arrive the way they do in a browser. Each one is remembered per account,
      // because a dropped socket is something only the test can arrange.
      class LoopbackSocket {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        account = current;
        send() {}
        close() {
          this.onclose?.();
        }
        constructor() {
          opened.set(current, this);
          // A real socket is open by the time the store is handed back control,
          // and that is what makes it say it is here.
          queueMicrotask(() => this.onopen?.());
        }
      }
      vi.stubGlobal("WebSocket", LoopbackSocket as never);
    },
    /**
     * Hands a device a frame the way the object does: as text down its socket.
     *
     * Not a direct call into the store. The name a frame arrives under is part of
     * the contract with the object, and a test that reaches past the socket cannot
     * see a frame that was sent under a name the store does not read.
     */
    deliver: (email: string, frame: unknown) => {
      opened.get(email)?.onmessage?.({ data: JSON.stringify(frame) });
    },
    /**
     * Drops a device's socket, the way a phone that slept through part of a call
     * finds it when it wakes up. The store opens a new one by itself, after its
     * backoff, and that is the moment this file is really about.
     */
    dropSocket: (email: string) => {
      const instance = opened.get(email);
      opened.delete(email);
      instance?.onclose?.();
    },
  };
};

// ---------------------------------------------------------------- the media

/**
 * Two media layers that actually negotiate with each other.
 *
 * The connection is a real `RTCPeerConnection` pair over jsdom's WebRTC shim if
 * the browser seam is available; when it is not, the pairing falls back to two
 * linked fakes, so the test is about the conversation either way and never
 * depends on a codec being present.
 */
const mediaFor = (onSignal: (signal: unknown) => void) => {
  const track = (kind: string, label: string): TrackLike => ({
    kind,
    label,
    enabled: true,
    stop: () => {},
    addEventListener: () => {},
  });
  const stream = (tracks: TrackLike[]): MediaStreamLike => ({
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
    getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
  });
  const realPc = typeof globalThis.RTCPeerConnection === "function";
  const peers: PeerLike[] = [];
  const media = new CallMedia({
    media: {
      getUserMedia: async (constraints) =>
        stream([track("audio", "mic"), ...(constraints.video ? [track("video", "camera")] : [])]),
      getDisplayMedia: async () => stream([track("video", "screen")]),
      enumerateDevices: async () => [
        { deviceId: "mic-1", kind: "audioinput", label: "Built in" },
        { deviceId: "cam-1", kind: "videoinput", label: "Camera" },
      ],
    },
    rtc: () => {
      // A pair of linked stubs: an offer from one becomes the answer for the
      // other, which is the whole handshake the store cares about.
      const partner = { description: null as unknown };
      const self: PeerLike = {
        localDescription: null,
        connectionState: "new",
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        addTrack: () => {},
        addIceCandidate: async () => undefined,
        createOffer: async () => {
          const offer = { type: "offer", id: `offer-${peers.length}` };
          partner.description = offer;
          return offer;
        },
        createAnswer: async () => {
          const answer = { type: "answer", for: partner.description };
          partner.description = answer;
          return answer;
        },
        setLocalDescription: async () => undefined,
        setRemoteDescription: async (description) => {
          partner.description = description;
        },
        close: () => {
          self.connectionState = "closed";
        },
        getSenders: () => [],
      };
      peers.push(self);
      return self;
    },
  });
  return { media, peers, realPc, track, stream };
};

// ---------------------------------------------------------------- the pair

/** Both sides, running, wired to each other. */
const pair = async () => {
  const link = cloud();
  link.introduce();
  link.install();

  const make = async (email: string) => {
    const store = new MessagesStore();
    const media = mediaFor((signal) => {
      // A frame this side produced is handed to the other one, which is what
      // the gateway's socket does.
      const other = email === ALICE ? BOB : ALICE;
      link.sockets.get(other)?.({ type: "call", signal });
    });
    // The store opens its socket as the signed in account.
    link.sockets.set(email, (frame) => {
      const message = frame as {
        type: string;
        signal: Parameters<typeof store.handleCallSignal>[0];
      };
      if (message.type !== "call") return;
      store.handleCallSignal(message.signal);
    });
    store.attachCallMedia(media.media);
    await link.as(email, async () => {
      await store.start();
      await store.sync();
    });
    return { store, media, email };
  };

  const alice = await make(ALICE);
  const bob = await make(BOB);
  return { link, alice, bob };
};

/** Runs one action as the account it belongs to. */
const as = <T>(link: ReturnType<typeof cloud>, email: string, action: () => Promise<T>) =>
  link.as(email, action);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a voice call between two people", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rings on the other phone, with their name", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();

    const call = bob.store.getState().call;
    expect(call.status).toBe("incoming");
    expect(call.peerName).toBe("Alice");
    expect(call.starts).toBe("audio");
    // The caller's own side is ringing out, not waiting for an answer, and not
    // pretending to be connecting to something that has not started.
    expect(alice.store.getState().call.status).toBe("outgoing");
  });

  it("is answered from the other phone, and the two handsakes cross", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();

    const callId = alice.store.getState().call.callId;
    await as(link, BOB, () => bob.store.answerCall());
    // The accept reaches the caller, which is what makes it offer the connection;
    // that offer is the frame that starts the caller's half of the handshake.
    // Four turns, because an offer now goes through the same per link lock as
    // every other handshake on the link, and the chain through it is longer than
    // the one it replaced.
    await settle();
    await settle();
    await settle();
    await settle();
    await settle();
    await settle();

    const kinds = link.relayed.map((frame) => frame.kind);
    expect(kinds).toContain("begin");
    expect(kinds).toContain("invite");
    expect(kinds).toContain("accept");
    expect(kinds).toContain("offer");
    expect(link.relayed.every((frame) => frame.callId === callId)).toBe(true);

    // Checked last, because the status follows the frames: a failure that only
    // says "connecting" sends you looking at the wrong half of the handshake.
    // Both sides show the call the moment it is picked up, on either phone, which
    // is what puts the timer going and the waiting screen away. Neither waits for
    // the connection, because the person on the other end is already there.
    expect(bob.store.getState().call.status).toBe("active");
    // The caller was told the call was picked up, and offered the connection
    // that the answer will come back on.
    expect(alice.store.getState().call.status).toBe("active");
  });

  it("refuses a second call from the same person while one is ringing", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();

    // A second device of the same person calling again while the other side is
    // already ringing: the ringing call is kept, and the new one is turned away.
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    expect(bob.store.getState().call.status).toBe("incoming");
    expect(bob.store.getState().call.callId).toBe(alice.store.getState().call.callId);
  });

  it("hangs up from either side and both phones agree it is over", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    await as(link, BOB, () => bob.store.answerCall());
    await settle();

    await as(link, ALICE, () => alice.store.endCall());
    await settle();

    expect(alice.store.getState().call.status).toBe("ended");
    expect(bob.store.getState().call.status).toBe("ended");
    expect(bob.store.getState().call.callId).toBe(alice.store.getState().call.callId);
  });

  it("is a mute the other side hears about", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    await as(link, BOB, () => bob.store.answerCall());
    await settle();

    await as(link, BOB, () => bob.store.setCallMedia({ mic: false }));
    await settle();

    // Bob's microphone is off on his own phone...
    expect(bob.store.getState().call.mic).toBe(false);
    // ...and Alice is told, so her tile can show it.
    const bobOnAlice = alice.store
      .getState()
      .call.participants.find((person) => person.email === BOB);
    expect(bobOnAlice?.mic).toBe(false);
  });

  it("leaves one line in the history, which each side reads its own way", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    const callId = alice.store.getState().call.callId;

    // Bob never picks up, and Alice gives up on it.
    await as(link, ALICE, () => alice.store.endCall());
    await settle();

    // It is in the cloud for both accounts, written once.
    expect(link.calls(ALICE)).toHaveLength(1);
    expect(link.calls(BOB)).toHaveLength(1);
    expect(link.calls(ALICE)[0]?.callId).toBe(callId);

    // Each side reads the same row from its own chair.
    const hers = callSummary(link.calls(ALICE)[0]!, ALICE);
    const his = callSummary(link.calls(BOB)[0]!, BOB);
    expect(hers).toMatchObject({ kind: "cancelled", direction: "outgoing", missed: false });
    expect(his).toMatchObject({ kind: "missed", direction: "incoming", missed: true });
    void bob;
  });

  it("says it is still here when the socket comes back", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    await as(link, BOB, () => bob.store.answerCall());
    await settle();
    await link.settle(50);
    const before = link.relayed.length;

    // The phone slept, the socket went with it, and everything the far end said
    // in between went past while it was gone. A laptop in a tunnel does the same
    // thing to a call that is otherwise fine.
    link.dropSocket(ALICE);
    await link.settle(1_400);

    const afterwards = link.relayed.slice(before);
    // It comes back and says so: the other side works out from its own roster
    // who reconnects whom, and nothing about the call is invented.
    expect(afterwards.some((frame) => frame.kind === "accept")).toBe(true);
    expect(afterwards.some((frame) => frame.kind === "state")).toBe(true);
    // And the call is still the call it was, on both devices.
    expect(alice.store.getState().call.status).not.toBe("idle");
    expect(bob.store.getState().call.status).not.toBe("idle");
  }, 10_000);

  it("reaches the other phone when a screen is shared in a voice call", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    await as(link, BOB, () => bob.store.answerCall());
    await settle();
    await link.settle(50);
    const before = link.relayed.length;

    // A voice call has no video anywhere, so sharing opens a sender that did not
    // exist a moment ago. A sender the other side was never told about is a
    // screen only this device can see.
    expect(await alice.media.media.startScreen()).toBe(true);
    await link.settle(300);

    const afterwards = link.relayed.slice(before);
    expect(afterwards.some((frame) => frame.kind === "offer")).toBe(true);
    expect(afterwards.some((frame) => frame.kind === "answer")).toBe(true);
    // And the far end is told, so the tile can say what is being shared.
    expect(afterwards.some((frame) => frame.kind === "state" && frame["screen"] === true)).toBe(
      true,
    );
    expect(
      bob.store.getState().call.participants.find((person) => person.email === ALICE)?.screen,
    ).toBe(true);
  });

  it("records a call that ran, with a length worth reading", async () => {
    const { link, alice, bob } = await pair();
    await as(link, ALICE, () => alice.store.beginCall({ chatId: CHAT, starts: "audio" }));
    await settle();
    await as(link, BOB, () => bob.store.answerCall());
    await settle();

    // The two were talking, and then Bob puts the phone down.
    await as(link, BOB, () => bob.store.endCall());
    await settle();

    const record = link.calls(ALICE)[0];
    expect(record?.outcome).toBe("completed");
    expect(callDuration(record?.durationMs ?? 0)).toMatch(/^\d+:\d{2}$/);
    // Bob's own object holds the same call, written by the gateway's mirror.
    expect(link.calls(BOB)[0]?.outcome).toBe("completed");
  });
});
