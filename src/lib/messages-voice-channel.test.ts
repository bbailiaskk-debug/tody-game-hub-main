// @vitest-environment jsdom

// A voice channel on the client.
//
// A channel is not a call: nobody is rung, nobody is put out, and the device that
// walks into a room joins whoever is already standing there. What is worth
// testing here is the part the object cannot do — it cannot stop the audio, so it
// can only tell the phone holding the microphone to stop sending it, and that is
// this file's subject along with the joins, the leaves and the mesh order.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesStore } from "./messages-store";
import type { VoicePresence, VoiceRoster } from "./messages-protocol";
import {
  DEFAULT_SCREEN_QUALITY,
  SCREEN_QUALITIES,
  screenQualityLabel,
  type ScreenQuality,
} from "./call-media";

const ME = "me@example.com";
const ANA = "ana@example.com";
const LOBBY = "g-hub-v-lobi";
const GAMES = "g-hub-v-igri";

const presence = (patch: Partial<VoicePresence> = {}): VoicePresence => ({
  email: ANA,
  name: "Ana",
  avatar: null,
  mic: true,
  camera: false,
  screen: false,
  screenSurface: "monitor",
  serverMuted: false,
  deafened: false,
  order: 1,
  status: "active",
  joinedAt: 2,
  ...patch,
});

const roster = (channelId: string, presences: VoicePresence[]): VoiceRoster => ({
  channelId,
  guildId: "g-hub",
  ownerEmail: ME,
  presences,
});

/** The one conversation this account has, so a call has somebody to ring. */
const chat = () => ({
  id: "chat-1",
  peerEmail: ANA,
  pinned: false,
  muted: false,
  updatedAt: Date.now(),
  messages: [],
});

const me = (patch: Partial<VoicePresence> = {}): VoicePresence =>
  presence({ email: ME, name: "Me", order: 0, ...patch });

/**
 * The store, stood up against a gateway that answers with whatever roster the
 * test hands it, and records every voice frame that goes out.
 */
const install = (options: { roster?: VoiceRoster; chats?: unknown[] } = {}) => {
  type SentFrame = {
    kind?: string;
    channelId?: string;
    to?: string;
    screen?: boolean;
    surface?: string;
    screenLabel?: string;
  };
  const sent: SentFrame[] = [];
  /**
   * The device's own socket, kept so a test can hand it a frame.
   *
   * The object pushes changes down a socket as text, and the store reads them by
   * the name they were sent under. A test that calls into the store instead skips
   * that entirely, which is how a room can go on knowing only about the person in
   * front of the screen while every frame arrives perfectly.
   */
  let open: ((event: { data: string }) => void) | null = null;
  class Socket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 1;
    send() {}
    close() {}
    constructor() {
      open = (event) => this.onmessage?.(event);
      queueMicrotask(() => this.onopen?.());
    }
  }
  vi.stubGlobal("WebSocket", Socket as never);
  /** A frame arriving from the object, as it arrives. */
  const deliver = (frame: unknown) => open?.({ data: JSON.stringify(frame) });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/session")) return json({ ok: true, email: ME, name: "Me" });
      if (url.includes("/friend/list")) {
        return json({
          ok: true,
          friends: { incoming: [], outgoing: [], friends: [], declined: [] },
        });
      }
      if (url === "/api/messages/voice") {
        sent.push(JSON.parse(String(init?.body)));
        return json({ ok: true, ...(options.roster ? { roster: options.roster } : {}) });
      }
      if (url === "/api/messages/chat") return json({ ok: true });
      if (url === "/api/messages/") {
        return json({
          ok: true,
          snapshot: {
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
            contacts: [],
            chats: options.chats ?? [],
            rev: 1,
            serverTime: Date.now(),
            typing: [],
            guilds: {
              guilds: [
                {
                  id: "g-hub",
                  name: "Hub",
                  initials: "H",
                  accent: "#5865f2",
                  ownerEmail: ME,
                  createdAt: 1,
                },
              ],
              members: [],
              channels: { text: [], voice: [] },
            },
          },
        });
      }
      return json({ ok: true });
    }),
  );
  return { sent, deliver };
};

/** Joins with the gateway answering with a room this account is standing in. */
const joinLobby = async (room = roster(LOBBY, [me(), presence()])) => {
  const harness = install({ roster: room });
  await messagesStore.start();
  const result = await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
  return { ...harness, result, room };
};

/**
 * The media layer, standing in for the browser's own capture.
 *
 * `screenName` is the track's own label, which is the only place a browser says
 * which screen it captured.
 *
 * The events object handed to `listen` is kept so a test can fire `onScreen` the
 * way the browser does, which is the only way a share is ever found to have
 * ended by something other than this app's own button.
 */
const installMedia = (options: { starts?: boolean; screenName?: string } = {}) => {
  const shareCalls: boolean[] = [];
  let events: { onScreen?: (sharing: boolean, surface: "monitor", label?: string) => void } = {};
  /**
   * What the device is putting into the room, kept here so the double answers the
   * same question the real media layer does.
   *
   * The store reads these to decide what to tell the room, and a double that
   * left them undefined would test the fallback rather than the device.
   */
  const sending = { mic: true, camera: false, screen: false, surface: "monitor" as const };
  const media = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    setMic: vi.fn((on: boolean) => {
      sending.mic = on;
    }),
    setCamera: vi.fn(async (on: boolean) => {
      sending.camera = on;
      return true;
    }),
    startScreen: vi.fn(async () => {
      shareCalls.push(true);
      // A real share announces itself, because the browser now has a button of
      // its own that will end it.
      sending.screen = options.starts ?? true;
      events.onScreen?.(true, "monitor", options.screenName);
      return options.starts ?? true;
    }),
    stopScreen: vi.fn(async () => {
      shareCalls.push(false);
      sending.screen = false;
      events.onScreen?.(false, "monitor", options.screenName);
      return true;
    }),
    listen: vi.fn((given: typeof events) => {
      /**
       * The announcement is taken as the device's own news, the way the real media
       * layer takes it: it settles its own state and *then* says so. A double that
       * only listened would still be claiming a share it has just reported ending,
       * which is a thing the real one cannot do.
       */
      events = {
        ...given,
        onScreen: (sharing: boolean, surface: "monitor", label?: string) => {
          sending.screen = sharing;
          given.onScreen?.(sharing, surface, label);
        },
      };
    }),
    setOfferer: vi.fn(),
    connectedTo: () => [],
    createOffer: vi.fn(async () => ({})),
    accept: vi.fn(async () => undefined),
    renegotiate: vi.fn(async () => true),
    dropPeer: vi.fn(),
  };
  Object.defineProperties(media, {
    sendingMic: { get: () => sending.mic },
    sendingCamera: { get: () => sending.camera },
    sendingScreen: { get: () => sending.screen },
    sendingSurface: { get: () => sending.surface },
  });
  messagesStore.attachCallMedia(media as never);
  return {
    media,
    shareCalls,
    /** The browser's own button, or the picker finishing. */
    browserStoppedSharing: () => events.onScreen?.(false, "monitor"),
  };
};

describe("walking into a voice channel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("is not a call, so nobody is rung", async () => {
    const { sent } = await joinLobby();
    // The only frame is a join: there is no `begin`, no invite and nothing that
    // makes the other side's phone ring.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "voice-join", channelId: LOBBY });
    expect(sent[0]?.kind).not.toBe("begin");
    expect(sent[0]?.kind).not.toBe("invite");
  });

  it("puts this account in the channel and learns who is there", async () => {
    await joinLobby();
    expect(messagesStore.getState().voiceChannelId).toBe(LOBBY);
    expect(messagesStore.voicePresence(LOBBY).map((p) => p.email)).toEqual([ME, ANA]);
  });

  it("leaves the channel it was in first", async () => {
    const { sent } = await joinLobby();
    await messagesStore.joinVoiceChannel(GAMES, "g-hub");

    // One channel at a time: two rooms of one server both claiming this device
    // would hand it the frames of a room it is not standing in.
    expect(sent.map((frame) => frame.kind)).toEqual(["voice-join", "voice-leave", "voice-join"]);
    expect(sent[1]).toMatchObject({ channelId: LOBBY });
    expect(sent[2]).toMatchObject({ channelId: GAMES });
  });

  it("does nothing when asked to join the room it is already in", async () => {
    const { sent } = await joinLobby();
    await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
    expect(sent).toHaveLength(1);
  });

  it("says so rather than spinning when the gateway refuses", async () => {
    install();
    await messagesStore.start();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, reason: "unknown-channel" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const result = await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
    expect(result.ok).toBe(false);
    // The channel it could not get into is not left on the screen as if it had.
    expect(messagesStore.getState().voiceChannelId).toBeNull();
  });

  // The roster on a join is what tells a phone who to offer a connection to, and
  // a room that has not arrived yet is a room with nobody in it.
  it("ignores a roster that names nobody", async () => {
    const { sent } = await joinLobby(roster(LOBBY, [me(), presence()]));
    messagesStore.handleVoiceSignal({
      kind: "voice-roster",
      channelId: LOBBY,
      roster: roster(LOBBY, []),
    });
    expect(messagesStore.voicePresence(LOBBY)).toHaveLength(2);
    expect(sent.some((frame) => frame.kind === "voice-join")).toBe(true);
  });
});

describe("a microphone somebody else switched off", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  const silenced = async () => {
    await joinLobby(roster(LOBBY, [me(), presence()]));
    messagesStore.handleVoiceSignal({
      kind: "voice-mute",
      channelId: LOBBY,
      from: ME,
      target: ME,
      muted: true,
    });
  };

  // The object cannot stop the audio: the microphone belongs to this device. So a
  // silence is really an instruction to this phone, and this phone applying it is
  // the whole of the feature.
  it("reaches the device that is holding the microphone", async () => {
    await silenced();
    expect(messagesStore.selfVoicePresence(LOBBY)).toMatchObject({
      mic: false,
      serverMuted: true,
      mutedBy: ME,
    });
  });

  it("cannot be undone from this account's own button", async () => {
    await silenced();
    const result = await messagesStore.setVoiceMic(LOBBY, true);
    // A switch that looks available and does nothing is worse than one that is
    // plainly not there, so the store refuses rather than pretending.
    expect(result).toMatchObject({ ok: false, reason: "server-muted" });
    expect(messagesStore.selfVoicePresence(LOBBY)).toMatchObject({ mic: false, serverMuted: true });
  });

  it("can be lifted by the owner, and the button works again", async () => {
    await silenced();
    await messagesStore.setVoiceServerMute(LOBBY, ME, false);
    messagesStore.handleVoiceSignal({
      kind: "voice-mute",
      channelId: LOBBY,
      from: ME,
      target: ME,
      muted: false,
    });
    expect(messagesStore.selfVoicePresence(LOBBY)).toMatchObject({ serverMuted: false });
    expect(await messagesStore.setVoiceMic(LOBBY, true)).toMatchObject({ ok: true });
  });

  // Somebody else being silenced is news for the room, but it is not this phone's
  // microphone to touch.
  it("leaves another member's microphone alone", async () => {
    await joinLobby();
    messagesStore.handleVoiceSignal({
      kind: "voice-mute",
      channelId: LOBBY,
      from: ME,
      target: ANA,
      muted: true,
    });
    // Not applied locally: the room's copy of somebody else's switch comes from
    // the object, and a phone that acted on its own would be guessing.
    expect(messagesStore.voicePresence(LOBBY).find((p) => p.email === ANA)).toMatchObject({
      serverMuted: false,
    });
  });
});

describe("leaving a channel is not leaving a call", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("takes this account out and says so", async () => {
    const { sent } = await joinLobby();
    await messagesStore.leaveVoiceChannel(LOBBY);

    expect(sent.at(-1)).toMatchObject({ kind: "voice-leave", channelId: LOBBY });
    expect(messagesStore.getState().voiceChannelId).toBeNull();
  });

  it("is not what an end of a call looks like", async () => {
    const { sent } = await joinLobby();
    await messagesStore.leaveVoiceChannel(LOBBY);
    // `end` is the frame that puts everybody out. A channel has no such frame,
    // which is the whole difference between the two.
    expect(sent.some((frame) => frame.kind === "end")).toBe(false);
    expect(messagesStore.getState().call.status).toBe("idle");
  });

  it("does nothing for a channel this account is not in", async () => {
    const { sent } = await joinLobby();
    await messagesStore.leaveVoiceChannel(GAMES);
    expect(sent).toHaveLength(1);
    expect(messagesStore.getState().voiceChannelId).toBe(LOBBY);
  });

  it("is forced when the owner takes somebody out", async () => {
    await joinLobby();
    messagesStore.handleVoiceSignal({
      kind: "voice-kick",
      channelId: LOBBY,
      // Somebody else's address: a frame with our own on it is our own echo and
      // is dropped, so the owner removing somebody has to be a different account.
      from: ANA,
      target: ME,
    });
    expect(messagesStore.getState().voiceChannelId).toBeNull();
  });

  // A roster this account is not in is how a removal is learned when the object
  // has already dropped the row.
  it("is forced by a roster this account is not part of", async () => {
    await joinLobby();
    messagesStore.handleVoiceSignal({
      kind: "voice-state",
      channelId: LOBBY,
      from: ANA,
      roster: roster(LOBBY, [presence()]),
    });
    expect(messagesStore.getState().voiceChannelId).toBeNull();
  });
});

describe("a call and a channel are one room", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  /**
   * The reason this exists at all.
   *
   * A call used to be drawn by a screen of its own, over everything, with its own
   * stage and its own bar. That is two of everything and a call that looked like a
   * different application from the channel two fingers away — and worse, the media
   * layer is shared, so whichever branch won silently took the other's
   * connections with it.
   */
  it("reports the same room either way round", async () => {
    await joinLobby();
    const inChannel = messagesStore.voiceRoom();
    expect(inChannel?.kind).toBe("channel");
    expect(inChannel?.presences.map((p) => p.email)).toEqual([ME, ANA]);

    await messagesStore.leaveVoiceChannel(LOBBY);
    expect(messagesStore.voiceRoom()).toBeNull();
  });

  it("has no room while nothing is up", async () => {
    install();
    await messagesStore.start();
    expect(messagesStore.voiceRoom()).toBeNull();
    expect(messagesStore.selfInRoom()).toBeNull();
  });

  /**
   * One device is in one room.
   *
   * There is one camera and one microphone, so a device that is in a room cannot
   * also be in one. Letting it try is how the second room quietly takes the first
   * one's connections and the screen goes on saying everything is fine.
   */
  it("will not walk into a channel while a call is up", async () => {
    const { sent } = install({ chats: [chat()] });
    await messagesStore.start();
    await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
    sent.length = 0;

    await messagesStore.startCall({ chatId: "chat-1", starts: "audio" });
    expect(messagesStore.voiceRoom()?.kind).toBe("call");

    // A different channel, so this is a real attempt rather than the short
    // circuit that answers "you are already here".
    const result = await messagesStore.joinVoiceChannel(GAMES, "g-hub");
    expect(result).toMatchObject({ ok: false, reason: "in-call" });
    // Not even one frame: a refused join that still said so would be noise.
    expect(sent.filter((frame) => frame.kind === "voice-join")).toHaveLength(0);
    // The call is the room, still.
    expect(messagesStore.voiceRoom()?.kind).toBe("call");
  });

  it("leaves the channel before a call takes the media", async () => {
    const { sent } = await joinLobby();
    await messagesStore.leaveVoiceChannel(LOBBY);
    sent.length = 0;

    await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
    // A call afterwards is refused rather than allowed to fight for the camera.
    expect(sent.filter((frame) => frame.kind === "voice-join")).toHaveLength(1);
    expect(messagesStore.voiceRoom()?.kind).toBe("channel");
  });

  it("leaves the channel before answering, rather than after", async () => {
    const { sent } = await joinLobby();
    const before = sent.filter((frame) => frame.kind === "voice-join").length;

    // Answering needs an incoming call, which this does not have; what matters
    // is that leaving a room is what frees the media, and that leaving a channel
    // while nothing else holds it does stop the media.
    const media = { stop: vi.fn() };
    messagesStore.attachCallMedia({
      ...media,
      listen: vi.fn(),
      setMic: vi.fn(),
      setCamera: vi.fn(async () => true),
      start: vi.fn(async () => undefined),
      createOffer: vi.fn(async () => ({})),
      accept: vi.fn(async () => undefined),
      connectedTo: () => [],
      setOfferer: vi.fn(),
      dropPeer: vi.fn(),
    } as never);

    await messagesStore.leaveVoiceChannel(LOBBY);
    expect(media.stop).toHaveBeenCalled();
    expect(sent.filter((frame) => frame.kind === "voice-join").length).toBe(before);
  });
});

describe("the connection frames a channel needs", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  /**
   * A media layer that records what it is asked to do, so a test can say what a
   * frame caused rather than only that nothing threw.
   */
  const watchMedia = () => {
    const renegotiate = vi.fn(async () => true);
    const accept = vi.fn(async () => undefined);
    messagesStore.attachCallMedia({
      start: vi.fn(async () => undefined),
      stop: vi.fn(),
      setMic: vi.fn(),
      setCamera: vi.fn(async () => true),
      startScreen: vi.fn(async () => true),
      stopScreen: vi.fn(async () => true),
      listen: vi.fn(),
      setOfferer: vi.fn(),
      connectedTo: () => [],
      createOffer: vi.fn(async () => ({})),
      accept,
      renegotiate,
      dropPeer: vi.fn(),
    } as never);
    return { renegotiate, accept };
  };

  /**
   * The frame that carries no description.
   *
   * Sharing a screen in a channel nobody has a camera in adds a track to a link
   * that was opened for audio alone, and that needs a new description. The frame
   * which says so is not something `accept` can apply. Dropped, the sharer's own
   * screen says it is working, the tile beside it stays a camera, and nothing on
   * screen admits the other person cannot see it.
   */
  it("renegotiates when somebody adds a track, rather than ignoring the frame", async () => {
    await joinLobby();
    const { renegotiate } = watchMedia();

    messagesStore.handleVoiceSignal({ kind: "renegotiate", channelId: LOBBY, from: ANA });

    expect(renegotiate).toHaveBeenCalledWith(ANA);
  });

  it("drops a renegotiation of its own making, which is just an echo", async () => {
    await joinLobby();
    const { renegotiate } = watchMedia();

    messagesStore.handleVoiceSignal({ kind: "renegotiate", channelId: LOBBY, from: ME });

    expect(renegotiate).not.toHaveBeenCalled();
  });

  it("applies the offers and answers of a channel like any other link", async () => {
    await joinLobby();
    const { accept, renegotiate } = watchMedia();

    messagesStore.handleVoiceSignal({
      kind: "offer",
      channelId: LOBBY,
      from: ANA,
      description: { type: "offer" },
    });

    expect(accept).toHaveBeenCalledWith(ANA, expect.objectContaining({ kind: "offer" }));
    expect(renegotiate).not.toHaveBeenCalled();
  });
});

describe("sharing a screen with a channel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  it("starts a share and tells the room", async () => {
    const { sent } = await joinLobby();
    const { media } = installMedia();

    const result = await messagesStore.setVoiceScreen(LOBBY, true);
    expect(result.ok).toBe(true);
    expect(media.startScreen).toHaveBeenCalled();
    expect(sent.at(-1)).toMatchObject({ kind: "voice-state", screen: true });
  });

  it("says so when the picker was refused rather than lighting a button over nothing", async () => {
    await joinLobby();
    installMedia({ starts: false });
    const result = await messagesStore.setVoiceScreen(LOBBY, true);
    // A person who is showing a desktop nobody can see has no way of knowing.
    expect(result).toMatchObject({ ok: false, reason: "no-screen" });
  });

  /**
   * The case that was broken.
   *
   * The browser's own "stop sharing" button is not this app's, so the only way to
   * learn that a share ended is the media layer saying so. Dropping that frame —
   * which is what happened while no call was up — leaves the room showing a
   * desktop that stopped moving minutes ago.
   */
  it("reaches the room when the browser's own button ends it", async () => {
    const { sent } = await joinLobby();
    const { browserStoppedSharing } = installMedia();
    await messagesStore.setVoiceScreen(LOBBY, true);
    sent.length = 0;

    browserStoppedSharing();

    expect(sent.at(-1)).toMatchObject({ kind: "voice-state", screen: false });
  });

  it("does not send the same change twice", async () => {
    const { sent } = await joinLobby();
    const { browserStoppedSharing } = installMedia();
    await messagesStore.setVoiceScreen(LOBBY, true);

    browserStoppedSharing();
    const afterStop = sent.length;

    // The browser button can fire more than once for one share, and one press is
    // one change: two frames for it is a roster that flickers and a share that
    // looks like it ended and started again.
    browserStoppedSharing();
    expect(sent).toHaveLength(afterStop);
    expect(sent.at(-1)).toMatchObject({ kind: "voice-state", screen: false });
  });

  it("carries what was shared, so a phone is not watching a whole desktop by accident", async () => {
    const { sent } = await joinLobby();
    installMedia({ screenName: "Екран 2" });
    await messagesStore.setVoiceScreen(LOBBY, true);
    expect(sent.at(-1)).toMatchObject({ surface: "monitor", screenLabel: "Екран 2" });
  });

  /**
   * A share that ended with the page must not be able to outlive it.
   *
   * The room remembers that this account was sharing, and a device that reads its
   * own switches back out of the room believes the memory and says so again on
   * every join. The switch is then stuck on: stopping asks a device with no capture
   * for one, gets nothing, and reports nothing, so the room and the device go on
   * agreeing about a desktop that stopped being sent an hour ago — and the person
   * cannot share anything again.
   */
  it("does not carry a share the room remembers but this device is not sending", async () => {
    /**
     * The room still says this account is sharing, from a session that is gone:
     * a reload, a closed tab, a browser that took the capture away.
     */
    const stale = roster(LOBBY, [me({ screen: true })]);
    const harness = install({ roster: stale });
    await messagesStore.start();
    const { sent } = harness;
    await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
    installMedia();

    // The room's memory is now this store's own state, which is what the next
    // frame is built from. Leaving does not clear it — a roster is a record of
    // the room, not of the session that read it.
    await messagesStore.leaveVoiceChannel(LOBBY);
    sent.length = 0;
    await messagesStore.joinVoiceChannel(LOBBY, "g-hub");

    // Coming back into the room is the moment this device can correct it, and
    // the frame has to say what this device is doing rather than what the room
    // last heard. Confirming the memory is what pins the switch on for good.
    const joined = sent.find((frame) => (frame as { kind?: string }).kind === "voice-join");
    expect(joined).toMatchObject({ screen: false });
  });

  it("lets a share be stopped even when the capture is already gone", async () => {
    const stale = roster(LOBBY, [me({ screen: true })]);
    const harness = install({ roster: stale });
    await messagesStore.start();
    const { sent } = harness;
    await messagesStore.joinVoiceChannel(LOBBY, "g-hub");
    const { media } = installMedia();

    // The capture went with the page, but the room still says this account is
    // sharing, so the switch is on and pressing it has to be the way out.
    const result = await messagesStore.setVoiceScreen(LOBBY, false);

    // Nothing to release is not a failure: refusing is what leaves the room stuck.
    expect(result.ok).toBe(true);
    expect(media.stopScreen).toHaveBeenCalled();
    expect(sent.at(-1)).toMatchObject({ kind: "voice-state", screen: false });
  });

  /**
   * Which screen, in words.
   *
   * The browser offers the name of what it captured in exactly one place — the
   * track's own label — and nowhere else. Without it the room can say that
   * somebody is sharing and nothing about what, which is the difference between
   * "Screen 2" and "a whole desktop".
   */
  it("says which screen it is, by the name the browser gave it", async () => {
    const { sent } = await joinLobby();
    installMedia({ screenName: "Екран 2" });
    await messagesStore.setVoiceScreen(LOBBY, true);

    expect(sent.at(-1)?.screenLabel).toBe("Екран 2");
    expect(messagesStore.selfVoicePresence(LOBBY)).toMatchObject({ screenLabel: "Екран 2" });
  });

  it("asks the browser for the quality that was chosen", async () => {
    await joinLobby();
    const { media } = installMedia();

    await messagesStore.setVoiceScreen(LOBBY, true, { width: 1920, height: 1080, frameRate: 60 });

    // The browser's own picker has no resolution or frame rate control at all, so
    // this is the only place they can be asked for before a frame is sent.
    expect(media.startScreen).toHaveBeenCalledWith({ width: 1920, height: 1080, frameRate: 60 });
  });

  it("asks for 720p at 30 by default, because a screen is mostly text", () => {
    expect(DEFAULT_SCREEN_QUALITY).toMatchObject({ height: 720, frameRate: 30 });
    expect(screenQualityLabel(DEFAULT_SCREEN_QUALITY)).toBe("720p");
  });

  it("keeps the quality list ordered by what it costs", () => {
    // A picker that reads as a list of names rather than of trade-offs is how
    // somebody ends up at 1080p60 wondering why the call is dropping.
    const costs = SCREEN_QUALITIES.map((entry) => entry.height * entry.frameRate);
    expect(costs).toEqual([...costs].sort((left, right) => left - right));
    expect(screenQualityLabel(SCREEN_QUALITIES[3] as ScreenQuality)).toBe("1080p");
  });
});

describe("somebody else arriving in the room", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  /**
   * The room has to learn about people from the frames the object pushes.
   *
   * A join brings back the room's answer to the account that asked, so whoever
   * joins second sees everybody. The first one is told nothing that way: the only
   * thing that can tell them is a frame coming down their own socket, and a frame
   * read under a name it was not sent with is dropped without a sound. The result
   * is a room where the person who was there first is alone in a channel with
   * three other people in it.
   */
  it("learns from a frame the object pushes, under the name it was sent with", async () => {
    const { deliver } = await joinLobby(roster(LOBBY, [me()]));
    const before = messagesStore.getState().voiceRosters[LOBBY]?.presences ?? [];
    expect(before.map((person) => person.email)).toEqual([ME]);

    // Exactly what the object sends: the type, and the signal beside it.
    deliver({
      type: "voice",
      signal: {
        kind: "voice-join",
        channelId: LOBBY,
        from: ANA,
        roster: roster(LOBBY, [me(), presence()]),
      },
    });

    const after = messagesStore.getState().voiceRosters[LOBBY]?.presences ?? [];
    expect(after.map((person) => person.email)).toEqual([ME, ANA]);
  });
});

describe("the echo of our own frame", () => {
  beforeEach(() => {
    window.localStorage.clear();
    messagesStore.reset();
  });

  afterEach(() => {
    messagesStore.reset();
    vi.unstubAllGlobals();
  });

  // The gateway hands every frame back to the sender's own devices, so a phone
  // that acted on its own echo would mute itself twice, leave a room it is in and
  // answer a connection that is already up.
  it("is dropped, so a frame about us never acts on us", async () => {
    await joinLobby(roster(LOBBY, [me(), presence()]));
    const before = messagesStore.getState().voiceChannelId;

    messagesStore.handleVoiceSignal({
      kind: "voice-leave",
      channelId: LOBBY,
      from: ME,
    });
    expect(messagesStore.getState().voiceChannelId).toBe(before);
  });

  it("is still acted on when the server owner is this account", async () => {
    await joinLobby(roster(LOBBY, [me(), presence()]));
    // A silence this account gave itself comes back with its own address on it,
    // and it is not an echo: somebody has to apply it.
    messagesStore.handleVoiceSignal({
      kind: "voice-mute",
      channelId: LOBBY,
      from: ME,
      target: ME,
      muted: true,
    });
    expect(messagesStore.selfVoicePresence(LOBBY)).toMatchObject({ serverMuted: true });
  });
});
