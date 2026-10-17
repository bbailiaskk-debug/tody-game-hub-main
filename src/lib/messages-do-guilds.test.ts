// Servers and voice channels, as the object keeps them.
//
// The object is the only place that decides whether a person may do something to
// a server, because a button hidden in the markup is still a button somebody can
// send a request for. What is checked here is therefore mostly refusals: a member
// renaming somebody else's server, silencing somebody without being the owner,
// joining a channel in a server they are not in, and speaking into a channel
// through an object that has never heard of it.
//
// The one behaviour that matters most is the last one in the file: a voice
// channel is not a call, so somebody leaving does not take the room with them.

import { describe, expect, it } from "vitest";

import { MessagesDO } from "../../exports.cloudflare";
import type { Guild, VoiceRoster } from "../lib/messages-protocol";

const OWNER = "todor@example.com";
const MEMBER = "ana@example.com";
const OUTSIDER = "mallory@example.com";

const memoryStorage = () => {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T = unknown>(key: string) => map.get(key) as T | undefined,
    put: async (key: string, value: unknown) => {
      map.set(key, value);
    },
    delete: async (key: string) => map.delete(key),
  };
};

/**
 * What one write came back with.
 *
 * Typed rather than `Record<string, unknown>` so a test can read `result.ok`
 * without a cast, and so a field the object stops returning shows up as a
 * compile error here instead of `undefined` inside an expectation.
 */
type WriteResult = {
  ok: boolean;
  rev: number;
  reason?: string;
  guild?: Guild;
  guildId?: string;
  peers?: string[];
  roster?: { channelId: string; presences: Array<{ email: string }> };
  channel?: { id: string; kind: "text" | "voice"; name: string; order: number };
  members?: Array<{ email: string }>;
  added?: { email: string } | string;
  removed?: string | false;
};

/**
 * One account's object, with the identity headers the gateway would send.
 *
 * The email is per request on purpose: a server lives in several objects, and
 * the checks below are only meaningful if the object knows which account a frame
 * claims to come from.
 */
const seedObject = (email: string, profile: { name?: string } = {}) => {
  const storage = memoryStorage();
  storage.map.set("profile", {
    email,
    name: profile.name ?? "Me",
    about: "",
    accent: "#1DB954",
    avatar: null,
    online: true,
    lastSeenAt: 1_700_000_000_000,
    status: "online",
  });
  const frames: unknown[] = [];
  const object = new MessagesDO(
    {
      storage,
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
      waitUntil: () => {},
      getWebSockets: () => [{ send: (frame: string) => frames.push(JSON.parse(frame)) }],
    } as never,
    {} as never,
  );

  const write = (
    path: string,
    payload: unknown,
    options: { mirror?: boolean; as?: string; from?: string } = {},
  ) =>
    object.fetch(
      new Request(`https://messages-do${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-messages-secret": "1",
          // The identity header is what the object believes, so a frame written
          // for somebody else has to say so. In production that is the gateway
          // forwarding into each member's own object; here it is the same thing
          // with the routing left out.
          "x-messages-email": options.as ?? email,
          ...(options.mirror ? { "x-messages-mirror": "1" } : {}),
          // A relayed frame arrives at somebody else's object, so the identity
          // above names the recipient. This is how it says who is speaking.
          ...(options.from ? { "x-messages-voice-from": options.from } : {}),
        },
        body: JSON.stringify(payload),
      }),
    );

  const apply = async (
    path: string,
    payload: unknown,
    options: { mirror?: boolean; as?: string; from?: string } = {},
  ) => (await (await write(path, payload, options)).json()) as WriteResult;

  /** A frame about a voice channel, as one of the people in the server sends it. */
  const voice = (
    payload: unknown,
    options: { as?: string; mirror?: boolean; from?: string } = {},
  ) => apply("/voice", payload, options);

  /** The row the gateway mirrors into a member's object, complete. */
  const mirrorGuild = (guildId: string, name: string, ownerEmail: string) =>
    apply("/guild/upsert", { id: guildId, name, ownerEmail }, { mirror: true });

  /** Who this object has recorded as being in a channel, as stored rather than reported. */
  const readVoiceRoster = async (channelId: string) => {
    const response = await object.fetch(
      new Request(`https://messages-do/voice/roster?channel=${encodeURIComponent(channelId)}`, {
        headers: { "x-messages-secret": "1", "x-messages-email": email },
      }),
    );
    return ((await response.json()) as { roster?: VoiceRoster | null }).roster ?? null;
  };

  const hasMember = (guildId: string, memberEmail: string) =>
    apply(
      "/guild/member",
      { guildId, email: memberEmail, name: memberEmail.split("@")[0] },
      { mirror: true },
    );

  return {
    object,
    storage,
    frames,
    apply,
    write,
    voice,
    readVoiceRoster,
    mirrorGuild,
    hasMember,
    guilds: async () => {
      const snapshot = (await (
        await object.fetch(
          new Request("https://messages-do/", {
            headers: { "x-messages-secret": "1", "x-messages-email": email },
          }),
        )
      ).json()) as { guilds?: { guilds: Guild[] } };
      return snapshot.guilds?.guilds ?? [];
    },
    // Not async: it reads the harness's own map, so a test can assert on the
    // row an object kept without an await in the middle of the expectation.
    voiceRoster: (channelId: string) =>
      storage.map.get(`voice:${channelId}`) as VoiceRoster | undefined,
  };
};

const GUILD_ID = "g-hub";
const GUILD_NAME = "Todor Khristov Gaming";

/**
 * An owner who already has a server with a text and a voice channel.
 *
 * `member()` gives back a member's view of the same server: the same object with
 * the same rows, but every frame it sends is stamped as that member, which is
 * what the gateway does when it forwards somebody's frame into their account.
 */
const withServer = async (email: string = OWNER) => {
  const account = seedObject(email, { name: email === OWNER ? "Todor" : "Ana" });
  const created = await account.apply("/guild/create", { id: GUILD_ID, name: GUILD_NAME });
  return {
    ...account,
    created,
    member: (memberEmail: string, memberName: string) => ({
      apply: (path: string, payload: unknown, options: { mirror?: boolean } = {}) =>
        account.apply(path, payload, { ...options, as: memberEmail }),
      mirrorGuild: () => account.mirrorGuild(GUILD_ID, GUILD_NAME, OWNER),
      hasMember: () => account.hasMember(GUILD_ID, memberEmail),
      name: memberName,
    }),
  };
};

/** A server with the owner and a member in it, both able to speak for themselves. */
const withRoom = async () => {
  const account = await withServer();
  await account.hasMember(GUILD_ID, MEMBER);
  return account;
};

describe("creating a server", () => {
  it("makes the owner, and a channel of each kind to begin with", async () => {
    const account = await withServer();

    expect((await account.guilds()).map((guild) => guild.id)).toEqual([GUILD_ID]);
    // A server with nothing in it is a server the sidebar cannot draw and the
    // owner cannot undo, so both channels are made up front.
    expect([...account.storage.map.keys()].sort()).toEqual(
      expect.arrayContaining([
        `channel:${GUILD_ID}-t-obsch`,
        `channel:${GUILD_ID}-v-lobi`,
        "guildMembers",
      ]),
    );
    const members = account.storage.map.get("guildMembers") as Array<{
      email: string;
      role: string;
    }>;
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ email: OWNER, role: "owner" });
  });

  it("names the roundel from the server name", async () => {
    const account = await withServer(OWNER);
    expect(account.created.guild).toMatchObject({ initials: "TK", ownerEmail: OWNER });
  });

  it("refuses a second server with the same id", async () => {
    const account = await withServer();
    const again = await account.apply("/guild/create", { id: GUILD_ID, name: "Impostor" });
    expect(again).toMatchObject({ ok: false, reason: "guild-exists" });
    expect((await account.guilds())[0]?.name).toBe("Todor Khristov Gaming");
  });

  it("creates nothing for a name nobody typed", async () => {
    const account = seedObject(OWNER);
    expect(await account.apply("/guild/create", { id: GUILD_ID, name: "   " })).toMatchObject({
      ok: false,
    });
    expect(await account.guilds()).toEqual([]);
  });
});

describe("only the owner runs a server", () => {
  it("lets the owner rename it", async () => {
    const account = await withServer();
    const result = await account.apply("/guild/upsert", { id: GUILD_ID, name: "Ново име" });
    expect(result.ok).toBe(true);
    expect((await account.guilds())[0]?.name).toBe("Ново име");
  });

  it("refuses a rename from anybody else", async () => {
    const account = await withServer();
    await account.mirrorGuild(GUILD_ID, GUILD_NAME, OWNER);

    const result = await account.apply(
      "/guild/upsert",
      { id: GUILD_ID, name: "Презета" },
      { as: MEMBER },
    );
    expect(result).toMatchObject({ ok: false, reason: "not-owner" });
  });

  it("refuses a rename that hands ownership over", async () => {
    const account = await withServer();
    await account.mirrorGuild(GUILD_ID, GUILD_NAME, OWNER);

    // Mirrored rows are allowed to change the name but never the owner, or a
    // member could promote themselves by writing a row somebody will relay.
    const result = await account.apply(
      "/guild/upsert",
      { id: GUILD_ID, name: "Мой", ownerEmail: MEMBER },
      { mirror: true },
    );
    expect(result.ok).toBe(true);
    expect(result.guild).toMatchObject({ ownerEmail: OWNER });
  });

  it("refuses to delete a server from anybody but its owner", async () => {
    const account = await withServer();
    await account.mirrorGuild(GUILD_ID, GUILD_NAME, OWNER);

    expect(await account.apply("/guild/remove", { id: GUILD_ID }, { as: MEMBER })).toMatchObject({
      ok: false,
      reason: "not-owner",
    });
    expect((await account.guilds())[0]?.id).toBe(GUILD_ID);
  });

  it("takes the channels and the people with it when it does go", async () => {
    const account = await withServer();
    const result = await account.apply("/guild/remove", { id: GUILD_ID });
    expect(result.ok).toBe(true);
    expect(await account.guilds()).toEqual([]);
    expect(account.storage.map.has(`channel:${GUILD_ID}-v-lobi`)).toBe(false);
    expect(account.storage.map.get("guildMembers")).toEqual([]);
  });
});

describe("channels belong to the server they were made in", () => {
  it("lets the owner add a voice channel", async () => {
    const account = await withServer();
    const result = await account.apply("/guild/channel", {
      guildId: GUILD_ID,
      id: `${GUILD_ID}-v-igri`,
      kind: "voice",
      name: "Игри",
    });
    expect(result).toMatchObject({ ok: true });
    expect(account.storage.map.get(`channel:${GUILD_ID}-v-igri`)).toMatchObject({
      kind: "voice",
      guildId: GUILD_ID,
      name: "Игри",
    });
  });

  it("refuses a channel id from another server", async () => {
    const account = await withServer();
    // A row written into this object under somebody else's prefix would show up
    // in a sidebar that has no reason to look for it.
    expect(
      await account.apply("/guild/channel", {
        guildId: GUILD_ID,
        id: "g-druga-v-lobi",
        kind: "voice",
        name: "Чуждо",
      }),
    ).toMatchObject({ ok: false, reason: "foreign-channel" });
  });

  it("refuses a new channel from anybody but the owner", async () => {
    const account = await withServer();
    await account.mirrorGuild(GUILD_ID, GUILD_NAME, OWNER);
    expect(
      await account.apply(
        "/guild/channel",
        { guildId: GUILD_ID, id: `${GUILD_ID}-v-igri`, kind: "voice", name: "Игри" },
        { as: MEMBER },
      ),
    ).toMatchObject({ ok: false, reason: "not-owner" });
  });

  it("stops at the cap rather than growing without end", async () => {
    const account = await withServer();
    let last: WriteResult = { ok: false, rev: 0 };
    for (let index = 0; index < 40; index += 1) {
      last = await account.apply("/guild/channel", {
        guildId: GUILD_ID,
        id: `${GUILD_ID}-v-${index}`,
        kind: "voice",
        name: `Канал ${index}`,
      });
      if (last.ok === false) break;
    }
    expect(last).toMatchObject({ ok: false, reason: "too-many-voice-channels" });
  });

  it("lets the owner rename a channel that already exists", async () => {
    const account = await withServer();
    await account.apply("/guild/channel", {
      guildId: GUILD_ID,
      id: `${GUILD_ID}-v-lobi`,
      kind: "voice",
      name: "Хол",
    });
    expect(account.storage.map.get(`channel:${GUILD_ID}-v-lobi`)).toMatchObject({ name: "Хол" });
  });
});

describe("membership", () => {
  it("puts somebody in the server", async () => {
    const account = await withServer();
    const result = await account.apply("/guild/member", {
      guildId: GUILD_ID,
      email: MEMBER,
      name: "Ana",
    });
    expect(result).toMatchObject({ ok: true });
    const members = account.storage.map.get("guildMembers") as Array<{ email: string }>;
    expect(members.map((member) => member.email).sort()).toEqual([MEMBER, OWNER]);
  });

  it("never makes a second row for the same person in the same server", async () => {
    const account = await withServer();
    await account.apply("/guild/member", { guildId: GUILD_ID, email: MEMBER, name: "Ana" });
    await account.apply("/guild/member", { guildId: GUILD_ID, email: MEMBER, name: "Ana II" });
    const members = account.storage.map.get("guildMembers") as Array<{
      email: string;
      name: string;
    }>;
    expect(members.filter((member) => member.email === MEMBER)).toHaveLength(1);
    expect(members.find((member) => member.email === MEMBER)?.name).toBe("Ana II");
  });

  it("refuses to make the owner anything but the owner", async () => {
    const account = await withServer();
    // The role comes from the guild row, never from what the caller sends.
    await account.apply("/guild/member", { guildId: GUILD_ID, email: OWNER, role: "member" });
    const members = account.storage.map.get("guildMembers") as Array<{ role: string }>;
    expect(members.every((member) => member.role === "owner")).toBe(true);
  });

  it("keeps a person in one server out of another", async () => {
    const account = await withServer();
    await account.mirrorGuild("g-druga", "Другия", OWNER);
    await account.hasMember(GUILD_ID, MEMBER);
    await account.hasMember("g-druga", MEMBER);

    const members = account.storage.map.get("guildMembers") as Array<{
      email: string;
      guildId: string;
    }>;
    expect(members.filter((member) => member.email === MEMBER)).toHaveLength(2);
  });

  it("refuses a member to a server that does not exist", async () => {
    const account = await withServer();
    expect(await account.apply("/guild/member", { guildId: "g-nie", email: MEMBER })).toMatchObject(
      { ok: false, reason: "unknown-guild" },
    );
  });

  it("lets the owner leave nobody stranded as the admin", async () => {
    const account = await withServer();
    // A server whose owner has left cannot be renamed or deleted by anybody.
    expect(
      await account.apply("/guild/member", { guildId: GUILD_ID, email: OWNER, remove: true }),
    ).toMatchObject({ ok: false, reason: "owner-cannot-leave" });
  });

  it("takes somebody out, and their presence with them", async () => {
    const account = await withRoom();
    await account.apply(
      "/voice",
      { channelId: `${GUILD_ID}-v-lobi`, kind: "voice-join" },
      { as: MEMBER },
    );
    expect(account.voiceRoster(`${GUILD_ID}-v-lobi`)?.presences).toHaveLength(1);

    expect(
      await account.apply("/guild/member", { guildId: GUILD_ID, email: MEMBER, remove: true }),
    ).toMatchObject({ ok: true });
    // Still connected to a channel of a server they are no longer in.
    expect(account.voiceRoster(`${GUILD_ID}-v-lobi`)).toBeUndefined();
  });
});

describe("a voice channel is joined, not rung", () => {
  it("puts the person in and names the room after the server", async () => {
    const account = await withServer();
    const result = await account.apply("/voice", {
      channelId: `${GUILD_ID}-v-lobi`,
      kind: "voice-join",
    });
    expect(result.ok).toBe(true);
    expect(result.guildId).toBe(GUILD_ID);
    expect(account.voiceRoster(`${GUILD_ID}-v-lobi`)?.presences.map((p) => p.email)).toEqual([
      OWNER,
    ]);
  });

  it("tells the joiner who is already there", async () => {
    const account = await withRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });

    const result = await account.voice({ channelId, kind: "voice-join" });
    // Nobody is connected to anybody else on their own: the roster is what tells
    // this phone who to offer a connection to.
    expect(result.peers).toContain(MEMBER);
    expect(result.roster?.presences.map((p) => p.email).sort()).toEqual([MEMBER, OWNER]);
  });

  // The room is a member list, not a call: somebody arriving is news for the
  // whole server, because each object only knows the occupants as of the last
  // mirror it received and would otherwise never hear about a late arrival.
  it("also tells the rest of the server", async () => {
    const account = await withRoom();
    const result = await account.apply("/voice", {
      channelId: `${GUILD_ID}-v-lobi`,
      kind: "voice-join",
    });
    expect(result.peers).toEqual(expect.arrayContaining([MEMBER]));
  });

  it("refuses a frame from somebody who is not in the server", async () => {
    const account = await withServer();
    await account.mirrorGuild(GUILD_ID, GUILD_NAME, OWNER);
    // Knowing the server's id is not being in it: the row was mirrored but no
    // member row was ever written, so there is nothing to be one of.
    expect(
      await account.apply(
        "/voice",
        { channelId: `${GUILD_ID}-v-lobi`, kind: "voice-join" },
        { as: OUTSIDER },
      ),
    ).toMatchObject({ ok: false, reason: "unknown-channel" });
  });

  it("refuses a text channel, because nothing is heard there", async () => {
    const account = await withServer();
    expect(
      await account.apply("/voice", {
        channelId: `${GUILD_ID}-t-obsch`,
        kind: "voice-join",
      }),
    ).toMatchObject({ ok: false, reason: "unknown-channel" });
  });

  it("refuses a channel that does not exist", async () => {
    const account = await withServer();
    expect(
      await account.apply("/voice", { channelId: `${GUILD_ID}-v-nie`, kind: "voice-join" }),
    ).toMatchObject({ ok: false, reason: "unknown-channel" });
  });

  it("refuses a kind of frame it does not know", async () => {
    const account = await withServer();
    expect(
      await account.apply("/voice", {
        channelId: `${GUILD_ID}-v-lobi`,
        kind: "voice-teleport",
      }),
    ).toMatchObject({ ok: false });
  });

  it("keeps somebody in their place when they come back", async () => {
    const account = await withRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-join" });
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });
    await account.voice({ channelId, kind: "voice-leave" }, { as: MEMBER });
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });

    // The mesh order is the `order` field, and a reshuffle under the people
    // already connected is how two phones end up offering at once.
    const ana = account.voiceRoster(channelId)?.presences.find((p) => p.email === MEMBER);
    expect(ana?.status).toBe("active");
    expect(ana?.order).toBe(1);
  });

  it("takes somebody out of the channel they moved to", async () => {
    const account = await withRoom();
    await account.apply("/guild/channel", {
      guildId: GUILD_ID,
      id: `${GUILD_ID}-v-igri`,
      kind: "voice",
      name: "Игри",
    });
    await account.voice({ channelId: `${GUILD_ID}-v-lobi`, kind: "voice-join" }, { as: MEMBER });
    await account.voice({ channelId: `${GUILD_ID}-v-igri`, kind: "voice-join" }, { as: MEMBER });

    // A member is in one channel at a time. Two rooms of one server both listing
    // them would hand them the frames of a room they are not sitting in.
    expect(account.voiceRoster(`${GUILD_ID}-v-lobi`)).toBeUndefined();
    expect(account.voiceRoster(`${GUILD_ID}-v-igri`)?.presences.map((p) => p.email)).toEqual([
      MEMBER,
    ]);
  });

  it("empties the room once the last person has gone", async () => {
    const account = await withRoom();
    await account.apply(
      "/voice",
      { channelId: `${GUILD_ID}-v-lobi`, kind: "voice-join" },
      { as: MEMBER },
    );
    await account.apply(
      "/voice",
      { channelId: `${GUILD_ID}-v-lobi`, kind: "voice-leave" },
      { as: MEMBER },
    );
    // A row kept for a person nobody is left to fade for is a room that looks
    // occupied forever.
    expect(account.voiceRoster(`${GUILD_ID}-v-lobi`)?.presences).toEqual([]);
  });

  it("stops a channel growing past what a mesh can carry", async () => {
    const account = await withServer();
    const channelId = `${GUILD_ID}-v-lobi`;
    for (let index = 0; index < 12; index += 1) {
      const email = `m${index}@example.com`;
      await account.hasMember(GUILD_ID, email);
      await account.voice({ channelId, kind: "voice-join" }, { as: email });
    }
    const roster = account.voiceRoster(channelId);
    const live = roster?.presences.filter((p) => p.status === "active") ?? [];
    // A mesh of one stream each way per pair does not scale, so the room stops
    // rather than admitting everybody and holding a call nobody can be in.
    expect(live.length).toBeLessThanOrEqual(8);
    expect(live.length).toBeGreaterThan(0);
  });
});

/**
 * What an account has to hold to see a server at all.
 *
 * Found by trying to get two people into one room and finding the second one
 * could see nothing: the gateway wrote the member row but never the server or its
 * channels, so the sidebar drew an empty column and every channel was out of
 * reach. An invitation that appears to have done nothing.
 *
 * These are the rows a new member's object is given, and the check that they are
 * enough — which is the object half of that; the fan-out that writes them lives
 * in the gateway and is checked by walking two real accounts through a room.
 */
describe("the rows a new member is given", () => {
  const GUILD = "g-d28fbe80";
  const CHANNEL = `${GUILD}-v-lobi`;

  it("takes the server, its channels and its own row, and can then walk in", async () => {
    // The owner's object: where the server is actually kept.
    const owner = await withServer();
    await owner.apply("/guild/channel", {
      guildId: GUILD,
      id: CHANNEL,
      kind: "voice",
      name: "Лоби",
    });

    // The newcomer's object, which starts with nothing at all.
    const newcomer = seedObject("ana@example.com");
    expect(await newcomer.guilds()).toEqual([]);

    const rows = await owner.apply(
      "/guild/upsert",
      { id: GUILD, name: "Пробна стая", ownerEmail: OWNER },
      { mirror: true },
    );
    await newcomer.apply("/guild/upsert", rows["guild"], { mirror: true });
    await newcomer.apply(
      "/guild/member",
      { guildId: GUILD, email: "ana@example.com", name: "Ana" },
      { mirror: true },
    );
    const channel = await owner.apply("/guild/channel", {
      guildId: GUILD,
      id: CHANNEL,
      kind: "voice",
      name: "Лоби",
    });
    await newcomer.apply("/guild/channel", channel["channel"], { mirror: true });

    // The sidebar has something to draw.
    expect((await newcomer.guilds()).map((guild) => guild.id)).toEqual([GUILD]);
    const snapshot = (await newcomer.object
      .fetch(
        new Request("https://messages-do/", {
          headers: { "x-messages-secret": "1", "x-messages-email": "ana@example.com" },
        }),
      )
      .then((response) => response.json())) as { guilds?: { channels: { voice: unknown[] } } };
    expect(snapshot.guilds?.channels.voice).toHaveLength(1);

    // And the one thing that matters: the channel is now somewhere this account
    // can actually be in.
    const joined = await newcomer.voice({ channelId: CHANNEL, kind: "voice-join" });
    expect(joined.ok).toBe(true);
    expect(joined.roster?.presences.map((p) => p.email)).toEqual(["ana@example.com"]);
  });

  it("refuses the channel without the server row, which is what a bare member is", async () => {
    const bare = seedObject("ana@example.com");
    await bare.apply(
      "/guild/member",
      { guildId: GUILD, email: "ana@example.com", name: "Ana" },
      { mirror: true },
    );

    // A member of a server this object has never heard of is not a member of
    // anything, and saying so is the point of the membership check.
    expect(await bare.voice({ channelId: CHANNEL, kind: "voice-join" })).toMatchObject({
      ok: false,
      reason: "unknown-channel",
    });
  });

  /**
   * A relayed frame has to be recorded against the person who sent it.
   *
   * It arrives at somebody else's object, so the session on the request names the
   * recipient. Read as the speaker, the recipient writes its own presence as
   * whatever the frame says, never records the person who actually spoke, and is
   * handed back a frame that claims to be its own — which the client drops as an
   * echo. The two of them sit in the same channel and neither can see the other,
   * and the only symptom is a presence that changes on the wrong account.
   */
  it("records a relayed frame against the speaker, not the recipient", async () => {
    const ana = seedObject("ana@example.com");
    await ana.mirrorGuild(GUILD, "Пробна стая", OWNER);
    await ana.hasMember(GUILD, "ana@example.com");
    // The owner is a member like anybody else, and a frame about them is refused
    // by an object that has no row for them — which is what the gateway fans out.
    await ana.hasMember(GUILD, OWNER);
    // The channel itself, or the room below does not exist to be in.
    await ana.apply(
      "/guild/channel",
      { guildId: GUILD, id: CHANNEL, kind: "voice", name: "Лоби" },
      { mirror: true },
    );

    // Ana is in the room in her own object.
    await ana.voice({ channelId: CHANNEL, kind: "voice-join" });

    // The owner's object learns she is there and mirrors it into hers, which is
    // how a frame actually reaches a member: somebody else's object, forwarded.
    const owner = await withRoom();
    await owner.voice({ channelId: CHANNEL, kind: "voice-join" });
    await ana.voice({ channelId: CHANNEL, kind: "voice-join" }, { mirror: true, from: OWNER });

    // Then the owner starts sharing, which reaches her object as a relayed frame.
    await ana.voice(
      { channelId: CHANNEL, kind: "voice-state", screen: true, surface: "monitor" },
      { mirror: true, from: OWNER },
    );

    // Both of them, in her object, each under their own name. Read from the object
    // rather than from the frame's answer, because the answer is a report and the
    // stored rows are the room.
    const room = (await ana.readVoiceRoster(CHANNEL)) as VoiceRoster | null;
    expect(room?.presences.map((p) => p.email).sort()).toEqual(["ana@example.com", OWNER]);

    // And the share is recorded against the person who is sharing, which is the
    // whole difference: written to the wrong account it shows a desktop going out
    // from somebody who never started one.
    const who = (email: string) => room?.presences.find((p) => p.email === email);
    expect(who(OWNER)?.screen).toBe(true);
    expect(who("ana@example.com")?.screen).toBe(false);

    // The frame pushed to her own devices names the speaker, so the client does
    // not take somebody else's change for its own echo and throw it away.
    const voiceFrames = ana.frames.filter(
      (frame) => (frame as { type?: string }).type === "voice",
    ) as Array<{ signal?: { from?: string; screen?: boolean } }>;
    const last = voiceFrames.at(-1)?.signal;
    expect(last?.from).toBe(OWNER);
    expect(last?.screen).toBe(true);
  });
});

describe("a silence is the owner's to give and to lift", () => {
  const silenceRoom = async () => {
    const account = await withRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-join" });
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });
    return account;
  };

  const presenceOf = (account: Awaited<ReturnType<typeof silenceRoom>>, who: string) =>
    account.voiceRoster(`${GUILD_ID}-v-lobi`)?.presences.find((entry) => entry.email === who);

  it("silences a member and says whose it was", async () => {
    const account = await silenceRoom();
    const result = await account.apply("/voice", {
      channelId: `${GUILD_ID}-v-lobi`,
      kind: "voice-mute",
      target: MEMBER,
      muted: true,
    });
    expect(result.ok).toBe(true);
    expect(presenceOf(account, MEMBER)).toMatchObject({
      mic: false,
      serverMuted: true,
      mutedBy: OWNER,
    });
  });

  it("lifts it again", async () => {
    const account = await silenceRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-mute", target: MEMBER, muted: true });
    await account.voice({ channelId, kind: "voice-mute", target: MEMBER, muted: false });
    expect(presenceOf(account, MEMBER)).toMatchObject({ serverMuted: false, mic: false });
    expect(presenceOf(account, MEMBER)?.mutedBy).toBeUndefined();
  });

  it("refuses a silence from somebody who is not the owner", async () => {
    const account = await silenceRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    // The frame was accepted as a route, but the owner's microphone is
    // untouched: a member cannot silence the person who owns the server.
    await account.voice(
      { channelId, kind: "voice-mute", target: OWNER, muted: true },
      { as: MEMBER },
    );
    expect(presenceOf(account, OWNER)).toMatchObject({ serverMuted: false, mic: true });
  });

  it("lets a member hand their own microphone back", async () => {
    const account = await silenceRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-state", mic: false }, { as: MEMBER });
    await account.voice({ channelId, kind: "voice-state", mic: true }, { as: MEMBER });
    expect(presenceOf(account, MEMBER)).toMatchObject({ serverMuted: false, mic: true });
  });

  // The microphone belongs to the phone holding it, so the object cannot stop
  // the audio — it can only tell that phone to stop sending it. This is the
  // check that a later `voice-state` cannot quietly undo that.
  it("stops a silenced member turning their own microphone back on", async () => {
    const account = await silenceRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-mute", target: MEMBER, muted: true });
    await account.voice({ channelId, kind: "voice-state", mic: true }, { as: MEMBER });
    expect(presenceOf(account, MEMBER)).toMatchObject({ serverMuted: true, mic: false });
  });

  it("carries a member's own switches through", async () => {
    const account = await silenceRoom();
    await account.apply(
      "/voice",
      { channelId: `${GUILD_ID}-v-lobi`, kind: "voice-state", mic: false, camera: true },
      { as: MEMBER },
    );
    expect(presenceOf(account, MEMBER)).toMatchObject({ mic: false, camera: true });
  });

  it("refuses to kick somebody unless the owner asks", async () => {
    const account = await silenceRoom();
    const channelId = `${GUILD_ID}-v-lobi`;

    await account.voice({ channelId, kind: "voice-kick", target: MEMBER }, { as: MEMBER });
    expect(presenceOf(account, MEMBER)?.status).toBe("active");

    await account.voice({ channelId, kind: "voice-kick", target: MEMBER });
    expect(presenceOf(account, MEMBER)?.status).toBe("left");
  });
});

describe("a voice frame reaches only the channel it names", () => {
  it("sends a directed frame to that one person", async () => {
    const account = await withRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });
    await account.apply("/guild/channel", {
      guildId: GUILD_ID,
      id: `${GUILD_ID}-v-igri`,
      kind: "voice",
      name: "Игри",
    });
    await account.voice({ channelId: `${GUILD_ID}-v-igri`, kind: "voice-join" }, { as: MEMBER });

    const result = await account.voice({ channelId, kind: "offer", to: MEMBER });
    // Somebody in the other channel is not somebody this frame is for.
    expect(result.peers).toEqual([]);
  });

  it("sends a directed frame to the person who is in this channel", async () => {
    const account = await withRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });
    const result = await account.voice({ channelId, kind: "offer", to: MEMBER });
    expect(result.peers).toEqual([MEMBER]);
  });

  it("sends an unnamed frame to everybody else in the channel", async () => {
    const account = await withRoom();
    const channelId = `${GUILD_ID}-v-lobi`;
    await account.voice({ channelId, kind: "voice-join" }, { as: MEMBER });

    const result = await account.voice({ channelId, kind: "voice-state", mic: false });
    expect(result.peers).toEqual([MEMBER]);
  });

  it("puts the frame on this account's own sockets too", async () => {
    const account = await withServer();
    await account.apply("/voice", { channelId: `${GUILD_ID}-v-lobi`, kind: "voice-join" });

    // The gateway hands every frame back to the sender's own devices, so a
    // second laptop joins the room instead of ringing the account again.
    const frames = account.frames as Array<{ type: string; signal?: { kind: string } }>;
    expect(frames.filter((frame) => frame.type === "voice").map((f) => f.signal?.kind)).toEqual([
      "voice-join",
    ]);
  });

  it("stamps the sender rather than believing the frame", async () => {
    const account = await withServer();
    await account.apply("/voice", {
      channelId: `${GUILD_ID}-v-lobi`,
      kind: "voice-join",
      from: "someone.else@example.com",
    });
    const frames = account.frames as Array<{ type: string; signal?: { from?: string } }>;
    expect(frames.find((frame) => frame.type === "voice")?.signal?.from).toBe(OWNER);
  });

  it("pushes no generic sync frame for a voice change", async () => {
    const account = await withRoom();
    // Creating the server pushed one of its own; only what follows is the point.
    account.frames.length = 0;

    await account.voice({ channelId: `${GUILD_ID}-v-lobi`, kind: "voice-join" });
    await account.voice({ channelId: `${GUILD_ID}-v-lobi`, kind: "voice-state", mic: false });

    // The frame itself is the notice; a snapshot re-sync behind every one would
    // be a full conversation history pulled over the wire per switch.
    const frames = account.frames as Array<{ type: string }>;
    expect(frames.filter((frame) => frame.type === "voice")).toHaveLength(2);
    expect(frames.some((frame) => frame.type === "sync")).toBe(false);
  });
});
