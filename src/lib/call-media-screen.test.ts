// Why a screen share reaches the other side at all.
//
// The whole thing rests on one fact about WebRTC: a track can only be sent over a
// slot that both ends already agreed exists in the description. A voice room is
// joined with audio alone, so ten minutes later there is nowhere to put a screen
// — and adding a slot at that moment means renegotiating the link while somebody
// is mid-sentence.
//
// These are the tests for the two ways that goes wrong, and for the thing that
// makes it work.

import { describe, expect, it, vi } from "vitest";

import { CallMedia } from "./call-media";

type SenderStub = {
  track: { kind: string; label?: string } | null;
  replaceTrack: (track: unknown) => Promise<void>;
};

/**
 * A peer connection that behaves like a browser's.
 *
 * `addTransceiver` makes a sender with no track on it, which is what a real one
 * does and what the whole design rests on. A browser without it is the fallback
 * the tests below check separately.
 */
const makePeer = (options: { withTransceivers?: boolean } = {}) => {
  const senders: SenderStub[] = [];
  const events: string[] = [];
  const transceivers: Array<{ kind: string; direction?: string; sender: SenderStub }> = [];

  const peer = {
    connectionState: "new",
    localDescription: null as unknown,
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    getSenders: () => senders,
    getTransceivers: () => transceivers,
    addTrack: vi.fn((track: { kind: string }) => {
      const sender: SenderStub = {
        track,
        replaceTrack: async (next) => {
          events.push(`addTrack-then-replace:${next === null ? "none" : "track"}`);
          sender.track = next as SenderStub["track"];
        },
      };
      senders.push(sender);
      return sender;
    }),
    replaceTrack: vi.fn(),
    addIceCandidate: async () => undefined,
    createOffer: async () => ({ type: "offer" }),
    createAnswer: async () => ({ type: "answer" }),
    setLocalDescription: async () => undefined,
    setRemoteDescription: async () => undefined,
    close: () => undefined,
  };

  if (options.withTransceivers !== false) {
    (
      peer as unknown as {
        addTransceiver: (kind: string, init?: { direction?: string }) => unknown;
      }
    ).addTransceiver = (kind, init) => {
      events.push(`addTransceiver:${kind}:${init?.direction ?? ""}`);
      // A real reserved slot behaves like an empty sender: it takes a track when
      // one arrives and empties again when it is taken away.
      const sender: SenderStub = {
        track: null,
        replaceTrack: async (next) => {
          sender.track = next as SenderStub["track"];
        },
      };
      senders.push(sender);
      transceivers.push({
        kind,
        sender,
        ...(init?.direction ? { direction: init.direction } : {}),
      });
      return { sender, kind, direction: init?.direction };
    };
  }

  return { peer, senders, events, transceivers };
};

const stream = (kinds: Array<"audio" | "video">) =>
  ({
    getTracks: () => kinds.map((kind) => ({ kind, label: `${kind}-track`, stop: () => {} })),
    getAudioTracks: () =>
      kinds.filter((k) => k === "audio").map(() => ({ kind: "audio", stop: () => {} })),
    getVideoTracks: () =>
      kinds
        .filter((k) => k === "video")
        .map(() => ({ kind: "video", label: "video-track", stop: () => {} })),
  }) as never;

/** The one sender whose slot is for video, whether or not anything is in it. */
const videoSender = (senders: SenderStub[]) =>
  senders.find((item) => item.track?.kind === "video" || item.track === null) ?? null;

const mediaOf = (userKinds: Array<"audio" | "video"> = ["audio"]) => ({
  getUserMedia: vi.fn(async () => stream(userKinds)),
  getDisplayMedia: vi.fn(async () => stream(["video"])),
  enumerateDevices: vi.fn(async () => []),
});

const setup = async (
  options: { withTransceivers?: boolean; userKinds?: Array<"audio" | "video"> } = {},
) => {
  const rtc = makePeer(options);
  const signals: Array<Record<string, unknown>> = [];
  const media = new CallMedia({
    media: mediaOf(options.userKinds) as never,
    rtc: ((config: unknown) => rtc.peer) as never,
    turn: async () => null,
  } as never);
  media.listen({
    onSignal: (signal) => signals.push(signal as unknown as Record<string, unknown>),
    onRemote: () => {},
    onPeer: () => {},
    onLocal: () => {},
    onScreen: () => {},
  });
  return { media, ...rtc, signals };
};

describe("every connection keeps a video slot", () => {
  it("reserves one on a room joined with audio alone", async () => {
    const { media, events } = await setup();

    await media.start({ video: false });
    media.peerFor("ana@example.com");

    // Nothing is captured and nothing extra is sent: the slot simply exists, so a
    // share ten minutes later is a track dropped into a place both ends agreed on.
    expect(events).toContain("addTransceiver:video:sendrecv");
  });

  it("does not ask for a camera to do it", async () => {
    const { media } = await setup();
    const getUserMedia = (media as unknown as { media: { getUserMedia: ReturnType<typeof vi.fn> } })
      .media.getUserMedia;

    await media.start({ video: false });

    // A voice room must not open the camera: the permission prompt is not expected
    // and nobody asked for a picture.
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
  });

  it("still works on a browser that will not reserve one", async () => {
    const { media, peer, senders } = await setup({ withTransceivers: false });

    await media.start({ video: false });
    media.peerFor("ana@example.com");

    // No reserved slot, so the only way to send a screen is to add the track.
    const started = await media.startScreen();
    expect(started).toBe(true);
    expect(peer.addTrack).toHaveBeenCalled();
    expect(videoSender(senders)?.track?.kind).toBe("video");
  });
});

/**
 * The picture the sharer sees of their own share.
 *
 * This was the bug that made sharing look broken to the one person who could fix
 * it: the desktop went to the room and the room showed it, while the sharer's own
 * tile was bound to the microphone stream — which a voice room joined without a
 * camera has no picture in at all. An empty rectangle, labelled live, next to
 * everybody else watching the desktop perfectly well.
 */
/**
 * A stream whose tracks keep their identity and their hints, like real ones.
 *
 * The shared stub above hands back a fresh object on every call, which is fine for
 * asking what *kind* of track is in a sender and useless for asking whether it is
 * the same track — a hint written on one call would not be readable on the next,
 * and an identity comparison would always fail. Both of the things below are about
 * exactly that, so they need tracks that behave.
 */
const solidStream = (kinds: Array<"audio" | "video">, label: string) => {
  const tracks = kinds.map((kind) => ({ kind, label: `${label}-${kind}`, stop: () => {} }));
  const pick = (kind: string) => tracks.filter((item) => item.kind === kind);
  return {
    tracks,
    getTracks: () => tracks,
    getAudioTracks: () => pick("audio"),
    getVideoTracks: () => pick("video"),
  } as never;
};

type StubTrack = { kind: string; label: string; contentHint?: string };

/**
 * What the encoder is told about the picture it is sending.
 *
 * This is the difference between a screen share somebody can read and one that
 * looks like a photograph of a screen. It used to be set and then deleted on the
 * next line by a second call that read like switching back to the camera's hint —
 * but the hint lands on the track named in the call, so the pair cancelled itself
 * and the capture went out with no hint at all.
 */
describe("what the share tells the encoder", () => {
  const withShare = async () => {
    const rtc = makePeer();
    const media = new CallMedia({
      media: {
        getUserMedia: vi.fn(async () => solidStream(["audio"], "mic")),
        getDisplayMedia: vi.fn(async () => solidStream(["video"], "screen")),
        enumerateDevices: vi.fn(async () => []),
      } as never,
      rtc: ((config: unknown) => rtc.peer) as never,
      turn: async () => null,
    } as never);
    media.listen({
      onSignal: () => {},
      onRemote: () => {},
      onPeer: () => {},
      onLocal: () => {},
      onScreen: () => {},
    });
    await media.start({ video: false });
    media.peerFor("ana@example.com");
    await media.startScreen();
    const tracks = (
      media as unknown as { screenStream: { getVideoTracks: () => StubTrack[] } }
    ).screenStream.getVideoTracks();
    return { media, tracks };
  };

  it("asks for detail, so text is allowed to stay sharp", async () => {
    const { tracks } = await withShare();
    expect(tracks[0]?.contentHint).toBe("detail");
  });

  it("leaves the audio alone, which is what speech is for", async () => {
    const { media } = await withShare();
    // Guard against the fix being "set every hint to detail": the microphone is
    // already told what it is, and a screen never overrides that.
    const outgoing = (
      media as unknown as { localStream: { getAudioTracks: () => StubTrack[] } }
    ).localStream.getAudioTracks();
    expect(outgoing[0]?.contentHint).toBe("speech");
  });
});

/**
 * The microphone after a share that carried sound.
 *
 * The screen's sound goes onto the microphone's own sender, because that slot is
 * already negotiated. Which means the microphone is what got replaced, and putting
 * it back is not something the absence of screen audio can be relied on to notice.
 * The desktop build always captures loopback audio, so this happened on every
 * single share and left the person muted for the rest of the call.
 */
describe("the microphone after a share that carried sound", () => {
  const withSound = async () => {
    const rtc = makePeer();
    const media = new CallMedia({
      media: {
        getUserMedia: vi.fn(async () => solidStream(["audio"], "mic")),
        // A tab capture, or the desktop app's loopback: sound comes with the video.
        getDisplayMedia: vi.fn(async () => solidStream(["video", "audio"], "screen")),
        enumerateDevices: vi.fn(async () => []),
      } as never,
      rtc: ((config: unknown) => rtc.peer) as never,
      turn: async () => null,
    } as never);
    media.listen({
      onSignal: () => {},
      onRemote: () => {},
      onPeer: () => {},
      onLocal: () => {},
      onScreen: () => {},
    });
    await media.start({ video: false });
    media.peerFor("ana@example.com");
    return { media, ...rtc };
  };

  const audioSender = (senders: SenderStub[]) =>
    senders.find((item) => item.track?.kind === "audio") ?? null;

  it("carries the tab while the share is up", async () => {
    const { media, senders } = await withSound();
    await media.startScreen();
    expect(audioSender(senders)?.track?.label).toBe("screen-audio");
  });

  it("has the microphone back once the share stops", async () => {
    const { media, senders } = await withSound();
    await media.startScreen();
    const whileSharing = audioSender(senders)?.track;

    await media.stopScreen();

    // The very track the call started with, not merely something of the right
    // kind: a fresh one would mean a fresh permission and a fresh device light.
    expect(audioSender(senders)?.track?.label).toBe("mic-audio");
    expect(audioSender(senders)?.track).not.toBe(whileSharing);
  });

  it("keeps the microphone where a share that had no sound left it", async () => {
    // A whole screen has no audio of its own, which is the common case on the web,
    // and the microphone must not be disturbed by a share with nothing to put in
    // its place.
    const rtc = makePeer();
    const media = new CallMedia({
      media: {
        getUserMedia: vi.fn(async () => solidStream(["audio"], "mic")),
        getDisplayMedia: vi.fn(async () => solidStream(["video"], "screen")),
        enumerateDevices: vi.fn(async () => []),
      } as never,
      rtc: ((config: unknown) => rtc.peer) as never,
      turn: async () => null,
    } as never);
    media.listen({
      onSignal: () => {},
      onRemote: () => {},
      onPeer: () => {},
      onLocal: () => {},
      onScreen: () => {},
    });
    await media.start({ video: false });
    media.peerFor("ana@example.com");
    const before = audioSender(rtc.senders)?.track;

    await media.startScreen();
    await media.stopScreen();

    expect(audioSender(rtc.senders)?.track).toBe(before);
  });
});

describe("the sharer's own view of what they are sharing", () => {
  it("is handed over as its own stream when the share begins", async () => {
    const { media } = await setup();
    const seen: Array<unknown> = [];
    media.listen({
      onSignal: () => {},
      onRemote: () => {},
      onPeer: () => {},
      onLocal: () => {},
      onScreen: () => {},
      onScreenStream: (stream) => seen.push(stream),
    });
    await media.start({ video: false });

    await media.startScreen();
    // A stream, not nothing: this is what the sharer's tile is bound to.
    expect(seen.at(-1)).not.toBeNull();
    const screen = seen.at(-1) as { getVideoTracks: () => unknown[] };
    expect(screen.getVideoTracks()).toHaveLength(1);

    await media.stopScreen();
    // And nothing once it is over, so the tile falls back rather than holding the
    // last frame of a desktop that is no longer being shown.
    expect(seen.at(-1)).toBeNull();
  });

  it("does not pretend the microphone stream gained a picture", async () => {
    const { media } = await setup();
    const locals: Array<unknown> = [];
    media.listen({
      onSignal: () => {},
      onRemote: () => {},
      onPeer: () => {},
      onLocal: (stream) => locals.push(stream),
      onScreen: () => {},
    });
    await media.start({ video: false });

    await media.startScreen();

    // Only one `onLocal`, from joining. A share does not change the microphone,
    // and pretending otherwise is what left the tile empty.
    expect(locals).toHaveLength(1);
    const mic = locals[0] as { getVideoTracks: () => unknown[] };
    expect(mic.getVideoTracks()).toHaveLength(0);
  });
});
describe("sharing into a room that has no picture in it", () => {
  it("drops the screen onto the reserved slot, without renegotiating", async () => {
    const { media, peer, signals, senders } = await setup();
    await media.start({ video: false });
    media.peerFor("ana@example.com");

    // The slot is there and empty before anything is shared.
    expect(videoSender(senders)?.track).toBeNull();
    // The audio track was added when the connection was made, and nothing since.
    const addedBefore = (peer.addTrack as ReturnType<typeof vi.fn>).mock.calls.length;

    const started = await media.startScreen();

    expect(started).toBe(true);
    // The screen went into the slot that was already there.
    expect(videoSender(senders)?.track?.kind).toBe("video");
    // And nothing had to be negotiated to put it there, which is the whole point:
    // a share that has to wait for a fresh description arrives late or not at all.
    expect((peer.addTrack as ReturnType<typeof vi.fn>).mock.calls.length).toBe(addedBefore);
    expect(signals.some((signal) => signal["kind"] === "renegotiate")).toBe(false);
  });

  it("goes back to nothing when the share stops, rather than to a stale screen", async () => {
    const { media, senders } = await setup();
    await media.start({ video: false });
    media.peerFor("ana@example.com");
    await media.startScreen();
    expect(videoSender(senders)?.track?.kind).toBe("video");

    const stopped = await media.stopScreen();

    expect(stopped).toBe(true);
    // An empty slot rather than a frozen desktop, which is what a viewer is left
    // looking at when a share ends and the tile keeps the last frame.
    expect(videoSender(senders)?.track).toBeNull();
  });

  /**
   * A share has to be stoppable after the capture is already gone.
   *
   * The switch is on because the room says this account is sharing, and the room
   * says so long after the page that was sharing it went away: a reload, a closed
   * tab, a browser that took the capture for itself. Pressing the switch then asks
   * a device with nothing to release, and an early return answers "nothing
   * happened" — so the room is never told, the switch stays on, and the next press
   * finds nothing to release either. One share that ended badly and the person
   * cannot share anything again.
   *
   * So stopping settles the share whether or not there is a stream to stop, and
   * says so out loud.
   */
  it("settles the share even when the capture is already gone", async () => {
    const announced: boolean[] = [];
    const screens: unknown[] = [];
    const rtc = makePeer({});
    const media = new CallMedia({
      media: mediaOf() as never,
      rtc: ((config: unknown) => rtc.peer) as never,
      turn: async () => null,
    } as never);
    media.listen({
      onSignal: () => {},
      onRemote: () => {},
      onPeer: () => {},
      onLocal: () => {},
      onScreen: (sharing: boolean) => announced.push(sharing),
      onScreenStream: (stream: unknown) => screens.push(stream),
    });

    // Nothing was ever shared on this device.
    expect(media.sendingScreen).toBe(false);

    const stopped = await media.stopScreen();

    expect(stopped).toBe(true);
    // The room is told, which is the only part that unsticks the switch.
    expect(announced).toEqual([false]);
    // And the tile is handed back nothing, so a stale frame is not left on screen.
    expect(screens).toEqual([null]);
  });

  it("goes back to the camera when there is one", async () => {
    const { media, senders } = await setup({ userKinds: ["audio", "video"] });
    await media.start({ video: true });
    media.peerFor("ana@example.com");

    const carryingVideo = () => senders.filter((item) => item.track?.kind === "video").length;
    expect(carryingVideo()).toBe(1);

    await media.startScreen();
    // The screen took the camera's place rather than opening a second picture,
    // which is the point of a share: one picture, and it is the desktop.
    expect(carryingVideo()).toBe(1);

    await media.stopScreen();
    // And the camera came back, rather than an empty room or a frozen desktop.
    expect(carryingVideo()).toBe(1);
  });

  it("tells the room even though nothing was negotiated", async () => {
    const { media, signals } = await setup();
    let announced = false;
    media.listen({
      onSignal: (signal) => signals.push(signal as unknown as Record<string, unknown>),
      onRemote: () => {},
      onPeer: () => {},
      onLocal: () => {},
      // The browser's own button: the room has to hear that the share is over, or
      // it keeps showing a desktop that stopped moving.
      onScreen: (sharing) => {
        announced = !sharing;
      },
    });
    await media.start({ video: false });
    media.peerFor("ana@example.com");

    await media.startScreen();
    await media.stopScreen();

    expect(announced).toBe(true);
  });
});
