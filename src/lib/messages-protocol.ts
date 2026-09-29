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
  /** True when the payload is present in the Durable Object. */
  stored: boolean;
  /**
   * Inline preview, only ever populated on the device that composed the
   * message. The object strips it out and serves the payload from
   * `/api/messages/attachment` instead.
   */
  dataUrl?: string;
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
};

/** The two changes an author may make to a message they sent. */
export type MessageChangeAction = "edit" | "delete";

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
};

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
  /** Base64 payload, consumed once and moved out of the chat record. */
  dataUrl: string;
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
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 4000;
export const ONLINE_WINDOW_MS = 70 * 1000;
export const MAX_CHATS = 60;
export const MAX_MESSAGES_PER_CHAT = 300;
/** A call log is a list of evenings, not a transcript: this is plenty. */
export const MAX_CALLS_PER_CHAT = 60;
/** Guardrail for a single Durable Object storage value. */
export const MAX_ATTACHMENT_VALUE_CHARS = 900_000;

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
