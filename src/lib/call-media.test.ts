// The media half of a call, driven against a stand in for the browser.
//
// A call is a mesh now, so most of what is checked here is about doing something
// to every connection at once: the order of the handshake, the tracks that go
// out, a screen share that reaches four people, and a hang up that leaves no
// microphone light on. Those are the things that break in practice.

import { describe, expect, it, vi } from "vitest";

import {
  CallMedia,
  type AudioLike,
  type CallMediaOptions,
  type MediaStreamLike,
  type PeerLike,
  type TrackLike,
} from "./call-media";

/** A track that records whether it was stopped and whether it is live. */
const track = (kind: string, label = ""): TrackLike & { stopped: boolean } => {
  const state = {
    kind,
    label,
    enabled: true,
    stopped: false,
    stop: () => {
      state.stopped = true;
    },
    addEventListener: vi.fn(),
  };
  return state;
};

const stream = (tracks: TrackLike[]): MediaStreamLike => ({
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
  getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
});

/**
 * A peer connection that records the handshake instead of negotiating it.
 *
 * `replaceTrack` really does leave the new track on the sender, because that is
 * how a screen share or a gain node taking the audio over is seen where it lands.
 */
const peer = (name = "peer") => {
  const sent: { remote: unknown[]; local: unknown[]; candidates: unknown[] } = {
    remote: [],
    local: [],
    candidates: [],
  };
  const senders: Array<{ track: TrackLike | null; replace: (next: unknown) => Promise<void> }> = [];
  const self: PeerLike & {
    sent: typeof sent;
    senders: typeof senders;
    fireIce: (candidate: unknown) => void;
    fireTrack: (stream: unknown) => void;
    fireState: (state: string) => void;
  } = {
    localDescription: null,
    connectionState: "new",
    sent,
    senders,
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    addTrack: (added) => {
      const entry = {
        track: added as TrackLike,
        replace: async (next: unknown) => {
          entry.track = next as TrackLike;
        },
      };
      senders.push(entry);
    },
    addIceCandidate: async (candidate) => {
      sent.candidates.push(candidate);
    },
    createOffer: async () => ({ type: "offer", name, sdp: "o" }),
    createAnswer: async () => ({ type: "answer", name, sdp: "a" }),
    setLocalDescription: async (description) => {
      sent.local.push(description);
    },
    setRemoteDescription: async (description) => {
      sent.remote.push(description);
    },
    close: () => {
      self.connectionState = "closed";
    },
    getSenders: () => senders.map((entry) => ({ track: entry.track, replaceTrack: entry.replace })),
    fireIce: (candidate) => self.onicecandidate?.({ candidate }),
    fireTrack: (remote) => self.ontrack?.({ streams: [remote] }),
    fireState: (state) => {
      self.connectionState = state;
      self.onconnectionstatechange?.();
    },
  };
  return self;
};

type FakePeer = ReturnType<typeof peer>;

const harness = (extra: Partial<CallMediaOptions> = {}) => {
  const camera = track("video", "camera");
  const mic = track("audio", "mic");
  const screen = track("video", "screen");
  const local = { value: stream([mic, camera]) as MediaStreamLike | null };
  /** The next getUserMedia answer, used to stand in for a second device. */
  const queued: { value: MediaStreamLike | (() => never) | null } = { value: null };
  /** The next screen share, for a browser that refused to give one. */
  let queuedScreen: MediaStreamLike | null = null;
  let display: MediaStreamLike | null = null;
  /** One connection per person, so a mesh is just a bigger map. */
  const created: FakePeer[] = [];
  const signals: Array<{ to: string; kind: string; [key: string]: unknown }> = [];
  const remotes: Array<{ email: string; stream: unknown }> = [];
  const peerStates: Array<{ email: string; state: string }> = [];
  const screenEvents: Array<{ sharing: boolean; surface: string }> = [];
  let localEvents = 0;

  const media = new CallMedia({
    media: {
      getUserMedia: async (constraints) => {
        if (queued.value) {
          const answer = queued.value;
          queued.value = null;
          if (typeof answer === "function") answer();
          return answer as MediaStreamLike;
        }
        const wanted = constraints.video ? [mic, camera] : [mic];
        local.value = stream(wanted);
        return local.value;
      },
      getDisplayMedia: async () => {
        display = queuedScreen ?? stream([screen]);
        queuedScreen = null;
        return display;
      },
      enumerateDevices: async () => [
        { deviceId: "mic-1", kind: "audioinput", label: "Built in" },
        { deviceId: "cam-1", kind: "videoinput", label: "FaceTime" },
        { deviceId: "spk-1", kind: "audiooutput", label: "Speakers" },
      ],
    },
    rtc: () => {
      const made = peer();
      created.push(made);
      return made;
    },
    ...extra,
  });

  media.listen({
    onSignal: (signal) => signals.push(signal as { to: string; kind: string }),
    onRemote: (email, received) => remotes.push({ email, stream: received }),
    onPeer: (email, state) => peerStates.push({ email, state }),
    onLocal: () => {
      localEvents += 1;
    },
    onScreen: (sharing, surface) => {
      screenEvents.push({ sharing, surface });
    },
  });

  /**
   * The stand in for one person's connection, reached through the layer so the
   * object the test holds is the one the layer is using.
   */
  const forPeer = (email: string) => media.peerFor(email) as unknown as FakePeer;

  return {
    media,
    camera,
    mic,
    screen,
    created,
    signals,
    remotes,
    peerStates,
    screenEvents,
    forPeer,
    localEvents: () => localEvents,
    streams: () => ({ local: local.value, display }),
    /** A screen share the browser hands back, or refuses to. */
    queueScreen: (answer: MediaStreamLike) => {
      queuedScreen = answer;
    },
    /** What the next getUserMedia hands back, as a device switch would. */
    queue: (answer: MediaStreamLike | (() => never)) => {
      queued.value = answer;
    },
  };
};

describe("starting a call", () => {
  it("opens the microphone, and the camera only for a video call", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    expect(audio.streams().local?.getVideoTracks()).toHaveLength(0);
    expect(audio.streams().local?.getAudioTracks()).toHaveLength(1);

    const video = harness();
    await video.media.start({ video: true });
    expect(video.streams().local?.getVideoTracks()).toHaveLength(1);
  });

  it("puts the local tracks on the connection before the offer is built", async () => {
    const { media } = harness();
    await media.start({ video: true });
    await media.createOffer("peer@example.com");

    // The offer is built from a connection that already carries the camera and
    // the microphone, or the other side hears nothing.
    expect(media.connectedTo()).toEqual(["peer@example.com"]);
  });

  it("holds one connection per person, and no more", async () => {
    const { media } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");
    await media.createAnswer("c@example.com", { type: "offer" });

    expect(media.connectedTo().sort()).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    // Asking twice for the same person is the same connection, not a second one.
    await media.createOffer("a@example.com");
    expect(media.connectedTo()).toHaveLength(3);
  });

  it("addresses every frame to the person it is about", async () => {
    const { media, signals } = harness();
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");

    expect(signals.filter((signal) => signal.kind === "offer").length).toBe(0);
    // An offer is handed back to the caller, not pushed out as a signal; the
    // store relays it. The only frames the layer raises itself are candidates.
    expect(signals).toEqual([]);
  });

  it("raises a candidate against the person it came from", async () => {
    const { media, signals } = harness();
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");

    // The stand in for the connection the layer built is reached through the
    // layer itself, so the candidate has to be raised by hand.
    const a = media.peerFor("a@example.com") as unknown as FakePeer;
    a.fireIce({ candidate: "one" });
    const b = media.peerFor("b@example.com") as unknown as FakePeer;
    b.fireIce({ candidate: "two" });

    expect(signals).toEqual([
      { kind: "candidate", to: "a@example.com", candidate: { candidate: "one" } },
      { kind: "candidate", to: "b@example.com", candidate: { candidate: "two" } },
    ]);
  });

  it("answers an offer on the connection of the person who sent it", async () => {
    const { media, forPeer } = harness();
    await media.start({ video: false });
    const answer = await media.createAnswer("a@example.com", { type: "offer", sdp: "o" });

    expect(forPeer("a@example.com").sent.remote).toEqual([{ type: "offer", sdp: "o" }]);
    expect(answer).toEqual({ type: "answer", name: "peer", sdp: "a" });
  });

  it("hands the answer and a candidate to the right connection", async () => {
    const { media, forPeer } = harness();
    await media.start({ video: false });
    await media.createAnswer("a@example.com", { type: "offer", sdp: "o" });
    await media.accept("a@example.com", { kind: "answer", description: { sdp: "a" } });
    await media.accept("a@example.com", { kind: "candidate", candidate: { c: 1 } });

    const a = forPeer("a@example.com");
    expect(a.sent.remote).toEqual([{ type: "offer", sdp: "o" }, { sdp: "a" }]);
    expect(a.sent.candidates).toEqual([{ c: 1 }]);
  });

  it("gives one stream per person, named by who it is", async () => {
    const { media, remotes } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");

    const remote = stream([track("audio", "their voice")]);
    (media.peerFor("a@example.com") as unknown as FakePeer).fireTrack(remote);
    expect(remotes).toEqual([{ email: "a@example.com", stream: remote }]);
  });

  it("reports each connection on its own, so one person leaving is not the end", async () => {
    const { media, peerStates } = harness();
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");

    (media.peerFor("a@example.com") as unknown as FakePeer).fireState("connected");
    expect(peerStates).toEqual([{ email: "a@example.com", state: "connected" }]);
  });
});

describe("the switches on the bar", () => {
  it("mutes the microphone, and everybody is on the same track", async () => {
    const { media, mic } = harness();
    await media.start({ video: false });

    expect(media.setMic(false)).toBe(false);
    // One track is shared by every connection, so a single flag is the whole
    // mute: there is nothing per person to forget.
    expect(mic.enabled).toBe(false);
  });

  it("turns the camera off without ending the call", async () => {
    const { media, camera } = harness();
    await media.start({ video: true });

    expect(media.setCamera(false)).toBe(false);
    expect(camera.enabled).toBe(false);
  });

  it("keeps a mute across a device change", async () => {
    const { media, queue } = harness();
    await media.start({ video: true });
    media.setMic(false);

    const replacement = track("audio", "headset");
    queue(stream([replacement]));
    await media.switchInput("audio", "mic-2");

    expect(replacement.enabled).toBe(false);
  });

  it("swaps a device on every connection at once", async () => {
    const { media, queue } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");

    const replacement = track("video", "webcam");
    queue(stream([replacement]));
    expect(await media.switchInput("video", "cam-2")).toBe(true);

    for (const email of ["a@example.com", "b@example.com"]) {
      const connection = media.peerFor(email) as unknown as FakePeer;
      const sender = connection.senders.find((entry) => entry.track?.kind === "video");
      expect(sender?.track).toBe(replacement);
    }
  });

  it("keeps the call up when the device cannot be opened", async () => {
    const { media, queue } = harness();
    await media.start({ video: false });
    queue(() => {
      throw new Error("device-in-use");
    });
    expect(await media.switchInput("audio", "mic-9")).toBe(false);
  });
});

describe("sharing a screen with the whole call", () => {
  it("puts the screen on every connection, not only the first", async () => {
    const { media, screen, forPeer } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");
    await media.createOffer("c@example.com");

    expect(await media.startScreen()).toBe(true);
    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      const connection = forPeer(email);
      const sender = connection.senders.find((entry) => entry.track?.kind === "video");
      // One video per person, so every one of them is watching the same screen.
      expect(sender?.track).toBe(screen);
    }
  });

  it("opens a video sender for a voice call, instead of sharing nothing", async () => {
    const { media, screen, forPeer } = harness();
    // A call that was placed without a camera: there is no video sender to put
    // anything on, so the screen has to open one. Replacing onto nothing is how
    // a share in a voice call used to reach nobody.
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    expect(forPeer("a@example.com").senders.some((entry) => entry.track?.kind === "video")).toBe(
      false,
    );

    expect(await media.startScreen()).toBe(true);

    const sender = forPeer("a@example.com").senders.find((entry) => entry.track?.kind === "video");
    expect(sender?.track).toBe(screen);
  });

  it("asks for a small frame rate, because a screen is mostly text", async () => {
    const asked: unknown[] = [];
    const { media } = harness({
      media: {
        getUserMedia: async () => stream([track("audio", "mic")]),
        getDisplayMedia: async (constraints) => {
          asked.push(constraints);
          return stream([track("video", "screen")]);
        },
        enumerateDevices: async () => [],
      },
    });
    await media.start({ video: false });
    await media.startScreen();

    const video = (asked[0] as { video?: { frameRate?: { max?: number } } })?.video;
    // Fifteen a second reads as still to somebody reading a document, and is the
    // difference between a call that holds together and one that does not.
    expect(video?.frameRate?.max).toBe(30);
  });

  it("sends the sound of a shared tab, and never plays it here", async () => {
    const tabSound = track("audio", "tab sound");
    const { media, forPeer } = harness({
      media: {
        getUserMedia: async () => stream([track("audio", "mic")]),
        getDisplayMedia: async () => stream([track("video", "screen"), tabSound]),
        enumerateDevices: async () => [],
      },
    });
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    await media.startScreen();

    // The other people hear the tab; this one does not, because the sound would
    // come straight back out of the speakers being captured.
    const sender = forPeer("a@example.com").senders.find((entry) => entry.track?.kind === "audio");
    expect(sender?.track).toBe(tabSound);
  });

  it("asks the browser what was picked, so the people watching are told", async () => {
    const window = track("video", "window");
    (window as unknown as { getSettings: () => unknown }).getSettings = () => ({
      displaySurface: "window",
    });
    const { media, screenEvents } = harness({
      media: {
        getUserMedia: async () => stream([track("audio", "mic")]),
        getDisplayMedia: async () => stream([window]),
        enumerateDevices: async () => [],
      },
    });
    await media.start({ video: false });

    await media.startScreen();
    await media.stopScreen();

    // A window, not a whole screen: the difference between an answer and a
    // "why is my desktop on their phone".
    expect(screenEvents).toEqual([
      { sharing: true, surface: "window" },
      { sharing: false, surface: "window" },
    ]);
  });

  it("treats a cancelled picker as no share and no change", async () => {
    const { media, screen, forPeer } = harness({
      media: {
        getUserMedia: async () => stream([track("video", "camera")]),
        getDisplayMedia: async () => {
          throw new Error("NotAllowedError");
        },
        enumerateDevices: async () => [],
      },
    });
    await media.start({ video: true });
    await media.createOffer("a@example.com");

    expect(await media.startScreen()).toBe(false);
    // The call is exactly as it was: the camera is still on the connection and
    // the screen is stopped.
    const sender = forPeer("a@example.com").senders.find((entry) => entry.track?.kind === "video");
    expect(sender?.track?.label).toBe("camera");
    expect(screen.stopped).toBe(false);
  });

  it("treats a picker that hands back no picture as no share", async () => {
    const { media, forPeer } = harness({
      media: {
        getUserMedia: async () => stream([track("video", "camera")]),
        getDisplayMedia: async () => stream([]),
        enumerateDevices: async () => [],
      },
    });
    await media.start({ video: true });
    await media.createOffer("a@example.com");

    expect(await media.startScreen()).toBe(false);
    const sender = forPeer("a@example.com").senders.find((entry) => entry.track?.kind === "video");
    expect(sender?.track?.label).toBe("camera");
  });

  it("hears about the browser's own stop sharing button", async () => {
    const shared = track("video", "screen");
    const listeners: Array<() => void> = [];
    (
      shared as unknown as { addEventListener: (type: string, fn: () => void) => void }
    ).addEventListener = (_type, fn) => listeners.push(fn);
    const { media, forPeer, screenEvents } = harness({
      media: {
        getUserMedia: async () => stream([track("video", "camera")]),
        getDisplayMedia: async () => stream([shared]),
        enumerateDevices: async () => [],
      },
    });
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.startScreen();
    expect(screenEvents.map((event) => event.sharing)).toEqual([true]);

    // The browser's own button, which the app did not press: the room has to be
    // told, or everybody keeps looking at a frozen desktop.
    for (const listener of listeners) listener();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screenEvents.map((event) => event.sharing)).toEqual([true, false]);
    const sender = forPeer("a@example.com").senders.find((entry) => entry.track?.kind === "video");
    expect(sender?.track?.label).toBe("camera");
  });

  it("goes back to the camera when the share stops", async () => {
    const { media, camera, screen } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.startScreen();

    expect(await media.stopScreen()).toBe(true);
    const connection = media.peerFor("a@example.com") as unknown as FakePeer;
    const sender = connection.senders.find((entry) => entry.track?.kind === "video");
    expect(sender?.track).toBe(camera);
    expect(screen.stopped).toBe(true);
  });

  it("does not touch a camera that was already switched off", async () => {
    const { media, camera } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    media.setCamera(false);

    await media.startScreen();
    await media.stopScreen();

    // The track is the camera's, but the user turned it off before sharing and
    // it is still off when the share ends.
    const connection = media.peerFor("a@example.com") as unknown as FakePeer;
    const sender = connection.senders.find((entry) => entry.track?.kind === "video");
    expect(sender?.track).toBe(camera);
    expect(camera.enabled).toBe(false);
  });

  it("says no when the browser hands back nothing to share", async () => {
    const { media, queueScreen } = harness();
    await media.start({ video: false });
    // A screen share that was cancelled at the picker, or a browser with no
    // display media at all: there is no video track to send to anybody.
    queueScreen(stream([]));
    expect(await media.startScreen()).toBe(false);
  });

  it("closes every connection on the way out", async () => {
    const { media, mic, camera, screen } = harness();
    await media.start({ video: true });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");
    await media.startScreen();
    const a = media.peerFor("a@example.com") as unknown as FakePeer;
    const b = media.peerFor("b@example.com") as unknown as FakePeer;

    media.stop();

    expect(mic.stopped).toBe(true);
    expect(camera.stopped).toBe(true);
    expect(screen.stopped).toBe(true);
    expect(a.connectionState).toBe("closed");
    expect(b.connectionState).toBe("closed");
    expect(media.connectedTo()).toEqual([]);
  });

  it("forgets one person without closing the rest", async () => {
    const { media } = harness();
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");
    const a = media.peerFor("a@example.com") as unknown as FakePeer;
    const b = media.peerFor("b@example.com") as unknown as FakePeer;

    expect(media.dropPeer("a@example.com")).toBe(true);

    expect(a.connectionState).toBe("closed");
    expect(b.connectionState).toBe("new");
    expect(media.connectedTo()).toEqual(["b@example.com"]);
  });
});

/**
 * A Web Audio graph that records what was connected where, and answers with a
 * chosen level so the meter has something to report.
 */
const audioHarness = (options: { level?: number; broken?: boolean } = {}) => {
  const level = options.level ?? 0;
  const gains: { value: number; targets: number[] }[] = [];
  const connections: string[] = [];
  const processed = track("audio", "processed");
  const closed: number[] = [];
  /** Mid point of the byte range is silence, so the level is written straight. */
  const analyserData = (data: Uint8Array) => data.fill(128 + Math.round(level * 127));
  const graph: AudioLike = {
    context: {
      currentTime: 3,
      close: async () => {
        closed.push(1);
      },
    } as unknown as AudioContext,
    createGain: () => {
      if (options.broken) throw new Error("no-webaudio");
      const state = {
        value: 1,
        targets: [] as number[],
        setTargetAtTime: (next: number) => {
          state.targets.push(next);
          state.value = next;
        },
      };
      gains.push(state);
      return {
        name: "gain",
        gain: state,
        connect: (node: unknown) => {
          connections.push(`gain->${(node as { name?: string })?.name ?? "node"}`);
        },
      } as unknown as GainNode;
    },
    createMediaStreamSource: () =>
      ({
        connect: (node: unknown) => {
          connections.push(`source->${(node as { name?: string })?.name ?? "node"}`);
        },
        disconnect: () => undefined,
      }) as unknown as MediaStreamAudioSourceNode,
    createMediaStreamDestination: () =>
      ({ name: "sink", stream: stream([processed]) }) as unknown as MediaStreamAudioDestinationNode,
    createAnalyser: () =>
      ({
        name: "analyser",
        fftSize: 0,
        getByteTimeDomainData: analyserData,
      }) as unknown as AnalyserNode,
  };
  return {
    graph,
    gains,
    connections,
    processed,
    closed,
    factory: options.broken ? null : () => graph,
    /** Runs the frames the meter asked for, one at a time. */
    frames: (() => {
      let queue: FrameRequestCallback[] = [];
      const original = globalThis.requestAnimationFrame;
      const originalCancel = globalThis.cancelAnimationFrame;
      globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        queue.push(callback);
        return queue.length;
      }) as typeof globalThis.requestAnimationFrame;
      globalThis.cancelAnimationFrame = (() => {
        queue = [];
      }) as typeof globalThis.cancelAnimationFrame;
      return {
        tick: (time = 16) => {
          const waiting = queue;
          queue = [];
          for (const callback of waiting) callback(time);
        },
        pending: () => queue.length,
        restore: () => {
          globalThis.requestAnimationFrame = original;
          globalThis.cancelAnimationFrame = originalCancel;
        },
      };
    })(),
  };
};

/** A recorder that keeps what it was handed, and hands it back on stop. */
const recorderHarness = () => {
  const started: (number | undefined)[] = [];
  const seen: MediaStreamLike[] = [];
  let finish: (blob: Blob | null) => void = () => undefined;
  const result = new Promise<Blob | null>((resolve) => {
    finish = resolve;
  });
  const recorder = {
    start: (timeslice?: number) => started.push(timeslice),
    stop: () => finish(new Blob(["voice"], { type: "audio/webm" })),
    result,
  };
  return {
    started,
    seen,
    recorder,
    build: (source: MediaStreamLike) => {
      seen.push(source);
      return recorder;
    },
  };
};

describe("the input volume", () => {
  it("sends the gain through to every connection", async () => {
    const audio = audioHarness();
    const { media, mic } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.createOffer("a@example.com");
    await media.createOffer("b@example.com");

    expect(await media.setInputVolume(1.5)).toBe(1.5);
    // The graph is microphone to gain to the connections, with no other path.
    expect(audio.connections).toEqual(["source->gain", "gain->sink"]);
    // The call carries the gain node's output on every connection, not on one of
    // them: a volume knob that reaches one person out of three is a bug.
    for (const email of ["a@example.com", "b@example.com"]) {
      const connection = media.peerFor(email) as unknown as FakePeer;
      const sender = connection.senders.find((entry) => entry.track?.kind === "audio");
      expect(sender?.track).toBe(audio.processed);
    }
    expect(mic.stopped).toBe(false);
  });

  it("keeps the level a fraction of a second, so a drag does not click", async () => {
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory });
    await media.start({ video: false });

    await media.setInputVolume(0.8);
    // Smoothed, and from the clock of the graph rather than the wall clock.
    expect(audio.gains[0]?.targets).toEqual([0.8]);
    expect(audio.gains[0]?.value).toBe(0.8);
  });

  it("stays inside what a gain can do", async () => {
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory });
    await media.start({ video: false });

    expect(await media.setInputVolume(9)).toBe(2);
    expect(await media.setInputVolume(-4)).toBe(0);
    expect(await media.setInputVolume(Number.NaN)).toBe(0);
    expect(media.getInputVolume()).toBe(0);
  });

  it("points a connection made after the slider at the gain too", async () => {
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.setInputVolume(1.25);
    await media.createOffer("late@example.com");

    const late = media.peerFor("late@example.com") as unknown as FakePeer;
    const sender = late.senders.find((entry) => entry.track?.kind === "audio");
    expect(sender?.track).toBe(audio.processed);
  });

  it("carries the level across a device change", async () => {
    const audio = audioHarness();
    const { media, queue } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.setInputVolume(1.75);

    const other = track("audio", "headset");
    queue(stream([other]));
    expect(await media.switchInput("audio", "mic-2")).toBe(true);

    // The graph was reading the microphone that just went away, so it is built
    // again, and it comes up with the level the user had chosen.
    expect(audio.gains).toHaveLength(2);
    expect(audio.gains[1]?.value).toBe(1.75);
    expect(other.stopped).toBe(false);
  });

  it("mutes the track the call carries, not only the one on this device", async () => {
    const audio = audioHarness();
    const { media, mic } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.setInputVolume(1);
    media.setMic(false);

    expect(mic.enabled).toBe(false);
    expect(audio.processed.enabled).toBe(false);
  });

  it("comes back muted after a device change, because the user said so", async () => {
    const audio = audioHarness();
    const { media, queue } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.setInputVolume(1);
    media.setMic(false);

    queue(stream([track("audio", "headset")]));
    await media.switchInput("audio", "mic-2");

    expect(audio.processed.enabled).toBe(false);
  });

  it("keeps the call working where the browser has no Web Audio", async () => {
    const { media } = harness({ audio: null });
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    expect(media.canSetInputVolume).toBe(false);
    // The number is still held, so a browser that gains the feature later has it.
    expect(await media.setInputVolume(1.25)).toBe(1.25);
    // And the microphone is still on the call, unchanged.
    const connection = media.peerFor("a@example.com") as unknown as FakePeer;
    expect(connection.senders.find((entry) => entry.track?.kind === "audio")?.track?.label).toBe(
      "mic",
    );
  });

  it("falls back to the raw microphone when the graph is refused", async () => {
    const audio = audioHarness({ broken: true });
    const { media } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.createOffer("a@example.com");

    expect(await media.setInputVolume(2)).toBe(2);
    const connection = media.peerFor("a@example.com") as unknown as FakePeer;
    expect(connection.senders.find((entry) => entry.track?.kind === "audio")?.track?.label).toBe(
      "mic",
    );
  });

  it("closes the graph on hang up, or the sound device stays awake", async () => {
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory });
    await media.start({ video: false });
    await media.setInputVolume(1);
    media.stop();

    expect(audio.closed).toHaveLength(1);
  });
});

describe("the level meter", () => {
  it("reports nothing in silence", async () => {
    const audio = audioHarness({ level: 0 });
    const frames = audio.frames;
    try {
      const { media } = harness({ audio: audio.factory });
      await media.start({ video: false });

      const seen: number[] = [];
      expect(await media.startMeter((level) => seen.push(level))).toBe(true);
      expect(seen).toEqual([0]);

      media.stopMeter();
    } finally {
      frames.restore();
    }
  });

  it("moves with the microphone and stops when asked", async () => {
    const audio = audioHarness({ level: 0.5 });
    const frames = audio.frames;
    try {
      const { media } = harness({ audio: audio.factory });
      await media.start({ video: false });

      const seen: number[] = [];
      await media.startMeter((level) => seen.push(level));
      // One reading on the spot, and a frame queued for the next.
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeCloseTo(0.5, 2);
      expect(frames.pending()).toBe(1);

      frames.tick();
      expect(seen).toHaveLength(2);

      media.stopMeter();
      // A closed panel asks for no more frames.
      expect(frames.pending()).toBe(0);
      frames.tick();
      expect(seen).toHaveLength(2);
    } finally {
      frames.restore();
    }
  });

  it("says no when there is no microphone to watch", async () => {
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory });
    expect(await media.startMeter(() => undefined)).toBe(false);
  });

  it("says no where the browser has no Web Audio", async () => {
    const { media } = harness({ audio: null });
    await media.start({ video: false });
    expect(await media.startMeter(() => undefined)).toBe(false);
    // And stopping is still safe, so a panel can always clean up.
    media.stopMeter();
  });
});

describe("the microphone test", () => {
  it("records the microphone and hands the recording back", async () => {
    const recording = recorderHarness();
    const audio = audioHarness();
    const { media, mic } = harness({ audio: audio.factory, recorder: recording.build });

    const test = await media.recordTest();
    expect(test).not.toBeNull();
    // A timeslice, so a long test is a file rather than a memory.
    expect(recording.started).toEqual([200]);
    expect(recording.seen).toHaveLength(1);

    const blob = await test?.stop();
    expect(blob?.type).toBe("audio/webm");
    // The microphone is released the moment the test is over.
    expect(mic.stopped).toBe(true);
  });

  it("records what the call would carry, so the playback is honest", async () => {
    const recording = recorderHarness();
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory, recorder: recording.build });
    await media.start({ video: false });
    await media.setInputVolume(1.4);

    const test = await media.recordTest();
    expect(recording.seen[0]?.getAudioTracks()[0]).toBe(audio.processed);
    await test?.stop();
  });

  it("says no where the browser cannot record", async () => {
    const audio = audioHarness();
    const { media } = harness({ audio: audio.factory, recorder: () => null });
    await media.start({ video: false });
    expect(await media.recordTest()).toBeNull();
  });

  it("says no when the microphone is not allowed", async () => {
    const recording = recorderHarness();
    const { media, queue } = harness({
      audio: audioHarness().factory,
      recorder: recording.build,
    });
    queue(() => {
      throw new Error("denied");
    });
    expect(await media.recordTest()).toBeNull();
    expect(recording.started).toEqual([]);
  });
});
