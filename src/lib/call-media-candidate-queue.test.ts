// A candidate that arrives before the description it belongs to.
//
// A phone on a slow link finishes gathering long before the far side has read
// the offer, so this is the ordinary order rather than the unusual one. Dropped
// instead of held, this is the only route that works, and the call comes up
// connected and silent on exactly one device.

import { describe, expect, it, vi } from "vitest";

import {
  CallMedia,
  type CallMediaOptions,
  type MediaStreamLike,
  type PeerLike,
  type TrackLike,
} from "./call-media";

const track = (kind: string, label: string): TrackLike => ({
  kind,
  label,
  enabled: true,
  stop: vi.fn(),
  addEventListener: vi.fn(),
});

const stream = (tracks: TrackLike[]): MediaStreamLike => ({
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
  getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
});

/** A connection that records what it was asked to do, in the order it was asked. */
const connection = () => {
  const log: string[] = [];
  const senders: Array<{
    track: TrackLike | null;
    replaceTrack: (next: unknown) => Promise<void>;
  }> = [];
  const self = {
    localDescription: null,
    connectionState: "new",
    log,
    senders,
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    addTrack: (added: unknown) => {
      senders.push({ track: added as TrackLike, replaceTrack: async () => {} });
    },
    addIceCandidate: async (incoming: unknown) => {
      log.push(`candidate:${(incoming as { id?: string }).id}`);
    },
    createOffer: async () => ({ type: "offer" }),
    createAnswer: async () => ({ type: "answer" }),
    setLocalDescription: async () => {},
    setRemoteDescription: async (applied: unknown) => {
      log.push(`remote:${(applied as { type?: string }).type ?? "?"}`);
    },
    close: () => {},
    getSenders: () => senders,
  };
  return self as unknown as PeerLike & { log: string[]; senders: typeof senders };
};

const setup = (extra: Partial<CallMediaOptions> = {}) => {
  const made: ReturnType<typeof connection>[] = [];
  const signals: Array<{ kind: string; to: string }> = [];
  const media = new CallMedia({
    media: {
      getUserMedia: async (constraints) =>
        stream([track("audio", "mic"), ...(constraints.video ? [track("video", "camera")] : [])]),
      getDisplayMedia: async () => stream([track("video", "screen")]),
      enumerateDevices: async () => [],
    },
    rtc: () => {
      const peer = connection();
      made.push(peer);
      return peer;
    },
    ...extra,
  });
  media.listen({
    onSignal: (signal) => signals.push(signal as { kind: string; to: string }),
    onRemote: () => {},
    onPeer: () => {},
    onLocal: () => {},
    onScreen: () => {},
  });
  return { media, made, signals, peer: () => made[0] };
};

const candidate = (id: string) => ({ id }) as unknown;

describe("a candidate before its description", () => {
  it("waits for the description, and is added the moment it arrives", async () => {
    const { media, peer } = setup();
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    // The order a slow phone really produces it in.
    await media.accept("a@example.com", {
      kind: "candidate",
      candidate: candidate("early"),
    } as never);
    expect(peer()!.log).toEqual([]);

    await media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);

    expect(peer()!.log).toEqual(["remote:offer", "candidate:early"]);
  });

  it("is added straight away once a description has been applied", async () => {
    const { media, peer } = setup();
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    await media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);
    await media.accept("a@example.com", {
      kind: "candidate",
      candidate: candidate("late"),
    } as never);

    // Nothing to hold back now: the description is already in place.
    expect(peer()!.log).toEqual(["remote:offer", "candidate:late"]);
  });

  it("keeps every waiting candidate, and in the order they arrived", async () => {
    const { media, peer } = setup();
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    for (const id of ["one", "two", "three", "four"]) {
      await media.accept("a@example.com", { kind: "candidate", candidate: candidate(id) } as never);
    }
    await media.accept("a@example.com", {
      kind: "answer",
      description: { type: "answer" },
    } as never);

    // Order matters: a candidate added out of order is a candidate the browser
    // refuses, and the route is lost with it.
    expect(peer()!.log).toEqual([
      "remote:answer",
      "candidate:one",
      "candidate:two",
      "candidate:three",
      "candidate:four",
    ]);
  });

  it("does not hold a second batch behind a description that has already been set", async () => {
    const { media, peer } = setup();
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    await media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);
    // A renegotiation brings a second description, and the candidates that
    // arrived before it must not be left waiting for a description already given.
    await media.accept("a@example.com", {
      kind: "candidate",
      candidate: candidate("later"),
    } as never);

    expect(peer()!.log).toEqual(["remote:offer", "candidate:later"]);
  });

  it("keeps a candidate that arrives for somebody this device has not called yet", async () => {
    const { media, made } = setup();
    await media.start({ video: false });

    // With four people in a call there are six handshakes and they do not arrive
    // in order, so a frame can turn up for a link that does not exist yet.
    await media.accept("b@example.com", {
      kind: "candidate",
      candidate: candidate("stranger"),
    } as never);
    expect(made).toHaveLength(1);
    expect(made[0]!.log).toEqual([]);

    await media.accept("b@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);

    // It waited on the connection that was built to hold it, not on a lost frame.
    expect(made).toHaveLength(1);
    expect(made[0]!.log).toEqual(["remote:offer", "candidate:stranger"]);
  });

  it("releases the queue on the path that builds the answer", async () => {
    const { media, peer } = setup();
    await media.start({ video: false });

    // The same order, arriving on the answering side: held first, released by
    // the description this path applies itself rather than one `accept` applies.
    await media.accept("a@example.com", {
      kind: "candidate",
      candidate: candidate("early"),
    } as never);
    expect(peer()!.log).toEqual([]);

    await media.createAnswer("a@example.com", { type: "offer" });

    // A queue that is never emptied here is a queue every later candidate waits
    // in, behind a description that has already been given.
    expect(peer()!.log).toEqual(["remote:offer", "candidate:early"]);
  });

  it("does not let one refused candidate stop the ones behind it", async () => {
    const refused: string[] = [];
    const added: string[] = [];
    // The connection is built here rather than through the seam, because this is
    // the one case where the stand in has to be the thing that refuses.
    const { media, made } = setup({
      rtc: () => {
        const base = connection();
        base.addIceCandidate = async (incoming: unknown) => {
          const id = (incoming as { id?: string }).id ?? "";
          if (id === "bad") {
            refused.push(id);
            throw new Error("cannot add candidate");
          }
          added.push(id);
        };
        return base;
      },
    });
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    for (const id of ["good", "bad", "also-good"]) {
      await media.accept("a@example.com", { kind: "candidate", candidate: candidate(id) } as never);
    }
    await media.accept("a@example.com", {
      kind: "answer",
      description: { type: "answer" },
    } as never);

    // A single bad candidate is not the whole route list, and treating it as one
    // is how a call that was going to connect does not.
    expect(refused).toEqual(["bad"]);
    expect(added).toEqual(["good", "also-good"]);
  });
});
