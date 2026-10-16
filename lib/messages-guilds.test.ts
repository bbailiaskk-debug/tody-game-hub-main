import { describe, expect, it } from "vitest";

import {
  channelBelongsToGuild,
  channelIdFor,
  guildView,
  liveVoicePresences,
  ownsGuild,
  voiceChannelBusy,
  voiceChannelOf,
  type Guild,
  type GuildMember,
  type GuildSnapshot,
  type VoiceRoster,
} from "./messages-protocol";

const guild = (patch: Partial<Guild> = {}): Guild => ({
  id: "g-hub",
  name: "Todor Khristov Gaming",
  initials: "TK",
  accent: "#5865f2",
  ownerEmail: "todor@example.com",
  createdAt: 1,
  ...patch,
});

const member = (patch: Partial<GuildMember> = {}): GuildMember => ({
  email: "todor@example.com",
  guildId: "g-hub",
  name: "Todor",
  avatar: null,
  role: "owner",
  joinedAt: 1,
  ...patch,
});

const snapshot = (patch: Partial<GuildSnapshot> = {}): GuildSnapshot => ({
  guilds: [guild()],
  members: [member(), member({ email: "ana@example.com", role: "member", joinedAt: 2 })],
  channels: {
    text: [
      {
        id: "g-hub-t-obsch",
        guildId: "g-hub",
        kind: "text" as const,
        name: "общ",
        topic: "",
        order: 0,
      },
      {
        id: "g-hub-t-musika",
        guildId: "g-hub",
        kind: "text" as const,
        name: "музика",
        topic: "",
        order: 1,
      },
    ],
    voice: [
      { id: "g-hub-v-lobi", guildId: "g-hub", kind: "voice" as const, name: "Лоби", order: 0 },
      { id: "g-hub-v-igri", guildId: "g-hub", kind: "voice" as const, name: "Игри", order: 1 },
    ],
  },
  ...patch,
});

describe("channel ids carry the server they belong to", () => {
  it("namespaces an id by the guild and the kind", () => {
    expect(channelIdFor("g-hub", "v", "Лоби")).toBe("g-hub-v-лоби");
    expect(channelIdFor("g-hub", "t", "общ")).toBe("g-hub-t-общ");
  });

  it("falls back to a name when the typed one has nothing left in it", () => {
    // Emoji and punctuation are the whole of what somebody typed once, and a
    // channel with no id is a channel that cannot be joined.
    expect(channelIdFor("g-hub", "v", "!!! 🎉")).toBe("g-hub-v-channel");
    expect(channelIdFor("g-hub", "t", "   ")).toBe("g-hub-t-channel");
  });

  it("keeps a text and a voice channel apart when they share a name", () => {
    expect(channelIdFor("g-hub", "t", "Лоби")).not.toBe(channelIdFor("g-hub", "v", "Лоби"));
  });

  // A channel row is mirrored into every member's object, so a row written for
  // one server can be read by somebody in another. This is the check that stops
  // it being used there.
  it("refuses a channel id from another server", () => {
    expect(channelBelongsToGuild("g-hub-v-lobi", "g-hub")).toBe(true);
    expect(channelBelongsToGuild("g-druga-v-lobi", "g-hub")).toBe(false);
    expect(channelBelongsToGuild("g-hub-extra-v-lobi", "g-hub")).toBe(true);
    expect(channelBelongsToGuild("ghub-v-lobi", "g-hub")).toBe(false);
  });
});

describe("one account may be in more than one server", () => {
  it("gives each view only its own people and channels", () => {
    const view = guildView(guild(), snapshot());

    expect(view.members.map((entry) => entry.email)).toEqual([
      "todor@example.com",
      "ana@example.com",
    ]);
    expect(view.textChannels.map((channel) => channel.name)).toEqual(["общ", "музика"]);
    expect(view.voiceChannels.map((channel) => channel.name)).toEqual(["Лоби", "Игри"]);
  });

  it("leaves another server's rows out", () => {
    const other = snapshot({
      members: [
        member(),
        member({ email: "boris@example.com", guildId: "g-druga", role: "member", joinedAt: 3 }),
      ],
      channels: {
        text: [
          {
            id: "g-hub-t-obsch",
            guildId: "g-hub",
            kind: "text" as const,
            name: "общ",
            topic: "",
            order: 0,
          },
          {
            id: "g-druga-t-obsch",
            guildId: "g-druga",
            kind: "text" as const,
            name: "общ",
            topic: "",
            order: 0,
          },
        ],
        voice: [
          { id: "g-hub-v-lobi", guildId: "g-hub", kind: "voice" as const, name: "Лоби", order: 0 },
          {
            id: "g-druga-v-lobi",
            guildId: "g-druga",
            kind: "voice" as const,
            name: "Лоби",
            order: 0,
          },
        ],
      },
    });

    const view = guildView(guild(), other);
    expect(view.members.map((entry) => entry.email)).toEqual(["todor@example.com"]);
    expect(view.textChannels.map((channel) => channel.id)).toEqual(["g-hub-t-obsch"]);
    expect(view.voiceChannels.map((channel) => channel.id)).toEqual(["g-hub-v-lobi"]);
  });
});

describe("only the owner may run a server", () => {
  // This is checked on the object, not in the view: a button hidden in the
  // markup is a button anybody can still send a request for.
  it("compares addresses the way the object stores them", () => {
    expect(ownsGuild(guild(), "todor@example.com")).toBe(true);
    expect(ownsGuild(guild(), "ToDor@Example.com")).toBe(true);
    expect(ownsGuild(guild(), " to dor@example.com ")).toBe(false);
  });

  it("owns nothing when the server is not there", () => {
    expect(ownsGuild(undefined, "todor@example.com")).toBe(false);
  });
});

const presence = (patch: Partial<VoiceRoster["presences"][number]>) => ({
  email: "todor@example.com",
  name: "Todor",
  avatar: null,
  mic: true,
  camera: false,
  screen: false,
  screenSurface: "monitor" as const,
  serverMuted: false,
  deafened: false,
  order: 0,
  status: "active" as const,
  joinedAt: 1,
  ...patch,
});

const roster = (presences: VoiceRoster["presences"]): VoiceRoster => ({
  channelId: "g-hub-v-lobi",
  guildId: "g-hub",
  ownerEmail: "todor@example.com",
  presences,
});

describe("a voice channel is busy only while somebody is in it", () => {
  it("is quiet with nobody there", () => {
    expect(voiceChannelBusy("g-hub-v-lobi", roster([]))).toBe(false);
    expect(voiceChannelBusy("g-hub-v-lobi", undefined)).toBe(false);
  });

  it("is busy with somebody who is there", () => {
    expect(voiceChannelBusy("g-hub-v-lobi", roster([presence({})]))).toBe(true);
  });

  // Somebody who left keeps their row for a moment so a phone can fade the tile.
  // Counting them would leave a channel lit up for an empty room.
  it("is quiet again once the last person has left", () => {
    expect(voiceChannelBusy("g-hub-v-lobi", roster([presence({ status: "left" })]))).toBe(false);
  });

  // A roster for one channel says nothing about the others in the same server.
  it("is not busy in a channel nobody is in", () => {
    const lobby = roster([presence({})]);
    expect(voiceChannelBusy("g-hub-v-igri", lobby)).toBe(false);
  });
});

describe("the mesh is built from the order people arrived in", () => {
  it("sorts by the order the object gave them", () => {
    const live = liveVoicePresences(
      roster([
        presence({ email: "c@example.com", order: 2 }),
        presence({ email: "a@example.com", order: 0 }),
        presence({ email: "b@example.com", order: 1 }),
      ]),
    );
    expect(live.map((entry) => entry.email)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  // Two phones offering a connection at once is the one thing that reliably
  // breaks a call, so both sides have to derive the same order from the roster.
  // Each object builds its own roster out of its own frames, so the same two
  // people can arrive in a different array order on two phones.
  it("agrees on the order when two people join on the same tick", () => {
    const first = roster([
      presence({ email: "b@example.com", order: 1, joinedAt: 5 }),
      presence({ email: "a@example.com", order: 1, joinedAt: 5 }),
    ]);
    const second = roster([
      presence({ email: "a@example.com", order: 1, joinedAt: 5 }),
      presence({ email: "b@example.com", order: 1, joinedAt: 5 }),
    ]);

    expect(liveVoicePresences(first).map((entry) => entry.email)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(liveVoicePresences(second).map((entry) => entry.email)).toEqual(
      liveVoicePresences(first).map((entry) => entry.email),
    );
  });

  it("drops the people who left", () => {
    const live = liveVoicePresences(
      roster([
        presence({ order: 0 }),
        presence({ email: "b@example.com", order: 1, status: "left" }),
      ]),
    );
    expect(live.map((entry) => entry.email)).toEqual(["todor@example.com"]);
  });
});

describe("a member sits in one voice channel at a time", () => {
  const channels = ["g-hub-v-lobi", "g-hub-v-igri"];

  it("finds the channel the member is actually in", () => {
    const lobby = roster([presence({}), presence({ email: "ana@example.com", order: 1 })]);
    expect(voiceChannelOf(channels, lobby, "ana@example.com")).toBe("g-hub-v-lobi");
  });

  it("says nothing when the member is not in any", () => {
    const lobby = roster([presence({})]);
    expect(voiceChannelOf(channels, lobby, "boris@example.com")).toBeNull();
  });

  it("says nothing when there is no roster at all", () => {
    expect(voiceChannelOf(channels, undefined, "todor@example.com")).toBeNull();
  });

  // A roster naming a channel this account has since left behind, from a server
  // it is no longer in, must not make the panel claim it is connected to it.
  it("ignores a roster for a channel that is gone", () => {
    const ghost = roster([presence({})]);
    ghost.channelId = "g-hub-v-stara";
    expect(voiceChannelOf(channels, ghost, "todor@example.com")).toBeNull();
  });
});

describe("a silence has to say whose it is", () => {
  it("keeps the two kinds apart", () => {
    // Muted by hand comes back with one tap; muted by the server does not, and a
    // view that cannot tell them apart offers a button that does nothing.
    const byHand = presence({ mic: false, serverMuted: false });
    const byServer = presence({ mic: false, serverMuted: true, mutedBy: "todor@example.com" });
    expect(byHand.serverMuted).toBe(false);
    expect(byServer.serverMuted).toBe(true);
    expect(byServer.mutedBy).toBe("todor@example.com");
  });
});
