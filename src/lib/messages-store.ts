import {
  IDLE_CALL,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CALLS_PER_CHAT,
  MAX_TEXT_LENGTH,
  callCandidates,
  callOutcomeFor,
  canManageMessage,
  createMessageId,
  friendshipId,
  initialsForName,
  isOnlineAt,
  normalizePresenceStatus,
  isMineOn,
  setReaction,
  shouldOffer,
  type CallMedia as CallMediaKind,
  type CallCandidate,
  type CallParticipant,
  type CallRecord,
  type CallRoster,
  type ScreenSurface,
  type CallSignal,
  type CallState,
  type ChatContact,
  type ChatMessage,
  type DirectoryEntry,
  type FriendsSnapshot,
  type GuildSnapshot,
  type GuildView,
  type IncomingAttachment,
  type MessageAttachment,
  type MessageChat,
  type MessagesProfile,
  type PresenceStatus,
  type MessagesSnapshot,
  type MessageStatus,
  type TypingState,
  type VoicePresence,
  type VoiceRoster,
  type VoiceSignal,
  channelIdFor,
  emptyGuildSnapshot,
  guildView,
  liveVoicePresences,
  liveTyping,
  TYPING_TTL_MS,
} from "./messages-protocol";
import { MessagesApiError, messagesApi } from "./messages-api";
import { AttachmentUploadError, uploadAttachment } from "./messages-upload";
import { CallMedia, type ScreenQuality } from "./call-media";
import { messagesLocal } from "./messages-local";
import { parseStoredJson, storageGet, storageRemove, storageSet } from "./local-persistence";

/**
 * Client-side store for the cloud-backed messages hub.
 *
 * Holds a metadata-only mirror of the server snapshot in localStorage so the UI
 * paints instantly and still works offline, but localStorage is never the source
 * of truth: every mutation is applied optimistically and then pushed to the
 * Durable Object through an authenticated server function. A websocket pushes
 * changes made on the account's other devices, with polling as a fallback.
 */

export type MessagesStatus = "loading" | "needs-auth" | "ready" | "error" | "offline" | "local";

export type MessagesMode = "cloud" | "local";

export type MessagesData = {
  profile: MessagesProfile;
  contacts: ChatContact[];
  chats: MessageChat[];
};

const emptyFriends = (): FriendsSnapshot => ({
  incoming: [],
  outgoing: [],
  friends: [],
  declined: [],
});

/**
 * The one voice room this device is in.
 *
 * A call and a channel are the same room to a person and two different rooms to
 * the signalling. The view is handed this and draws one thing for both.
 */
export type VoiceRoom = {
  kind: "call" | "channel";
  /** The call id, or the channel id. What the signalling frames are addressed by. */
  id: string;
  /** What the header calls it. */
  label: string;
  presences: VoicePresence[];
};

export type MessagesStoreState = {
  status: MessagesStatus;
  /** `local` means the offline fallback is driving the UI. */
  mode: MessagesMode;
  email: string;
  name: string;
  error: string;
  /** Server reachable. */
  online: boolean;
  /** Live websocket attached. */
  live: boolean;
  data: MessagesData | null;
  friends: FriendsSnapshot;
  /** Directory search hits. */
  people: DirectoryEntry[];
  searching: boolean;
  /** Peers currently composing, per conversation. */
  typing: TypingState[];
  /**
   * Files on their way up, keyed by the message they belong to.
   *
   * Four gigabytes is not a moment, and a send button that does nothing visible
   * for ten minutes reads as a broken app rather than a long wait. The bubble
   * this is keyed by is already on screen, so the progress belongs on it rather
   * than in a toast that would be about something else by the time it appeared.
   */
  uploads: Record<string, UploadProgressRow>;
  /** The call in progress, or idle. */
  call: CallState;
  /**
   * One person's media per participant, keyed by their address.
   *
   * A call with four people is four of these, and the view plays all four: a
   * single stream would mean the last person to speak is the only one heard.
   * Kept out of the persisted state, because a stream is not data.
   */
  remoteStreams: Record<string, unknown>;
  /** What the local camera is sending, for the self view in the call screen. */
  localStream: unknown;
  /**
   * The desktop being shared, as a stream, or null.
   *
   * Kept apart from `localStream` because the microphone stream is unchanged by a
   * share and carries no picture: this is what the sharer's own tile is bound to.
   */
  screenStream: unknown;
  /** The servers this account is in, as mirrored rows. */
  guilds: GuildSnapshot;
  /**
   * The voice channel this account is sitting in, or null.
   *
   * A channel and not a call: it has no status to move between and nobody is
   * rung, because everybody in it is already in it.
   */
  voiceChannelId: string | null;
  /** The voice channel being joined, before its roster arrives. */
  voiceConnectingId: string | null;
  /** Who is in each voice channel, by channel id. */
  voiceRosters: Record<string, VoiceRoster>;
};

const CACHE_PREFIX = "tk-messages-cache:";
const LEGACY_PREFIX = "tk-messages:";
const MIGRATED_PREFIX = "tk-messages-migrated:";
const OUTBOX_PREFIX = "tk-messages-outbox:";

const POLL_MS = 30_000;
const RETRY_MS = 60_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/**
 * How long a call rings before the app gives up on it.
 *
 * `0` means it does not give up on its own, and the call rings until somebody
 * picks it up or the person dialling hangs up. The number it used to carry was
 * chosen so that a call is never left ringing by nobody's decision but the
 * app's; a person asking for a call that rings indefinitely is asking for that
 * to be theirs instead, which is a reasonable thing to ask for.
 *
 * It is not written as a very large number on purpose. `setTimeout` takes a
 * signed 32 bit millisecond count, so anything past 2^31-1 (about 24 days)
 * overflows and fires immediately — a timer set to 100000000000000 ends the call
 * the instant it is armed, which is the opposite of what a large number means.
 */
const RING_TIMEOUT_MS = 0;
/**
 * How long an answered call has to actually connect.
 *
 * Longer than a handshake needs and much shorter than a person's patience: the
 * routes are already gathered by this point, so anything later than this is not
 * a slow network, it is a network that is not going to work.
 */
const CONNECT_TIMEOUT_MS = 25_000;
/**
 * Hard ceiling on the initial handshake. Without this a hung or dropped
 * request would leave the page on the loading screen forever, which is exactly
 * the failure this guard exists to prevent.
 */
const BOOT_TIMEOUT_MS = 12_000;
/** How long a freshly created chat is shielded from being pruned by a sync. */
const PENDING_CHAT_TTL_MS = 60_000;
/** Minimum gap between typing signals for one conversation. */
const TYPING_THROTTLE_MS = 2_500;

const emptyState: MessagesStoreState = {
  status: "loading",
  mode: "cloud",
  email: "",
  name: "",
  error: "",
  online: true,
  live: false,
  data: null,
  friends: emptyFriends(),
  people: [],
  searching: false,
  typing: [],
  uploads: {},
  call: IDLE_CALL,
  remoteStreams: {},
  localStream: null,
  screenStream: null,
  guilds: emptyGuildSnapshot(),
  voiceChannelId: null,
  voiceConnectingId: null,
  voiceRosters: {},
};

const normalize = (email: string) => email.trim().toLowerCase();
const cacheKey = (email: string) => `${CACHE_PREFIX}${normalize(email)}`;
const legacyKey = (email: string) => `${LEGACY_PREFIX}${normalize(email)}`;
const migratedKey = (email: string) => `${MIGRATED_PREFIX}${normalize(email)}`;
const outboxKey = (email: string) => `${OUTBOX_PREFIX}${normalize(email)}`;

/** Rejects with a tagged timeout so callers can treat it as an offline state. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MessagesApiError(0, "timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function describeError(error: unknown): string {
  if (error instanceof MessagesApiError) return error.reason;
  if (error instanceof Error) return error.message;
  return "unknown";
}

export type OutboxEntry = {
  id: string;
  chatId: string;
  peerEmail: string;
  text: string;
  at: number;
  attachments: IncomingAttachment[];
};

/**
 * How far one file has got, as the bubble shows it.
 *
 * Carries the whole of the file's size rather than a fraction because a fraction
 * of four gigabytes is a number nobody can picture, and `1.2 GB of 3.8 GB` is.
 */
export type UploadProgressRow = { name: string; sent: number; total: number };

/** The optimistic row's copy of an attachment: what the bubble can draw right now. */
function previewAttachment(item: IncomingAttachment): MessageAttachment {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    stored: false,
    // Only ever set on the device that composed the message, and only for the
    // small compressed copy of a picture. The server strips it.
    ...(item.dataUrl ? { dataUrl: item.dataUrl } : {}),
  };
}

/**
 * An attachment with its payload taken off.
 *
 * What goes into the outbox and into the message body is this: a name, a size and
 * an id. The outbox is written to localStorage, so a queue entry holding a file
 * handle would be a queue entry that is empty after a reload and claims not to
 * be, which is worse than one that never accepted the file in the first place.
 */
function uploadedAttachment(item: IncomingAttachment): IncomingAttachment {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    ...(item.dataUrl ? { dataUrl: item.dataUrl } : {}),
  };
}

const sanitizeCachedSnapshot = (value: unknown): MessagesData | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const profile = entry["profile"];
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const contacts = Array.isArray(entry["contacts"]) ? (entry["contacts"] as ChatContact[]) : [];
  const chats = Array.isArray(entry["chats"]) ? (entry["chats"] as MessageChat[]) : [];
  return {
    profile: {
      email: normalize(String(p["email"] ?? "")),
      name: String(p["name"] ?? ""),
      about: String(p["about"] ?? ""),
      accent: String(p["accent"] ?? "#1DB954"),
      avatar: typeof p["avatar"] === "string" ? p["avatar"] : null,
      online: Boolean(p["online"]),
      lastSeenAt: Number(p["lastSeenAt"]) || 0,
      status: normalizePresenceStatus(p["status"]),
    },
    contacts,
    chats,
  };
};

type Listener = (state: MessagesStoreState) => void;

/**
 * The messages store.
 *
 * Exported as a class, not only as the singleton, because a call involves two
 * people: a test that only ever holds one side can only check that side. Two
 * instances sharing one cloud are the only way to see a call from both ends.
 */
export class MessagesStore {
  private state: MessagesStoreState = emptyState;
  private listeners = new Set<Listener>();
  private socket: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = BACKOFF_START_MS;
  private syncing = false;
  private syncQueued = false;
  private pendingChats = new Map<string, number>();
  private lastTypingSent = new Map<string, number>();
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private listenersBound = false;
  private outbox: OutboxEntry[] = [];
  private started = false;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private emit(patch: Partial<MessagesStoreState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private cache(next: MessagesData) {
    const email = normalize(next.profile.email || this.state.email);
    if (!email) return;
    // Cached data is metadata only: attachment payloads are served from the
    // object, so keeping copies would bloat localStorage for no benefit.
    storageSet(cacheKey(email), JSON.stringify(next));
  }

  private readCache(email: string): MessagesData | null {
    return sanitizeCachedSnapshot(parseStoredJson<unknown>(storageGet(cacheKey(email)), null));
  }

  private readOutbox(email: string): OutboxEntry[] {
    const parsed = parseStoredJson<unknown>(storageGet(outboxKey(email)), []);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  }

  private writeOutbox(email: string) {
    if (this.outbox.length === 0) storageRemove(outboxKey(email));
    else storageSet(outboxKey(email), JSON.stringify(this.outbox.slice(-100)));
  }

  // ------------------------------------------------------------------ typing

  /**
   * Throttled so a fast typist produces a couple of signals per second rather
   * than one per keystroke, and always stops shortly after the last edit.
   */
  notifyTyping = (chatId: string, peerEmail: string) => {
    if (!peerEmail || this.isLocal() || this.state.status !== "ready") return;
    const now = Date.now();
    const last = this.lastTypingSent.get(chatId) ?? 0;
    if (now - last < TYPING_THROTTLE_MS) return;
    this.lastTypingSent.set(chatId, now);

    // state.typing holds only signals received from the cloud. Writing our own
    // outgoing signal into it would make isPeerTyping light up in the sender's
    // own header, so the indicator is driven purely by the relayed echo.
    void messagesApi.typing({ chatId, peerEmail, typing: true });
  };

  stopTyping = (chatId: string, peerEmail: string) => {
    if (!peerEmail || this.isLocal()) return;
    this.lastTypingSent.delete(chatId);
    // Our own stop does not cancel a signal the peer is currently sending, so
    // received state is left alone; the relay echo and the TTL clear it.
    void messagesApi.typing({ chatId, peerEmail, typing: false });
  };

  /** True when the given peer is composing in this conversation. */
  isPeerTyping = (chatId: string) => this.state.typing.some((entry) => entry.chatId === chatId);

  // ------------------------------------------------------------- lifecycle

  /**
   * Falls back to the device-local store so the UI is never a dead end. The
   * cloud is still retried in the background; `promoteToCloud` takes over as
   * soon as a sync succeeds again.
   */
  private enterLocalMode(reason: string) {
    const data = messagesLocal.read();
    this.stopSocket();
    this.emit({
      status: "local",
      mode: "local",
      online: false,
      live: false,
      error: reason,
      data,
    });
  }

  start = async () => {
    if (this.started) return;
    this.started = true;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.emit({ online: false });
    }

    // The handshake is wrapped end to end: whatever the gateway does, the store
    // must always leave the "loading" state, otherwise the page dead-ends on
    // the splash screen.
    try {
      const session = await withTimeout(messagesApi.session(), BOOT_TIMEOUT_MS);
      if (!session.ok) {
        this.emit({ status: "needs-auth" });
        this.startTimers();
        return;
      }

      const cached = this.readCache(session.email);
      this.outbox = this.readOutbox(session.email);
      this.emit({
        status: cached ? "ready" : "loading",
        mode: "cloud",
        email: session.email,
        name: session.name,
        data: cached,
      });

      // The friends are asked for on their own, and straight away, rather than
      // as the tail of the sync below: the snapshot carries the conversations
      // and the contacts, so a friends request that is slow or that fails would
      // otherwise leave the account looking like it has nobody, while its whole
      // chat list is on screen.
      void this.refreshFriends();

      await this.sync();
      await this.migrateLegacy(session.email);
      this.connectSocket();
    } catch (error) {
      const cached = this.state.data;
      if (error instanceof MessagesApiError && error.isUnauthorized) {
        this.emit({ status: "needs-auth" });
      } else if (cached) {
        this.emit({ status: "offline", mode: "cloud", online: false, error: "offline" });
      } else {
        this.enterLocalMode(describeError(error));
      }
    } finally {
      this.startTimers();
    }
  };

  /** Explicitly starts the offline store (used by the "continue offline" CTA). */
  goLocal = () => {
    this.stop();
    messagesLocal.markUnlocked();
    this.started = false;
    this.enterLocalMode("local");
    this.startTimers();
  };

  /** Re-attempts the cloud from local mode and hands control back on success. */
  promoteToCloud = async () => {
    this.emit({ status: "loading", mode: "cloud", error: "" });
    this.started = false;
    this.stop();
    await this.start();
  };

  private stopSocket() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  stop = () => {
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pollTimer = null;
    this.retryTimer = null;
    if (this.typingTimer) clearInterval(this.typingTimer);
    this.typingTimer = null;
    this.socket?.close();
    this.socket = null;
    this.emit({ live: false });
  };

  /** Full teardown, including in-memory state. Used by tests and sign-out. */
  reset = () => {
    this.stop();
    this.state = { ...emptyState };
    this.syncing = false;
    this.backoff = BACKOFF_START_MS;
    this.outbox = [];
    this.pendingChats.clear();
    this.lastTypingSent.clear();
    // The media layer is built from the browser's own APIs, so a reset has to
    // drop it: a session that started before a permission or a device existed
    // would otherwise keep answering from the state it was built with.
    this.media?.stop();
    this.media = null;
    this.localStream = null;
    this.remoteStreams = {};
    this.pendingOffers.clear();
    this.loggedCalls.clear();
  };

  private startTimers() {
    // Both timers are rebuilt on every start(), so the previous ones must go or
    // a re-login or a cloud retry would stack duplicate intervals.
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.typingTimer) clearInterval(this.typingTimer);
    // Local mode keeps a slower heartbeat only to detect the cloud coming back.
    this.pollTimer = setInterval(
      () => {
        // Expire stale typing signals so a closed tab cannot leave a stuck bubble.
        const live = liveTyping(this.state.typing);
        if (live.length !== this.state.typing.length) this.emit({ typing: live });

        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (this.state.mode === "local") {
          if (this.state.online) return;
          void this.promoteToCloud();
          return;
        }
        void this.sync();
      },
      this.state.mode === "local" ? 15_000 : POLL_MS,
    );

    if (typeof window === "undefined") return;
    // Bound once per page: startTimers can run again after a re-login or a
    // retry, and re-adding the listeners would fire each handler N times.
    if (!this.listenersBound) {
      this.listenersBound = true;
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
      document.addEventListener("visibilitychange", this.handleVisibility);
    }

    // A safety net for the indicator: even without a push, it clears itself.
    this.typingTimer = setInterval(() => {
      const live = liveTyping(this.state.typing);
      if (live.length !== this.state.typing.length) this.emit({ typing: live });
    }, 1_500);
  }

  private handleOnline = () => {
    this.emit({ online: true });
    if (this.state.mode === "local") {
      void this.promoteToCloud();
      return;
    }
    // A friendship accepted on a phone while this one was asleep reaches it
    // here, without waiting for a full sync to be worth something.
    void this.refreshFriends();
    void this.sync();
    this.connectSocket();
  };

  private handleOffline = () => this.emit({ online: false });

  private handleVisibility = () => {
    if (document.visibilityState === "visible") void this.sync();
  };

  // ------------------------------------------------------------------ auth

  signIn = async (email: string, password: string) => {
    // A rejected password comes back as a 401, which the api layer raises, so it
    // must be caught here or the unlock screen would fail silently.
    let result: Awaited<ReturnType<typeof messagesApi.authenticate>>;
    try {
      result = await messagesApi.authenticate(email, password);
    } catch (error) {
      const reason =
        error instanceof MessagesApiError
          ? error.reason === "network"
            ? "network"
            : "invalid-credentials"
          : "invalid-credentials";
      return { ok: false as const, reason };
    }

    if (!result.ok) {
      return { ok: false as const, reason: result.reason };
    }
    this.state = emptyState;
    this.started = false;
    this.stop();
    await this.start();
    return { ok: true as const, email: result.email, name: result.name };
  };

  /**
   * Exchanges credentials for the HttpOnly messages session.
   *
   * Called right after the site login so signing in on a new device never asks
   * for the password twice. Failure is non-fatal: the messages page falls back
   * to its own unlock screen.
   */
  establishSession = async (email: string, password: string) => {
    try {
      const result = await messagesApi.authenticate(email, password);
      if (result.ok) {
        this.started = false;
        await this.start();
        return { ok: true as const };
      }
    } catch {
      // Swallowed on purpose: this only pre-warms the messages session.
    }
    return { ok: false as const };
  };

  signOut = async () => {
    try {
      await messagesApi.logout();
    } catch {
      // Clearing local state matters more than the round trip succeeding.
    }
    const email = this.state.email;
    this.stop();
    this.state = { ...emptyState, status: "needs-auth" };
    this.listeners.forEach((listener) => listener(this.state));
    if (email) {
      storageRemove(cacheKey(email));
      storageRemove(outboxKey(email));
    }
  };

  retry = async () => {
    this.state = { ...this.state, status: "loading", error: "" };
    this.started = false;
    await this.start();
  };

  // ------------------------------------------------------------------ sync

  sync = async () => {
    if (this.syncing || this.state.status === "needs-auth") {
      // A live push arrived while a sync was in flight. Remember it so the
      // change is not silently dropped until the next poll.
      this.syncQueued = true;
      return;
    }
    if (this.state.mode === "local") {
      const data = messagesLocal.read();
      this.emit({ data, status: "local", online: false });
      return;
    }
    this.syncing = true;
    try {
      const result = await withTimeout(messagesApi.sync(), BOOT_TIMEOUT_MS);
      if (!result.ok) {
        if (result.reason === "unauthorized") {
          this.emit({ status: "needs-auth" });
        } else {
          this.emit({ online: false, status: this.state.data ? "offline" : "error" });
        }
        return;
      }
      if (!this.applySnapshot(result.snapshot)) return;
      this.emit({ online: true, status: "ready", mode: "cloud", error: "" });
      await this.refreshFriends();
      await this.uploadLocalQueue();
      await this.flushOutbox();
    } catch (error) {
      if (error instanceof MessagesApiError && error.isUnauthorized) {
        this.emit({ status: "needs-auth" });
        return;
      }
      // Cloud unreachable: degrade instead of showing a dead end.
      if (this.state.data) {
        this.emit({
          online: false,
          status: "offline",
          mode: "cloud",
          error: describeError(error),
        });
      } else {
        this.enterLocalMode(describeError(error));
      }
    } finally {
      this.syncing = false;
      if (this.syncQueued) {
        // A push landed mid-sync; pick it up immediately so real-time delivery
        // does not degrade to waiting for the poll.
        this.syncQueued = false;
        void this.sync();
      }
    }
  };

  /** Returns false when the payload was rejected, after switching to local mode. */
  private applySnapshot(snapshot: MessagesSnapshot): boolean {
    // The gateway is the trust boundary for the payload shape: a malformed or
    // unexpected response must degrade, never crash the store.
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !snapshot.profile ||
      !Array.isArray(snapshot.contacts) ||
      !Array.isArray(snapshot.chats)
    ) {
      this.enterLocalMode("invalid-snapshot");
      return false;
    }

    const now = Date.now();
    const pendingIds = new Set([
      ...this.outbox.map((entry) => entry.chatId),
      ...messagesLocal.pending().map((entry) => entry.chatId),
    ]);
    const cloudIds = new Set(snapshot.chats.map((chat) => chat.id));

    // Never drop a conversation that has not landed in the cloud yet: either it
    // still has unsent messages, or it was just created and is being persisted.
    // Otherwise a sync landing in that window makes the chat disappear.
    const self = this.state.data?.chats ?? [];
    const localOnly = self.filter((chat) => {
      if (cloudIds.has(chat.id)) return false;
      if (pendingIds.has(chat.id)) return true;
      const awaitedAt = this.pendingChats.get(chat.id);
      if (awaitedAt === undefined) return false;
      if (now - awaitedAt > PENDING_CHAT_TTL_MS) {
        this.pendingChats.delete(chat.id);
        return false;
      }
      return true;
    });

    // Anything the cloud does know about no longer needs protecting.
    for (const id of cloudIds) this.pendingChats.delete(id);

    const next: MessagesData = {
      profile: {
        ...snapshot.profile,
        email: normalize(snapshot.profile.email || this.state.email),
        online: snapshot.profile.lastSeenAt > 0 && isOnlineAt(snapshot.profile.lastSeenAt, now),
      },
      contacts: snapshot.contacts.map((contact) => ({
        ...contact,
        online: isOnlineAt(contact.lastSeenAt, now),
      })),
      chats: [...snapshot.chats, ...localOnly].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      }),
    };
    this.emit({ data: next });
    this.cache(next);
    // Converged typing state, so a device that just joined also renders it.
    this.emit({ typing: liveTyping(snapshot.typing ?? [], now) });
    // Servers are mirrored rows rather than part of the conversation cache, so
    // they are read straight off the snapshot. An older object has none, which
    // reads as "in no servers" rather than as a crash.
    this.emit({ guilds: snapshot.guilds ?? emptyGuildSnapshot() });
    return true;
  }

  /**
   * One-shot lift of the old device-local conversations into the cloud. Runs
   * only while the legacy key is still present, so a second device never
   * re-imports.
   */
  private migrateLegacy = async (email: string) => {
    if (storageGet(migratedKey(email))) return;
    const raw = storageGet(legacyKey(email));
    if (!raw) {
      storageSet(migratedKey(email), "1");
      return;
    }

    const legacy = parseStoredJson<{ contacts?: unknown[]; chats?: unknown[] }>(raw, {});
    const contacts = Array.isArray(legacy.contacts) ? legacy.contacts : [];
    const chats = Array.isArray(legacy.chats) ? legacy.chats : [];

    if (contacts.length === 0 && chats.length === 0) {
      storageSet(migratedKey(email), "1");
      storageRemove(legacyKey(email));
      return;
    }

    const result = await messagesApi.import({ contacts, chats });
    if (result.ok) {
      storageSet(migratedKey(email), "1");
      storageRemove(legacyKey(email));
      await this.sync();
    }
  };

  // ------------------------------------------------------------- websocket

  private connectSocket = () => {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    if (this.state.status === "needs-auth") return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const connId = createMessageId();
    let socket: WebSocket;
    try {
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/messages/ws?cid=${encodeURIComponent(connId)}`,
      );
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.backoff = BACKOFF_START_MS;
      this.emit({ live: true });
      // A phone that slept through part of a call comes back with a socket and a
      // conversation, and everything the far end said in between went past while
      // it was gone. So it says it is here: the other devices work out from the
      // roster who reconnects whom, and nothing about the call is invented.
      void this.announcePresenceInCall();
    };
    socket.onclose = () => {
      this.emit({ live: false });
      this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as {
          type?: string;
          chatId?: string;
          peerEmail?: string;
          at?: number;
          signal?: CallSignal | VoiceSignal;
          roster?: CallRoster;
        };
        if (frame.type === "sync" || frame.type === "presence" || frame.type === "guild") {
          void this.sync();
          return;
        }
        if (frame.type === "voice") {
          /**
           * Under the name the frame is actually sent with.
           *
           * Read under any other name and every change pushed to this device is
           * dropped on the way in, silently — the frame arrives, nothing happens,
           * and the room goes on knowing only about the person in front of the
           * screen. It looks like the object is not telling anybody: the tiles for
           * everybody else never arrive, and only the person who joined last, whose
           * own request brought the room's answer back, can see who is there.
           */
          if (frame.signal) this.handleVoiceSignal(frame.signal as VoiceSignal);
          return;
        }
        if (frame.type === "call") {
          if (frame.signal) this.handleCallSignal(frame.signal as CallSignal);
          return;
        }
        if (frame.type === "roster") {
          // Who is in the call, and in what order. It arrives beside the frame
          // that changed it, so a phone that was told "you are in a call" also
          // learns who else is.
          if (frame.roster) this.handleRoster(frame.roster);
          return;
        }
        if (frame.type === "typing" && frame.chatId && frame.peerEmail) {
          // Render immediately instead of waiting for a full round trip.
          const at = Number(frame.at) || Date.now();
          this.emit({
            typing: liveTyping(
              [
                ...this.state.typing.filter(
                  (entry) =>
                    !(entry.chatId === frame.chatId && entry.peerEmail === frame.peerEmail),
                ),
                { chatId: frame.chatId, peerEmail: frame.peerEmail, at },
              ],
              Date.now(),
            ),
          });
        }
      } catch {
        // Ignore frames we do not understand rather than tearing down the socket.
      }
    };
  };

  private scheduleReconnect = () => {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = this.backoff;
    this.backoff = Math.min(BACKOFF_MAX_MS, this.backoff * 2);
    this.retryTimer = setTimeout(() => this.connectSocket(), delay);
  };

  /**
   * Says this device is still in the call, after the socket came back.
   *
   * Only ever sent when a call is already up, and only ever the frames that
   * mean "here I am": an accept for the people placing the call, and this side's
   * own microphone and camera flags so the tiles are not left showing somebody
   * who was muted the whole time. It is safe to repeat, because everything it
   * triggers is a question the other side answers from its own roster.
   */
  private announcePresenceInCall = async () => {
    const call = this.state.call;
    if (call.status === "idle" || call.status === "ended") return;
    if (!this.state.data) return;
    const self = normalize(this.state.email);
    const others = call.participants.filter((person) => !person.isSelf && person.status !== "left");
    for (const person of others) {
      await this.relayCall({
        kind: "accept",
        callId: call.callId,
        chatId: call.chatId,
        to: person.email,
      });
    }
    await this.relayCall({
      kind: "state",
      callId: call.callId,
      chatId: call.chatId,
      mic: call.mic,
      camera: call.camera,
      screen: call.screen,
    });
    void self;
    // The connections this device was holding may have been dropped by whatever
    // took the socket down, so it offers again to whoever it owes a link to.
    await this.connectToNewcomers(call);
  };

  // ------------------------------------------------------------------ calls

  /**
   * Hands the media layer to the store and the frames back.
   *
   * The call needs the browser's media, which the store deliberately knows
   * nothing about, so the view builds a `CallMedia`, hands it over and receives
   * the handshake through this seam. That keeps the conversation and the
   * signalling in one place and the camera in the view.
   */
  private media: CallMedia | null = null;
  /** One stream per participant, so a call with four people plays all four. */
  private remoteStreams: Record<string, unknown> = {};
  /** What this device is sharing, as a stream. Not data, so not persisted. */
  private screenStream: unknown = null;
  /**
   * The offers waiting for an answer, one per person.
   *
   * With four people there are four handshakes, and they do not arrive in order:
   * a phone that is ringing cannot answer before it has media of its own, so
   * each offer waits for the answer button rather than being dropped.
   */
  private pendingOffers = new Map<string, unknown>();

  attachCallMedia = (media: CallMedia) => {
    this.media = media;
    media.listen({
      onSignal: (signal) => {
        // Frames the handshake produces go straight back out, already addressed
        // to the one person they belong to.
        const call = this.state.call;
        if (call.status === "idle" || call.status === "ended") {
          // No call up, but a voice channel may be. The connection belongs to the
          // channel, and dropping its frames here is how two people sit in the
          // same room connected to nobody.
          const channelId = this.state.voiceChannelId;
          if (channelId) {
            void messagesApi
              .voiceSignal({
                kind: signal.kind as "offer" | "answer" | "candidate" | "renegotiate",
                channelId,
                to: signal.to ?? "",
                ...(signal.description !== undefined ? { description: signal.description } : {}),
                ...(signal.candidate !== undefined ? { candidate: signal.candidate } : {}),
                ...this.voiceSwitches(),
              })
              .catch(() => undefined);
          }
          return;
        }
        void this.relayCall({ ...signal, callId: call.callId, chatId: call.chatId } as CallSignal);
      },
      onRemote: (email, stream) => {
        // One entry per person, so a call with four people has four things to
        // play rather than one that keeps being overwritten.
        this.remoteStreams = { ...this.remoteStreams, [email]: stream };
        this.emit({ remoteStreams: this.remoteStreams });
      },
      onPeer: (email, state) => {
        const call = this.state.call;
        if (state === "connected") {
          this.markParticipant(email, "active");
          this.markAnswered();
          // Connected: nothing left to wait for, and the clock would otherwise
          // hang up a call that is being had.
          this.clearCallDeadlines();
          return;
        }
        if (state === "failed") {
          // One person dropping out is not the end of the call, but a call where
          // nobody is left is.
          this.markParticipant(email, "left");
          this.media?.dropPeer(email);
          if (this.everybodyElseIsGone()) {
            this.clearCallDeadlines();
            this.emit({ call: { ...call, status: "ended", reason: state } });
            this.media?.stop();
            void this.recordCall(call, state, true);
          }
          return;
        }
        // `disconnected` is what a phone reports for the seconds it spends with
        // no signal, and it comes back on its own: the media layer is already
        // asking for new addresses. Taking the person out of the call here is
        // how a lift ride used to end a call that was about to be fine.
      },
      onLocal: (stream) => {
        this.localStream = stream;
        this.emit({ localStream: stream });
      },
      onScreenStream: (stream) => {
        // The desktop, kept apart from the microphone stream. A voice room has no
        // picture in its own stream, so binding the sharer's tile to that is how
        // the one person who can fix it is shown an empty tile while everybody
        // else is watching their desktop perfectly well.
        this.screenStream = stream;
        this.emit({ screenStream: stream });
      },
      onScreen: (sharing, surface, label) => {
        // The browser's own "stop sharing" button ends up here, and the room has
        // to hear about it: without this the other side keeps looking at a frozen
        // picture of somebody's desktop.
        //
        // The call first. It used to be the channel that won, which meant that
        // sharing a screen while a call was up wrote the change to the channel and
        // the person on the call was shown a camera that was not being sent.
        const call = this.state.call;
        if (call.status !== "idle" && call.status !== "ended") {
          if (call.screen === sharing) return;
          // Both places the call screen is drawn from, not just the one the share
          // switch reads. The room is built from `participants`, so updating only
          // `call.screen` left the stage in its sharing layout with a black tile
          // and the button still lit after somebody used the browser's own "stop
          // sharing" — which is the one way to stop that does not go through this
          // store's own switch.
          this.emit({
            call: {
              ...call,
              screen: sharing,
              screenSurface: sharing ? surface : "monitor",
              participants: call.participants.map((person) =>
                person.isSelf
                  ? {
                      ...person,
                      screen: sharing,
                      screenSurface: sharing ? surface : person.screenSurface,
                    }
                  : person,
              ),
            },
          });
          void this.relayCall({
            kind: "state",
            callId: call.callId,
            chatId: call.chatId,
            mic: call.mic,
            camera: call.camera,
            screen: sharing,
            ...(sharing ? { surface } : {}),
          });
          return;
        }

        const channelId = this.state.voiceChannelId;
        if (channelId) {
          // No call up, so the share belongs to the channel. Dropping this frame
          // is how a room ends up showing a desktop that stopped moving.
          const mine = this.selfVoicePresence(channelId);
          if (mine?.screen === sharing) return;
          this.patchVoicePresence(channelId, this.state.email, (entry) => ({
            ...entry,
            screen: sharing,
            screenSurface: sharing ? surface : "monitor",
            // Which screen, so the room can say "Екран 2" rather than only that
            // something is being shown.
            ...(sharing && label ? { screenLabel: label } : {}),
          }));
          void this.relayVoice({
            kind: "voice-state",
            channelId,
            ...(sharing && label ? { screenLabel: label } : {}),
          });
        }
      },
    });
  };

  /** True when nobody but this account is left in the call. */
  private everybodyElseIsGone = () => {
    const self = normalize(this.state.email);
    return !this.state.call.participants.some(
      (person) => person.email !== self && person.status !== "left",
    );
  };

  /** Moves one person to a new point in the call, in the view's own list. */
  private markParticipant = (email: string, status: CallParticipant["status"]) => {
    const call = this.state.call;
    if (call.status === "idle") return;
    const participants = call.participants.map((person) =>
      person.email === email ? { ...person, status } : person,
    );
    this.emit({ call: { ...call, participants } });
  };

  /**
   * Applies the roster the object keeps.
   *
   * The names and faces come from this account's own contacts, so nothing about
   * another person is taken on trust from the wire: only who is in the call and
   * in what order travels.
   */
  handleRoster = (roster: CallRoster) => this.applyRoster(roster);

  private applyRoster = (roster: CallRoster) => {
    const call = this.state.call;
    const self = normalize(this.state.email);
    if (call.callId !== roster.callId) return;
    // A roster naming nobody is one that does not know yet, not one announcing an
    // empty call. Taking it at its word replaces a list that is full with one that
    // is not, and the screen falls back to "waiting for somebody to join" with
    // everybody already in it.
    if (roster.participants.length === 0 && call.participants.length > 0) return;
    const nameOf = (email: string) => {
      if (normalize(email) === self) return this.state.data?.profile.name ?? email;
      const contact = this.state.data?.contacts.find((item) => item.peerEmail === email);
      return contact?.name ?? email;
    };
    const avatarOf = (email: string) => {
      if (normalize(email) === self) return this.state.data?.profile.avatar ?? null;
      return this.state.data?.contacts.find((item) => item.peerEmail === email)?.avatar ?? null;
    };
    const known = new Map(call.participants.map((person) => [person.email, person]));
    const participants = roster.participants
      .map((entry) => {
        const mine = normalize(entry.email) === self;
        const was = known.get(entry.email);
        return {
          email: entry.email,
          name: mine ? nameOf(entry.email) : nameOf(entry.email),
          avatar: avatarOf(entry.email),
          // The flags stay as this account last saw them; a roster says who is
          // there, not what their microphone is doing.
          mic: was?.mic ?? true,
          camera: was?.camera ?? false,
          screen: was?.screen ?? false,
          screenSurface: was?.screenSurface ?? "monitor",
          status: (mine
            ? entry.status === "left"
              ? "left"
              : "active"
            : entry.status) as CallParticipant["status"],
          order: entry.order,
          isSelf: mine,
        };
      })
      .sort((left, right) => left.order - right.order);
    const next = {
      ...call,
      host: roster.host,
      starts: roster.starts,
      participants,
      callerEmail: roster.host || call.callerEmail,
    };
    this.emit({ call: next });
    // Somebody new is in the call, so this phone has to be connected to them.
    void this.connectToNewcomers(next);
  };

  /**
   * Makes the connections this account owes to the people in the call.
   *
   * Whoever was in the call first offers, decided from the roster, so the two
   * phones never both offer at once: that is the one thing that reliably breaks a
   * call, and it cannot be fixed afterwards.
   */
  private connectToNewcomers = async (call: CallState) => {
    if (!this.media) return;
    const self = normalize(this.state.email);
    const roster = call.participants.map((person) => ({
      email: person.email,
      order: person.order,
    }));
    for (const person of call.participants) {
      if (person.isSelf || person.status === "left") continue;
      // Every device is told which side of the link it is on, not only the ones
      // about to offer: it is also what decides who renegotiates when a screen
      // is shared or a network changes halfway through.
      const mine = shouldOffer(self, person.email, roster);
      this.media.setOfferer(person.email, mine);
      if (this.media.connectedTo().includes(person.email)) continue;
      // Nothing is offered until the other side has media of its own to answer
      // with, which is what the accept frame means.
      if (person.status !== "active") continue;
      if (!mine) continue;
      try {
        const offer = await this.media.createOffer(person.email);
        await this.relayCall({
          kind: "offer",
          callId: call.callId,
          chatId: call.chatId,
          to: person.email,
          description: offer,
        });
      } catch (error) {
        console.warn("Failed to offer a connection to a participant.", error);
      }
    }
  };

  /**
   * Sends one call frame out to the object, which works out who it is for.
   *
   * The chat is taken from the live call rather than from the frame, so a frame
   * cannot be aimed at a conversation the account is not in.
   */
  private relayCall = async (signal: CallSignal) => {
    const call = this.state.call;
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    return messagesApi
      .callSignal({ ...signal, chatId: call.chatId })
      .catch(() => ({ ok: false as const, reason: "network" as const }));
  };

  // --------------------------------------------------- servers and voice

  /**
   * The one voice room this device is in, if any.
   *
   * A call and a channel are the same thing to a person: a room other people are
   * in, with tiles and a bar of switches at the bottom. They are different to
   * the signalling, which is why they are two code paths, and they are the same
   * to the view, which is why there is one view.
   *
   * A device is in one of them. Two at once would mean two sets of WebRTC
   * connections keyed by the same addresses over one media layer, and the second
   * one to be built would quietly take the first one's place.
   */
  voiceRoom = (): VoiceRoom | null => {
    const call = this.state.call;
    if (call.status !== "idle" && call.status !== "ended") {
      const startedAt = call.answeredAt || call.startedAt;
      return {
        kind: "call",
        id: call.callId,
        label: call.peerName || call.peerEmail,
        presences: call.participants
          // Somebody who has gone keeps their row for a moment so a tile can fade;
          // a room is not a list of everybody who ever picked up.
          .filter((person) => person.status !== "left")
          .map((person) => ({
            email: person.email,
            name: person.name,
            avatar: person.avatar,
            mic: person.mic,
            camera: person.camera,
            screen: person.screen,
            screenSurface: person.screenSurface,
            serverMuted: false,
            deafened: false,
            order: person.order,
            status: "active" as const,
            joinedAt: startedAt,
          })),
      };
    }

    const channelId = this.state.voiceChannelId;
    if (!channelId) return null;
    return {
      kind: "channel",
      id: channelId,
      label: channelId,
      presences: liveVoicePresences(this.state.voiceRosters[channelId]),
    };
  };

  /** This account's own row in whichever room it is in, or null. */
  selfInRoom = (): VoicePresence | null => {
    const self = normalize(this.state.email);
    return this.voiceRoom()?.presences.find((entry) => normalize(entry.email) === self) ?? null;
  };

  /**
   * Frees the media layer before this device goes into another room.
   *
   * There is one camera and one microphone, so a device that is already in a
   * room cannot also be in one. Called before a call is placed or answered, and
   * before a channel is walked into, so the media is never asked to serve two
   * things at once — which is where a call ends up connected to nobody while the
   * screen says it is fine.
   */
  leaveAnyVoiceRoom = async () => {
    const call = this.state.call;
    if (call.status !== "idle" && call.status !== "ended") {
      await this.endCall("hangup");
      return;
    }
    const channelId = this.state.voiceChannelId ?? this.state.voiceConnectingId;
    if (channelId) await this.leaveVoiceChannel(channelId);
  };

  /**
   * The servers this account is in, each with the people and channels in it.
   *
   * Derived from the mirrored rows rather than stored beside them, so a sidebar
   * cannot be showing a server the snapshot has dropped.
   */
  guildViews = (): GuildView[] => {
    const snapshot = this.state.guilds;
    return snapshot.guilds.map((guild) => guildView(guild, snapshot));
  };

  guildById = (guildId: string | null): GuildView | null => {
    if (!guildId) return null;
    return this.guildViews().find((guild) => guild.id === guildId) ?? null;
  };

  /** The people in a voice channel, in the order the mesh is built from. */
  voicePresence = (channelId: string): VoicePresence[] =>
    liveVoicePresences(this.state.voiceRosters[channelId]);

  /** This account's own row in a channel, which is the only one it may act on. */
  selfVoicePresence = (channelId: string): VoicePresence | null => {
    const self = normalize(this.state.email);
    return this.voicePresence(channelId).find((entry) => normalize(entry.email) === self) ?? null;
  };

  /**
   * Sends one frame about a voice channel, with the microphone state that goes
   * with it.
   *
   * The switches are attached here rather than by each caller, because a frame
   * that says somebody is still in the room while their microphone is off is how
   * a room ends up showing somebody as speaking when they are not.
   */
  private relayVoice = async (
    signal: Omit<VoiceSignal, "roster" | "from" | "mic" | "camera" | "screen" | "surface">,
    switches: {
      mic: boolean;
      camera: boolean;
      screen: boolean;
      surface: ScreenSurface;
    } = this.voiceSwitches(),
  ) => {
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    const result = await messagesApi
      .voiceSignal({ ...signal, ...switches })
      .catch(() => ({ ok: false as const, reason: "network" as const }) as const);
    if (result.ok && result.roster) this.applyVoiceRoster(result.roster);
    return result;
  };

  /** What this device is currently sending, as the room should be told. */
  private voiceSwitches = (): {
    mic: boolean;
    camera: boolean;
    screen: boolean;
    surface: ScreenSurface;
  } => {
    /**
     * Read off the device, not out of the room.
     *
     * The roster is the room's memory of this account, and a share that ended with
     * the page stays in that memory: a reload, a browser that took the capture
     * away, a second tab closed. Reporting that memory back as fact is how a room
     * ends up permanently "sharing" a desktop nobody is sending, with a switch
     * that cannot turn it off — because stopping asks the device for a capture it
     * does not have, gets nothing, and so tells the room nothing either.
     *
     * The roster is only the answer on a device with no media layer of its own to
     * ask, which is a test and nothing else.
     */
    const media = this.media;
    if (media) {
      return {
        mic: media.sendingMic,
        camera: media.sendingCamera,
        screen: media.sendingScreen,
        surface: media.sendingSurface,
      };
    }
    const mine = this.selfVoicePresence(this.state.voiceChannelId ?? "");
    return {
      mic: mine?.mic ?? true,
      camera: mine?.camera ?? false,
      screen: mine?.screen ?? false,
      surface: mine?.screenSurface ?? "monitor",
    };
  };

  /**
   * Puts a roster into the state.
   *
   * A roster naming nobody is one that does not know yet rather than one
   * announcing an empty room, so it is ignored: taking it at its word replaces a
   * stage full of people with an empty one.
   */
  private applyVoiceRoster = (roster: VoiceRoster) => {
    if (roster.presences.length === 0) return;
    const self = normalize(this.state.email);
    const here = liveVoicePresences(roster).some((entry) => normalize(entry.email) === self);
    const voiceRosters = { ...this.state.voiceRosters, [roster.channelId]: roster };
    this.emit({
      voiceRosters,
      // A roster this account is not in means it has left the room, and the only
      // thing that can take it out of its own media is that.
      ...(roster.channelId === this.state.voiceChannelId && !here
        ? { voiceChannelId: null, voiceConnectingId: null }
        : {}),
    });
    void this.connectVoiceMesh(roster);
  };

  /**
   * Makes the connections this account owes to the people in the room.
   *
   * The same rule as a call: whoever was in the room first offers, read from the
   * roster's order, so two phones never offer at once. A late arrival is handed
   * everybody who is already there, and everybody already there is handed the
   * late arrival — which is why a join is broadcast to the whole server rather
   * than to the occupants this device happens to know about.
   */
  private connectVoiceMesh = async (roster: VoiceRoster) => {
    const media = this.media;
    if (!media || roster.channelId !== this.state.voiceChannelId) return;
    const self = normalize(this.state.email);
    const live = liveVoicePresences(roster);
    const order = live.map((entry) => ({ email: entry.email, order: entry.order }));

    for (const person of live) {
      if (normalize(person.email) === self) continue;
      const mine = shouldOffer(self, person.email, order);
      // Both sides are told which side of the link they are on, not only the one
      // about to offer: it is also what decides who renegotiates.
      media.setOfferer(person.email, mine);
      if (!mine) continue;
      if (media.connectedTo().includes(person.email)) continue;
      try {
        const offer = await media.createOffer(person.email);
        await messagesApi.voiceSignal({
          kind: "offer",
          channelId: roster.channelId,
          to: person.email,
          description: offer,
          ...this.voiceSwitches(),
        });
      } catch (error) {
        console.warn("Failed to offer a connection to somebody in the channel.", error);
      }
    }
  };

  /**
   * Applies one frame that arrived about a voice channel.
   *
   * The WebRTC frames are routed here rather than through the call machine,
   * because a room and a call are different things with different lifetimes: the
   * connection belongs to the channel, not to a conversation, and nobody is put
   * out when somebody else's frame arrives.
   */
  handleVoiceSignal = (signal: VoiceSignal) => {
    const self = normalize(this.state.email);
    // The gateway hands every frame back to the sender's own devices, so this is
    // how a phone tells that echo from somebody else speaking.
    if (signal.from && normalize(signal.from) === self && signal.kind !== "voice-mute") return;
    if (signal.roster) this.applyVoiceRoster(signal.roster);

    const channelId = signal.channelId;
    const roster = this.state.voiceRosters[channelId];

    if (signal.kind === "voice-mute" && signal.target) {
      this.enforceVoiceMute(channelId, signal.target, signal.muted === true, signal.from ?? "");
      return;
    }

    if (signal.kind === "voice-kick" && signal.target === self) {
      void this.leaveVoiceChannel(channelId);
      return;
    }

    if (signal.kind === "voice-leave" && signal.from) {
      this.dropVoicePresence(channelId, signal.from);
      return;
    }

    // A microphone somebody else turned off reaches the phone holding it: the
    // object cannot stop the audio, it can only say that it should.
    if (signal.kind === "voice-state" && signal.from && signal.mic === false) {
      this.media?.setMic(false);
      if (this.state.voiceChannelId === channelId) {
        this.patchVoicePresence(channelId, signal.from, (entry) => ({ ...entry, mic: false }));
      }
      return;
    }

    if (
      (signal.kind === "offer" ||
        signal.kind === "answer" ||
        signal.kind === "candidate" ||
        signal.kind === "renegotiate") &&
      signal.from
    ) {
      const peer = signal.from;
      if (signal.kind === "renegotiate") {
        /**
         * The other device added a track to this link, and it is the side that
         * offers on a link, so it is the side that has to send the new
         * description.
         *
         * Without this a shared screen arrives on the phone that was already in
         * the channel and on nobody else: the sharer's own screen says it is
         * working, the tile beside it stays a camera, and there is nothing on
         * screen to say the other person cannot see it. The frame is not
         * something `accept` can apply — it carries no description, it says that
         * one is now needed.
         */
        this.pendingOffers.delete(peer);
        void this.media?.renegotiate(peer).catch(() => undefined);
        return;
      }
      void this.handleVoiceWebrtc(signal);
      return;
    }

    // Anything else that names a change to somebody in the room is a roster the
    // view can draw once the object has settled it.
    if (roster && this.state.voiceChannelId === channelId) {
      this.applyVoiceRoster(roster);
    }
  };

  /** Applies a remote session description or candidate to the right peer. */
  private handleVoiceWebrtc = async (signal: VoiceSignal) => {
    const media = this.media;
    const peer = signal.from;
    if (!media || !peer) return;
    try {
      // The media layer answers an offer itself and sends the answer back through
      // its own `onSignal`, which is the same path a call's handshake uses. So
      // only the incoming frame is applied here.
      await media.accept(peer, {
        kind: signal.kind as "offer" | "answer" | "candidate",
        description: signal.description,
        candidate: signal.candidate,
      });
    } catch (error) {
      console.warn("Failed to apply a connection frame in a voice channel.", error);
    }
  };

  /** Marks somebody as gone without taking this account out of the room. */
  private dropVoicePresence = (channelId: string, email: string) => {
    const roster = this.state.voiceRosters[channelId];
    if (!roster) return;
    this.emit({
      voiceRosters: {
        ...this.state.voiceRosters,
        [channelId]: {
          ...roster,
          presences: roster.presences.map((entry) =>
            normalize(entry.email) === normalize(email) ? { ...entry, status: "left" } : entry,
          ),
        },
      },
    });
    // A peer that is gone must not keep a connection open on this device, or it
    // sits there decoding frames nobody is sending.
    if (normalize(email) !== normalize(this.state.email)) this.media?.dropPeer(email);
  };

  private patchVoicePresence = (
    channelId: string,
    email: string,
    patch: (entry: VoicePresence) => VoicePresence,
  ) => {
    const roster = this.state.voiceRosters[channelId];
    if (!roster) return;
    this.emit({
      voiceRosters: {
        ...this.state.voiceRosters,
        [channelId]: {
          ...roster,
          presences: roster.presences.map((entry) =>
            normalize(entry.email) === normalize(email) ? patch(entry) : entry,
          ),
        },
      },
    });
  };

  /**
   * Applies a silence the server owner handed down.
   *
   * Only ever about this account: a member's own microphone is their own business,
   * and a frame naming somebody else is not this phone's to act on.
   */
  private enforceVoiceMute = (
    channelId: string,
    target: string,
    muted: boolean,
    byWhom: string,
  ) => {
    if (normalize(target) !== normalize(this.state.email)) return;
    this.media?.setMic(!muted);
    this.patchVoicePresence(channelId, target, (entry) => ({
      ...entry,
      mic: muted ? false : entry.mic,
      serverMuted: muted,
      ...(muted ? { mutedBy: byWhom } : {}),
    }));
  };

  /**
   * Walks into a voice channel.
   *
   * The camera is asked for on the way in rather than on the first frame, because
   * a browser only grants it to a gesture and a join is one.
   */
  joinVoiceChannel = async (channelId: string, guildId: string) => {
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    if (this.state.voiceChannelId === channelId) return { ok: true as const };

    // A call and a channel are the same room to a person, and a device is in one
    // at a time. Leaving whatever room this was in first is what stops the media
    // layer being asked to serve both — which is where a call ends up connected
    // to nobody while the screen says it is fine.
    const call = this.state.call;
    if (call.status !== "idle" && call.status !== "ended") {
      return { ok: false as const, reason: "in-call" as const };
    }
    const previous = this.state.voiceChannelId;
    if (previous) await this.leaveVoiceChannel(previous);

    this.emit({ voiceConnectingId: channelId });
    try {
      // Audio only: a camera is something a person turns on once they are in the
      // room, not something they are asked for on the way in. The stream that
      // comes back is announced by the media layer, which is what this device's
      // own tile plays.
      await this.media?.start({ video: false });
    } catch (error) {
      console.warn("Failed to open the microphone for a voice channel.", error);
      this.emit({ voiceConnectingId: null });
      return { ok: false as const, reason: "no-media" as const };
    }
    this.emit({ voiceChannelId: channelId, voiceConnectingId: null });

    const result = await this.relayVoice({ kind: "voice-join", channelId });
    if (!result.ok) {
      await this.leaveVoiceChannel(channelId);
      return result;
    }
    void guildId;
    return { ok: true as const };
  };

  /** Leaves a voice channel, which is not leaving a call: the room goes on. */
  leaveVoiceChannel = async (channelId: string) => {
    const was = this.state.voiceChannelId ?? this.state.voiceConnectingId;
    if (!was || was !== channelId) return { ok: true as const };

    this.emit({ voiceChannelId: null, voiceConnectingId: null });
    // Told last, so the frame goes out while this device is still the one that
    // left rather than after the media has already been torn down.
    void this.relayVoice({ kind: "voice-leave", channelId });
    // Only when a call is not holding the media. There is one camera and one
    // microphone, and stopping it for a channel would take the call's video with
    // it — which is how leaving a room hung up somebody else's call.
    const call = this.state.call;
    if (call.status === "idle" || call.status === "ended") {
      this.media?.stop();
      this.emit({ remoteStreams: {} });
    }
    return { ok: true as const };
  };

  /** A member's own microphone, which the server owner cannot take back for them. */
  setVoiceMic = async (channelId: string, mic: boolean) => {
    const mine = this.selfVoicePresence(channelId);
    // Somebody else silenced it: the button is not theirs to press, and letting
    // it look so would be a switch that does nothing.
    if (mine?.serverMuted && mic) return { ok: false as const, reason: "server-muted" as const };
    this.media?.setMic(mic);
    this.patchVoicePresence(channelId, this.state.email, (entry) => ({ ...entry, mic }));
    return this.relayVoice({ kind: "voice-state", channelId });
  };

  setVoiceCamera = async (channelId: string, camera: boolean) => {
    const media = this.media;
    if (!media) return { ok: false as const, reason: "no-media" as const };
    try {
      const changed = await media.setCamera(camera);
      if (!changed) return { ok: false as const, reason: "no-camera" as const };
    } catch (error) {
      console.warn("Failed to change the camera in a voice channel.", error);
      return { ok: false as const, reason: "no-camera" as const };
    }
    this.patchVoicePresence(channelId, this.state.email, (entry) => ({ ...entry, camera }));
    return this.relayVoice({ kind: "voice-state", channelId });
  };

  /**
   * Shows a screen to everybody in the channel, or stops showing it.
   *
   * Only the media is touched here. The state and the frame are written by
   * `onScreen`, which the media calls on the way in and on the way out — including
   * when the browser's own button is what ended it, which is the case that has to
   * work and the one a wrapper around the button would miss.
   *
   * A share that did not start says so rather than leaving a lit button over
   * nothing: a person who is showing a desktop nobody can see has no way of
   * knowing that is why.
   */
  setVoiceScreen = async (_channelId: string, share: boolean, quality?: ScreenQuality) => {
    const media = this.media;
    if (!media) return { ok: false as const, reason: "no-media" as const };
    if (share) {
      const changed = await media.startScreen(quality).catch(() => false);
      return changed ? { ok: true as const } : { ok: false as const, reason: "no-screen" as const };
    }
    const stopped = await media.stopScreen().catch(() => false);
    return stopped ? { ok: true as const } : { ok: false as const, reason: "no-screen" as const };
  };

  /** The owner's silence, which is the only one this account may give. */
  setVoiceServerMute = async (channelId: string, target: string, muted: boolean) => {
    return this.relayVoice({ kind: "voice-mute", channelId, target, muted });
  };

  setVoiceDeafened = async (channelId: string, deafened: boolean) => {
    // Deafening is this device's own business: it stops the audio coming out of
    // it, and nobody else has any say in that.
    this.patchVoicePresence(channelId, this.state.email, (entry) => ({ ...entry, deafened }));
    if (deafened) this.emit({ remoteStreams: {} });
    return this.relayVoice({ kind: "voice-state", channelId, deafened });
  };

  kickFromVoiceChannel = async (channelId: string, target: string) => {
    return this.relayVoice({ kind: "voice-kick", channelId, target });
  };

  // ------------------------------------------------------------------ servers

  createGuild = async (name: string) => {
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    const clean = name.trim().slice(0, 60);
    if (!clean) return { ok: false as const, reason: "invalid-name" as const };
    const id = `g-${createMessageId()}`;
    const result = await messagesApi.createGuild({ id, name: clean });
    if (!result.ok) return result;
    await this.sync();
    return { ok: true as const, guild: result.guild };
  };

  renameGuild = async (guildId: string, name: string) => {
    const result = await messagesApi.renameGuild(guildId, name.trim().slice(0, 60));
    if (!result.ok) return result;
    await this.sync();
    return { ok: true as const };
  };

  deleteGuild = async (guildId: string) => {
    const result = await messagesApi.deleteGuild(guildId);
    if (result.ok) await this.sync();
    return result;
  };

  addGuildMember = async (guildId: string, email: string) => {
    const result = await messagesApi.guildMember({ guildId, email });
    if (result.ok) await this.sync();
    return result;
  };

  /**
   * Walks everybody who is already a friend into a new server.
   *
   * One call and one read afterwards, rather than one of each per person. Fifty
   * friends is fifty full snapshots otherwise, and the last one to arrive is the
   * one that decides what the sidebar draws — so the server would flicker through
   * fifty different member counts on the way to the right one.
   *
   * Reports how many landed rather than only whether the call worked. A server
   * with thirty-eight of fifty people in it is not a failure, but the person who
   * made it should be told which thirty-eight, or they will assume all fifty
   * arrived and go looking for the other twelve.
   */
  addGuildFriends = async (guildId: string) => {
    const result = await messagesApi.guildMembers({ guildId });
    if (!result.ok) return { ok: false as const, reason: result.reason, added: 0, wanted: 0 };
    await this.sync();
    return { ok: true as const, added: result.added, wanted: result.wanted };
  };

  removeGuildMember = async (guildId: string, email: string) => {
    const result = await messagesApi.guildMember({ guildId, email, remove: true });
    if (result.ok) await this.sync();
    return result;
  };

  /**
   * Adds a channel to a server.
   *
   * The id is made from the name and namespaced by the server, so two servers can
   * both have a `общ` without either shadowing the other.
   */
  addGuildChannel = async (input: { guildId: string; kind: "text" | "voice"; name: string }) => {
    const name = input.name.trim().slice(0, 40);
    if (!name) return { ok: false as const, reason: "invalid-name" as const };
    const result = await messagesApi.guildChannel({
      guildId: input.guildId,
      id: channelIdFor(input.guildId, input.kind === "voice" ? "v" : "t", name),
      kind: input.kind,
      name,
    });
    if (result.ok) await this.sync();
    return result;
  };

  removeGuildChannel = async (input: { guildId: string; id: string; kind: "text" | "voice" }) => {
    const result = await messagesApi.guildChannel({
      guildId: input.guildId,
      id: input.id,
      kind: input.kind,
      name: "x",
      remove: true,
    });
    if (result.ok) await this.sync();
    return result;
  };

  /** Places a call to whoever the conversation is with. */
  startCall = async (input: { chatId: string; starts: CallMediaKind }) => {
    // A call needs the object, because the object is what carries the handshake
    // to the other phone. Without it there is nothing to connect, and the honest
    // answer is said now rather than as a screen that spins for ever. Asked
    // before anything else, because this is the reason and not the conversation.
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    const chat = this.state.data?.chats.find((item) => item.id === input.chatId);
    if (!chat) return { ok: false as const, reason: "unknown-chat" as const };
    const peer = this.state.data?.contacts.find((item) => item.peerEmail === chat.peerEmail);
    if (this.state.call.status !== "idle" && this.state.call.status !== "ended") {
      return { ok: false as const, reason: "busy" as const };
    }
    // And there has to be an address to ring. A conversation with nobody's
    // address in it is a row in the history, not a person to call.
    if (!chat.peerEmail.trim()) return { ok: false as const, reason: "no-address" as const };

    const self = normalize(this.state.email);
    const call: CallState = {
      ...IDLE_CALL,
      // Ringing, not connecting: nothing is being connected yet, and a person
      // watching this screen has to be able to tell the two apart. A call that
      // says "connecting" from the moment the button is pressed is a call that
      // cannot say what went wrong when it never connects.
      status: "outgoing",
      callId: createMessageId(),
      chatId: chat.id,
      peerEmail: chat.peerEmail,
      peerName: peer?.name ?? chat.peerEmail,
      peerAvatar: peer?.avatar ?? null,
      // A call that has not been redirected has nobody before it.
      previousPeerName: "",
      starts: input.starts,
      // My own address is the caller's, so the history can say so later.
      callerEmail: self,
      host: self,
      // The person placing the call is in it before anybody is invited, and
      // first in the order: that order is what decides who offers the
      // connection, and a host missing from its own roster offers nobody.
      participants: [
        {
          email: self,
          name: this.state.data?.profile.name ?? self,
          avatar: this.state.data?.profile.avatar ?? null,
          mic: true,
          camera: input.starts === "video",
          screen: false,
          screenSurface: "monitor",
          status: "active",
          order: 0,
          isSelf: true,
        },
      ],
      mic: true,
      camera: input.starts === "video",
      startedAt: Date.now(),
    };
    this.emit({ call });
    this.armCallDeadlines();

    // The person to ring is named by `beginCall`, which opens the microphone
    // first: a phone that has not been asked for permission yet cannot be called
    // on behalf of anybody.
    return { ok: true as const, callId: call.callId };
  };

  // ------------------------------------------------------- call deadlines

  /**
   * When a call gives up on itself.
   *
   * A call that is never answered rings for ever, and a call that was answered
   * but never connected turns and turns on a spinner. Both are the same bug seen
   * from two sides: the person watching has no idea whether it is still working,
   * so they wait, and the honest thing happens without them. These are the
   * moments where the app says so instead.
   */
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Starts the two clocks a ringing call runs on, and stops the one that no
   * longer applies.
   *
   * The ring clock is about the other person and the connect clock is about the
   * network, so they are kept apart: a phone that answers at the last second
   * gets the full time to build a connection, and a call nobody ever answers
   * does not keep waiting for one.
   */
  private armCallDeadlines = () => {
    this.clearCallDeadlines();
    const call = this.state.call;
    if (call.status === "outgoing") {
      // No clock at all when ringing is left to run for as long as it takes. The
      // connect clock below is unaffected, so a call that is answered and then
      // cannot meet is still given up rather than left on a spinner.
      if (RING_TIMEOUT_MS <= 0) return;
      this.ringTimer = setTimeout(() => {
        this.ringTimer = null;
        if (this.state.call.status !== "outgoing") return;
        void this.ringNextOrGiveUp();
      }, RING_TIMEOUT_MS);
      return;
    }
    // `active` is armed here as well as `connecting`, and that is not a
    // duplication. A call goes on screen the moment it is picked up, so `active`
    // is what an answered call looks like while the two sides are still trying to
    // meet. Arming only `connecting` left that whole span with no clock on it,
    // and a call that is answered and then never connects is exactly the case
    // this timer exists for: it would sit on a spinner for good. The clock is
    // stopped the moment the media layer reports the connection up.
    if (call.status === "connecting" || call.status === "active") this.startConnectDeadline();
  };

  /**
   * Nobody picked up in time, so the call is offered to somebody else before it
   * is given up on.
   *
   * A person dialling somebody who is at work, driving, or asleep has not been
   * told no, and ending the call on a timer answers a question they never asked.
   * So the next name is tried, and only a list with nobody left on it ends the
   * call as missed.
   *
   * The person who was rung keeps their place in the call and their history: they
   * are marked as having been reached, not deleted, so a later invite list still
   * says who was in it and an answer from them seconds later still finds a live
   * call rather than one that has closed underneath them.
   */
  private ringNextOrGiveUp = async () => {
    const call = this.state.call;
    if (call.status !== "outgoing") return;
    const next = this.nextCallCandidate();
    if (!next) {
      // Nobody left to try. Said once, by the app, rather than left ringing.
      await this.endCall("timeout");
      return;
    }

    // The one who did not answer is shown as reached rather than removed, so the
    // call keeps its own record of who it tried.
    const participants = call.participants.map((person) =>
      person.email === call.peerEmail && person.status !== "active"
        ? { ...person, status: "left" as const }
        : person,
    );
    this.emit({
      call: {
        ...call,
        status: "outgoing",
        peerEmail: next.email,
        peerName: next.name,
        peerAvatar: next.avatar,
        // Kept so the thread can say the first name did not answer, instead of
        // only ever showing who the call is on now.
        previousPeerName: call.peerName,
        participants,
      },
    });
    const invited = await this.inviteToCall(next.email);
    if (!invited.ok) {
      // The cloud would not carry the frame, so nobody is ringing. Saying the
      // call is over beats leaving a screen that will never change.
      await this.endCall("timeout");
      return;
    }
    // A fresh clock for the new person, rather than the old one running out a
    // moment after it starts ringing them.
    this.armCallDeadlines();
  };

  /**
   * The next person this account could ring, or nothing.
   *
   * Taken from the same list the invite panel shows, so "who would it try next"
   * and "who is there to invite" cannot disagree. This account and everybody
   * already in the call are left out, and so is whoever was just rung: dialling
   * the same person again immediately is not trying somebody else.
   */
  private nextCallCandidate = (): CallCandidate | null => {
    const call = this.state.call;
    const tried = new Set(
      call.participants.filter((person) => !person.isSelf).map((person) => normalize(person.email)),
    );
    const list = callCandidates({
      friends: this.state.friends,
      contacts: this.state.data?.contacts ?? [],
      chats: this.state.data?.chats ?? [],
      self: this.state.email,
      inCall: [...tried],
    });
    return list[0] ?? null;
  };

  /**
   * The clock for a call that was answered and is still building its link.
   *
   * Both `connecting` and `active` are in scope here, because a call goes on
   * screen the moment it is picked up, so an answered call that has not yet met
   * is `active`. Testing for `connecting` alone left this timer to fire into a
   * status that no longer existed, return without doing anything, and leave a
   * call that can never connect sitting on a spinner for good — which is the one
   * thing this clock is here to prevent. The media layer stops it by clearing the
   * deadlines the moment it reports the connection up.
   */
  private startConnectDeadline = () => {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      const call = this.state.call;
      if (call.status !== "connecting" && call.status !== "active") return;
      // Somebody is there and the two sides never met, which is a network
      // problem rather than a person hanging up, and the history says so.
      this.emit({ call: { ...call, status: "ended", reason: "failed" } });
      this.media?.stop();
      // Told to the people in it, not only written down here. The far side is a
      // phone that is still ringing: it has no way of knowing this device gave
      // up, so without this frame the other person is left listening to a call
      // that ended on a machine they cannot see.
      void this.relayCall({
        kind: "end",
        callId: call.callId,
        chatId: call.chatId,
        reason: "failed",
      });
      void this.recordCall(call, "failed", true);
    }, CONNECT_TIMEOUT_MS);
  };

  private clearCallDeadlines = () => {
    this.clearRingDeadline();
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  };

  private clearRingDeadline = () => {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
  };

  /**
   * A frame arrived. The conversation it names is one the account really has, so
   * the peer, their name and their face all come from local state.
   */
  handleCallSignal = (signal: CallSignal) => {
    // A frame this device sent comes back to its own sockets, and one from the
    // other person's phone comes with their address on it. Anything that is
    // plainly our own echo is dropped here, before it can ring a phone or
    // answer a connection that is already up.
    const self = normalize(this.state.email);
    if (signal.from && self && normalize(signal.from) === self) return;

    const call = this.state.call;
    const chat = this.state.data?.chats.find((item) => item.id === signal.chatId);
    const peer = chat
      ? this.state.data?.contacts.find((item) => item.peerEmail === chat.peerEmail)
      : null;

    if (signal.kind === "invite") {
      // The gateway hands a frame back to the sender's own devices as well, so a
      // call arrives here as its own echo. A call this device is placing or
      // already in is not a second call: it is the same one, and declining it
      // would hang up the phone that is ringing it.
      const mine = call.callId === signal.callId;
      if (mine && call.status !== "idle" && call.status !== "ended") return;
      // A call already up is not replaced, and neither is one that already
      // finished: a frame that arrives late must not ring a phone for a call
      // that is over.
      if (mine || (call.status !== "idle" && call.status !== "ended")) {
        void this.relayCall({
          kind: "decline",
          callId: signal.callId,
          chatId: signal.chatId,
          to: signal.from ?? "",
          reason: mine ? "ended" : "busy",
        });
        return;
      }
      const host = signal.from ?? chat?.peerEmail ?? "";
      this.emit({
        call: {
          ...IDLE_CALL,
          status: "incoming",
          callId: signal.callId,
          chatId: signal.chatId,
          peerEmail: host,
          peerName: this.nameOf(host),
          peerAvatar: this.avatarOf(host),
          previousPeerName: "",
          starts: signal.starts === "video" ? "video" : "audio",
          // The other side is the caller, which is all the history needs.
          callerEmail: host,
          host,
          startedAt: Date.now(),
          participants: [
            {
              email: normalize(this.state.email),
              // Through `nameOf`, so this account's own name falls back the same
              // way it does everywhere else. Hand-rolled here it fell back to
              // nothing, and a tile showing "Unknown" for the person reading the
              // screen is the one name on it that can be got wrong.
              name: this.nameOf(this.state.email),
              avatar: this.state.data?.profile.avatar ?? null,
              mic: true,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              status: "active",
              order: 1,
              isSelf: true,
            },
            {
              email: host,
              name: this.nameOf(host),
              avatar: this.avatarOf(host),
              mic: true,
              camera: false,
              screen: false,
              screenSurface: "monitor",
              status: "ringing",
              order: 0,
              isSelf: false,
            },
          ],
        },
      });
      return;
    }

    if (signal.kind === "decline" || signal.kind === "leave") {
      if (call.callId !== signal.callId) return;
      // Somebody leaving is ordinary: the call goes on for everybody else, so
      // only their connection and their tile go.
      if (signal.kind === "leave") {
        this.markParticipant(signal.from ?? "", "left");
        this.media?.dropPeer(signal.from ?? "");
        return;
      }
      const reason = signal.reason || "hangup";
      // The gateway hands a frame back to the sender's own devices as well, so
      // this can be the echo of the end this side just sent. A call that is
      // already over here was ended here, and recording it again from the other
      // side's chair would turn a cancelled call into a missed one.
      if (call.status === "ended") return;
      this.emit({
        call: { ...call, status: "ended", ...(signal.reason ? { reason: signal.reason } : {}) },
      });
      // The other side put the phone down, so this is where the call is logged.
      // Fire and forget: a frame handler cannot wait, and the record is already
      // in this session's view before the request goes out.
      void this.recordCall(call, reason, false);
      return;
    }

    if (signal.kind === "end") {
      if (call.callId !== signal.callId) return;
      if (call.status === "ended") return;
      const reason = signal.reason || "hangup";
      this.emit({ call: { ...call, status: "ended", reason } });
      void this.recordCall(call, reason, false);
      return;
    }

    if (signal.kind === "accept") {
      if (call.callId !== signal.callId) return;
      // The call has a person more, or one person less: the rest of the call is
      // about to be connected to them.
      this.markParticipant(signal.from ?? "", "active");
      this.emit({ call: { ...this.state.call, status: "connecting" } });
      // Somebody picked up, so the ring clock has done its job, and what is left
      // to wait for is the link itself.
      this.clearRingDeadline();
      this.startConnectDeadline();
      void this.connectToNewcomers(this.state.call);
      return;
    }

    if (signal.kind === "state") {
      if (call.callId !== signal.callId) return;
      const who = signal.from ?? "";
      if (!who) return;
      const participants = call.participants.map((person) =>
        person.email === who
          ? {
              ...person,
              mic: typeof signal.mic === "boolean" ? signal.mic : person.mic,
              camera: typeof signal.camera === "boolean" ? signal.camera : person.camera,
              screen: typeof signal.screen === "boolean" ? signal.screen : person.screen,
              // What they are sharing, so the tile can say screen or window. A
              // share that has stopped goes back to saying nothing.
              screenSurface:
                signal.surface ?? (signal.screen === false ? "monitor" : person.screenSurface),
            }
          : person,
      );
      this.emit({ call: { ...call, participants } });
      return;
    }

    // offer, answer and candidate belong to the media layer, not to the state.
    // The object stamps who sent the frame; where it cannot, the one person this
    // call is with is the only address there is.
    const from = signal.from || call.host || call.peerEmail;
    if (!from) return;
    if (signal.kind === "offer") {
      // The other side offered before this phone had media of its own, so the
      // offer waits for the answer button instead of being dropped: with four
      // people, three offers can be waiting at once. Once there is a microphone
      // the media layer answers on its own, which is what a second offer
      // halfway through the call is: a shared screen, a changed network.
      this.pendingOffers.set(from, signal.description);
      if (this.media) void this.media.accept(from, signal).catch(() => undefined);
      return;
    }
    if (signal.kind === "answer") {
      // The other side answered, so this call was picked up even if the media
      // layer has not said the connection is up yet.
      this.markAnswered();
    }
    if (signal.kind === "renegotiate") {
      // The other device added something to the call, and it is the side that
      // offers on this link, so it is the side that has to send the new
      // description. Without this a screen shared in a voice call shows up on
      // one device and not on the other.
      this.pendingOffers.delete(from);
      void this.media?.renegotiate(from).catch(() => undefined);
      return;
    }
    // A frame the connection refuses must not surface as an unhandled rejection:
    // it is a call going wrong, and the call is already ending on its own.
    void this.media?.accept(from, signal).catch(() => undefined);
  };

  // ------------------------------------------------------------- call log

  /** Calls already written to the history, so one call is never logged twice. */
  private loggedCalls = new Set<string>();

  /**
   * Puts a finished call into the conversation, where both sides will find it.
   *
   * A call is not a message: it is not typed, it cannot be edited or deleted, and
   * it reads differently depending on whose phone went down. So it is written
   * once as a record and each reader turns it into words for themselves.
   *
   * Only the side that ended the call writes. The other side sees the record
   * arrive with the next sync, which is one round trip after a call that has
   * already ended, and beats two sides writing slightly different durations for
   * the same call.
   */
  private recordCall = async (call: CallState, reason: string, endedByMe: boolean) => {
    if (!call.callId || this.loggedCalls.has(call.callId)) return null;
    const chat = this.state.data?.chats.find((item) => item.id === call.chatId);
    if (!chat) return null;
    this.loggedCalls.add(call.callId);

    const answered = call.answeredAt > 0;
    const endedAt = Date.now();
    const record: CallRecord = {
      callId: call.callId,
      caller: call.callerEmail || chat.peerEmail,
      starts: call.starts,
      at: call.startedAt || endedAt,
      endedAt,
      durationMs: answered ? Math.max(0, endedAt - call.answeredAt) : 0,
      outcome: callOutcomeFor({ answered, reason, endedByMe }),
      endedBy: endedByMe ? normalize(this.state.email) : chat.peerEmail,
    };

    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((item) =>
        item.id === chat.id
          ? {
              ...item,
              // Keyed by the call, so a retried write lands on the same row.
              calls: [
                ...(item.calls ?? []).filter((entry) => entry.callId !== record.callId),
                record,
              ].slice(-MAX_CALLS_PER_CHAT),
            }
          : item,
      ),
    }));

    if (this.isLocal()) {
      messagesLocal.addCall(chat.id, record);
      return record;
    }
    const written = await messagesApi
      .callSignal({
        kind: "log",
        callId: record.callId,
        chatId: chat.id,
        log: record,
      })
      .catch(() => ({ ok: false as const, reason: "network" as const }));
    if (!written.ok) {
      // The record stays in this session's view; the next sync will bring the
      // authoritative copy once the network is back.
      console.warn("Failed to write a finished call to the history.", written.reason);
    }
    return record;
  };

  /**
   * Marks the call as answered.
   *
   * The answer button counts, not only the media layer saying the two are
   * joined: a person who picked up the phone did not miss the call, whatever the
   * network does next. `activate` is for the moment the connection is really
   * up, which is what puts the call on screen.
   */
  /**
   * The call was picked up: the clock starts and the call goes on screen.
   *
   * Both happen on the answer rather than on the connection being reported up.
   * A person who picked up the phone is already in the call whether or not ICE
   * ever gets there, and holding the screen on "Ringing" for the whole handshake
   * is a screen that is wrong for every second of it — and on a network that
   * needs a relay to meet at all, wrong for good. The connection still decides
   * whether anybody is heard, which is what the media layer's own state is for;
   * it does not decide whether the call is happening.
   */
  private markAnswered = () => {
    const call = this.state.call;
    if (call.status === "idle" || call.status === "ended") return;
    this.emit({
      call: { ...call, answeredAt: call.answeredAt || Date.now(), status: "active" as const },
    });
  };

  /** Puts the call away entirely, so the next one starts clean. */
  clearCall = () => {
    if (this.state.call.status === "idle") return;
    // A clock left running would hang up a call that no longer exists, and
    // would do it to the next one.
    this.clearCallDeadlines();
    this.remoteStreams = {};
    this.loggedCalls.clear();
    this.pendingOffers.clear();
    this.emit({ call: IDLE_CALL, remoteStreams: {} });
    this.media?.stop();
  };

  /**
   * Mirrors a media switch to everybody in the call.
   *
   * A mute in a group is a broadcast: four people each have to hear that one of
   * them went quiet, or the others keep talking over a person who cannot answer.
   */
  setCallMedia = async (patch: {
    mic?: boolean;
    camera?: boolean;
    screen?: boolean;
    surface?: ScreenSurface;
  }) => {
    const call = this.state.call;
    if (call.status === "idle" || call.status === "ended") return;
    const next = { ...call, ...patch };
    // This account's own row, so its own tile is right without a round trip.
    const participants = next.participants.map((person) =>
      person.isSelf ? { ...person, ...patch } : person,
    );
    this.emit({ call: { ...next, participants } });
    await this.relayCall({
      kind: "state",
      callId: call.callId,
      chatId: call.chatId,
      mic: next.mic,
      camera: next.camera,
      screen: next.screen,
      // What is being shared travels with the flag, so a viewer is told whether
      // they are watching a whole screen or one window.
      ...(next.screen ? { surface: next.screenSurface as ScreenSurface } : {}),
    });
  };

  /**
   * Adds somebody to the call in progress.
   *
   * The first person invited comes from the conversation the call was placed
   * from, and everybody after that is pulled in from here. Both are the same
   * frame: the object adds them to the list and the rest of the call is told.
   */
  inviteToCall = async (email: string) => {
    const call = this.state.call;
    const target = normalize(email);
    const self = normalize(this.state.email);
    if (call.status === "idle" || call.status === "ended" || !target || target === self) {
      return { ok: false as const, reason: "no-call" as const };
    }
    if (call.participants.some((person) => person.email === target)) {
      return { ok: false as const, reason: "already-in" as const };
    }
    // Shown at once, as somebody dialling, rather than waiting for a frame to
    // come back and say what the object already decided.
    this.emit({
      call: {
        ...call,
        participants: [
          ...call.participants,
          {
            email: target,
            name: this.nameOf(target),
            avatar: this.avatarOf(target),
            mic: true,
            camera: false,
            screen: false,
            screenSurface: "monitor",
            status: "invited",
            order: call.participants.reduce((most, person) => Math.max(most, person.order), -1) + 1,
            isSelf: false,
          },
        ],
      },
    });
    const result = await this.relayCall({
      kind: "invite",
      callId: call.callId,
      chatId: call.chatId,
      to: target,
      starts: call.starts,
    });
    return { ok: result.ok as boolean, reason: result.ok ? "" : "network" };
  };

  /** Everybody's name, from this account's own contacts. */
  private nameOf = (email: string) => {
    const self = normalize(this.state.email);
    if (normalize(email) === self) return this.state.data?.profile.name ?? email;
    return this.state.data?.contacts.find((item) => item.peerEmail === email)?.name ?? email;
  };

  private avatarOf = (email: string) => {
    const self = normalize(this.state.email);
    if (normalize(email) === self) return this.state.data?.profile.avatar ?? null;
    return this.state.data?.contacts.find((item) => item.peerEmail === email)?.avatar ?? null;
  };

  /**
   * Places a call and rings the person it is for.
   *
   * The order is the one a browser likes: the object is told the call exists, the
   * microphone is opened, and only then is the invite sent, so the phone that is
   * about to ring can be answered the moment it rings.
   */
  beginCall = async (input: { chatId: string; starts: CallMediaKind }) => {
    const media = this.callMedia();
    if (!media.supported) return { ok: false as const, reason: "unsupported" as const };
    // A device is in one voice room at a time. A call asked for while a channel is
    // up takes the media with it, so the channel is left first rather than the
    // two quietly fighting over one camera.
    await this.leaveVoiceChannel(this.state.voiceChannelId ?? "");
    const result = await this.startCall(input);
    if (!result.ok) return result;

    // The call exists before anybody is in it, so the roster has somewhere to
    // put the first person.
    await this.relayCall({
      kind: "begin",
      callId: this.state.call.callId,
      chatId: this.state.call.chatId,
      starts: input.starts,
    });

    try {
      const stream = await media.start({ video: input.starts === "video" });
      this.setCallLocalStream(stream);
    } catch {
      // No camera or no permission: the call still rings, audio may still work,
      // and the bar shows the microphone as off.
      this.emit({ call: { ...this.state.call, camera: false, mic: false } });
    }

    // The person this conversation is with is the first to be rung, and the one
    // whose conversation this call belongs to.
    const anchor = this.state.data?.chats.find((item) => item.id === input.chatId);
    if (anchor) await this.inviteToCall(anchor.peerEmail);
    return result;
  };

  /**
   * Answers a call.
   *
   * The answer is sent first and the media opened after, so the other side is
   * told this phone picked up even while the camera is still waking: a person
   * who answered is never counted as having missed the call.
   */
  answerCall = async () => {
    const call = this.state.call;
    if (call.status !== "incoming") return { ok: false as const, reason: "no-call" as const };
    const media = this.callMedia();
    const host = call.host || call.peerEmail;
    // Picking up leaves whatever channel this device was standing in. Both are
    // the same room to a person and there is one microphone: answering while the
    // channel still held the media is how a call connects and carries no sound.
    await this.leaveVoiceChannel(this.state.voiceChannelId ?? "");
    this.emit({ call: { ...call, status: "connecting" } });
    this.markAnswered();
    this.clearCallDeadlines();
    this.startConnectDeadline();

    // The microphone opens before the other side is told, not after.
    //
    // Answering sends `accept`, and the caller builds its offer the moment that
    // arrives. If the microphone is still waking, the offer is answered from a
    // connection that carries no audio at all, and the person who picked up is
    // in the call and cannot be heard — which is the one failure nobody can
    // explain from the screen, because both tiles look identical.
    //
    // This is the same order the caller uses, for the same reason: a call is
    // offered from a connection that already has a microphone on it.
    if (media.supported) {
      try {
        const stream = await media.start({ video: call.starts === "video" });
        this.setCallLocalStream(stream);
      } catch {
        // No permission or no device. The call still goes ahead — the other
        // side still has somebody to talk to — and the bar shows the microphone
        // as off rather than claiming a voice that is not there.
        this.emit({ call: { ...this.state.call, camera: false, mic: false } });
      }
    }

    await this.relayCall({
      kind: "accept",
      callId: call.callId,
      chatId: call.chatId,
      to: host,
    });

    // Everybody who offered this phone a connection gets answered, and the people
    // who arrive later are connected to from the other side instead.
    for (const person of call.participants) {
      if (person.isSelf) continue;
      // The media layer holds the offers that are still waiting, and knows
      // whether it already answered this one on its own. It answered by itself
      // when the microphone opened after the offer arrived, which is the ordinary
      // case on a fast phone, and answering twice would roll the far side back.
      if (!media.hasPendingOffer(person.email)) continue;
      try {
        this.pendingOffers.delete(person.email);
        await media.answerPending(person.email);
      } catch (error) {
        console.warn("Failed to answer a connection in a group call.", error);
      }
    }
    return { ok: true as const };
  };

  /**
   * Leaves the call without ending it for everybody else.
   *
   * Two computers and two phones in one call: somebody leaving is ordinary, and
   * the call goes on for the three who are still there.
   */
  leaveCall = async () => {
    const call = this.state.call;
    if (call.status === "idle" || call.status === "ended") {
      return { ok: false as const, reason: "no-call" as const };
    }
    await this.relayCall({ kind: "leave", callId: call.callId, chatId: call.chatId });
    this.clearCallDeadlines();
    this.media?.stop();
    this.remoteStreams = {};
    this.emit({ call: IDLE_CALL, remoteStreams: {} });
    return { ok: true as const };
  };

  /** Answers an incoming call and starts the handshake from this side. */
  acceptCall = async () => {
    const call = this.state.call;
    if (call.status !== "incoming") return { ok: false as const, reason: "no-call" as const };
    this.emit({ call: { ...call, status: "connecting" } });
    this.markAnswered();
    // Answered: the two sides are now trying to meet, and the clock for that is a
    // different one from the clock for somebody not picking up.
    this.clearCallDeadlines();
    this.startConnectDeadline();
    await this.relayCall({
      kind: "accept",
      callId: call.callId,
      chatId: call.chatId,
      to: call.host || call.peerEmail,
    });
    return { ok: true as const };
  };

  /** Declines an incoming call, or hangs up the one in progress. */
  endCall = async (reason = "hangup") => {
    const call = this.state.call;
    if (call.status === "idle") return { ok: false as const, reason: "no-call" as const };
    this.clearCallDeadlines();
    this.emit({ call: { ...call, status: "ended", reason } });
    await this.relayCall({ kind: "end", callId: call.callId, chatId: call.chatId, reason });
    this.media?.stop();
    await this.recordCall(call, reason, true);
    return { ok: true as const };
  };

  /** The local stream, so the view can show what the camera is sending. */
  private localStream: unknown = null;

  setCallLocalStream = (stream: unknown) => {
    this.localStream = stream;
    this.emit({ localStream: stream });
  };

  /** The media layer, created on first use so a page without calls costs nothing. */
  callMedia = () => {
    if (!this.media) {
      // The relay, if this deployment has one, comes from the server at call
      // time: it is a deployment decision rather than a code one, and asking
      // here is what lets it be turned on without rebuilding anything.
      this.media = new CallMedia({ turn: () => messagesApi.turn() });
    }
    return this.media;
  };

  /** The real device list, which the browser only labels after permission. */
  callDevices = async () => {
    try {
      return await this.callMedia().devices();
    } catch {
      return [];
    }
  };

  // ------------------------------------------------------------- mutations

  private mutateData(updater: (data: MessagesData) => MessagesData) {
    const current = this.state.data;
    if (!current) return null;
    const next = updater(current);
    this.emit({ data: next });
    this.cache(next);
    return next;
  }

  addContact = async (input: {
    name: string;
    about?: string;
    accent?: string;
    avatar?: string | null;
    peerEmail?: string;
  }) => {
    const id = `contact-${createMessageId()}`;
    const name = input.name.trim();
    if (!name) return { ok: false as const, reason: "invalid-name" as const };

    const optimistic: ChatContact = {
      id,
      peerEmail: normalize(input.peerEmail ?? ""),
      name,
      initials: initialsForName(name),
      about: input.about ?? "",
      accent: input.accent ?? "#1DB954",
      avatar: input.avatar ?? null,
      online: false,
      lastSeenAt: 0,
      lastSeenLabel: "",
      linked: Boolean(input.peerEmail),
      status: "online",
    };
    this.mutateData((data) => ({ ...data, contacts: [optimistic, ...data.contacts] }));

    if (this.isLocal()) {
      const created = messagesLocal.addContact({
        name,
        about: input.about ?? "",
        accent: input.accent ?? "#1DB954",
        avatar: input.avatar ?? null,
        peerEmail: input.peerEmail ?? "",
      });
      if (!created.ok) {
        this.mutateData((data) => ({
          ...data,
          contacts: data.contacts.filter((contact) => contact.id !== id),
        }));
        return created;
      }
      this.emit({ data: messagesLocal.read() });
      return { ok: true as const, id: created.id };
    }

    const result = await messagesApi
      .contact({
        id,
        name,
        about: input.about ?? "",
        accent: input.accent ?? "#1DB954",
        avatar: input.avatar ?? null,
        peerEmail: input.peerEmail ?? "",
      })
      .catch(() => ({ ok: false as const, reason: "network" as const }));
    if (!result.ok) {
      this.mutateData((data) => ({
        ...data,
        contacts: data.contacts.filter((contact) => contact.id !== id),
      }));
      return { ok: false as const, reason: result.reason };
    }
    void this.sync();
    return { ok: true as const, id };
  };

  private isLocal() {
    return this.state.mode === "local";
  }

  // ------------------------------------------------------------------ friends

  refreshFriends = async () => {
    if (this.isLocal()) return;
    const result = await messagesApi.friends();
    if (result?.ok && result.friends) {
      this.emit({ friends: result.friends });
    }
  };

  searchPeople = async (query: string) => {
    const q = query.trim();
    if (this.isLocal() || q.length < 2) {
      this.emit({ people: [], searching: false });
      return;
    }
    this.emit({ searching: true });
    const result = await messagesApi.searchPeople(q);
    this.emit({ people: result.people, searching: false });
  };

  clearPeople = () => this.emit({ people: [], searching: false });

  sendFriendRequest = async (person: DirectoryEntry) => {
    if (this.isLocal()) {
      return { ok: false as const, reason: "offline" as const };
    }
    const result = await messagesApi.sendFriendRequest(person.email, person.name);
    if (result.ok) {
      this.emit({ people: this.state.people.filter((entry) => entry.email !== person.email) });
      await this.refreshFriends();
    }
    return result;
  };

  respondToFriendRequest = async (id: string, accept: boolean) => {
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    const result = await messagesApi.respondToFriendRequest(id, accept);
    if (result.ok) {
      await Promise.all([this.refreshFriends(), this.sync()]);
    }
    return result;
  };

  removeFriend = async (email: string) => {
    if (this.isLocal()) return { ok: false as const, reason: "offline" as const };
    const result = await messagesApi.removeFriend(email);
    if (result.ok) {
      await Promise.all([this.refreshFriends(), this.sync()]);
    }
    return result;
  };

  /** True when a friendship row already exists between me and this address. */
  friendshipWith = (email: string) => {
    const target = email.trim().toLowerCase();
    const self = normalize(this.state.email);
    if (!target || !self) return null;
    const all = [
      ...this.state.friends.incoming,
      ...this.state.friends.outgoing,
      ...this.state.friends.friends,
      ...this.state.friends.declined,
    ];
    return (
      all.find(
        (entry) =>
          (entry.fromEmail === self && entry.toEmail === target) ||
          (entry.toEmail === self && entry.fromEmail === target),
      ) ?? null
    );
  };

  removeContact = async (id: string) => {
    const target = this.state.data?.contacts.find((contact) => contact.id === id);
    this.mutateData((data) => ({
      ...data,
      contacts: data.contacts.filter((contact) => contact.id !== id),
      // A contact's conversations go with them, or the list keeps a row nobody
      // can open.
      chats: data.chats.filter((chat) => {
        if (!target) return true;
        return chat.peerEmail !== target.peerEmail;
      }),
    }));
    if (this.isLocal()) {
      messagesLocal.removeContact(id);
      this.emit({ data: messagesLocal.read() });
      return { ok: true as const };
    }
    const result = await messagesApi.removeContact(id).catch(() => ({
      ok: false as const,
      reason: "network" as const,
    }));
    if (!result.ok) await this.sync();
    return result;
  };

  updateProfile = async (patch: {
    name?: string;
    about?: string;
    accent?: string;
    avatar?: string | null;
    status?: PresenceStatus;
  }) => {
    // Only the fields that were actually sent, so a partial update cannot blank
    // the ones it did not mention.
    this.mutateData((data) => ({
      ...data,
      profile: {
        ...data.profile,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.about === undefined ? {} : { about: patch.about }),
        ...(patch.accent === undefined ? {} : { accent: patch.accent }),
        ...(patch.avatar === undefined ? {} : { avatar: patch.avatar }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
    }));
    if (this.isLocal()) {
      messagesLocal.setProfile(patch);
      this.emit({ data: messagesLocal.read() });
      return { ok: true as const };
    }
    const result = await messagesApi.profile(patch).catch(() => ({
      ok: false as const,
      reason: "network" as const,
    }));
    if (!result.ok) await this.sync();
    return result;
  };

  setStatus = async (status: PresenceStatus) => {
    const next = normalizePresenceStatus(status);
    if (this.state.data?.profile.status === next) return { ok: true as const };
    return this.updateProfile({ status: next });
  };

  removeChat = async (chatId: string) => {
    this.mutateData((data) => ({
      ...data,
      chats: data.chats.filter((chat) => chat.id !== chatId),
    }));
    if (this.isLocal()) {
      messagesLocal.removeChat(chatId);
      this.emit({ data: messagesLocal.read() });
      return { ok: true as const };
    }
    const result = await messagesApi.removeChat(chatId).catch(() => ({
      ok: false as const,
      reason: "network" as const,
    }));
    if (!result.ok) await this.sync();
    return result;
  };

  /** Marks the other side's messages as read, and tells the object about it. */
  markRead = async (chatId: string) => {
    let changed = false;
    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) => {
        if (chat.id !== chatId) return chat;
        const messages = chat.messages.map((message) => {
          if (message.fromMe || message.status === "read") return message;
          changed = true;
          return { ...message, status: "read" as const };
        });
        return { ...chat, messages };
      }),
    }));
    // Only the object that owns the account is told, and only when something
    // actually changed: an empty conversation would otherwise be marked on every
    // render.
    if (!changed || this.isLocal()) return;
    await messagesApi.markRead(chatId).catch(() => undefined);
  };

  /**
   * Opens, or creates, the conversation with somebody the account has an entry
   * for. The row is persisted before it is shown, so a chat created on this
   * device is not removed by the next sync from the other one.
   */
  openChatWithPeer = (peerEmail: string, entry?: { name?: string; avatar?: string | null }) => {
    const email = peerEmail.trim().toLowerCase();
    if (!email) return null;
    const known = this.state.data?.contacts.find((contact) => contact.peerEmail === email);
    const name = entry?.name?.trim() || known?.name || email;
    const avatar = entry?.avatar ?? known?.avatar ?? null;
    const existing = this.state.data?.chats.find((chat) => chat.peerEmail === email);
    if (existing) {
      void this.persistChat(existing.id, email, name, avatar);
      return existing.id;
    }
    const chat: MessageChat = {
      // Keyed by the pair, not by a fresh id, so a conversation opened here and
      // one opened on the other device are the same row rather than two.
      id: `chat-${friendshipId(this.state.email, email)}`.slice(0, 80),
      peerEmail: email,
      pinned: false,
      muted: false,
      updatedAt: Date.now(),
      messages: [],
    };
    this.mutateData((data) => {
      const contacts = data.contacts.some((contact) => contact.peerEmail === email)
        ? data.contacts
        : [
            {
              id: `contact-${createMessageId()}`,
              peerEmail: email,
              name,
              initials: initialsForName(name),
              about: "",
              accent: "#1DB954",
              avatar,
              online: false,
              lastSeenAt: 0,
              lastSeenLabel: "",
              linked: true,
              status: known?.status ?? "online",
            },
            ...data.contacts,
          ];
      return { ...data, contacts, chats: [chat, ...data.chats] };
    });
    void this.persistChat(chat.id, email, name, avatar);
    return chat.id;
  };

  persistChat = async (
    chatId: string,
    peerEmail: string,
    peerName?: string,
    peerAvatar?: string | null,
  ) => {
    if (this.isLocal()) return;
    // Shielded from a sync that arrives before the write lands, or the new row
    // would be pruned as one the server has never heard of.
    this.pendingChats.set(chatId, Date.now());
    const result = await messagesApi
      .ensureChat({
        chatId,
        peerEmail,
        ...(peerName ? { peerName } : {}),
        ...(peerAvatar === undefined ? {} : { peerAvatar }),
      })
      .catch(() => ({ ok: false as const, reason: "network" as const }));
    if (result.ok) await this.sync();
    else this.pendingChats.delete(chatId);
  };

  openChatWithContact = (contact: ChatContact) => {
    const existing = this.state.data?.chats.find((chat) => chat.peerEmail === contact.peerEmail);
    if (existing) return existing.id;
    const chat: MessageChat = {
      id: `chat-${createMessageId()}`,
      peerEmail: contact.peerEmail,
      pinned: false,
      muted: false,
      updatedAt: Date.now(),
      messages: [],
    };
    this.mutateData((data) => ({ ...data, chats: [chat, ...data.chats] }));
    return chat.id;
  };

  togglePin = (chatId: string) => {
    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) =>
        chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat,
      ),
    }));
  };

  // --------------------------------------------------------------- messages

  /**
   * Puts a message in the conversation immediately and lets the object catch up.
   *
   * The optimistic row is what makes sending feel instant, and the outbox is
   * what makes it survive a dropped connection: a message that could not be sent
   * is kept until a later sync carries it.
   *
   * The row goes in before anything is uploaded, which is the whole reason it is
   * optimistic. A file has to reach the bucket before the message naming it can
   * be written anywhere, and at four gigabytes that is minutes rather than
   * seconds — so the bubble appears at once, says how far the file has got, and
   * is only queued once the file is actually there.
   */
  sendMessage = async (input: {
    chatId: string;
    peerEmail: string;
    text: string;
    attachments: IncomingAttachment[];
    signal?: AbortSignal;
  }) => {
    const id = createMessageId();
    const at = Date.now();
    if (!input.text.trim() && input.attachments.length === 0) {
      return { ok: false as const, reason: "empty" as const };
    }
    const optimistic: ChatMessage = {
      id,
      fromMe: true,
      text: input.text.trim(),
      at,
      status: "sending",
      ...(input.attachments.length
        ? { attachments: input.attachments.map(previewAttachment) }
        : {}),
    };
    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) =>
        chat.id === input.chatId
          ? { ...chat, updatedAt: at, messages: [...chat.messages, optimistic] }
          : chat,
      ),
    }));

    if (this.isLocal()) {
      messagesLocal.send({
        id,
        ...input,
        text: input.text.trim(),
        at,
      });
      this.emit({ data: messagesLocal.read() });
      return { ok: true as const, id };
    }

    const attachments: IncomingAttachment[] = [];
    for (const attachment of input.attachments) {
      if (!attachment.file) {
        attachments.push(uploadedAttachment(attachment));
        continue;
      }
      this.setUpload(id, { name: attachment.name, sent: 0, total: attachment.size });
      try {
        await uploadAttachment(
          { ...attachment, file: attachment.file },
          {
            ...(input.signal ? { signal: input.signal } : {}),
            onProgress: ({ sent, total }) =>
              this.setUpload(id, { name: attachment.name, sent, total }),
          },
        );
      } catch (error) {
        // The bubble is taken back rather than left spinning: a message whose
        // file never arrived is not a message, and a send button that has already
        // cleared the composer is not a place to find out otherwise.
        this.clearUpload(id);
        this.dropOptimistic(input.chatId, id);
        // A deployment with nowhere to put a file is a different problem from a
        // connection that gave out, and "try again" is the wrong advice for the
        // first one — nobody is going to try again.
        const reason =
          error instanceof AttachmentUploadError && error.reason === "attachments-not-configured"
            ? ("attachments-not-configured" as const)
            : ("upload-failed" as const);
        return { ok: false as const, reason };
      }
      attachments.push(uploadedAttachment(attachment));
    }
    this.clearUpload(id);

    this.outbox.push({
      id,
      chatId: input.chatId,
      peerEmail: input.peerEmail,
      text: input.text.trim(),
      at,
      attachments,
    });
    this.writeOutbox(this.state.email);
    await this.flushOutbox();
    return { ok: true as const, id };
  };

  /** Moves a file's progress forward without rebuilding the whole state object. */
  private setUpload(messageId: string, row: UploadProgressRow) {
    this.emit({ uploads: { ...this.state.uploads, [messageId]: row } });
  }

  private clearUpload(messageId: string) {
    if (!this.state.uploads[messageId]) return;
    const next = { ...this.state.uploads };
    delete next[messageId];
    this.emit({ uploads: next });
  }

  /** Takes a message that never made it out of the conversation again. */
  private dropOptimistic(chatId: string, messageId: string) {
    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.filter((message) => message.id !== messageId),
            }
          : chat,
      ),
    }));
  }

  editMessage = async (input: { chatId: string; messageId: string; text: string }) => {
    const text = input.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return { ok: false as const, reason: "empty" as const };
    return this.changeMessage(input.chatId, input.messageId, "edit", text);
  };

  deleteMessage = async (input: { chatId: string; messageId: string }) =>
    this.changeMessage(input.chatId, input.messageId, "delete");

  /**
   * Adds or takes off this account's reaction to one message.
   *
   * The one change either participant may make to a message they did not send, and
   * the only one that is not `canManageMessage`: reacting to somebody is the point
   * of a conversation, and a chat where only your own words can be acknowledged is a
   * chat with nobody in it.
   *
   * Which way the press goes is worked out here, from the row already in front of
   * the reader, and sent as `on` rather than left for the far end to guess: this
   * change is written into both objects, and a mirror that arrived twice must leave
   * the same thing on the message rather than take the reaction back off.
   *
   * Applied here first so the button answers under the finger, then corrected by the
   * sync that follows — the same order an edit lands in, because a reaction that
   * waited for the round trip felt broken rather than slow.
   */
  toggleReaction = async (input: { chatId: string; messageId: string; emoji: string }) => {
    const emoji = (input.emoji ?? "").trim();
    if (!emoji) return { ok: false as const, reason: "no-emoji" as const };

    const who = this.state.data?.profile.email ?? "";
    const existing = this.state.data?.chats
      .find((chat) => chat.id === input.chatId)
      ?.messages.find((message) => message.id === input.messageId);
    if (!existing) return { ok: false as const, reason: "unknown-message" as const };
    // Refused here for the same reason it is refused at the object: a row this
    // account cannot see is a row it cannot react to.
    if (existing.deletedAt) return { ok: false as const, reason: "gone" as const };

    const on = !isMineOn(existing, emoji, who);
    const next = setReaction(existing, emoji, who, on);
    if (!next) return { ok: false as const, reason: "refused" as const };

    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) =>
        chat.id === input.chatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === input.messageId ? { ...message, reactions: next } : message,
              ),
            }
          : chat,
      ),
    }));

    if (this.isLocal()) {
      messagesLocal.toggleReaction(input.chatId, input.messageId, emoji);
      return { ok: true as const };
    }

    const result = await messagesApi
      .react({ id: input.messageId, chatId: input.chatId, emoji, on })
      .catch(() => ({ ok: false as const, reason: "network" as const }));
    // The sync is what makes the other side's press land, and it is also what
    // corrects this one if the object refused.
    await this.sync();
    return { ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) };
  };

  /**
   * Applies an edit or a deletion to one of this account's own messages.
   *
   * The check is the same one the object makes: a message can only be changed by
   * whoever sent it, so a frame that names somebody else's row is refused here
   * rather than being quietly shown and then contradicted.
   */
  private async changeMessage(
    chatId: string,
    messageId: string,
    action: "edit" | "delete",
    text?: string,
  ) {
    const apply = (message: ChatMessage): ChatMessage =>
      action === "edit"
        ? { ...message, text: text ?? message.text, editedAt: Date.now() }
        : { ...message, deletedAt: Date.now() };

    const existing = this.state.data?.chats
      .find((chat) => chat.id === chatId)
      ?.messages.find((message) => message.id === messageId);
    if (!existing) return { ok: false as const, reason: "unknown-message" as const };
    if (!canManageMessage(existing)) return { ok: false as const, reason: "not-yours" as const };

    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: chat.messages.map((m) => (m.id === messageId ? apply(m) : m)) }
          : chat,
      ),
    }));

    if (this.isLocal()) {
      messagesLocal.changeMessage(chatId, messageId, action, text);
      return { ok: true as const };
    }
    const result = await messagesApi
      .changeMessage({
        id: messageId,
        chatId,
        action,
        ...(action === "edit" ? { text: text ?? "" } : {}),
      })
      .catch(() => ({ ok: false as const, reason: "network" as const }));
    await this.sync();
    return { ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) };
  }

  // ------------------------------------------------------------- offline up

  /**
   * Carries a conversation written on this device into the cloud.
   *
   * One message at a time and one row at a time: a queue that stopped halfway
   * would leave two accounts disagreeing about a conversation, and the next sync
   * would pick whichever side happened to be written last.
   */
  private async uploadLocalQueue() {
    const pending = messagesLocal.pending();
    if (pending.length === 0) return;
    for (const item of pending) {
      const result = await messagesApi
        .send({
          id: item.id,
          chatId: item.chatId,
          peerEmail: item.peerEmail,
          text: item.text,
          at: item.at,
          attachments: item.attachments,
        })
        .catch(() => ({ ok: false as const, reason: "network" as const }));
      if (!result.ok) return;
      messagesLocal.clearPending(item.id);
    }
  }

  /**
   * Sends what the outbox is holding, in the order it was written.
   *
   * Nothing is taken off the list until the object has it, so a message that
   * could not be sent is still there after a reload rather than lost.
   */
  flushOutbox = async () => {
    const email = this.state.email;
    if (!email || this.outbox.length === 0) return;
    const queued = [...this.outbox];
    for (const item of queued) {
      try {
        const result = await messagesApi
          .send({
            id: item.id,
            chatId: item.chatId,
            peerEmail: item.peerEmail,
            text: item.text,
            at: item.at,
            attachments: item.attachments,
          })
          .catch(() => ({ ok: false as const, reason: "network" as const }));
        if (!result.ok) continue;
        this.outbox = this.outbox.filter((entry) => entry.id !== item.id);
        this.writeOutbox(email);
        this.patchLocalStatus(item.id, "read");
      } catch {
        // A network that gives up mid queue leaves the rest for the next pass.
        return;
      }
    }
  };

  /** The bubble's own tick, for a message that has just been sent. */
  private patchLocalStatus(messageId: string, status: MessageStatus) {
    this.mutateData((data) => ({
      ...data,
      chats: data.chats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) =>
          message.id === messageId ? { ...message, status } : message,
        ),
      })),
    }));
  }
}

export const messagesStore = new MessagesStore();

/** URL for an attachment payload held in the Durable Object. */
export const attachmentUrl = (id: string) =>
  `/api/messages/attachment?id=${encodeURIComponent(id)}`;

export type { ChatContact, ChatMessage, MessageChat, MessagesProfile, IncomingAttachment };
