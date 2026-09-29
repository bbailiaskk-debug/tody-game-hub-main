import {
  IDLE_CALL,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CALLS_PER_CHAT,
  MAX_TEXT_LENGTH,
  callOutcomeFor,
  canManageMessage,
  createMessageId,
  friendshipId,
  initialsForName,
  isOnlineAt,
  normalizePresenceStatus,
  shouldOffer,
  type CallMedia as CallMediaKind,
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
  type IncomingAttachment,
  type MessageChat,
  type MessagesProfile,
  type PresenceStatus,
  type MessagesSnapshot,
  type MessageStatus,
  type TypingState,
  liveTyping,
  TYPING_TTL_MS,
} from "./messages-protocol";
import { MessagesApiError, messagesApi } from "./messages-api";
import { CallMedia } from "./call-media";
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
};

const CACHE_PREFIX = "tk-messages-cache:";
const LEGACY_PREFIX = "tk-messages:";
const MIGRATED_PREFIX = "tk-messages-migrated:";
const OUTBOX_PREFIX = "tk-messages-outbox:";

const POLL_MS = 30_000;
const RETRY_MS = 60_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** How long a call rings before the app gives up on it. */
const RING_TIMEOUT_MS = 45_000;
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
  call: IDLE_CALL,
  remoteStreams: {},
  localStream: null,
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
          signal?: CallSignal;
          roster?: CallRoster;
        };
        if (frame.type === "sync" || frame.type === "presence") {
          void this.sync();
          return;
        }
        if (frame.type === "call") {
          if (frame.signal) this.handleCallSignal(frame.signal);
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
        if (call.status === "idle" || call.status === "ended") return;
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
      onScreen: (sharing, surface) => {
        // The browser's own "stop sharing" button ends up here, and the room has
        // to hear about it: without this the other side keeps looking at a frozen
        // picture of somebody's desktop.
        const call = this.state.call;
        if (call.status === "idle" || call.status === "ended") return;
        if (call.screen === sharing) return;
        this.emit({
          call: { ...call, screen: sharing, screenSurface: sharing ? surface : "monitor" },
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
      this.ringTimer = setTimeout(() => {
        this.ringTimer = null;
        // Nobody picked up. Said once, by the app, rather than left ringing.
        if (this.state.call.status !== "outgoing") return;
        void this.endCall("timeout");
      }, RING_TIMEOUT_MS);
      return;
    }
    if (call.status === "connecting") this.startConnectDeadline();
  };

  /** The clock for a call that was answered and is still building its link. */
  private startConnectDeadline = () => {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      const call = this.state.call;
      if (call.status !== "connecting") return;
      // Somebody is there and the two sides never met, which is a network
      // problem rather than a person hanging up, and the history says so.
      this.emit({ call: { ...call, status: "ended", reason: "failed" } });
      this.media?.stop();
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
      this.markAnswered(false);
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
  private markAnswered = (activate = true) => {
    const call = this.state.call;
    if (call.status === "idle" || call.status === "ended") return;
    if (call.answeredAt > 0 && !activate) return;
    this.emit({
      call: {
        ...call,
        answeredAt: call.answeredAt || Date.now(),
        ...(activate ? { status: "active" as const } : {}),
      },
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
    this.emit({ call: { ...call, status: "connecting" } });
    this.markAnswered(false);
    this.clearCallDeadlines();
    this.startConnectDeadline();
    await this.relayCall({
      kind: "accept",
      callId: call.callId,
      chatId: call.chatId,
      to: host,
    });

    if (!media.supported) return { ok: true as const };
    try {
      const stream = await media.start({ video: call.starts === "video" });
      this.setCallLocalStream(stream);
    } catch {
      this.emit({ call: { ...this.state.call, camera: false, mic: false } });
    }

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
    this.markAnswered(false);
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
   */
  sendMessage = async (input: {
    chatId: string;
    peerEmail: string;
    text: string;
    attachments: IncomingAttachment[];
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
        ? {
            attachments: input.attachments.map((item) => ({
              id: item.id,
              kind: item.kind,
              name: item.name,
              mimeType: item.mimeType,
              size: item.size,
              stored: false,
              dataUrl: item.dataUrl,
            })),
          }
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
    this.outbox.push({ id, ...input, text: input.text.trim(), at });
    this.writeOutbox(this.state.email);
    await this.flushOutbox();
    return { ok: true as const, id };
  };

  editMessage = async (input: { chatId: string; messageId: string; text: string }) => {
    const text = input.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) return { ok: false as const, reason: "empty" as const };
    return this.changeMessage(input.chatId, input.messageId, "edit", text);
  };

  deleteMessage = async (input: { chatId: string; messageId: string }) =>
    this.changeMessage(input.chatId, input.messageId, "delete");

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
