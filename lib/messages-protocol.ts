/**
 * Wire types for the cloud-backed messages hub.
 *
 * Imported by the Durable Object bundle, the SSR server functions and the
 * browser client, so it must stay free of runtime dependencies.
 *
 * Each account owns one Durable Object. A conversation is mirrored into both
 * participants' objects, which means a user only ever reads from their own
 * object and there is no cross-account read path to get wrong.
 */

export type MessageStatus = "sending" | "sent" | "read";

export type AttachmentKind = "image" | "file";

export type MessageAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  /** True when the payload is present and this account may read it. */
  stored: boolean;
  /**
   * Inline preview, only ever populated on the device that composed the
   * message. The object strips it out and serves the payload from
   * `/api/messages/attachment` instead.
   */
  dataUrl?: string;
};

/**
 * One emoji on a message, and who put it there.
 *
 * Addresses rather than names, for the same reason the messages themselves are
 * addressed: a name can be changed, and a reaction that pointed at one would change
 * with it. The bubble shows a name by looking the address up, which is the only
 * place a name belongs.
 */
export type MessageReaction = {
  emoji: string;
  /** Who reacted, in the order they did. An address at most once per emoji. */
  by: string[];
};

export type ChatMessage = {
  id: string;
  fromMe: boolean;
  text: string;
  at: number;
  status: MessageStatus;
  attachments?: MessageAttachment[];
  /** Set once the author changed the text, so the bubble can say so. */
  editedAt?: number;
  /**
   * A tombstone rather than a removal: both objects keep the row so the change
   * converges, and the text is no longer rendered or counted anywhere.
   */
  deletedAt?: number;
  /**
   * The emoji on it, and who pressed them.
   *
   * Optional and absent rather than an empty list, because a message nobody has
   * reacted to is the ordinary case and an empty array on every row would be a
   * field on every message forever.
   */
  reactions?: MessageReaction[];
};

/** The two changes an author may make to a message they sent. */
export type MessageChangeAction = "edit" | "delete";

/** The most different emoji one message may carry. */
export const MAX_REACTIONS_PER_MESSAGE = 8;
/** The most people behind one emoji. */
export const MAX_REACTIONS_PER_EMOJI = 50;
/**
 * The longest an emoji may be, in code points.
 *
 * Long enough for the flags and the skin tones, which are several code points each
 * and are the reason a limit of "four bytes" would refuse half the set.
 */
export const MAX_REACTION_CODE_POINTS = 32;

export type ChatContact = {
  id: string;
  /** Empty for drafts that are not linked to a registered account yet. */
  peerEmail: string;
  name: string;
  initials: string;
  about: string;
  accent: string;
  avatar: string | null;
  online: boolean;
  lastSeenAt: number;
  lastSeenLabel: string;
  /** False while the contact has no account to mirror messages to. */
  linked: boolean;
  /** The peer's chosen presence, mirrored from their profile. */
  status: PresenceStatus;
};

export type MessageChat = {
  id: string;
  peerEmail: string;
  pinned: boolean;
  muted: boolean;
  updatedAt: number;
  messages: ChatMessage[];
  /**
   * The calls that happened here, kept beside the messages rather than among
   * them: a call is not something anyone typed, and reading it as a sentence
   * would lose the answer button a ringing call needs.
   */
  calls?: CallRecord[];
};

/**
 * Presence a user can choose, mirroring the messaging apps the design follows.
 * `online` is also the only state that makes the account reachable.
 */
export const PRESENCE_STATUSES = ["online", "away", "busy", "invisible"] as const;

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const normalizePresenceStatus = (value: unknown): PresenceStatus =>
  PRESENCE_STATUSES.includes(value as PresenceStatus) ? (value as PresenceStatus) : "online";

export type MessagesProfile = {
  email: string;
  name: string;
  about: string;
  accent: string;
  avatar: string | null;
  online: boolean;
  lastSeenAt: number;
  /** What the user chose to show; `invisible` hides the green dot. */
  status: PresenceStatus;
};

export type MessagesSnapshot = {
  profile: MessagesProfile;
  contacts: ChatContact[];
  chats: MessageChat[];
  /** Monotonic revision used to skip redundant syncs. */
  rev: number;
  serverTime: number;
  /** Converged typing state, so a device joining mid-compose still sees it. */
  typing: TypingState[];
  /**
   * The servers this account is in, with their people and channels.
   *
   * Mirrored rows rather than a shared read: an account only ever reads from its
   * own object, and this is what lets the sidebar draw a server without a
   * cross-account path that could answer for a server it is not in.
   *
   * Optional because an object written before servers existed has none, and
   * absence reads as "this account is in no servers" rather than as a crash.
   */
  guilds?: GuildSnapshot;
};

/** The servers a snapshot carries, with empty ones for a snapshot that has none. */
export const emptyGuildSnapshot = (): GuildSnapshot => ({
  guilds: [],
  members: [],
  channels: { text: [], voice: [] },
});

/** One peer currently composing in a conversation. */
export type TypingState = {
  chatId: string;
  peerEmail: string;
  at: number;
};

/** How long a typing signal stays valid; expired entries are dropped. */
export const TYPING_TTL_MS = 7_000;

export type IncomingAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  /**
   * Where the bytes are, before the message is sent.
   *
   * One of two things, never both. `file` is the payload this device is about to
   * upload in parts, and it never leaves the browser: the field is dropped by the
   * gateway before a message reaches an object, so a four-gigabyte file is never
   * serialised into anything. `dataUrl` is the payload itself, used only where
   * there is no bucket to upload to.
   */
  file?: Blob;
  /** Base64 payload, for a small file or a device-only conversation. */
  dataUrl?: string;
  /**
   * Set by the gateway once the payload is in the bucket, naming the object it
   * landed in. The client never writes this: it is what the object resolves an
   * attachment id to, and a client that could name it could point somebody else
   * at a file they were never sent.
   */
  key?: string;
};

export type MessagePush =
  | { type: "sync"; rev: number }
  | {
      type: "presence";
      profile: Pick<MessagesProfile, "email" | "name" | "online" | "lastSeenAt" | "status">;
    }
  | { type: "typing"; chatId: string; peerEmail: string; at: number }
  | { type: "call"; signal: CallSignal }
  | { type: "roster"; roster: CallRoster }
  /** Somebody joined, left or changed a switch in a voice channel. */
  | { type: "voice"; signal: VoiceSignal }
  /** The whole membership of a server changed, so a sync is worth taking. */
  | { type: "guild"; rev: number }
  | { type: "error"; message: string };

// ------------------------------------------------------------------- calls

/** What a call starts as: audio only, or audio with a picture. */
export type CallMedia = "audio" | "video";

/**
 * What somebody is sharing.
 *
 * The browser's picker knows this and the browser does not tell us unless we
 * ask, so the people watching are told whether they are looking at a whole
 * screen or one window: it is the difference between "why is my desktop on
 * their phone" and an answer.
 */
export type ScreenSurface = "monitor" | "window" | "browser";

/**
 * One person in a call.
 *
 * The order matters as much as the flags: in a group, the two phones decide who
 * offers the connection to whom, and both read that order from the same roster,
 * so nobody has to be told who speaks first.
 */
export type CallParticipant = {
  email: string;
  name: string;
  avatar: string | null;
  /** Their own switches, as their phone reports them. */
  mic: boolean;
  camera: boolean;
  screen: boolean;
  /** What they are sharing, so a viewer is told rather than guessing. */
  screenSurface: ScreenSurface;
  /**
   * Which screen it is, as the browser names it: "Екран 2", a window title, a
   * tab.
   *
   * It is the one thing that says *what* is being shared rather than that
   * something is, and a room showing "Екран 2" is not a room showing
   * "На цял екран". The browser offers to say it nowhere else.
   */
  screenLabel?: string;
  /** Where they are in joining: rung, dialling, talking, or gone. */
  status: "invited" | "ringing" | "joining" | "active" | "left";
  /** When they joined, which is what fixes the order. */
  order: number;
  /** True for the account reading this. */
  isSelf: boolean;
};

/**
 * Who offers the connection between two people.
 *
 * Both sides hold the same roster, so both arrive at the same answer without a
 * negotiation: whoever was in the call first offers to whoever arrived after.
 * Two phones offering at once is the one thing that reliably breaks a call.
 */
export const shouldOffer = (
  self: string,
  them: string,
  roster: Array<{ email: string; order: number }>,
) => {
  const left = roster.find((entry) => entry.email === self)?.order ?? Number.MAX_SAFE_INTEGER;
  const right = roster.find((entry) => entry.email === them)?.order ?? Number.MAX_SAFE_INTEGER;
  return left < right;
};

/**
 * One step of the handshake, relayed between the participants' objects.
 *
 * The WebRTC handshake rides on the same websocket the chat already uses, so a
 * call needs no second connection: the object decides who may talk to whom and
 * the frames are the payload. In a group every participant holds a connection to
 * every other one, and these frames are what build them.
 */
export type CallSignalKind =
  | "begin"
  | "invite"
  | "accept"
  | "decline"
  | "leave"
  | "end"
  | "offer"
  | "answer"
  | "candidate"
  | "renegotiate"
  | "state"
  | "log";

/** The participants of a call, as the object holds them. */
export type CallRoster = {
  callId: string;
  host: string;
  starts: CallMedia;
  createdAt: number;
  participants: Array<{ email: string; order: number; status: CallParticipant["status"] }>;
};

export type CallSignal = {
  kind: CallSignalKind;
  callId: string;
  /** The conversation, checked against the caller's own object before sending. */
  chatId: string;
  /**
   * Who sent it, as the object knows rather than as the client claims.
   *
   * The gateway hands every frame back to the sender's own devices, so that a
   * second laptop joins the call it started instead of ringing the account
   * again. This is how a phone tells that echo from the other side.
   */
  from?: string;
  /**
   * Who it is for. Left empty it goes to everyone else in the call, which is
   * what a mute or a roster change means; named it goes to one person, which is
   * what a session description means.
   */
  to?: string;
  /** On `invite`: what the caller wants to start with. */
  starts?: CallMedia;
  /** On `offer` and `answer`: a WebRTC session description. */
  description?: unknown;
  /** On `candidate`: a WebRTC ICE candidate. */
  candidate?: unknown;
  /** On `state`: the sender's live media switches, so the other side can show them. */
  mic?: boolean;
  camera?: boolean;
  screen?: boolean;
  /** On `state`: what the sender is sharing, so the people watching are told. */
  surface?: ScreenSurface;
  /** On `decline` and `end`: why the call is over. */
  reason?: string;
  /**
   * On `log`: the finished call, written into the conversation's history rather
   * than passed to whoever is ringing.
   */
  log?: CallRecord;
  /** On `begin`, `invite` and `roster`: who is in the call, and in what order. */
  roster?: CallRoster;
};

/**
 * The call as the view sees it.
 *
 * One call at a time per account, as in every chat app, but not one person at a
 * time: a call with four people is four entries in one list, and the two
 * person case is simply the list with two.
 */
export type CallState = {
  status: "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
  callId: string;
  chatId: string;
  peerEmail: string;
  peerName: string;
  peerAvatar: string | null;
  /**
   * The person the call was on before it was moved to somebody else, kept so the
   * thread can say that the first name did not answer rather than only showing
   * who it is on now. Empty until a call is redirected, which is the only thing
   * that writes it.
   */
  previousPeerName: string;
  starts: CallMedia;
  /**
   * Whose button started it, as an address rather than a flag: the history is
   * written for both sides from one record, and it has to know the difference.
   */
  callerEmail: string;
  /** Set when two sides are actually connected, which is what a call is. */
  answeredAt: number;
  /**
   * Everyone in the call, this account first and the host first of all. A voice
   * call with two people is the two entry case of this, not a separate shape.
   */
  participants: CallParticipant[];
  /** The account that placed the call, and whose chat holds its history. */
  host: string;
  /** Local media switches, mirrored to the peer through a `state` signal. */
  mic: boolean;
  camera: boolean;
  screen: boolean;
  /** What this account is sharing, while it is sharing. */
  screenSurface: ScreenSurface;
  startedAt: number;
  /** Set when the peer cannot take a second call right now. */
  busy?: boolean;
  reason?: string;
};

export const IDLE_CALL: CallState = {
  status: "idle",
  callId: "",
  chatId: "",
  peerEmail: "",
  peerName: "",
  peerAvatar: null,
  previousPeerName: "",
  starts: "audio",
  callerEmail: "",
  answeredAt: 0,
  participants: [],
  host: "",
  mic: true,
  camera: false,
  screen: false,
  screenSurface: "monitor",
  startedAt: 0,
};

/** Drops expired typing signals so a disconnect never leaves a stuck bubble. */
export const liveTyping = (entries: TypingState[], now: number = Date.now()) =>
  entries.filter((entry) => now - entry.at < TYPING_TTL_MS);

// ------------------------------------------------------------------ friends

export type FriendshipStatus = "pending" | "accepted" | "rejected";

/**
 * One record per directed friendship request. The same id is written into both
 * participants' objects, so a user only ever reads from their own object and
 * both sides converge on the same status without a shared store.
 */
export type FriendRequest = {
  id: string;
  fromEmail: string;
  fromName: string;
  fromAvatar: string | null;
  toEmail: string;
  toName: string;
  status: FriendshipStatus;
  createdAt: number;
  updatedAt: number;
};

/** Minimal directory record. Never carries hashes, birthday or gender. */
export type DirectoryEntry = {
  email: string;
  name: string;
  avatar: string | null;
};

export type FriendsSnapshot = {
  /** Awaiting my decision. */
  incoming: FriendRequest[];
  /** I asked and they have not answered yet. */
  outgoing: FriendRequest[];
  /** Mutually accepted. */
  friends: FriendRequest[];
  /** Rejected or cancelled, kept briefly so the UI can explain the state. */
  declined: FriendRequest[];
};

const byNewest = (a: FriendRequest, b: FriendRequest) => b.updatedAt - a.updatedAt;

/** Buckets friendship rows relative to the signed-in account. */
export const splitFriendRequests = (records: FriendRequest[], me: string = ""): FriendsSnapshot => {
  const self = me.trim().toLowerCase();
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];
  const friends: FriendRequest[] = [];
  const declined: FriendRequest[] = [];

  for (const record of records) {
    if (record.status === "accepted") {
      friends.push(record);
      continue;
    }
    if (record.status === "rejected") {
      declined.push(record);
      continue;
    }
    if (!self) continue;
    if (record.toEmail === self) incoming.push(record);
    else if (record.fromEmail === self) outgoing.push(record);
  }

  return {
    incoming: incoming.sort(byNewest),
    outgoing: outgoing.sort(byNewest),
    friends: friends.sort((a, b) => a.fromName.localeCompare(b.fromName)),
    declined: declined.sort(byNewest).slice(0, 25),
  };
};

/** Everybody a call can be widened to, as the panel that offers them needs it. */
export type CallCandidate = {
  email: string;
  name: string;
  avatar: string | null;
  /**
   * False for somebody this account can see but has no address for.
   *
   * They are still listed, because telling a person they have nobody to invite
   * while three conversations are on screen is a list that looks broken. They
   * cannot be rung until there is an address, and the button says so rather than
   * doing nothing when pressed.
   */
  reachable: boolean;
};

/** A conversation, as far as an invite list is concerned. */
export type CallCandidateChat = { peerEmail: string; peerName?: string };

/**
 * The other half of a friendship row, from this account's chair.
 *
 * A row is written into both objects with the same id, so which side sent it is
 * the only thing that says who the other person is.
 */
const friendPeer = (
  record: FriendRequest,
  self: string,
): Omit<CallCandidate, "reachable"> | null => {
  const mine = normalizeAddress(record.fromEmail) === normalizeAddress(self);
  const email = mine ? record.toEmail : record.fromEmail;
  if (!email) return null;
  return {
    email: normalizeAddress(email),
    // The row carries a face for whoever sent it, which is the other side when
    // they are the one who asked. A contact row, when there is one, is fresher.
    name: (mine ? record.toName : record.fromName) || email,
    avatar: mine ? null : (record.fromAvatar ?? null),
  };
};

/**
 * Everybody this account could pull into a call, from its friends *and* its
 * contacts.
 *
 * Both, and not one or the other, because both are ways of knowing a person: a
 * friendship row can be missing while the conversation is not, and a contact can
 * be somebody you have never asked to be friends with. Listing only friends
 * shows an empty panel to somebody who is in a dozen conversations, which is
 * what it used to do.
 *
 * The contact row wins on the name and the face, because it is this account's
 * own and is the same row that fills the chat list. The people already in the
 * call and this account itself are left out: nobody invites themselves.
 */
export const callCandidates = (input: {
  friends: FriendsSnapshot;
  contacts: ChatContact[];
  /**
   * The conversations themselves, because a chat is a person even when there is
   * no contact row for them. Data that has been written on a device rather than
   * through a sign in holds a conversation with a name and no address, and that
   * is the exact case where dropping the row leaves the panel claiming there is
   * nobody to invite while the chat list is full.
   */
  chats?: CallCandidateChat[];
  self: string;
  inCall?: string[];
}): CallCandidate[] => {
  const self = normalizeAddress(input.self);
  const taken = new Set([self, ...(input.inCall ?? []).map(normalizeAddress)]);
  const found = new Map<string, CallCandidate>();

  for (const record of input.friends.friends) {
    const peer = friendPeer(record, self);
    // A friendship row in the snapshot can name this account itself if two
    // devices wrote it from different chairs; it is never a candidate.
    if (!peer || taken.has(peer.email)) continue;
    found.set(peer.email, { ...peer, reachable: true });
  }

  // Keyed by address where there is one, and by the person's own name where there
  // is not, so two address-less rows for the same person are still one row.
  for (const contact of input.contacts) {
    const email = normalizeAddress(contact.peerEmail);
    const name = contact.name?.trim() || "";
    if (email && taken.has(email)) continue;
    const key = email || `name:${name.toLowerCase()}`;
    if (!email && !name) continue;
    found.set(key, {
      email,
      name: name || email,
      avatar: contact.avatar ?? null,
      reachable: Boolean(email) && !taken.has(email),
    });
  }

  for (const chat of input.chats ?? []) {
    const email = normalizeAddress(chat.peerEmail);
    const name = (chat.peerName ?? "").trim();
    if (email && taken.has(email)) continue;
    if (found.has(email || `name:${name.toLowerCase()}`)) continue;
    found.set(email || `name:${name.toLowerCase()}`, {
      email,
      name: name || email,
      avatar: null,
      reachable: Boolean(email),
    });
  }

  return [...found.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
};

const normalizeAddress = (email: string) => email.trim().toLowerCase();

/** Stable id for a pair, so both objects key the same row. */
export const friendshipId = (a: string, b: string) => {
  const one = a.trim().toLowerCase();
  const two = b.trim().toLowerCase();
  return [one, two].sort().join("~");
};

export const MAX_ATTACHMENTS_PER_MESSAGE = 6;
/**
 * The most an inline payload may be, in base64 characters.
 *
 * Only the inline path is bounded by this any more: it is the ceiling on what a
 * single message body and a single stored value can hold, which is a ceiling the
 * object enforces on anything that arrives without an object key beside it.
 *
 * Declared before the byte limits below, because they are worked out from it — see
 * `MAX_INLINE_ATTACHMENT_BYTES`, which used to be a round number that was larger
 * than what this actually allows.
 */
export const MAX_ATTACHMENT_VALUE_CHARS = 900_000;

/**
 * Room for the `data:<type>;base64,` header in front of the base64 itself.
 *
 * Generous on purpose: the longest type a browser produces for a picked file is
 * short, and a ceiling that is off by a few characters is a ceiling that refuses
 * the largest file it is supposed to allow.
 */
const DATA_URL_HEADER_CHARS = 64;

/**
 * How much of a file may still ride along inside the message itself.
 *
 * The ceiling on what a single message body and a single stored value can hold,
 * and the ceiling on what localStorage will hold — which is what an account
 * running entirely on this device has to make do with. It is also where the
 * compressed copy of a picture sits: a few hundred kilobytes, wanted inline so
 * the bubble can draw it before a round trip has finished.
 *
 * Derived from `MAX_ATTACHMENT_VALUE_CHARS` rather than written, because it was
 * written as two megabytes while the path it describes could only ever carry
 * about six hundred and a half: a file between the two was accepted by the picker,
 * read into the page, and then dropped on arrival — the message went out with a
 * file on it that nothing could open. One number, worked out from the limit that
 * is actually enforced, is the only way the two cannot drift apart again.
 */
export const MAX_INLINE_ATTACHMENT_BYTES = Math.floor(
  ((MAX_ATTACHMENT_VALUE_CHARS - DATA_URL_HEADER_CHARS) * 3) / 4,
);
/**
 * The largest file a conversation will carry.
 *
 * Two regimes, and this is whichever one the deployment is actually in. A file
 * either travels inside the message body — base64, decoded by whoever opens the
 * conversation — or it goes to object storage in parts and only a reference
 * travels with the message. The second is worth having: at four gigabytes the
 * first would ask the sender's own browser to hold a five-gigabyte string.
 *
 * What the *storage* can hold is `MAX_BUCKET_FILE_BYTES`, and what this build
 * *offers* is this. They are deliberately different numbers, because the server
 * can accept anything the bucket takes while the client is the one that has to
 * know what to offer. Until a bucket is deployed the offer is the inline ceiling,
 * and `filesTravelInBucket` below is what picks between the two.
 *
 * To move this build to the bucket regime, both of these have to happen together,
 * in one commit:
 *
 *   1. `MESSAGES_FILES` bound to a bucket in `wrangler.json` — an R2 bucket, which
 *      the Cloudflare account has to have R2 switched on for at all.
 *   2. this line raised to `MAX_BUCKET_FILE_BYTES`, which is what flips
 *      `filesTravelInBucket` below and moves the picker, the part size and the
 *      progress bar over in one go.
 *
 * Raising it without the binding does not break quietly: the gateway answers every
 * upload with `attachments-not-configured` and the composer says so.
 */
export const MAX_FILE_BYTES = MAX_INLINE_ATTACHMENT_BYTES;
/**
 * What the bucket can hold: four gigabytes.
 *
 * A limit rather than a round figure because the service's own per-object
 * ceiling is five terabytes across up to ten thousand parts, so this is a choice
 * about what a chat is for rather than a technical wall.
 */
export const MAX_BUCKET_FILE_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 4000;
/**
 * Whether a file has to go somewhere to be sent.
 *
 * This is the one switch between the two regimes, and it is a constant rather
 * than a runtime probe so that a build says out loud what it can do. It follows
 * from the deployment: a build whose worker has been given the `MESSAGES_FILES`
 * bucket sets this true, and everything else — the picker's limit, the composer's
 * progress, the part size — follows without touching anything else.
 *
 * Derived rather than written, so raising `MAX_FILE_BYTES` above what can be
 * inlined cannot leave a build that offers a limit it has no way to deliver.
 */
export const filesTravelInBucket = MAX_FILE_BYTES > MAX_INLINE_ATTACHMENT_BYTES;
/**
 * The part an upload is cut into.
 *
 * Object storage refuses a part below five megabytes, so this is not a tuning
 * knob that can be turned down: it is the floor plus headroom, and it puts a
 * four-gigabyte file at a couple of hundred parts rather than the ten thousand
 * the service allows.
 */
export const UPLOAD_PART_BYTES = 16 * 1024 * 1024;
/** The most parts one upload may be cut into, comfortably inside the service cap. */
export const MAX_UPLOAD_PARTS = 256;
/**
 * A file is not usable until its first bytes have arrived, so a part this small
 * or smaller is sent as one whole object rather than as an upload that has to be
 * opened and closed around it.
 */
export const SINGLE_PART_UPLOAD_BYTES = UPLOAD_PART_BYTES;

/**
 * Where an uploaded file lands, derived rather than chosen.
 *
 * The account's own name is hashed into the path and the rest is a nonce the
 * sender picked, which is what makes this the whole authorisation story for an
 * upload: the gateway recomputes the key from the session it has already
 * verified, so an upload can only ever be written inside the namespace of the
 * account performing it. There is no registry of open uploads to check a token
 * against, and nothing for a client to forge.
 *
 * The reader's side of the story is separate and lives in the object: an
 * attachment can only be fetched by an account that holds a record naming it, so
 * the peer's copy of the record is what lets them read a file stored under the
 * sender's path.
 */
export const attachmentObjectKey = async (email: string, nonce: string) => {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const owner = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `messages/${owner}/${nonce}`;
};

/** The shape an object key has to have before the gateway will act on one. */
export const ATTACHMENT_KEY_PATTERN = /^messages\/[0-9a-f]{64}\/[0-9a-zA-Z_-]{16,80}$/;

export const isAttachmentObjectKey = (value: unknown): value is string =>
  typeof value === "string" && ATTACHMENT_KEY_PATTERN.test(value);

/**
 * The three ways a client can say "give me some of this file", collapsed into the
 * two the bucket understands.
 *
 * Answered properly because a browser sends one whether or not anybody meant to
 * play the file: a video element asks for its first chunk, seeks by asking for
 * another, and a download that ignored all of it would pull four gigabytes
 * before showing the first frame. `null` means the whole file, which is what a
 * request without a range means, and "unsatisfiable" is the answer a 416 carries.
 */
export const parseByteRange = (
  header: string | null,
  size: number,
): { offset: number; length: number } | "unsatisfiable" | null => {
  if (!header || !size) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (rawStart === "" && rawEnd === "") return "unsatisfiable";

  if (rawStart === "") {
    // A suffix: the last N bytes, which is how a player asks for its tail.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return "unsatisfiable";
  const requestedEnd = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(requestedEnd)) return "unsatisfiable";
  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1 };
};

/** The header a partial answer has to carry, or the 416 that replaces one. */
export const contentRangeHeader = (range: { offset: number; length: number }, size: number) =>
  `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`;

/** What opening an upload answers with. */
export type UploadSession = {
  /** Opaque handle the service gave the upload; meaningless without the nonce. */
  uploadId: string;
  /** How big each part should be, so both ends cut the file the same way. */
  partBytes: number;
  /** Parts the file will be cut into, which is what the client counts against. */
  parts: number;
};

/** One finished part, as the service wants it back to close the upload. */
export type UploadedPart = { partNumber: number; etag: string };
/**
 * The most a display name can be. The object cuts a longer one rather than
 * refusing it, so the field that writes the name stops here: a name that is
 * silently shortened on save reads as the app losing what was typed.
 */
export const MAX_NAME_LENGTH = 80;
export const ONLINE_WINDOW_MS = 70 * 1000;
export const MAX_CHATS = 60;
export const MAX_MESSAGES_PER_CHAT = 300;
/** A call log is a list of evenings, not a transcript: this is plenty. */
export const MAX_CALLS_PER_CHAT = 60;
/** Guardrail for a single Durable Object storage value. */
/**
 * How a call turned out, from the one who put the phone down.
 *
 * `declined` and `missed` read the same to both sides, but they are kept apart
 * because the difference matters to the history: one was refused on purpose and
 * the other was never picked up.
 */
export type CallOutcome = "completed" | "missed" | "declined" | "cancelled" | "busy" | "failed";

/**
 * One call, written once and read by both sides.
 *
 * Nothing here is written from a point of view. `caller` and `endedBy` are
 * addresses, so the same record reads "you called" on one phone and "they
 * called" on the other without either side having to keep its own copy in step.
 */
export type CallRecord = {
  callId: string;
  /** Whose button started it. */
  caller: string;
  starts: "audio" | "video";
  /** When it began, and when it stopped. */
  at: number;
  endedAt: number;
  /** Zero for a call that was never answered. */
  durationMs: number;
  outcome: CallOutcome;
  /** Whose phone went down first. */
  endedBy: string;
};

/** What one reader should be told about a call that is in the history. */
export type CallSummary = {
  /** How it reads, already folded for the reader: a decline is a missed call. */
  kind: "completed" | "missed" | "cancelled" | "busy" | "failed";
  direction: "incoming" | "outgoing";
  starts: "audio" | "video";
  durationMs: number;
  /** True when the call wants a red mark next to it. */
  missed: boolean;
  endedByMe: boolean;
};

const sameAddress = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * Reads one record from one side's chair.
 *
 * A call that was cancelled before it was answered is a cancellation for the
 * person who cancelled it and a missed call for the person who did not get to
 * answer, and that difference is the whole reason the record keeps the address
 * of the person who hung up.
 */
export const callSummary = (record: CallRecord, viewer: string): CallSummary => {
  const direction = sameAddress(record.caller, viewer) ? "outgoing" : "incoming";
  const endedByMe = sameAddress(record.endedBy, viewer);
  const kind =
    record.outcome === "cancelled" && !endedByMe
      ? "missed"
      : record.outcome === "declined"
        ? "missed"
        : record.outcome;
  return {
    kind,
    direction,
    starts: record.starts,
    durationMs: Math.max(0, Math.round(record.durationMs)),
    missed: kind === "missed",
    endedByMe,
  };
};

/**
 * What a call that just ended should say.
 *
 * The only thing that has to be right is the difference between a call that ran
 * and a call nobody picked up, so that is what the rules turn on.
 */
export const callOutcomeFor = (input: {
  /** Whether the two sides ever got connected. */
  answered: boolean;
  /** The reason the call ended, as it travelled between the two phones. */
  reason: string;
  endedByMe: boolean;
}): CallOutcome => {
  if (input.reason === "failed") return "failed";
  if (input.reason === "busy") return "busy";
  if (input.reason === "ended") return "missed";
  if (input.answered) return "completed";
  if (input.reason === "declined") return "declined";
  // Nobody picked up, and the phone that stopped ringing was mine: from here
  // that is a call I gave up on, not one that was missed.
  if (input.reason === "hangup" && input.endedByMe) return "cancelled";
  return "missed";
};

/** `0:42`, or `1:02:03` for the calls that outlast a minute counter. */
export const callDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (part: number) => String(part).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

// ------------------------------------------------------- guilds and channels

/**
 * A server, as one row mirrored into every member's object.
 *
 * Same mirroring rule as a friendship: the identical id is written into each
 * participant's own Durable Object, so an account only ever reads from its own
 * object and both sides converge without a shared store.
 */
export type Guild = {
  id: string;
  name: string;
  /** Two letters, drawn into the roundel on the far left. */
  initials: string;
  /** Drives the roundel's ring, so two servers are told apart at a glance. */
  accent: string;
  /** Address of the owner, who is the only one who may rename or delete it. */
  ownerEmail: string;
  createdAt: number;
};

export type GuildRole = "owner" | "member";

/** One person's place in a server, carried on the mirrored member row. */
export type GuildMember = {
  email: string;
  /** The server they are in, because an account is in more than one. */
  guildId: string;
  name: string;
  avatar: string | null;
  role: GuildRole;
  joinedAt: number;
};

/**
 * A text channel: a room several people post in, rather than a conversation
 * between two of them.
 *
 * The id is namespaced with the guild it belongs to (`<guildId>-t-<n>`) so one
 * account can hold several servers without their channel ids colliding, and so a
 * row cannot be moved between servers by accident.
 */
export type GuildTextChannel = {
  id: string;
  guildId: string;
  /** Which sort of channel this row is, read back rather than guessed from the id. */
  kind: "text";
  name: string;
  topic: string;
  order: number;
};

/**
 * A voice channel: a place people are connected to, rather than a call they
 * place. The id is the session id as well, which is what lets a late joiner be
 * handed the same roster the people already there are holding.
 */
export type GuildVoiceChannel = {
  id: string;
  guildId: string;
  kind: "voice";
  name: string;
  order: number;
};

export type GuildChannels = {
  text: GuildTextChannel[];
  voice: GuildVoiceChannel[];
};

export type GuildSnapshot = {
  guilds: Guild[];
  members: GuildMember[];
  channels: GuildChannels;
};

/** One server with its people and its channels, which is what a view reads. */
export type GuildView = Guild & {
  members: GuildMember[];
  textChannels: GuildTextChannel[];
  voiceChannels: GuildVoiceChannel[];
};

/**
 * What somebody is doing inside a voice channel, as the object holds it.
 *
 * This is live state and never persisted as a room: it is rebuilt from the
 * channel's session every time an object is asked who is there, and a member who
 * closes their laptop is simply absent from the next roster.
 */
export type VoicePresence = {
  email: string;
  name: string;
  avatar: string | null;
  /** Their own microphone, as their phone reports it. */
  mic: boolean;
  camera: boolean;
  screen: boolean;
  screenSurface: ScreenSurface;
  /**
   * Which screen it is, as the browser named it: "Екран 2", a window title, a
   * tab.
   *
   * It is the one thing that says *what* is being shared rather than that
   * something is, and a room showing "Екран 2" is not a room showing
   * "На цял екран". The browser offers to say it nowhere else.
   */
  screenLabel?: string;
  /**
   * Set by somebody else. A server can silence a member, and the phone that owns
   * the microphone is the only one that can actually stop sending it.
   */
  mutedBy?: string;
  /**
   * Left the channel and has not been removed by anybody.
   *
   * A member who mutes their own microphone can turn it back on; one somebody
   * else muted cannot, and this is the flag that says which of the two happened.
   */
  serverMuted: boolean;
  deafened: boolean;
  /** When they arrived, which is what fixes who offers the connection to whom. */
  order: number;
  /** Gone, kept briefly so a phone can show the tile fading rather than snapping. */
  status: "active" | "left";
  joinedAt: number;
};

/** The roster of a voice channel, as the object holds it. */
export type VoiceRoster = {
  channelId: string;
  guildId: string;
  /** Who owns the server, who is the only one who may move or silence people. */
  ownerEmail: string;
  presences: VoicePresence[];
};

export type VoiceSignalKind =
  /** Wants to be connected to a channel. Carries no roster: the object sends it. */
  | "voice-join"
  /** Has arrived; carries the roster so this phone knows who to connect to. */
  | "voice-roster"
  /** Left, on purpose or because the connection went. */
  | "voice-leave"
  /** This person's own media switches changed. */
  | "voice-state"
  /** Somebody was silenced, or their silence was lifted, by the server owner. */
  | "voice-mute"
  /** Somebody was removed from the channel by the server owner. */
  | "voice-kick"
  /** Shared with the whole channel. */
  | "offer"
  | "answer"
  | "candidate"
  | "renegotiate";

/**
 * One step of the voice handshake.
 *
 * The WebRTC frames are the same ones a call uses and they are addressed the same
 * way, so the mesh below a voice channel is the mesh below a call. What is added
 * is the channel the frame belongs to: two people can be connected for one call
 * and one channel at the same time, and a frame with no channel on it is not
 * routed.
 */
export type VoiceSignal = {
  kind: VoiceSignalKind;
  channelId: string;
  /** Stamped by the object, never taken from the client. */
  from?: string;
  /** Named it goes to one person; empty it goes to everybody else in the channel. */
  to?: string;
  roster?: VoiceRoster;
  /** On `voice-state`: the sender's switches. */
  mic?: boolean;
  camera?: boolean;
  screen?: boolean;
  surface?: ScreenSurface;
  /** On `voice-state`: which screen, as the browser named it. */
  screenLabel?: string;
  deafened?: boolean;
  /** On `voice-mute` and `voice-kick`: whose microphone, and who ordered it. */
  target?: string;
  /** On `voice-mute`: false lifts a silence somebody else applied. */
  muted?: boolean;
  description?: unknown;
  candidate?: unknown;
};

export const MAX_GUILDS_PER_ACCOUNT = 30;
export const MAX_GUILD_MEMBERS = 200;
/**
 * How many friends walk in with a new server, and how many of them at a time.
 *
 * The first is a ceiling rather than a target: a person with four hundred friends
 * does not get a server with four hundred people in it that nobody chose to be in,
 * and a membership is not a thing to hand out silently past a number. The second
 * exists because fifty invitations are fifty fan-outs — a write into the owner's
 * object, into every member's object, and the server itself into each newcomer's —
 * and doing all of those at once is a request that times out halfway, which is a
 * server with an arbitrary number of its invited people in it.
 */
export const MAX_AUTO_JOIN_FRIENDS = 50;
export const AUTO_JOIN_BATCH = 6;
export const MAX_TEXT_CHANNELS_PER_GUILD = 50;
export const MAX_VOICE_CHANNELS_PER_GUILD = 20;
export const MAX_CHANNEL_MESSAGES = 200;
/**
 * A mesh of one stream each way per pair does not scale, so a channel is capped
 * well below the number of people who could technically fit in the room.
 */
export const MAX_VOICE_PRESENCES = 8;

const slugPart = (value: string, max: number) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);

/**
 * The two letters a server's roundel carries.
 *
 * The first letter of the first two words, which is what a face-shaped server
 * icon does, and not `initialsForName`'s first-and-last: "Todor Khristov Gaming"
 * is a TK and not a TG, and every server in the rail has to be told apart at a
 * glance rather than read.
 */
export const guildInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "?").slice(0, 2).toUpperCase();
  return `${(words[0] ?? "")[0] ?? ""}${(words[1] ?? "")[0] ?? ""}`.toUpperCase();
};

/** The channel id for a name a person typed, namespaced by the server it is in. */
export const channelIdFor = (guildId: string, kind: "t" | "v", name: string) =>
  `${guildId}-${kind}-${slugPart(name, 32) || "channel"}`;

/** Whether a channel id belongs to the server it is being used under. */
export const channelBelongsToGuild = (channelId: string, guildId: string) =>
  channelId.startsWith(`${guildId}-`);

/**
 * Who owns a server, for the one decision that has to be checked on the object
 * rather than in the view: whether a person may silence or remove somebody.
 */
export const ownsGuild = (guild: Guild | undefined, email: string) =>
  Boolean(guild) && normalizeAddress(guild?.ownerEmail ?? "") === normalizeAddress(email);

/**
 * A voice channel's occupants, in the order the mesh is built from.
 *
 * The address is the last tiebreaker on purpose. Two objects can be handed the
 * same two people in a different array order, and whoever they build the mesh
 * from decides which side offers — so a tie that falls back on array position
 * gives two phones opposite answers and both offer at once, which is the one
 * thing that reliably breaks a call.
 */
export const liveVoicePresences = (roster: VoiceRoster | undefined) =>
  (roster?.presences ?? [])
    .filter((entry) => entry.status === "active")
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.joinedAt - right.joinedAt ||
        normalizeAddress(left.email).localeCompare(normalizeAddress(right.email)),
    );

/** True while the voice channel has somebody in it, which is what tints it. */
export const voiceChannelBusy = (channelId: string, roster: VoiceRoster | undefined) =>
  roster?.channelId === channelId && liveVoicePresences(roster).length > 0;

/** The channel a member is sitting in, or null when they are in none. */
export const voiceChannelOf = (
  channels: string[],
  roster: VoiceRoster | undefined,
  email: string,
) => {
  if (!roster) return null;
  const self = normalizeAddress(email);
  if (!liveVoicePresences(roster).some((entry) => normalizeAddress(entry.email) === self))
    return null;
  return channels.includes(roster.channelId) ? roster.channelId : null;
};

/** Groups the mirrored rows into the one server a view is about to draw. */
export const guildView = (
  guild: Guild,
  snapshot: Pick<GuildSnapshot, "members" | "channels">,
): GuildView => ({
  ...guild,
  members: snapshot.members
    .filter((member) => member.guildId === guild.id)
    .sort((left, right) => left.joinedAt - right.joinedAt),
  textChannels: [...snapshot.channels.text]
    .filter((channel) => channel.guildId === guild.id)
    .sort((left, right) => left.order - right.order),
  voiceChannels: [...snapshot.channels.voice]
    .filter((channel) => channel.guildId === guild.id)
    .sort((left, right) => left.order - right.order),
});

/** The calls of a conversation, oldest first, with the newest at the end. */
export const callRecords = (chat: MessageChat | undefined) => chat?.calls ?? [];

/** The moment a thread last had something in it: a message or a call. */
export const chatLastActivityAt = (chat: MessageChat | undefined) => {
  const lastMessage = chat?.messages.at(-1)?.at ?? 0;
  const lastCall = callRecords(chat).at(-1)?.endedAt ?? 0;
  return Math.max(chat?.updatedAt ?? 0, lastMessage, lastCall);
};

export const isOnlineAt = (lastSeenAt: number, now: number = Date.now()) =>
  lastSeenAt > 0 && now - lastSeenAt < ONLINE_WINDOW_MS;

/**
 * The messages a reader may see. A deleted row keeps its place in the thread so
 * the two objects stay in step, but it is skipped by every count and preview.
 */
export const isVisibleMessage = (message: ChatMessage) => !message.deletedAt;

export const visibleMessages = (chat: MessageChat | undefined) =>
  (chat?.messages ?? []).filter(isVisibleMessage);

/** Unread counts a tombstone out: a deleted message is no longer waiting. */
export const unreadIn = (chat: MessageChat | undefined) =>
  (chat?.messages ?? []).filter(
    (message) => !message.fromMe && message.status !== "read" && isVisibleMessage(message),
  ).length;

/** Every participant can delete and edit only what they themselves sent. */
export const canManageMessage = (message: ChatMessage) =>
  message.fromMe && isVisibleMessage(message);

/**
 * Whether a string is an emoji worth storing.
 *
 * Not a check that it *is* an emoji — that is a dictionary, and a dictionary of
 * unicode would refuse the next one that ships before the app is updated. It is a
 * check that it is a short, non-empty run of characters that is not a control or a
 * letter, which is what keeps a paste of prose out of a row of little buttons.
 */
export const isUsableReaction = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if ([...trimmed].length > MAX_REACTION_CODE_POINTS) return false;
  // Controls, joiners and spaces are what a pasted paragraph is made of; a letter is
  // the other half of the same test, and it is what keeps prose out of a row of
  // little buttons.
  return !/[\p{Cc}\p{Cf}\p{Zs}\p{L}]/u.test(trimmed);
};

/**
 * Adds or removes one person's reaction.
 *
 * `on` rather than a toggle, and the reason is the mirror. A reaction is written
 * into both objects, so the copy can arrive twice — a retried request, a reconnect
 * that resends it — and a toggle would answer the second copy by taking the reaction
 * off again. Setting the state it was asked for is the same thing on the second
 * arrival as on the first, which is what a change that is mirrored has to be.
 *
 * Returns the list to store, or nothing when the press changes nothing — a message
 * that is not yet in front of the reader, an emoji that is not usable, a row that
 * already carries eight, or a press that asks for what is already there.
 */
export const setReaction = (
  message: ChatMessage,
  emoji: string,
  email: string,
  on: boolean,
): MessageReaction[] | null => {
  if (!isVisibleMessage(message)) return null;
  const who = normalizeAddress(email);
  if (!who) return null;

  const key = emoji.trim();
  if (!isUsableReaction(key)) return null;

  const current = message.reactions ?? [];
  const existing = current.find((row) => row.emoji === key);
  const mine = existing?.by.includes(who) ?? false;
  // Already in the state it was asked for: nothing to write, and a write here would
  // bump the revision and wake every device for no change at all.
  if (mine === on) return null;

  if (!on) {
    // The last person to take an emoji off is the one who empties the row, so a
    // message nobody has reacted to carries no field at all.
    return current
      .map((row) => (row.emoji === key ? { ...row, by: row.by.filter((one) => one !== who) } : row))
      .filter((row) => row.by.length > 0);
  }

  if (!existing && current.length >= MAX_REACTIONS_PER_MESSAGE) return null;
  if ((existing?.by.length ?? 0) >= MAX_REACTIONS_PER_EMOJI) return null;

  return existing
    ? current.map((row) => (row.emoji === key ? { ...row, by: [...row.by, who] } : row))
    : [...current, { emoji: key, by: [who] }];
};

/**
 * Whether this account has already put this emoji on the message.
 *
 * The question a press asks before it decides which way it goes, asked in one place
 * because the composer and the composer of an optimistic update must not disagree
 * about it.
 */
export const isMineOn = (message: ChatMessage, emoji: string, email: string): boolean => {
  const who = normalizeAddress(email);
  const key = emoji.trim();
  return (message.reactions ?? []).some((row) => row.emoji === key && row.by.includes(who));
};

/**
 * The same change described the way a person means it: a press of an emoji that is
 * already yours takes it off, a press of one that is not puts it on.
 *
 * Used by the composer, which is the one place that has a row in front of it and can
 * answer the question without asking the object first.
 */
export const toggleReaction = (
  message: ChatMessage,
  emoji: string,
  email: string,
): MessageReaction[] | null => setReaction(message, emoji, email, !isMineOn(message, emoji, email));

/**
 * The reactions as the row of buttons shows them: how many, and whether this
 * account is one of them.
 *
 * Ordered by count and then by when the first one landed, so the row does not
 * reshuffle as people press, and the emoji the reader chose themselves stays put
 * rather than jumping because somebody else reacted too.
 */
export const reactionSummary = (
  message: ChatMessage,
  email: string,
): Array<{ emoji: string; count: number; mine: boolean }> => {
  const who = normalizeAddress(email);
  return (message.reactions ?? [])
    .filter((row) => row.by.length > 0)
    .map((row) => ({ emoji: row.emoji, count: row.by.length, mine: row.by.includes(who) }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
};

export const initialsForName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "?").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "")[0] ?? ""}${(parts.at(-1) ?? "")[0] ?? ""}`.toUpperCase();
};

export const truncate = (value: string, max: number) => value.slice(0, max);

export const createMessageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
