/**
 * The media half of a call: cameras, microphones, the screen and the peer
 * connection that carries them.
 *
 * Nothing here knows about the chat. The store owns the conversation and the
 * signalling; this class owns the browser APIs, behind a small set of seams
 * (`media`, `rtc`, `display`) so the handshake can be driven in a test with no
 * browser at all.
 *
 * Everything in here is written for the worst hardware in the call rather than
 * the best: a phone on a weak uplink, a laptop that changes network halfway
 * through, a browser that hands over its candidates before its description. A
 * call that works on the machine it was built on and fails on a phone is the
 * bug this file exists to not have.
 */

import type { CallSignal, ScreenSurface } from "./messages-protocol";

/**
 * One line per step of one connection, so a call that does not come up can be
 * read instead of guessed at.
 *
 * Every stage of a handshake is reported: which candidates were gathered, which
 * were held, which descriptions went out and came back, and what each of the
 * three state machines said at every transition. They disagree with each other
 * while a call is working and they disagree about where it stopped while it is
 * not: `signalingState` reaching `stable` only means the descriptions were
 * exchanged, `iceConnectionState` reaching `completed` only means a route was
 * chosen, and `connectionState` reaching `connected` is the first of the three
 * that means media can flow. A call hung on "connecting" has broken in one
 * specific place, and these lines are where that place is written down.
 *
 * Kept to a single prefixed line so it can be filtered with the other `call`
 * output, and left on by default: a trace nobody has to switch on is a trace
 * that is there the first time a call hangs.
 */
const traceCall = (to: string, step: string, detail = "") => {
  console.log(`[call ${to}] ${step}${detail ? ` · ${detail}` : ""}`);
};

/**
 * The part of a candidate worth having in a log line.
 *
 * A candidate is a blob of SDP with the one field that matters buried inside it,
 * and reading a call's routes out of that is not what anyone opens a console
 * for. The end-of-candidates marker has nothing to describe and says so,
 * because that line means gathering is over: any route still missing at that
 * point is not on its way, and a call waiting on one is waiting for good.
 */
const describeCandidate = (candidate: unknown): string => {
  const found = candidate as {
    type?: string;
    protocol?: string;
    address?: string;
    port?: number;
  } | null;
  if (!found) return "end of candidates";
  return `${found.protocol ?? "?"}/${found.type ?? "?"} ${found.address ?? "?"}:${found.port ?? "?"}`;
};

/** One connection, and the handshake state that goes with it. */
type Link = {
  peer: PeerLike;
  /**
   * Candidates that arrived before the description they belong to.
   *
   * A phone on a slow link routinely finishes gathering and sends its
   * candidates while the other side is still reading the description. Adding
   * one before that throws, and dropping it loses a route, which is how a call
   * ends up connected but silent on exactly one device.
   */
  queued: unknown[];
  /** True once a description from the other side has been applied. */
  hasRemote: boolean;
  /** An offer from the other side that has not been answered yet. */
  pendingOffer: unknown;
  /** Whether this side is the one that offers on this link. */
  offerer: boolean | null;
  /** A handshake in flight, so two offers are never built on top of each other. */
  busy: Promise<unknown>;
  /**
   * Adds one candidate, now if there is a description for it and held if there
   * is not.
   *
   * The one rule that matters: a candidate is never thrown away, and one the
   * connection refuses does not stop the ones behind it. A refused candidate is
   * a route that does not work here, not a reason to give up on the next one,
   * and treating it as one is how a call that was going to connect does not.
   */
  addCandidate: (candidate: unknown) => Promise<void>;
  /**
   * Says a description is in place, and puts everything that was waiting onto
   * the connection at once, in the order it arrived.
   *
   * Order is not a detail: a candidate offered out of order is one the browser
   * refuses, and the route is lost with it.
   */
  remoteApplied: () => void;
};

/**
 * The candidate queue, attached to one link's own fields.
 *
 * It reads and writes the very `queued` list and `hasRemote` flag the link holds,
 * rather than a copy of them, so there is only ever one list per link: two lists
 * that merely look the same is a candidate queue that quietly loses half of them.
 */
const attachCandidateQueue = (link: Link, to: string) => {
  /**
   * Puts one candidate on the connection, and reports whether it took.
   *
   * A refusal is reported and then stepped over, never rethrown: it is one
   * route that does not work here, not a reason to give up on the one behind
   * it, so the next candidate goes on however this one went.
   */
  const addOne = async (candidate: unknown) => {
    try {
      await link.peer.addIceCandidate(candidate);
    } catch (error) {
      traceCall(to, "candidate refused", String(error));
    }
  };
  link.addCandidate = async (candidate: unknown) => {
    if (!link.hasRemote) {
      link.queued.push(candidate);
      traceCall(to, "candidate held", `${link.queued.length} waiting for a description`);
      return;
    }
    await addOne(candidate);
  };
  link.remoteApplied = () => {
    link.hasRemote = true;
    const waiting = link.queued.splice(0);
    if (waiting.length) {
      traceCall(to, "description applied", `releasing ${waiting.length} held candidate(s)`);
    }
    for (const candidate of waiting) {
      void addOne(candidate);
    }
  };
  return link;
};

/**
 * What a microphone is asked for, whichever one it is.
 *
 * The processing is not decoration and it is not optional: a laptop with its
 * speakers on a table echoes straight back down the microphone, and a headset
 * picked out of the device list would arrive with it turned off. This is used
 * for the device switch as well as the first open, so the second microphone
 * sounds like the first one rather than like a different phone.
 */
const microphoneConstraints = (deviceId?: string): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48_000 },
});

/**
 * The public STUN list every connection starts from.
 *
 * A second and third address are not two more routes. STUN only ever reports
 * the address the device already has, so a server that is unreachable from the
 * network in use is dropped without a word, and the ones that do answer are
 * asked in parallel rather than one after another, which keeps gathering no
 * slower than one server costs. The two Google addresses sit on separate
 * anycast networks and rarely fail together, and the third is not Google's at
 * all, so one provider being down is not a call that cannot be made.
 *
 * This is still only ever a map. It says where a device appears to be, not how
 * to reach it, and none of it helps when the answer is a symmetric NAT, which is
 * the case TURN exists for.
 */
const publicStunServers = (): RTCIceServer[] => [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.stunprotocol.org:3478" },
];

/**
 * What a call is built on.
 *
 * The public STUN list is always there. TURN is the part that cannot be
 * invented: a phone behind a carrier's or an office's symmetric NAT has no
 * reachable address of its own, and only a relay can reach it. Set the three
 * variables and every device gets the same list, which is what makes a call
 * work everywhere rather than almost everywhere.
 */
const iceServersFromEnv = (): RTCIceServer[] => {
  const servers = publicStunServers();
  const env = typeof import.meta === "object" ? import.meta.env : undefined;
  const turn = (env?.["VITE_TURN_URL"] as string) ?? "";
  if (!turn) return servers;
  return [
    ...servers,
    {
      urls: turn
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
      username: (env?.["VITE_TURN_USER"] as string) ?? "",
      credential: (env?.["VITE_TURN_CRED"] as string) ?? "",
    },
  ];
};

/**
 * The bits of `RTCPeerConnection` this file uses, so a test can supply a stand in
 * that records the handshake instead of negotiating a real one.
 */
/** The track surface this file touches, so a stand in needs only these. */
export type TrackLike = {
  kind: string;
  enabled: boolean;
  label: string;
  stop: () => void;
  addEventListener?: (type: string, listener: () => void) => void;
};

export type PeerLike = {
  localDescription: unknown;
  addTrack?: (track: unknown, stream: unknown) => void;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  createOffer: (options?: { iceRestart?: boolean }) => Promise<unknown>;
  createAnswer: () => Promise<unknown>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  close: () => void;
  onicecandidate: ((event: { candidate: unknown }) => void) | null;
  /**
   * A candidate the browser could not gather, which is how an unreachable STUN
   * server or a blocked UDP port announces itself.
   */
  onicecandidateerror?: ((event: { errorCode?: number; errorText?: string }) => void) | null;
  ontrack: ((event: { streams: unknown[]; track?: unknown }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  /** The two narrower machines behind the one above, read for tracing only. */
  oniceconnectionstatechange?: (() => void) | null;
  onsignalingstatechange?: (() => void) | null;
  onnegotiationneeded?: (() => void) | null;
  /** The browser's own way of gathering fresh candidates after a network change. */
  restartIce?: () => void;
  connectionState: string;
  iceConnectionState?: string;
  signalingState?: string;
  getSenders: () => Array<{
    track: TrackLike | null;
    replaceTrack: (track: unknown) => Promise<void>;
    getParameters?: () => { encodings?: unknown[] };
    setParameters?: (parameters: unknown) => Promise<void>;
  }>;
  /** Used to ask for Opus by name, and to cap what one uplink has to carry. */
  getTransceivers?: () => Array<{
    sender?: { track?: { kind: string } | null };
    setCodecPreferences?: (list: unknown[]) => void;
    stopDirection?: string;
  }>;
};

export type MediaLike = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStreamLike>;
  enumerateDevices: () => Promise<MediaDeviceInfoLike[]>;
};

export type MediaStreamLike = {
  getTracks: () => TrackLike[];
  getAudioTracks: () => TrackLike[];
  getVideoTracks: () => TrackLike[];
  /**
   * Present on a real `MediaStream`, and used to swap a device in place: the
   * audio graph holds a reference to this very object, so a replaced wrapper
   * would leave it reading a stopped microphone.
   */
  addTrack?: (track: TrackLike) => void;
  removeTrack?: (track: TrackLike) => void;
};

export type MediaDeviceInfoLike = { deviceId: string; kind: string; label: string };

/** The audio graph, the level meter and the recorder, all optional seams. */
export type AudioLike = {
  context: AudioContext;
  createGain: () => GainNode;
  createMediaStreamSource: (stream: MediaStream) => MediaStreamAudioSourceNode;
  createMediaStreamDestination: () => MediaStreamAudioDestinationNode;
  createAnalyser: () => AnalyserNode;
};

export type RecorderLike = {
  start: (timeslice?: number) => void;
  stop: () => void;
  /** Resolves with whatever was recorded, in a format the browser can play. */
  result: Promise<Blob | null>;
};

export type CallMediaOptions = {
  /** Everything a call needs, defaulting to the browser's own seams. */
  media?: MediaLike | null;
  /** Builds a peer connection. Injected so a test can watch the handshake. */
  rtc?: (config: RTCConfiguration) => PeerLike;
  iceServers?: RTCIceServer[];
  /** The Web Audio graph, for the input volume and the level meter. */
  audio?: (() => AudioLike) | null;
  /** The recorder behind the microphone test. */
  recorder?: (stream: MediaStreamLike) => RecorderLike | null;
  /** What codecs this browser can send, as the browser itself reports them. */
  codecs?: ((kind: string) => { codecs?: Array<{ mimeType?: string } | null> } | null) | null;
  /**
   * Builds a stream out of loose tracks, for the browsers that hand over a track
   * with no stream attached. Safari does this often enough that "they cannot
   * hear me" is otherwise a bug report rather than an answer.
   */
  streamOf?: ((tracks: TrackLike[]) => MediaStreamLike) | null;
  /** The window, for the network and lifecycle events a call has to survive. */
  view?: ViewLike | null;
  /**
   * The relay this deployment has configured, asked once per call.
   *
   * Resolves to null where there is none, which is not a failure: two devices
   * reach each other directly on every network that lets them, and that is most
   * of them. The ones where they cannot are behind a shared address, and the
   * relay is the only way through.
   */
  turn?: () => Promise<{ urls: string[]; username?: string; credential?: string } | null>;
};

/** The parts of `window` this file listens to. */
export type ViewLike = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  document?: {
    visibilityState?: string;
    addEventListener?: (type: string, fn: () => void) => void;
    removeEventListener?: (type: string, fn: () => void) => void;
  };
};

/**
 * What this browser can send, asked of the browser itself.
 *
 * Opus first, and nothing else moved: it is the one codec that is both
 * universally present and worth its name on a voice call, and putting it at the
 * front of the list is what stops a desktop and a phone from spending the first
 * seconds of a call working out that they agree. The order of everything else is
 * left exactly as the browser had it, because that order is what the redundancy
 * codecs (`red`, `ulpfec`) and the retransmission for video expect.
 */
const preferredCodecs = (
  capabilities: ((kind: string) => { codecs?: Array<{ mimeType?: string } | null> } | null) | null,
  kind: string | undefined,
) => {
  if (!kind || !capabilities) return [] as unknown[];
  const list = capabilities(kind)?.codecs;
  if (!Array.isArray(list) || list.length === 0) return [] as unknown[];
  if (kind !== "audio") return [] as unknown[];
  const opus = list.filter(
    (codec) => typeof codec?.mimeType === "string" && /^audio\/opus/i.test(codec.mimeType),
  );
  if (opus.length === 0) return [] as unknown[];
  return [...opus, ...list.filter((codec) => !opus.includes(codec))];
};

export type CallMediaEvents = {
  /** A frame the caller has to relay, already addressed to one person. */
  onSignal: (signal: Partial<CallSignal> & { kind: CallSignal["kind"]; to: string }) => void;
  /** One participant's media, once it arrives. */
  onRemote: (email: string, stream: unknown) => void;
  /** One connection came up or went down. */
  onPeer: (email: string, state: "connecting" | "connected" | "disconnected" | "failed") => void;
  /** The local tracks changed, so a preview can be put back together. */
  onLocal: (stream: MediaStreamLike | null) => void;
  /**
   * Sharing started or stopped, including when the browser's own "stop sharing"
   * button is used, which is not something the app pressed.
   */
  onScreen: (sharing: boolean, surface: ScreenSurface) => void;
};

export class CallMedia {
  /**
   * One connection per person, keyed by their address.
   *
   * A group call is a mesh: with four people there are six connections and each
   * phone holds three of them. There is no server in the middle, so this map is
   * the whole of the group's shape, and a device switch or a screen share is a
   * walk over it.
   */
  private peers = new Map<string, PeerLike>();
  /** The handshake state that goes with each connection, keyed the same way. */
  private links = new Map<string, Link>();
  /** Which side of each link this device is on, kept for links not opened yet. */
  private roles = new Map<string, boolean>();
  private localStream: MediaStreamLike | null = null;
  private screenStream: MediaStreamLike | null = null;
  private readonly media: MediaLike | null;
  private readonly rtc: (config: RTCConfiguration) => PeerLike;
  private readonly ice: RTCIceServer[];
  /** The relay, when the deployment has one. Asked once, not per connection. */
  private readonly turn:
    (() => Promise<{ urls: string[]; username?: string; credential?: string } | null>) | null;
  private relay: RTCIceServer | null = null;
  private readonly audio: (() => AudioLike) | null;
  private readonly recorder: ((stream: MediaStreamLike) => RecorderLike | null) | null;
  private readonly streamOf: ((tracks: TrackLike[]) => MediaStreamLike) | null;
  private readonly codecs:
    ((kind: string) => { codecs?: Array<{ mimeType?: string } | null> } | null) | null;
  private readonly view: ViewLike | null;
  /** The graph the microphone is played through, once it has been opened. */
  private gainNode: GainNode | null = null;
  private meter: AnalyserNode | null = null;
  private meterNode: MediaStreamAudioSourceNode | null = null;
  private meterFrame: number | null = null;
  /** The gain node's own output, which is what the call and the test carry. */
  private processed: MediaStreamLike | null = null;
  private audioContext: AudioContext | null = null;
  private inputVolume = 1;
  private events: CallMediaEvents = {
    onSignal: () => {},
    onRemote: () => {},
    onPeer: () => {},
    onLocal: () => {},
    onScreen: () => {},
  };
  /** What the microphone and the camera were last switched to, so a device
   * change keeps the mute the user had chosen. */
  private micOn = true;
  private cameraOn = false;
  /**
   * Whether this device has a microphone to answer with.
   *
   * Until it does, an offer is left waiting rather than answered, because an
   * answer built on a connection with no microphone is a call where the other
   * side hears nothing and cannot say why.
   */
  private ready = false;
  /** The link waiting out a network change, per person. */
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The offers waiting to go out after a track was added, per person. */
  private renegotiations = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly onBackOnline = () => {
    // A phone that came out of a lift, or a laptop that came back from sleep, has
    // new addresses and a dead connection. Asking the far side to try again is
    // the difference between a call that comes back and one that does not.
    for (const email of this.peers.keys()) void this.renegotiate(email, { iceRestart: true });
  };
  private readonly onShown = () => this.onVisible();

  constructor(options: CallMediaOptions = {}) {
    this.media =
      options.media !== undefined
        ? options.media
        : typeof navigator === "undefined" || !navigator.mediaDevices
          ? null
          : (navigator.mediaDevices as unknown as MediaLike);
    this.rtc =
      options.rtc ??
      ((config: RTCConfiguration) => new RTCPeerConnection(config) as unknown as PeerLike);
    this.ice = options.iceServers ?? iceServersFromEnv();
    this.turn = options.turn ?? null;
    this.streamOf =
      options.streamOf !== undefined
        ? options.streamOf
        : typeof MediaStream === "undefined"
          ? null
          : (tracks) =>
              new MediaStream(
                tracks as unknown as MediaStreamTrack[],
              ) as unknown as MediaStreamLike;
    this.codecs =
      options.codecs !== undefined
        ? options.codecs
        : typeof RTCRtpSender === "undefined"
          ? null
          : (kind: string) =>
              (RTCRtpSender.getCapabilities(kind) as {
                codecs?: Array<{ mimeType?: string } | null>;
              } | null) ?? null;
    this.view =
      options.view !== undefined
        ? options.view
        : typeof window === "undefined"
          ? null
          : (window as unknown as ViewLike);
    this.audio =
      options.audio !== undefined
        ? options.audio
        : typeof window === "undefined" || !window.AudioContext
          ? null
          : () => {
              const context = new AudioContext();
              return {
                context,
                createGain: () => context.createGain(),
                createMediaStreamSource: (stream: MediaStream) =>
                  context.createMediaStreamSource(stream),
                createMediaStreamDestination: () => context.createMediaStreamDestination(),
                createAnalyser: () => context.createAnalyser(),
              };
            };
    this.recorder =
      options.recorder !== undefined
        ? options.recorder
        : typeof MediaRecorder === "undefined"
          ? null
          : (stream: MediaStreamLike) => {
              // Chromium on Windows 10 and 11 speaks webm/opus; everything else
              // is left to the browser's own choice.
              const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
              const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
              const recorder = new MediaRecorder(
                stream as unknown as MediaStream,
                mimeType ? { mimeType } : undefined,
              );
              const chunks: Blob[] = [];
              recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
              };
              const result = new Promise<Blob | null>((resolve) => {
                recorder.onstop = () => {
                  resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
                };
                recorder.onerror = () => resolve(null);
              });
              return {
                start: (timeslice?: number) => recorder.start(timeslice),
                stop: () => recorder.stop(),
                result,
              };
            };
  }

  /** False on a device or browser with no camera, which the view has to say. */
  get supported() {
    return this.media !== null;
  }

  listen(events: CallMediaEvents) {
    this.events = events;
    // A phone that comes back on a different network is still in the call as far
    // as the conversation goes, so the connections have to be told to try again
    // rather than the call quietly dying on one device.
    this.view?.addEventListener("online", this.onBackOnline);
    // And a phone that comes back from a locked screen has a suspended audio
    // graph, which would make the microphone a track of silence.
    this.view?.document?.addEventListener?.("visibilitychange", this.onShown);
  }

  /**
   * Opens the microphone, and the camera when the call is a video one.
   *
   * The audio constraints are what make a call usable rather than merely
   * connected. Echo cancellation is the difference between a laptop on a table
   * and a phone on speaker: without it the person opposite hears themselves a
   * beat later and talks over themselves. Noise suppression and automatic gain
   * are what make a call in a café a call.
   *
   * They are all `ideal` rather than required, because a device that cannot do
   * one of them should still make the call, and the browser is entitled to
   * refuse. A microphone is opened as mono, which is what a voice is and half
   * the bits of a stereo one.
   */
  /**
   * Opens the microphone, and the camera when the call is a video one.
   *
   * The relay is asked for here, before anything is built, because a connection
   * built without it never learns to use one: the candidates are gathered once,
   * and a relay discovered afterwards is not among them. It is asked once per
   * call rather than once per connection, because four people in a call means
   * six connections and the answer is the same for all of them.
   */
  start = async (options: {
    video: boolean;
    /** A chosen microphone, as `devices()` reports it. */
    deviceId?: string;
    /** A chosen camera, which is a different list entirely. */
    videoDeviceId?: string;
  }) => {
    if (!this.media) throw new Error("media-unavailable");
    if (this.turn) this.relay = await this.turn().catch(() => null);
    this.micOn = true;
    this.cameraOn = options.video;
    this.localStream = await this.media.getUserMedia({
      audio: microphoneConstraints(options.deviceId),
      video: options.video
        ? {
            ...(options.videoDeviceId ? { deviceId: { exact: options.videoDeviceId } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          }
        : false,
    });
    // A microphone in hand means an offer can be answered from now on.
    this.ready = true;
    return this.localStream;
  };

  /** Lists the microphones and cameras, after the permission prompt has shown. */
  devices = async () => {
    if (!this.media) return [];
    const all = await this.media.enumerateDevices();
    return all.filter((device) => device.kind === "audioinput" || device.kind === "videoinput");
  };

  /**
   * The connection to one person, made on first use.
   *
   * Created before the handshake because the local tracks have to be on it
   * before an offer is built: a connection that offers without them is a call
   * where the other side hears nothing.
   */
  peerFor = (email: string) => {
    const existing = this.peers.get(email);
    if (existing) return existing;
    const peer = this.rtc({
      iceServers: this.relay ? [...this.ice, this.relay] : this.ice,
      // Everything this device sends rides one connection, which is what a phone
      // can actually carry, and the candidates are gathered while the person is
      // still ringing somebody: by the time they answer, the routes are already
      // there and the call is up in about a second.
      bundlePolicy: "max-bundle",
      iceCandidatePoolSize: 4,
    });
    traceCall(
      email,
      "connection created",
      `${this.ice.length + (this.relay ? 1 : 0)} ice server(s)`,
    );
    const link: Link = attachCandidateQueue(
      {
        peer,
        queued: [],
        hasRemote: false,
        pendingOffer: null,
        // Until the store says otherwise this side offers, which is the right
        // guess for a call this device placed. The roster's own answer, if it has
        // already been worked out, wins.
        offerer: this.roles.get(email) ?? true,
        busy: Promise.resolve(undefined),
        addCandidate: async () => {},
        remoteApplied: () => {},
      },
      email,
    );
    this.links.set(email, link);
    peer.onicecandidate = (event) => {
      // A null candidate is the end of gathering, not something to send.
      if (!event.candidate) {
        traceCall(email, "gathering finished");
        return;
      }
      traceCall(email, "local candidate gathered", describeCandidate(event.candidate));
      this.events.onSignal({ kind: "candidate", to: email, candidate: event.candidate });
    };
    peer.onicecandidateerror = (event) => {
      // The commonest cause by far is a STUN server the network in use cannot
      // reach, which is why this is traced rather than swallowed.
      traceCall(email, "candidate gathering failed", `code ${event.errorCode} ${event.errorText}`);
    };
    peer.oniceconnectionstatechange = () => {
      traceCall(email, "ice connection state", peer.iceConnectionState ?? "unknown");
    };
    peer.onsignalingstatechange = () => {
      traceCall(email, "signaling state", peer.signalingState ?? "unknown");
    };
    peer.ontrack = (event) => {
      const [stream] = event.streams ?? [];
      // Safari hands the track over with no stream attached more often than not,
      // and a connection that has a track but no stream is a person nobody can
      // hear. One track in a stream of its own is the fallback that fixes it.
      const usable =
        (stream as MediaStreamLike | undefined) ?? this.streamOf?.([event.track as TrackLike]);
      if (usable) {
        traceCall(email, "remote track arrived", stream ? "with a stream" : "stream rebuilt");
        this.events.onRemote(email, usable);
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      traceCall(email, "connection state", state);
      const report =
        state === "connected"
          ? "connected"
          : state === "failed"
            ? "failed"
            : state === "connecting"
              ? "connecting"
              : "disconnected";
      if (report === "connected") this.clearGrace(email);
      if (report === "failed") void this.renegotiate(email, { iceRestart: true });
      // `disconnected` is a hiccup, not a hang up: the browser is still trying,
      // and a phone that walked out of signal comes back on its own.
      if (report === "disconnected") this.armGrace(email);
      this.events.onPeer(email, report);
    };
    // A track added halfway through a call only reaches the other side after a
    // new description, which is what this asks for.
    peer.onnegotiationneeded = () => this.askForRenegotiation(email);
    this.peers.set(email, peer);
    this.attachLocal(peer);
    this.tune(peer);
    // A gain node may already be open, in which case this connection carries
    // its output rather than the raw microphone.
    if (this.processed) void this.pointAudioAt(peer);
    return peer;
  };

  /** Forgets one person's connection, because they left. */
  dropPeer = (email: string) => {
    const peer = this.peers.get(email);
    if (!peer) return false;
    this.peers.delete(email);
    this.links.delete(email);
    this.clearGrace(email);
    this.cancelRenegotiation(email);
    peer.close();
    return true;
  };
  /**
   * Records which side of a link this device is on.
   *
   * The roster decides it, the same on every device, which is what keeps two
   * phones from offering at the same time. It also says who renegotiates: the
   * side that offers is the side that tells the other one to expect a new
   * description.
   *
   * Remembered rather than applied at once, because the store works out the
   * roster before the connection exists: a role set on a link that is not there
   * yet would be the one thing that decides who offers, silently lost.
   */
  setOfferer = (email: string, offerer: boolean) => {
    this.roles.set(email, offerer);
    const link = this.links.get(email);
    if (link) link.offerer = offerer;
  };

  /**
   * What a codec and a bitrate cap can be asked for.
   *
   * A voice call is Opus on every device that has ever shipped a browser, and
   * asking for it by name means a phone is not left negotiating against a
   * desktop that would rather send G722. The video is capped because a mesh of
   * three sends three video streams up one uplink, and 720p at whatever the
   * camera feels like is how a phone runs out of bandwidth and the voice goes
   * with it.
   */
  private tune = (peer: PeerLike) => {
    const senders = peer.getSenders?.() ?? [];
    void this.capVideo(senders);
    const transceivers = peer.getTransceivers?.();
    if (!transceivers?.length) return;
    for (const transceiver of transceivers) {
      const supported = preferredCodecs(this.codecs, transceiver.sender?.track?.kind);
      if (supported.length) {
        try {
          transceiver.setCodecPreferences?.(supported);
        } catch {
          // A browser that does not let this be set sends what it sends.
        }
      }
    }
  };

  /** Caps one video sender, and leaves the audio alone. */
  private capVideo = async (senders: ReturnType<PeerLike["getSenders"]>) => {
    for (const sender of senders) {
      if (sender.track?.kind !== "video") continue;
      if (!sender.setParameters) continue;
      try {
        const parameters = sender.getParameters?.();
        const encodings = parameters?.encodings;
        if (!Array.isArray(encodings) || !encodings.length) continue;
        await sender.setParameters({
          ...parameters,
          encodings: encodings.map((entry) => ({
            ...(entry as Record<string, unknown>),
            // What a person talking needs, not what a camera can be asked for.
            maxBitrate: 1_200_000,
            maxFramerate: 30,
            // Keep the picture whole when the uplink cannot hold the frame rate:
            // a soft image reads, a slideshow does not.
            scaleResolutionDownBy: 1,
          })),
        });
      } catch {
        // A browser that refuses the parameters keeps sending what it wants.
      }
    }
  };

  /** The people currently held on a connection. */
  connectedTo = () => [...this.peers.keys()];

  /**
   * Attaches what this side sends: the microphone, and one video.
   *
   * The video is whichever one is being sent, the camera or the screen, so a
   * person dialled into a call that is already sharing gets the screen rather
   * than a camera shot of somebody's ceiling. That is also why the video is
   * chosen here and not taken from the local stream: the screen is not in it.
   */
  private attachLocal = (peer: PeerLike) => {
    for (const track of this.localStream?.getTracks() ?? []) {
      if (track.kind !== "audio") continue;
      // The audio may already be running through the gain node, in which case
      // the call carries that track and not the raw microphone.
      const outgoing = this.processed?.getAudioTracks()[0] ?? track;
      // The browser owns the track, the connection only carries it.
      peer.addTrack?.(outgoing, this.localStream);
    }
    const video = this.outgoingVideo();
    if (video) peer.addTrack?.(video, this.localStream);
  };

  /** Puts the gain node's output on one more connection. */
  private pointAudioAt = async (peer: PeerLike) => {
    const processed = this.processed?.getAudioTracks()[0];
    const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
    if (processed && sender) await sender.replaceTrack(processed);
  };

  /** The caller side: builds the offer for one person and hands it over. */
  createOffer = async (to: string, options: { iceRestart?: boolean } = {}) => {
    const peer = this.peerFor(to);
    traceCall(to, "building offer", options.iceRestart ? "ice restart" : "");
    const offer = await peer.createOffer(options.iceRestart ? { iceRestart: true } : undefined);
    await peer.setLocalDescription(offer);
    return offer;
  };

  /** The callee side: answers one person's offer. */
  createAnswer = async (to: string, offer: unknown) => {
    const peer = this.peerFor(to);
    traceCall(to, "applying offer", "(direct path)");
    await peer.setRemoteDescription(offer);
    // The same rule `accept` follows, on the other path into the handshake: a
    // description is in place, so everything held for it goes on now, in the
    // order it arrived. Leaving this out is a queue that is never emptied, and
    // every candidate after this one waits for a description that has already
    // been given.
    this.linkFor(to).remoteApplied();
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    traceCall(to, "answer built");
    return answer;
  };

  /**
   * Applies what one person sent: a description or a candidate.
   *
   * The two are not independent. A candidate cannot be added before the
   * description it belongs to, and on a phone that order is regularly the other
   * way round, because gathering finishes long before the far side has read the
   * offer. So candidates wait here until there is something to add them to, and
   * are then added in the order they arrived: dropping them instead loses the
   * only route that works, and the call comes up connected and silent.
   */
  accept = async (to: string, signal: Pick<CallSignal, "kind" | "description" | "candidate">) => {
    const link = this.linkFor(to);
    const peer = link.peer;
    if (signal.kind === "offer" || signal.kind === "answer") {
      if (signal.description === undefined) {
        traceCall(to, `discarded an empty ${signal.kind}`);
        return;
      }
      traceCall(to, `applying ${signal.kind}`);
      await peer.setRemoteDescription(signal.description);
      // Everything that was waiting goes on straight away, in the order it
      // arrived, before anything else this link does.
      link.remoteApplied();
      if (signal.kind === "offer") {
        // A new description has arrived, and it is this side's turn to answer it.
        // The only case where it is not answered here is a phone that is still
        // ringing: it has no microphone yet, and the answer is sent when the
        // person presses the button.
        link.pendingOffer = signal.description;
        if (this.ready) await this.answerPending(to);
      }
      return;
    }
    if (signal.kind === "candidate" && signal.candidate !== undefined) {
      // A candidate is either added now or held until there is a description to
      // add it to. Never dropped, and never held behind a description that has
      // already been set, which is the whole of it.
      traceCall(to, "remote candidate received", describeCandidate(signal.candidate));
      await link.addCandidate(signal.candidate);
    }
  };

  private linkFor = (email: string) => {
    const found = this.links.get(email);
    if (found) return found;
    // Built the same way `peerFor` builds one, so a frame for somebody this
    // device has not connected to yet still has somewhere to wait.
    this.peerFor(email);
    return this.links.get(email)!;
  };

  /**
   * Answers an offer that is waiting, if there is one and if this device has
   * something to answer with.
   *
   * Answering twice is worse than not answering at all: the second description
   * rolls the first one back, and the far side keeps a state it has already
   * thrown away. So the offer is taken off the list before the answer is built.
   */
  answerPending = async (to: string) => {
    const link = this.links.get(to);
    if (!link?.pendingOffer || !this.ready) {
      if (link?.pendingOffer) traceCall(to, "offer held", "no microphone yet, not answering");
      return false;
    }
    // Taken off the list before the answer is built, because a second answer to
    // the same offer rolls the far side back to a state it has already thrown
    // away.
    link.pendingOffer = null;
    const run = link.busy.then(async () => {
      traceCall(to, "answering held offer");
      const answer = await link.peer.createAnswer();
      await link.peer.setLocalDescription(answer);
      traceCall(to, "answer sent");
      this.events.onSignal({ kind: "answer", to, description: answer });
    });
    // Kept usable whatever happened: a rejected chain would stop every later
    // renegotiation on this link from ever running.
    link.busy = run.catch(() => undefined);
    await link.busy;
    return true;
  };

  /** Whether an offer from this person is still waiting to be answered. */
  hasPendingOffer = (to: string) => this.links.get(to)?.pendingOffer != null;

  /**
   * Builds and sends a fresh offer for one person.
   *
   * `iceRestart` asks for entirely new routes, which is what a phone that has
   * changed network needs: the addresses it gave ten minutes ago are somebody
   * else's now, and no amount of waiting will make them answer.
   */
  renegotiate = async (to: string, options: { iceRestart?: boolean } = {}) => {
    const link = this.links.get(to);
    if (!link || !this.ready) return false;
    // One handshake at a time per link. Two offers on top of each other is how a
    // call ends up connected with no sound.
    const run = link.busy.then(async () => {
      const peer = link.peer;
      peer.restartIce?.();
      const offer = await peer.createOffer(options.iceRestart ? { iceRestart: true } : undefined);
      await peer.setLocalDescription(offer);
      this.events.onSignal({ kind: "offer", to, description: offer });
    });
    link.busy = run.catch(() => undefined);
    await link.busy;
    return true;
  };

  /**
   * The browser wants a new description because a track was added.
   *
   * Sharing a screen in a call that had no camera is the case that matters: the
   * connection has no video sender to put anything on, so one is opened, and the
   * other side has to hear about it or the share stays on this device.
   */
  private askForRenegotiation = (email: string) => {
    this.cancelRenegotiation(email);
    // One offer, not one per track: a camera and a screen added together is one
    // description, and the browser asks more than once while it settles.
    this.renegotiations.set(
      email,
      setTimeout(() => {
        this.renegotiations.delete(email);
        const link = this.links.get(email);
        if (!link) return;
        if (link.offerer === false) {
          // This side does not offer on this link, so it asks the side that does.
          this.events.onSignal({ kind: "renegotiate", to: email });
          return;
        }
        void this.renegotiate(email);
      }, 120),
    );
  };

  private cancelRenegotiation = (email: string) => {
    const timer = this.renegotiations.get(email);
    if (timer !== undefined) clearTimeout(timer);
    this.renegotiations.delete(email);
  };

  /**
   * Waits out a network hiccup before deciding the call is over.
   *
   * `disconnected` is what a phone reports for the seconds it spends on a lift
   * with no signal, and it recovers by itself. Restarting straight away would
   * spend the battery of a call that was about to come back; never restarting
   * would leave a call dead on the one device that needed help.
   */
  private armGrace = (email: string) => {
    if (this.graceTimers.has(email)) return;
    this.graceTimers.set(
      email,
      setTimeout(() => {
        this.graceTimers.delete(email);
        void this.renegotiate(email, { iceRestart: true });
      }, 4_000),
    );
  };

  private clearGrace = (email: string) => {
    const timer = this.graceTimers.get(email);
    if (timer !== undefined) clearTimeout(timer);
    this.graceTimers.delete(email);
  };

  /**
   * The video track every connection is currently carrying.
   *
   * One video per person, whichever it is: the camera, or the screen while that
   * is being shared. A call with four people and one screen share sends one
   * video each, and every other person is on every connection.
   */
  private outgoingVideo = () => {
    if (this.screenStream) return this.screenStream.getVideoTracks()[0] ?? null;
    return this.localStream?.getVideoTracks()[0] ?? null;
  };

  /**
   * Puts one video track on every connection at once.
   *
   * A connection made in a voice call has no video sender at all, so a share
   * that started halfway through one cannot be *replaced* onto it: there is
   * nothing there to replace, and the person opposite would simply never see the
   * screen. So the track is added when there is no sender and swapped when there
   * is, which is the difference between sharing into a call and sharing nothing.
   */
  private pushVideo = async (track: ReturnType<CallMedia["outgoingVideo"]>) => {
    await Promise.all(
      [...this.peers.entries()].map(([email, peer]) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (!sender) {
          // A voice call: the connection is opened for this, and every later
          // frame takes its place like any other. The far side is told, because a
          // track it has not been told about is a track it never shows.
          if (track) {
            peer.addTrack?.(track, this.localStream);
            this.askForRenegotiation(email);
          }
          return Promise.resolve();
        }
        return sender.replaceTrack(track);
      }),
    );
    await Promise.all(
      [...this.peers.values()].map((peer) => this.capVideo(peer.getSenders?.() ?? [])),
    );
  };

  /**
   * The sound of what is being shared, where the picker gave any.
   *
   * It is sent and never played here, because it would come back out of the very
   * speakers being captured, and a tab that is playing a video would then be
   * heard twice by everyone else.
   */
  private pushScreenAudio = async () => {
    const sound = this.screenStream?.getAudioTracks()[0] ?? null;
    for (const peer of this.peers.values()) {
      const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
      if (!sender || !sound) continue;
      if (sender.track?.label === sound.label) continue;
      await sender.replaceTrack(sound);
    }
  };

  setMic = (on: boolean) => {
    this.micOn = on;
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = on;
    // Once the microphone runs through the gain node, the track the call carries
    // is the one that has to fall silent, or the mute would only mute locally.
    for (const track of this.processed?.getAudioTracks() ?? []) track.enabled = on;
    return on;
  };

  setCamera = (on: boolean) => {
    this.cameraOn = on;
    for (const track of this.localStream?.getVideoTracks() ?? []) track.enabled = on;
    return on;
  };

  /**
   * Swaps the microphone or the camera for another one, live.
   *
   * The new track takes the sender's place on the connection, so the call keeps
   * running and neither side has to ring again. The old track is stopped, or
   * the device light would stay on after the switch.
   */
  switchInput = async (kind: "audio" | "video", deviceId: string) => {
    if (!this.media || !this.localStream || !deviceId) return false;
    let stream: MediaStreamLike;
    try {
      stream = await this.media.getUserMedia({
        audio: kind === "audio" ? microphoneConstraints(deviceId) : false,
        video: kind === "video" ? { deviceId: { exact: deviceId } } : false,
      });
    } catch {
      // A device that cannot be opened is not worth breaking the call over.
      return false;
    }

    const wanted = kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!wanted) return false;
    wanted.enabled = kind === "audio" ? this.micOn : this.cameraOn;

    const current = this.localStream;
    const old = kind === "audio" ? current.getAudioTracks() : current.getVideoTracks();
    for (const track of old) {
      // Taken off the stream before it is stopped, so the graph and the video
      // preview are not left looking at a dead track.
      current.removeTrack?.(track);
      track.stop();
    }
    if (current.addTrack) current.addTrack(wanted);
    else if (kind === "audio")
      // A stand in without addTrack: the audio view is the only thing to fake.
      this.localStream = { ...current, getAudioTracks: () => [wanted] } as MediaStreamLike;

    if (kind === "audio") {
      // The graph is reading the microphone that just went away, so it is built
      // again around the new one, and every connection is pointed back at it.
      if (this.gainNode) {
        this.closeAudio();
        await this.ensureGain();
        for (const peer of this.peers.values()) await this.pointAudioAt(peer);
      } else {
        // Without a gain node the raw track is what every connection carries.
        await this.pushAudio(wanted);
      }
    } else {
      // The camera is only the outgoing video while nothing is being shared.
      if (!this.screenStream) await this.pushVideo(wanted);
    }
    this.events.onLocal(this.localStream);
    return true;
  };

  /** Puts one microphone track on every connection at once. */
  private pushAudio = async (track: TrackLike | null) => {
    await Promise.all(
      [...this.peers.values()].map((peer) =>
        peer
          .getSenders()
          .find((item) => item.track?.kind === "audio")
          ?.replaceTrack(track),
      ),
    );
  };

  /**
   * Starts sharing the screen, with the browser's own picker.
   *
   * The picker is the system's: on Windows 11 the shell puts up its own window
   * and screen picker, and Chrome and Edge put up theirs. Asking for a small
   * frame rate is deliberate, because a screen is mostly text and going from 60
   * to 15 frames a second is invisible to a reader of a document while it is the
   * difference between a call that holds together and one that does not.
   *
   * Nothing here throws: a cancelled picker is an ordinary thing for a person to
   * do, and it has to leave the call exactly as it was rather than half sharing.
   */
  startScreen = async () => {
    if (!this.media) return false;
    let picked: MediaStreamLike;
    try {
      picked = await this.media.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
        // A tab can carry its own sound, which is how the people watching hear
        // the video being shown. A whole screen has none, and asking for it is
        // not a failure.
        audio: true,
        // The tab this app is in is never the interesting thing to share, and on
        // a browser that offers it that saves an accidental black square.
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
      } as DisplayMediaStreamOptions);
    } catch {
      // Cancelled at the picker, or refused by a policy: no share, no change.
      return false;
    }

    const [screen] = picked.getVideoTracks();
    if (!screen) {
      // A picker that hands back audio alone is a browser that cannot do this.
      for (const track of picked.getTracks()) track.stop();
      return false;
    }
    this.screenStream = picked;
    // Detail is what a screen needs: without it a browser is free to blur the
    // text, which is the one thing a shared screen is usually for.
    this.setHint(screen, "detail");
    this.setHint(screen, "motion", false);
    this.shareSurface = this.readSurface(screen);

    // The video goes out on every connection, and a tab's sound with it. The
    // sound is never played here: it would come straight back out of the same
    // speakers that are being captured.
    await this.pushVideo(screen);
    await this.pushScreenAudio();

    // The browser puts its own "stop sharing" button on the track, and honouring
    // it is the only way the room hears that the share is over.
    screen.addEventListener?.("ended", () => void this.stopScreen());
    this.events.onScreen(true, this.shareSurface);
    return true;
  };

  /** Goes back to the camera, or to nothing at all if the call never had one. */
  stopScreen = async () => {
    if (!this.screenStream) return false;
    for (const track of this.screenStream.getTracks()) track.stop();
    this.screenStream = null;
    // The camera comes back only if there was one: a voice call goes back to
    // being a voice call, and the other side is told that in the same breath.
    await this.pushVideo(this.outgoingVideo());
    await this.pushScreenAudio();
    this.events.onScreen(false, this.shareSurface);
    this.shareSurface = "monitor";
    return true;
  };

  private shareSurface: ScreenSurface = "monitor";

  /** Tells a track how it is going to be watched, where the browser listens. */
  private setHint = (track: TrackLike, hint: "detail" | "motion", on = true) => {
    const target = track as unknown as { contentHint?: string };
    try {
      if (on) target.contentHint = hint;
      else delete target.contentHint;
    } catch {
      // A browser without the hint sends what it sends; nothing else changes.
    }
  };

  /**
   * What the picker chose, as the browser describes it.
   *
   * Chrome and Edge both report this, and it is the difference between "why is
   * my whole desktop on their phone" and an answer.
   */
  private readSurface = (track: TrackLike): ScreenSurface => {
    const settings = (
      track as unknown as { getSettings?: () => { displaySurface?: string } }
    ).getSettings?.();
    const surface = settings?.displaySurface;
    if (surface === "window" || surface === "browser") return surface;
    return "monitor";
  };

  /** Releases the camera, the microphone and every connection. */
  stop = () => {
    for (const track of this.localStream?.getTracks() ?? []) track.stop();
    for (const track of this.screenStream?.getTracks() ?? []) track.stop();
    this.localStream = null;
    this.screenStream = null;
    this.stopMeter();
    this.closeAudio();
    for (const email of this.peers.keys()) {
      this.clearGrace(email);
      this.cancelRenegotiation(email);
    }
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.links.clear();
    this.roles.clear();
    this.relay = null;
    this.graceTimers.clear();
    this.renegotiations.clear();
    // A device that has not asked for a microphone cannot answer a ringing one,
    // and `stop` is what a call ends with.
    this.ready = false;
    this.view?.removeEventListener("online", this.onBackOnline);
    this.view?.document?.removeEventListener?.("visibilitychange", this.onShown);
    this.events.onLocal(null);
  };

  // ------------------------------------------------------- microphone level

  /**
   * The input volume, 0 to 2, applied to what the call carries.
   *
   * A web page cannot reach the Windows mixer, so this is the gain the browser
   * applies on the way out: the same knob, scoped to this conversation.
   */
  getInputVolume = () => this.inputVolume;

  setInputVolume = async (value: number) => {
    const next = Math.max(0, Math.min(2, Number(value) || 0));
    this.inputVolume = next;
    const node = await this.ensureGain();
    // The graph takes effect on the next audio block, which is what a slider
    // wants: dragging it does not click. The clock is the audio context's, not
    // the wall clock, so the ramp follows the sound device.
    if (node) node.gain.setTargetAtTime(next, this.audioContext?.currentTime ?? 0, 0.01);
    return next;
  };

  /**
   * Puts the microphone through a gain node before the connection sees it, so
   * the slider changes what the other side hears and not only what is measured
   * locally. Returns null where Web Audio is missing, and the slider then says
   * so rather than pretending to work.
   */
  private ensureGain = async () => {
    if (this.gainNode) {
      // A graph that was suspended by the phone coming back to the foreground is
      // resumed before it is used, or the call carries a track of silence.
      await this.resumeAudio();
      return this.gainNode;
    }
    if (!this.audio || !this.localStream) return null;
    try {
      const graph = this.audio();
      this.audioContext = graph.context;
      const source = graph.createMediaStreamSource(this.localStream as unknown as MediaStream);
      const gain = graph.createGain();
      const sink = graph.createMediaStreamDestination();
      gain.gain.value = this.inputVolume;
      source.connect(gain);
      gain.connect(sink);
      this.processed = sink.stream as unknown as MediaStreamLike;
      const processedTrack = this.processed.getAudioTracks()[0];
      if (processedTrack) {
        // A graph built after a mute, or after a device change, comes up with the
        // same choice the user already made.
        processedTrack.enabled = this.micOn;
        // Put the processed track on every connection: a gain that only reached
        // the first person would be a volume knob that works for one of four.
        for (const peer of this.peers.values()) await this.pointAudioAt(peer);
      }
      this.gainNode = gain;
      await this.resumeAudio();
      return gain;
    } catch {
      // A browser that refuses the graph still makes calls; only the knob is
      // lost, so the microphone stays on the raw track.
      this.processed = null;
      return null;
    }
  };

  /**
   * Starts the audio context if it is not already running.
   *
   * iOS and iPadOS start a context suspended unless it is opened inside a tap,
   * and suspend it again the moment the app goes to the background. A suspended
   * graph processes nothing: the track the call carries is silence, the level
   * meter reads zero, and the person opposite is told nothing. So the context is
   * resumed whenever it is found suspended, and again whenever the browser
   * suspends it on its own.
   */
  private resumeAudio = async () => {
    const context = this.audioContext;
    if (!context || context.state !== "suspended") return false;
    try {
      await context.resume();
      return this.audioContext?.state === "running";
    } catch {
      // A browser that will not resume it keeps sending the raw microphone.
      return false;
    }
  };

  /**
   * The call is in the foreground again, so the microphone graph is too.
   *
   * This is the difference between a phone that comes back from a locked screen
   * still being heard and one that is connected and mute.
   */
  private onVisible = () => {
    if (this.view?.document?.visibilityState === "hidden") return;
    void this.resumeAudio();
  };

  /** True when this browser can apply the input volume at all. */
  get canSetInputVolume() {
    return this.audio !== null;
  }

  /**
   * Watches the microphone and reports 0 to 1, sixty times a second.
   *
   * The reading is handed to the caller rather than stored, so a level meter can
   * move a bar without re-rendering the call screen on every frame.
   */
  startMeter = async (onLevel: (level: number) => void) => {
    const graph = this.audio?.();
    if (!graph || !this.localStream) return false;
    try {
      this.audioContext = this.audioContext ?? graph.context;
      this.meter = this.meter ?? graph.createAnalyser();
      this.meter.fftSize = 1024;
      if (!this.meterNode) {
        // Into the analyser only: the call already carries the microphone, and a
        // second path to the speakers would be a howl.
        this.meterNode = graph.createMediaStreamSource(this.localStream as unknown as MediaStream);
        this.meterNode.connect(this.meter);
      }
      const data = new Uint8Array(this.meter.fftSize);
      const read = () => {
        if (!this.meter) return;
        this.meter.getByteTimeDomainData(data);
        // Time domain data sits around the middle at silence, and the spread
        // from that middle is what a person hears.
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128);
        onLevel(Math.min(1, peak));
        this.meterFrame = requestAnimationFrame(read);
      };
      this.stopMeter();
      read();
      return true;
    } catch {
      return false;
    }
  };

  stopMeter = () => {
    if (this.meterFrame !== null) cancelAnimationFrame(this.meterFrame);
    this.meterFrame = null;
    this.meterNode?.disconnect();
    this.meterNode = null;
  };

  /**
   * Records a few seconds of the microphone, so the user can hear themselves
   * before they ring anyone. The recording is of the processed track once the
   * graph is open, which means the playback is what the far end would get.
   */
  recordTest = async () => {
    if (!this.media || !this.recorder) return null;
    let stream: MediaStreamLike;
    try {
      stream = await this.media.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch {
      return null;
    }
    // Nothing is being sent, so the tracks are closed the moment the recording
    // is; the thirty seconds is the backstop for a test that is walked away from.
    const recorder = this.recorder(this.processed ?? stream);
    if (!recorder) {
      for (const track of stream.getTracks()) track.stop();
      return null;
    }
    recorder.start(200);
    const release = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    const guard = setTimeout(release, 30_000);
    return {
      stop: async () => {
        clearTimeout(guard);
        release();
        recorder.stop();
        return recorder.result;
      },
    };
  };

  private closeAudio = () => {
    this.gainNode = null;
    this.meter = null;
    this.meterNode = null;
    this.processed = null;
    const context = this.audioContext;
    this.audioContext = null;
    // Left open, an audio context keeps the sound device awake after the call.
    void context?.close().catch(() => undefined);
  };
}
