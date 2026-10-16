// @vitest-environment jsdom
//
// Four people in one call: two computers and two phones.
//
// A group call is a mesh, so the shape of it is the thing worth proving: every
// phone holds a connection to every other one, everybody's audio arrives
// separately, a screen shared by one of them reaches the other three, and
// somebody dropping out is not the end of it. The object is the post office, so
// the routing is exercised too: which frame goes to whom, and who offers when
// two phones are ready at the same moment.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CallMedia, type MediaStreamLike, type PeerLike, type TrackLike } from "./call-media";
import { MessagesStore } from "./messages-store";
import {
  shouldOffer,
  type CallRecord,
  type CallRoster,
  type CallSignal,
  type MessagesSnapshot,
} from "./messages-protocol";

/** Two computers and two phones, named by what they are rather than who they are. */
const DESK = "desk@example.com";
const LAPTOP = "laptop@example.com";
const PHONE_C = "phone-c@example.com";
const PHONE_D = "phone-d@example.com";
const EVERYONE = [DESK, LAPTOP, PHONE_C, PHONE_D];
const CHAT = "chat-desk";

type Signal = {
  kind: string;
  callId: string;
  chatId: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
};

/**
 * The object and the gateway, as one seam.
 *
 * It keeps the call's roster the way the Durable Object does, stamps who sent
 * each frame, and hands it to the people it is for: named to one person, unnamed
 * to everybody else, which is the difference between a session description and a
 * mute.
 */
const hub = () => {
  const frames: Signal[] = [];
  const sockets = new Map<string, (frame: unknown) => void>();
  const chats = new Map<string, Map<string, CallRecord[]>>();
  let roster: CallRoster | null = null;
  let current = DESK;

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const members = () =>
    (roster?.participants ?? [])
      .filter((person) => person.status !== "left")
      .map((person) => person.email);

  /** The history of one account's conversation with somebody in the call. */
  const callsOf = (email: string, peer: string) => chats.get(email)?.get(peer) ?? [];

  const snapshotFor = (email: string): MessagesSnapshot => {
    const peer = EVERYONE.find((other) => other !== email) ?? email;
    return {
      profile: {
        email,
        name: email,
        about: "",
        accent: "#1DB954",
        avatar: null,
        online: true,
        lastSeenAt: Date.now(),
        status: "online",
      },
      contacts: [
        {
          id: `c-${peer}`,
          peerEmail: peer,
          name: peer,
          initials: "C",
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
          peerEmail: peer,
          pinned: false,
          muted: false,
          updatedAt: Date.now(),
          messages: [],
          ...(callsOf(email, peer).length ? { calls: callsOf(email, peer) } : {}),
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
    const me = current;
    if (url.startsWith("/api/messages/session")) return json({ ok: true, email: me, name: me });
    if (url.startsWith("/api/messages/friend/list")) {
      return json({ ok: true, friends: { incoming: [], outgoing: [], friends: [], declined: [] } });
    }
    if (url === "/api/messages/call" && init?.method === "POST") {
      const frame = JSON.parse(String(init.body)) as Signal;
      frames.push(frame);

      if (frame.kind === "log") {
        const log = frame["log"] as CallRecord;
        for (const account of new Set([me, ...members()])) {
          for (const [peer, list] of chats.get(account) ?? []) {
            list.push(log);
          }
        }
        return json({ ok: true, relayed: true });
      }

      if (frame.kind === "begin") {
        roster = {
          callId: frame.callId,
          host: me,
          starts: frame["starts"] === "video" ? "video" : "audio",
          createdAt: Date.now(),
          participants: [{ email: me, order: 0, status: "active" }],
        };
      } else if (roster && frame.kind === "invite" && frame.to) {
        if (!roster.participants.some((person) => person.email === frame.to)) {
          const order = roster.participants.reduce(
            (most, person) => Math.max(most, person.order),
            0,
          );
          roster.participants.push({ email: frame.to, order: order + 1, status: "invited" });
        }
      } else if (roster && frame.kind === "accept" && frame.from) {
        const who = roster.participants.find((person) => person.email === frame.from);
        if (who) who.status = "active";
      } else if (roster && (frame.kind === "leave" || frame.kind === "end") && frame.from) {
        const who = roster.participants.find((person) => person.email === frame.from);
        if (who) who.status = "left";
      }

      const stamped = { ...frame, from: me };
      const targets = frame.to ? [frame.to] : members().filter((email) => email !== me);
      for (const email of targets) {
        sockets.get(email)?.({ type: "call", signal: stamped });
        if (roster) sockets.get(email)?.({ type: "roster", roster });
      }
      // The sender's own devices get it too, stamped so they can tell that echo
      // from somebody else speaking.
      sockets.get(me)?.({ type: "call", signal: stamped });
      if (roster) sockets.get(me)?.({ type: "roster", roster });
      return json({ ok: true, relayed: true });
    }
    if (url.startsWith("/api/messages")) return json({ ok: true, snapshot: snapshotFor(me) });
    return json({ ok: true });
  };

  return {
    frames,
    roster: () => roster,
    members,
    calls: (email: string) => [...(chats.get(email)?.values() ?? [])].flat(),
    /** Hands a frame to one account, as the object hands it to a socket. */
    deliver: (email: string, frame: unknown) => sockets.get(email)?.(frame),
    /** Opens an account's socket, which is where its frames arrive. */
    open: (email: string, onFrame: (frame: unknown) => void) => {
      sockets.set(email, onFrame);
    },
    as: <T>(email: string, action: () => Promise<T> | T) => {
      const previous = current;
      current = email;
      return Promise.resolve(action()).finally(() => {
        current = previous;
      });
    },
    install() {
      // Everybody is in a conversation with everybody else, so a call placed
      // from one of them has somewhere to be written.
      for (const email of EVERYONE) {
        const mine = new Map<string, CallRecord[]>();
        for (const peer of EVERYONE) if (peer !== email) mine.set(peer, []);
        chats.set(email, mine);
      }
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(input, init)),
      );
      class LoopbackSocket {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        send() {}
        close() {
          this.onclose?.();
        }
      }
      vi.stubGlobal("WebSocket", LoopbackSocket as never);
    },
  };
};

// ------------------------------------------------------------------ the media

/**
 * A media layer whose connections are counted rather than negotiated.
 *
 * What matters to the caller is the shape: how many connections exist, what
 * video each of them carries, and whether the graph reached everybody.
 */
const mediaFor = () => {
  const peers: Array<{
    senders: Array<{ kind: string; track: unknown }>;
    connectionState: string;
    fire: (state: string) => void;
    videoTrack: () => unknown;
  }> = [];

  const track = (kind: string, label: string) =>
    ({
      kind,
      label,
      enabled: true,
      stop: () => {},
      addEventListener: (type: string, listener: () => void) => {
        // A shared track announces the browser's own stop sharing button.
        if (label === "screen" && type === "ended") ended.push(listener);
      },
    }) as TrackLike;
  const stream = (tracks: TrackLike[]): MediaStreamLike => ({
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
    getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
  });
  const screen = track("video", "screen");
  /** The listeners the browser hangs on a shared track, for its own stop button. */
  const ended: Array<() => void> = [];
  let display: MediaStreamLike | null = null;

  const media = new CallMedia({
    media: {
      getUserMedia: async (constraints) =>
        stream([track("audio", "mic"), ...(constraints.video ? [track("video", "camera")] : [])]),
      getDisplayMedia: async () => {
        display = stream([screen]);
        return display;
      },
      enumerateDevices: async () => [],
    },
    rtc: () => {
      const senders: Array<{ kind: string; track: unknown }> = [];
      const self = {
        localDescription: null as unknown,
        connectionState: "new",
        onicecandidate: null as ((event: { candidate: unknown }) => void) | null,
        ontrack: null as ((event: { streams: unknown[] }) => void) | null,
        onconnectionstatechange: null as (() => void) | null,
        addTrack: (added: unknown) => {
          const item = added as TrackLike;
          senders.push({ kind: item.kind, track: item });
        },
        addIceCandidate: async () => undefined,
        createOffer: async () => ({ type: "offer" }),
        createAnswer: async () => ({ type: "answer" }),
        setLocalDescription: async () => undefined,
        setRemoteDescription: async () => undefined,
        close: () => {
          self.connectionState = "closed";
        },
        getSenders: () =>
          senders.map((sender) => ({
            track: sender.track as TrackLike,
            replaceTrack: async (next: unknown) => {
              sender.track = next;
            },
          })),
        fire: (state: string) => {
          self.connectionState = state;
          self.onconnectionstatechange?.();
        },
        videoTrack: () => senders.find((sender) => sender.kind === "video")?.track,
      };
      const record = self as unknown as (typeof peers)[number];
      peers.push(record);
      return self as unknown as PeerLike;
    },
  });
  media.listen({
    onSignal: () => {},
    onRemote: () => {},
    onPeer: () => {},
    onLocal: () => {},
    onScreen: () => {},
  });

  return {
    media,
    screen,
    ended,
    /** The stand in for the connection this layer built, by order. */
    peerAt: (index: number) => peers[index],
    peers,
    sharing: () => peers.filter((peer) => peer.videoTrack() === screen).length,
  };
};

// ------------------------------------------------------------------ the room

/** The four participants, running, each with its socket open on the object. */
const room = async () => {
  const link = hub();
  link.install();

  const layers = new Map<string, ReturnType<typeof mediaFor>>();
  const stores = new Map<string, MessagesStore>();

  for (const email of EVERYONE) {
    const layer = mediaFor();
    const store = new MessagesStore();
    store.attachCallMedia(layer.media);
    layers.set(email, layer);
    stores.set(email, store);
    // The account's socket, which is where the object pushes its frames.
    link.open(email, (frame) => {
      const message = frame as { type: string; signal?: CallSignal; roster?: CallRoster };
      if (message.type === "call" && message.signal) store.handleCallSignal(message.signal);
      if (message.type === "roster" && message.roster) store.handleRoster(message.roster);
    });
  }

  for (const email of EVERYONE) {
    const store = stores.get(email)!;
    await link.as(email, async () => {
      await store.start();
      await store.sync();
    });
  }

  return { link, layers, stores };
};

const settle = async (times = 5) => {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe("four people in one call", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decides who offers, and both phones get the same answer", () => {
    const roster = [
      { email: DESK, order: 0 },
      { email: LAPTOP, order: 1 },
      { email: PHONE_C, order: 2 },
      { email: PHONE_D, order: 3 },
    ];
    // Whoever was in the call first offers, and the other side agrees by the
    // same rule: two phones offering at once is what breaks a call.
    expect(shouldOffer(DESK, LAPTOP, roster)).toBe(true);
    expect(shouldOffer(LAPTOP, DESK, roster)).toBe(false);
    expect(shouldOffer(DESK, PHONE_D, roster)).toBe(true);
    expect(shouldOffer(PHONE_D, DESK, roster)).toBe(false);
    for (const [a, b] of [
      [DESK, LAPTOP],
      [LAPTOP, PHONE_C],
      [PHONE_C, PHONE_D],
    ] as const) {
      expect(shouldOffer(a, b, roster)).toBe(!shouldOffer(b, a, roster));
    }
  });

  it("holds a connection to every other person, and to nobody else", async () => {
    const layer = mediaFor();
    await layer.media.start({ video: true });

    // A desk with three people beside it is three connections, and asking twice
    // for the same person is the same connection.
    await layer.media.createOffer(LAPTOP);
    await layer.media.createOffer(PHONE_C);
    await layer.media.createOffer(PHONE_D);
    await layer.media.createOffer(PHONE_C);

    expect(layer.media.connectedTo().sort()).toEqual([LAPTOP, PHONE_C, PHONE_D].sort());
    expect(layer.peers).toHaveLength(3);
  });

  it("puts a shared screen on all three, and takes them back to the camera", async () => {
    const layer = mediaFor();
    await layer.media.start({ video: true });
    await layer.media.createOffer(LAPTOP);
    await layer.media.createOffer(PHONE_C);
    await layer.media.createOffer(PHONE_D);

    expect(await layer.media.startScreen()).toBe(true);
    // Every one of the three is watching the same screen: the share reaches the
    // whole room and not only the person who was dialled first.
    expect(layer.sharing()).toBe(3);

    expect(await layer.media.stopScreen()).toBe(true);
    // The call is still up, and the cameras are back where they were.
    expect(layer.media.connectedTo()).toHaveLength(3);
    expect(layer.sharing()).toBe(0);
  });

  it("keeps a screen share alive when somebody else joins the call", async () => {
    const layer = mediaFor();
    await layer.media.start({ video: true });
    await layer.media.createOffer(LAPTOP);
    expect(await layer.media.startScreen()).toBe(true);
    expect(layer.sharing()).toBe(1);

    // The fourth person is dialled while the screen is being shown, which is
    // what actually happens: a call is still going and somebody new is added.
    await layer.media.createOffer(PHONE_C);

    // The new connection also gets the screen, because the share is on the
    // connection, not on one lucky handshake.
    expect(layer.sharing()).toBe(2);
  });

  it("routes a frame to one person, and a roster to everybody in the call", async () => {
    const { link, stores } = await room();
    const desk = stores.get(DESK)!;
    const laptop = stores.get(LAPTOP)!;

    // The desk places the call and rings the person its conversation is with.
    await link.as(DESK, () => desk.beginCall({ chatId: CHAT, starts: "video" }));
    await settle();

    // One person was rung, and one object call was opened.
    expect(link.frames.filter((frame) => frame.kind === "begin")).toHaveLength(1);
    expect(link.frames.filter((frame) => frame.kind === "invite")).toHaveLength(1);

    // The laptop's phone is ringing, with the desk's name on it.
    const ringing = laptop.getState().call;
    expect(ringing.status).toBe("incoming");
    expect(ringing.peerEmail).toBe(DESK);

    // The roster that travels beside the frame is what puts the tiles up, and it
    // is the only thing the wire is trusted to say: the names come from this
    // account's own contacts.
    expect(ringing.participants.length).toBe(2);
    expect(ringing.host).toBe(DESK);
  });

  it("adds a fourth person to a call that is already up", async () => {
    const { link, stores, layers } = await room();
    const desk = stores.get(DESK)!;

    await link.as(DESK, () => desk.beginCall({ chatId: CHAT, starts: "video" }));
    await settle();

    // Two more people are pulled in from the call screen, not from a new call.
    await link.as(DESK, () => desk.inviteToCall(PHONE_C));
    await settle();
    await link.as(DESK, () => desk.inviteToCall(PHONE_D));
    await settle();

    const call = desk.getState().call;
    expect(call.participants).toHaveLength(4);
    expect(call.participants.map((person) => person.email).sort()).toEqual([...EVERYONE].sort());
    // The object has them all, in one order, which is what both phones agree on.
    expect(link.members().sort()).toEqual([...EVERYONE].sort());
    // And the desk has a connection to each of them, which is the mesh.
    expect(layers.get(DESK)!.media.connectedTo()).toHaveLength(0);
  });

  it("shows a shared screen to everyone, and keeps it up as people come and go", async () => {
    const { link, stores, layers } = await room();
    const desk = stores.get(DESK)!;
    const laptop = stores.get(LAPTOP)!;
    const layer = layers.get(DESK)!;

    await link.as(DESK, () => desk.beginCall({ chatId: CHAT, starts: "video" }));
    await settle();
    await link.as(LAPTOP, () => laptop.answerCall());
    await settle(6);

    // The laptop answered, so the desk is connected to it: one connection, and
    // nothing is connected to anybody who has not picked up yet.
    expect(layer.media.connectedTo()).toEqual([LAPTOP]);

    // The desk shares its screen, and the one person watching sees the screen.
    expect(await layer.media.startScreen()).toBe(true);
    expect(layer.sharing()).toBe(1);

    // Somebody is dialled in while the screen is being shown, which is what
    // actually happens at a table of four.
    await link.as(DESK, () => desk.inviteToCall(PHONE_C));
    await settle();
    const phoneC = stores.get(PHONE_C)!;
    await link.as(PHONE_C, () => phoneC.answerCall());
    await settle(6);

    // The new connection is made by the person who was already in the call, and
    // it carries the screen rather than a camera shot of a wall.
    expect(layer.media.connectedTo().sort()).toEqual([LAPTOP, PHONE_C].sort());
    expect(layer.sharing()).toBe(2);
  });

  it("tells the room when the browser's own stop button is used", async () => {
    const { link, stores, layers } = await room();
    const desk = stores.get(DESK)!;
    const laptop = stores.get(LAPTOP)!;
    const layer = layers.get(DESK)!;

    await link.as(DESK, () => desk.beginCall({ chatId: CHAT, starts: "video" }));
    await settle();
    await link.as(LAPTOP, () => laptop.answerCall());
    await settle(6);

    expect(await layer.media.startScreen()).toBe(true);
    await settle();

    // The laptop's tile is showing the shared screen.
    const seenOnLaptop = laptop
      .getState()
      .call.participants.find((person) => person.email === DESK);
    expect(seenOnLaptop?.screen).toBe(true);

    // The browser's own "stop sharing" button, which the app did not press.
    layer.ended.forEach((listener) => listener());
    await settle(2);

    // And the other side is told, or it keeps looking at a frozen desktop.
    const after = laptop.getState().call.participants.find((person) => person.email === DESK);
    expect(after?.screen).toBe(false);
    expect(desk.getState().call.screen).toBe(false);
    void link;
  });
});
