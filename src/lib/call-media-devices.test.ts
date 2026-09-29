// A call between devices that are not the same: a phone on a weak uplink, a
// laptop that changes network halfway through, a Safari that hands over a track
// with no stream on it.
//
// Every test here is one of those situations, driven through the same seams the
// browser is behind. The point of the file is the handful of things that make a
// call work on hardware other than the machine it was built on: the order frames
// arrive in, a microphone that is opened with the right processing, a graph the
// phone suspends, and a connection that has to be rebuilt after the network
// changes under it.

import { describe, expect, it, vi } from "vitest";

import {
  CallMedia,
  type CallMediaOptions,
  type MediaStreamLike,
  type PeerLike,
  type TrackLike,
  type ViewLike,
} from "./call-media";

const track = (kind: string, label: string): TrackLike => {
  const state: TrackLike = {
    kind,
    label,
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn(),
  };
  return state;
};

const stream = (tracks: TrackLike[]): MediaStreamLike => ({
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
  getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
  addTrack: () => {},
  removeTrack: () => {},
});

/** A connection that records what it was asked to do, in the order it was asked. */
const connection = (name: string) => {
  const log: string[] = [];
  const offers: Array<{ iceRestart?: boolean }> = [];
  const senders: Array<{
    track: TrackLike | null;
    replaceTrack: (next: unknown) => Promise<void>;
    parameters: { encodings?: unknown[] } | null;
    setParameters?: (next: unknown) => Promise<void>;
  }> = [];
  const codecPreferences: unknown[][] = [];
  const transceivers: Array<{
    kind: string;
    setCodecPreferences: (list: unknown[]) => void;
    sender: { track?: { kind: string } | null };
  }> = [];
  const self: PeerLike & {
    log: string[];
    offers: Array<{ iceRestart?: boolean }>;
    senders: typeof senders;
    transceivers: typeof transceivers;
    codecPreferences: unknown[][];
    restartIce: ReturnType<typeof vi.fn>;
    addTrack: (added: unknown) => void;
    remote: () => string;
    added: () => string[];
    negotiation: () => void;
    ice: (candidate: unknown) => void;
    track: (withStream: boolean, received: unknown) => void;
    state: (next: string) => void;
  } = {
    localDescription: null,
    connectionState: "new",
    log,
    offers,
    senders,
    transceivers,
    codecPreferences,
    onicecandidate: null,
    ontrack: null,
    onconnectionstatechange: null,
    // A real connection grows a transceiver for every track that is added, and
    // that is where a codec is chosen, so the stand in does the same.
    addTrack: (added) => {
      const kind = (added as TrackLike).kind;
      const entry: (typeof senders)[number] = {
        track: added as TrackLike,
        replaceTrack: async (next) => {
          entry.track = next as TrackLike;
        },
        parameters: { encodings: [{}] },
        setParameters: async (next) => {
          entry.parameters = next as { encodings?: unknown[] };
        },
      };
      senders.push(entry);
      transceivers.push({
        kind,
        sender: { track: entry.track },
        setCodecPreferences: (list) => codecPreferences.push(list),
      });
      log.push(`add:${kind}`);
    },
    addIceCandidate: async (candidate) => {
      log.push(`candidate:${(candidate as { id?: string })?.id ?? "?"}`);
    },
    createOffer: async (options) => {
      offers.push(options ?? {});
      log.push(`offer:${name}`);
      return { type: "offer", name };
    },
    createAnswer: async () => {
      log.push(`answer:${name}`);
      return { type: "answer", name };
    },
    setLocalDescription: async (description) => {
      log.push(`local:${(description as { type: string }).type}`);
    },
    setRemoteDescription: async (description) => {
      log.push(`remote:${(description as { type?: string }).type ?? "?"}`);
    },
    close: () => {
      self.connectionState = "closed";
    },
    getSenders: () =>
      senders.map((entry) => ({
        track: entry.track,
        replaceTrack: entry.replaceTrack,
        getParameters: () => entry.parameters ?? { encodings: [] },
        setParameters: async (next: unknown) => {
          entry.parameters = next as { encodings?: unknown[] };
          log.push(`parameters:${name}`);
        },
      })),
    getTransceivers: () => transceivers,
    restartIce: vi.fn() as never,
    remote: () => log.filter((entry) => entry.startsWith("remote:")).join(","),
    added: () => senders.map((entry) => entry.track?.kind ?? "none"),
    negotiation: () => self.onnegotiationneeded?.(),
    ice: (candidate) => self.onicecandidate?.({ candidate }),
    track: (withStream, received) =>
      self.ontrack?.({
        streams: withStream ? [received] : [],
        track: (received as MediaStreamLike).getTracks?.()[0],
      }),
    state: (next) => {
      self.connectionState = next;
      self.onconnectionstatechange?.();
    },
  };
  return self;
};

type FakeConnection = ReturnType<typeof connection>;

/** The window, for the events a phone really does send. */
const window_ = () => {
  const listeners = new Map<string, Array<() => void>>();
  const document = {
    visibilityState: "visible" as string,
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(`doc:${type}`, [...(listeners.get(`doc:${type}`) ?? []), fn]);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.set(
        `doc:${type}`,
        (listeners.get(`doc:${type}`) ?? []).filter((entry) => entry !== fn),
      );
    },
  };
  const view: ViewLike & { fire: (type: string) => void } = {
    document,
    addEventListener: (type, fn) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type, fn) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== fn),
      );
    },
    fire: (type) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
  return view;
};

/** An audio context that behaves like the one on a phone: it suspends. */
const audioGraph = () => {
  const context = {
    state: "suspended" as "suspended" | "running" | "closed",
    resumes: 0,
    resume: async () => {
      context.resumes += 1;
      context.state = "running";
    },
    close: async () => {
      context.state = "closed";
    },
  };
  const gain = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  const sink = { stream: stream([track("audio", "processed")]) };
  return {
    context,
    gain,
    sink,
    api: {
      context: context as unknown as AudioContext,
      createGain: () => gain as unknown as GainNode,
      createMediaStreamSource: () =>
        ({ connect: vi.fn(), disconnect: vi.fn() }) as unknown as MediaStreamAudioSourceNode,
      createMediaStreamDestination: () => sink as unknown as MediaStreamAudioDestinationNode,
      createAnalyser: () =>
        ({ fftSize: 0, getByteTimeDomainData: vi.fn() }) as unknown as AnalyserNode,
    },
  };
};

const harness = (extra: Partial<CallMediaOptions> = {}) => {
  const mic = track("audio", "mic");
  const camera = track("video", "camera");
  const screen = track("video", "screen");
  const built: FakeConnection[] = [];
  const signals: Array<{ kind: string; to: string; [key: string]: unknown }> = [];
  const remotes: Array<{ email: string; stream: unknown }> = [];
  const peerStates: Array<{ email: string; state: string }> = [];
  const view = window_();
  const asked: MediaStreamConstraints[] = [];
  const graph = audioGraph();
  const builtStreams: Array<{ tracks: TrackLike[] }> = [];

  const media = new CallMedia({
    media: {
      getUserMedia: async (constraints) => {
        asked.push(constraints);
        return stream(constraints.video ? [mic, camera] : [mic]);
      },
      getDisplayMedia: async () => stream([screen]),
      enumerateDevices: async () => [
        { deviceId: "mic-1", kind: "audioinput", label: "Built in" },
        { deviceId: "cam-1", kind: "videoinput", label: "Camera" },
      ],
    },
    rtc: () => {
      const made = connection("peer");
      built.push(made);
      return made;
    },
    // The browser's own codec list, which is what the ordering is set from.
    codecs: (kind) =>
      kind === "audio"
        ? {
            codecs: [
              { mimeType: "audio/PCMU" },
              { mimeType: "audio/opus", clockRate: 48000 },
              { mimeType: "audio/red" },
            ],
          }
        : { codecs: [{ mimeType: "video/VP8" }, { mimeType: "video/H264" }] },
    streamOf: (tracks) => {
      builtStreams.push({ tracks });
      return stream(tracks);
    },
    // The graph the phone suspends, which is the whole point of two of the tests
    // below.
    audio: () => graph.api,
    view,
    ...extra,
  });

  media.listen({
    onSignal: (signal) => signals.push(signal as { kind: string; to: string }),
    onRemote: (email, received) => remotes.push({ email, stream: received }),
    onPeer: (email, state) => peerStates.push({ email, state }),
    onLocal: () => {},
    onScreen: () => {},
  });

  const forPeer = (email: string) => media.peerFor(email) as unknown as FakeConnection;
  return {
    media,
    mic,
    camera,
    screen,
    view,
    graph,
    built,
    signals,
    remotes,
    peerStates,
    asked,
    builtStreams,
    forPeer,
    kinds: () => signals.map((signal) => signal.kind),
  };
};

describe("a microphone, whatever it turns out to be", () => {
  it("is opened with the processing that makes a call usable", async () => {
    const audio = harness();
    await audio.media.start({ video: false });

    const constraints = audio.asked[0]?.audio as Record<string, unknown>;
    // A laptop on a table echoes straight back down the microphone, and that is
    // the difference between a call and a feedback loop.
    expect(constraints["echoCancellation"]).toEqual({ ideal: true });
    expect(constraints["noiseSuppression"]).toEqual({ ideal: true });
    expect(constraints["autoGainControl"]).toEqual({ ideal: true });
    // A voice is mono, and Opus carries it for half the bits of a stereo one.
    expect(constraints["channelCount"]).toEqual({ ideal: 1 });
    expect(constraints["sampleRate"]).toEqual({ ideal: 48_000 });
  });

  it("keeps that processing when another device is picked", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");

    expect(await audio.media.switchInput("audio", "mic-2")).toBe(true);

    // A headset chosen from the list arrives with the same treatment as the
    // built in one, or it echoes on a laptop that the first one did not.
    const constraints = audio.asked[1]?.audio as Record<string, unknown>;
    expect(constraints["deviceId"]).toEqual({ exact: "mic-2" });
    expect(constraints["echoCancellation"]).toEqual({ ideal: true });
    expect(constraints["autoGainControl"]).toEqual({ ideal: true });
  });

  it("does not offer a microphone's id to the camera", async () => {
    const audio = harness();
    await audio.media.start({ video: true, deviceId: "mic-1", videoDeviceId: "cam-1" });

    const constraints = audio.asked[0]!;
    expect((constraints.audio as Record<string, unknown>)["deviceId"]).toEqual({ exact: "mic-1" });
    // The two are different lists, and one id asked for both is a call with no
    // picture on the device that had a camera to offer.
    expect((constraints.video as Record<string, unknown>)["deviceId"]).toEqual({ exact: "cam-1" });
  });
});

describe("the audio graph on a phone", () => {
  it("is started, rather than left suspended and sending silence", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.setInputVolume(1);

    // iOS opens a context suspended unless it is resumed inside a tap, and a
    // suspended graph processes nothing at all: the call carries a track of
    // silence and the meter reads zero.
    expect(audio.graph.context.resumes).toBeGreaterThan(0);
    expect(audio.graph.context.state).toBe("running");
  });

  it("is resumed when the phone comes back to the foreground", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.setInputVolume(1);
    const before = audio.graph.context.resumes;

    // The phone locked the screen, which is when the browser suspends it.
    audio.graph.context.state = "suspended";
    audio.view.fire("doc:visibilitychange");

    expect(audio.graph.context.resumes).toBe(before + 1);
  });
});

describe("the order frames arrive in", () => {
  it("keeps a candidate that turns up before the description", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");
    const link = audio.forPeer("a@example.com");

    // A phone finishes gathering long before the far side has read the offer, so
    // this is the ordinary order rather than the unusual one.
    await audio.media.accept("a@example.com", {
      kind: "candidate",
      candidate: { id: "early" },
    } as never);
    expect(link.log).not.toContain("candidate:early");

    await audio.media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);

    // Dropped instead, this is the only route that works, and the call comes up
    // connected and silent on one device.
    expect(link.log).toContain("candidate:early");
  });

  it("keeps the candidates in the order they arrived", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");
    const link = audio.forPeer("a@example.com");

    for (const id of ["one", "two", "three"]) {
      await audio.media.accept("a@example.com", {
        kind: "candidate",
        candidate: { id },
      } as never);
    }
    await audio.media.accept("a@example.com", {
      kind: "answer",
      description: { type: "answer" },
    } as never);

    const added = link.log.filter((entry) => entry.startsWith("candidate:"));
    expect(added).toEqual(["candidate:one", "candidate:two", "candidate:three"]);
  });

  it("answers an offer that arrives after the microphone is open", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");

    // A new description halfway through a call is a shared screen or a changed
    // network. It is answered on its own, because there is nobody to press a
    // button at this point.
    await audio.media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);

    expect(audio.kinds()).toContain("answer");
    expect(audio.forPeer("a@example.com").log).toContain("answer:peer");
  });

  it("holds an offer while the phone is still ringing", async () => {
    const audio = harness();
    await audio.media.createOffer("a@example.com");

    // Ringing: there is no microphone yet, and an answer built now is a call
    // where the other side hears nothing and cannot say why.
    await audio.media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);
    expect(audio.kinds()).not.toContain("answer");
    expect(audio.media.hasPendingOffer("a@example.com")).toBe(true);

    await audio.media.start({ video: false });
    expect(await audio.media.answerPending("a@example.com")).toBe(true);
    expect(audio.kinds()).toContain("answer");
  });

  it("never answers the same offer twice", async () => {
    const audio = harness();
    await audio.media.start({ video: false });

    await audio.media.accept("a@example.com", {
      kind: "offer",
      description: { type: "offer" },
    } as never);
    // The answer button arrives after the media layer already answered, which is
    // the ordinary order on a fast phone. Answering again would roll the far
    // side back to a state it has already thrown away.
    expect(await audio.media.answerPending("a@example.com")).toBe(false);
    expect(
      audio.forPeer("a@example.com").log.filter((entry) => entry === "answer:peer"),
    ).toHaveLength(1);
  });
});

describe("a screen shared in a call that had no camera", () => {
  it("reaches the other device, because the link is told about it", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");

    // A voice call has no video sender, so one is opened. Nothing the far side
    // has been told about is a screen it never shows.
    expect(await audio.media.startScreen()).toBe(true);
    const link = audio.forPeer("a@example.com");
    link.negotiation();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // `createOffer` only builds the description; the store is what sends it, so
    // this offer is the renegotiation and it is the only frame that went out.
    expect(audio.kinds()).toEqual(["offer"]);
    expect(audio.signals[0]?.["description"]).toBeTruthy();
    expect(link.added()).toContain("video");
  });

  it("asks the side that offers, when this one does not", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    // The roster decides this, and it is worked out before the connection is
    // opened, so the role has to survive a link that does not exist yet.
    audio.media.setOfferer("a@example.com", false);
    await audio.media.createOffer("a@example.com");

    await audio.media.startScreen();
    audio.forPeer("a@example.com").negotiation();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Only the other side of the roster may build the description, or the two
    // phones end up offering at once and neither handshake lands.
    expect(audio.kinds()).toEqual(["renegotiate"]);
  });

  it("offers once, however many tracks were added", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");
    const link = audio.forPeer("a@example.com");

    await audio.media.startScreen();
    link.negotiation();
    link.negotiation();
    link.negotiation();
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The browser asks more than once while it settles, and one offer for a
    // camera and a screen is one description rather than two.
    expect(audio.signals.filter((signal) => signal.kind === "offer")).toHaveLength(1);
  });
});

describe("a network that changes under the call", () => {
  it("asks for new addresses when a connection fails outright", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");
    const link = audio.forPeer("a@example.com");

    link.state("failed");
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The addresses from ten minutes ago belong to somebody else now.
    expect(link.restartIce).toHaveBeenCalled();
    expect(link.offers.at(-1)).toEqual({ iceRestart: true });
  });

  it("waits out a hiccup before spending the restart", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");
    const link = audio.forPeer("a@example.com");

    // A phone walking out of signal reports this and recovers by itself.
    link.state("disconnected");
    expect(audio.peerStates.at(-1)).toEqual({ email: "a@example.com", state: "disconnected" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(link.offers).toHaveLength(1);

    // And the restart never comes, because the call came back on its own.
    link.state("connected");
    await new Promise((resolve) => setTimeout(resolve, 4200));
    expect(link.offers).toHaveLength(1);
  }, 10_000);

  it("catches up when the network comes back", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    await audio.media.createOffer("a@example.com");
    const link = audio.forPeer("a@example.com");

    // Out of a lift, or a laptop coming back from sleep.
    audio.view.fire("online");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(link.offers.at(-1)).toEqual({ iceRestart: true });
  });

  it("does not start a call that has not answered yet", async () => {
    const audio = harness();
    // Ringing: a restart would negotiate with no microphone and no one to send it.
    audio.media.peerFor("a@example.com");
    const link = audio.forPeer("a@example.com");

    link.state("failed");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(link.offers).toHaveLength(0);
  });
});

describe("what each device can actually send", () => {
  it("asks for Opus by name, and leaves the rest where the browser had it", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    const link = audio.media.peerFor("a@example.com") as unknown as FakeConnection;

    const [chosen] = link.codecPreferences;
    // Opus first: the one codec that is both everywhere and worth its name on a
    // voice call.
    expect(chosen?.[0]).toEqual({ mimeType: "audio/opus", clockRate: 48000 });
    // Everything the browser had, in the browser's own order, because that order
    // is what the redundancy codecs expect and moving them breaks the stream.
    expect(chosen?.slice(1)).toEqual([{ mimeType: "audio/PCMU" }, { mimeType: "audio/red" }]);
  });

  it("leaves the video codec list alone", async () => {
    const audio = harness();
    await audio.media.start({ video: true });
    const link = audio.media.peerFor("a@example.com") as unknown as FakeConnection;

    // VP8 and H264 both work on some devices and not others, and which one a
    // browser reaches for first is its own business.
    expect(link.codecPreferences).toHaveLength(1);
    expect(link.codecPreferences[0]?.[0]).toEqual({ mimeType: "audio/opus", clockRate: 48000 });
  });

  it("caps what one video uplink has to carry", async () => {
    const audio = harness();
    await audio.media.start({ video: true });
    const link = audio.media.peerFor("a@example.com") as unknown as FakeConnection;
    const sender = link.senders.find((entry) => entry.track?.kind === "video");

    // Three video streams up one phone's uplink is how the voice goes with them,
    // and a phone asking for 720p at whatever the camera feels like is the other
    // half of the same problem.
    expect(sender?.parameters?.encodings).toEqual([
      { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
    ]);
  });

  it("leaves the microphone uncapped", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    const link = audio.media.peerFor("a@example.com") as unknown as FakeConnection;
    const sender = link.senders.find((entry) => entry.track?.kind === "audio");

    // A voice codec is already small, and a cap on it is a cap on somebody
    // being heard at all.
    expect(sender?.parameters?.encodings).toEqual([{}]);
  });
});

describe("a browser that hands the track over on its own", () => {
  it("still produces something to listen to", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    const link = audio.forPeer("a@example.com");
    const received = stream([track("audio", "their voice")]);

    // Safari attaches no stream more often than not, and a connection with a
    // track but no stream is a person nobody can hear.
    link.track(false, received);

    expect(audio.remotes).toHaveLength(1);
    expect(audio.builtStreams[0]?.tracks[0]?.label).toBe("their voice");
  });

  it("uses the stream it was given when there is one", async () => {
    const audio = harness();
    await audio.media.start({ video: false });
    const link = audio.forPeer("a@example.com");
    const received = stream([track("audio", "their voice")]);

    link.track(true, received);

    expect(audio.remotes[0]?.stream).toBe(received);
    expect(audio.builtStreams).toHaveLength(0);
  });
});

describe("the connection a call is built on", () => {
  it("gathers the routes while the phone is still ringing", () => {
    const configs: RTCConfiguration[] = [];
    const audio = harness({
      rtc: (config) => {
        configs.push(config);
        return connection("peer");
      },
    });
    audio.media.peerFor("a@example.com");

    // Candidates are gathered up front, so by the time somebody answers, the
    // call is up in about a second rather than after a fresh round trip.
    expect(configs[0]?.iceCandidatePoolSize).toBe(4);
    expect(configs[0]?.bundlePolicy).toBe("max-bundle");
    expect(configs[0]?.iceServers?.[0]?.urls).toBe("stun:stun.l.google.com:19302");
  });

  it("puts the relay the server has on every connection", async () => {
    const asked: string[] = [];
    const configs: RTCConfiguration[] = [];
    const audio = harness({
      turn: async () => {
        asked.push("turn");
        return {
          urls: ["stun:turn.example.com:3478", "turn:turn.example.com:5349"],
          username: "who",
          credential: "what",
        };
      },
      rtc: (config) => {
        configs.push(config);
        return connection("peer");
      },
    });
    await audio.media.start({ video: false });
    audio.media.peerFor("a@example.com");

    // Asked once per call, and asked before anything is built: a connection
    // built without the relay never learns to use one, because the candidates
    // are gathered once and a relay found afterwards is not among them.
    expect(asked).toHaveLength(1);
    const servers = configs[0]?.iceServers ?? [];
    const relay = servers.find((server) =>
      (server.urls as unknown as string[]).includes("turn:turn.example.com:5349"),
    );
    expect(relay).toMatchObject({ username: "who", credential: "what" });
    // Both addresses, because a relay is normally reached on more than one port
    // and trying the next one beats giving up.
    expect((relay?.urls as unknown as string[]).length).toBe(2);
  });

  it("makes the call without a relay when there is none", async () => {
    const configs: RTCConfiguration[] = [];
    const audio = harness({
      turn: async () => null,
      rtc: (config) => {
        configs.push(config);
        return connection("peer");
      },
    });
    await audio.media.start({ video: false });
    audio.media.peerFor("a@example.com");

    // Not a failure: two devices reach each other directly on every network that
    // lets them, which is most of them. Pinned in full, because the list is what
    // decides whether a phone behind a symmetric NAT has any route at all, and
    // nothing that can relay is among them.
    const urls = (configs[0]?.iceServers ?? []).flatMap((server) => {
      const listed = server.urls as string | string[];
      return Array.isArray(listed) ? listed : [listed];
    });
    expect(urls).toEqual([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.stunprotocol.org:3478",
    ]);
    expect(urls.some((url) => url.startsWith("turn:"))).toBe(false);
  });
});
