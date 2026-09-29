import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CHATS,
  MAX_TEXT_LENGTH,
  type CallSignal,
  type ChatContact,
  type DirectoryEntry,
  type FriendsSnapshot,
  type IncomingAttachment,
  type MessageChangeAction,
  type MessageChat,
  type MessagesProfile,
  type MessagesSnapshot,
  type PresenceStatus,
} from "./messages-protocol";

/**
 * Typed client for the messages gateway.
 *
 * These calls go through plain `fetch` to `/api/messages/*` rather than
 * server functions on purpose. The gateway in `src/server.ts` already owns the
 * session cookie (read from the request, written to the response with ordinary
 * Headers), so the messages feature depends on no private framework internals
 * and behaves identically for REST calls and the websocket upgrade.
 */

const BASE = "/api/messages";

export class MessagesApiError extends Error {
  readonly status: number;
  readonly reason: string;

  constructor(status: number, reason: string) {
    super(reason);
    this.name = "MessagesApiError";
    this.status = status;
    this.reason = reason;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // Network-level failure: surfaced as a 0 status so callers can treat it as
    // "offline" rather than a hard failure.
    throw new MessagesApiError(0, "network");
  }

  if (!response.ok) {
    let reason = `http-${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) reason = body.error;
    } catch {
      // Keep the http fallback reason.
    }
    throw new MessagesApiError(response.status, reason);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export type SessionInfo = { ok: true; email: string; name: string } | { ok: false };

/** The relay list, as the server holds it. Empty means there is no relay. */
type TurnServers = { ok: boolean; urls?: string[]; username?: string; credential?: string };

export const messagesApi = {
  async authenticate(email: string, password: string) {
    return post<{ ok: true; email: string; name: string } | { ok: false; reason: string }>(
      "/session",
      { email, password },
    );
  },

  logout() {
    return post<{ ok: true }>("/logout");
  },

  session() {
    return call<SessionInfo>("/session");
  },

  sync() {
    return call<{ ok: true; snapshot: MessagesSnapshot } | { ok: false; reason: string }>("/");
  },

  send(input: {
    id: string;
    chatId: string;
    peerEmail: string;
    text: string;
    at: number;
    attachments?: IncomingAttachment[];
  }) {
    return post<{ ok: true } | { ok: false; reason: string }>("/message", {
      ...input,
      text: input.text.slice(0, MAX_TEXT_LENGTH),
      attachments: (input.attachments ?? []).slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
    });
  },

  /**
   * Edits or deletes a message the caller sent. The gateway mirrors it into the
   * peer's object, so the change reaches both sides without a second request.
   */
  changeMessage(input: { id: string; chatId: string; action: MessageChangeAction; text?: string }) {
    return post<{ ok: true } | { ok: false; reason: string }>("/message/change", {
      ...input,
      text: (input.text ?? "").slice(0, MAX_TEXT_LENGTH),
    });
  },

  /**
   * Relays one call frame. The gateway answers with the peer it resolved, so the
   * caller never names who gets rung.
   */
  callSignal(input: CallSignal) {
    return post<{ ok: true; relayed: boolean } | { ok: false; reason: string }>("/call", input);
  },

  contact(input: {
    id: string;
    name: string;
    about?: string;
    accent?: string;
    avatar?: string | null;
    peerEmail?: string;
  }) {
    return post<{ ok: true; name: string } | { ok: false; reason: string }>("/contact", input);
  },

  removeContact(id: string) {
    return post<{ ok: true } | { ok: false; reason: string }>("/contact/remove", { id });
  },

  profile(patch: {
    name?: string;
    about?: string;
    accent?: string;
    avatar?: string | null;
    status?: PresenceStatus;
  }) {
    return post<{ ok: true } | { ok: false; reason: string }>("/profile", patch);
  },

  markRead(chatId: string) {
    return post<{ ok: true }>("/read", { chatId });
  },

  removeChat(chatId: string) {
    return post<{ ok: true } | { ok: false; reason: string }>("/chat/remove", { chatId });
  },

  /** Creates the conversation in the cloud so a sync cannot delete it. */
  ensureChat(input: {
    chatId: string;
    peerEmail: string;
    peerName?: string;
    peerAvatar?: string | null;
  }) {
    return post<{ ok: true } | { ok: false; reason: string }>("/chat", input).catch(() => ({
      ok: false as const,
      reason: "network",
    }));
  },

  import(payload: { contacts: unknown[]; chats: unknown[] }) {
    return post<{
      ok: true;
      contacts: number;
      chats: number;
      messages: number;
    }>("/import", {
      contacts: (payload.contacts ?? []).slice(0, 200),
      chats: (payload.chats ?? []).slice(0, MAX_CHATS),
    });
  },

  async peerProfile(email: string) {
    return call<MessagesProfile>(`/profile?email=${encodeURIComponent(email)}`).catch(() => null);
  },

  /**
   * The relay a call falls back to, asked of the server at call time.
   *
   * Two devices can only meet directly when their networks allow it. Behind a
   * carrier's or an office's shared address neither can be reached, and the only
   * way through is a relay. Which relay is a deployment decision, so it is asked
   * for here rather than written into the bundle: turning it on is three
   * variables on the server, and it takes effect on the next call.
   *
   * Never throws. A call with no relay still works on every network that lets
   * two devices talk directly, which is most of them.
   */
  turn(): Promise<{ urls: string[]; username?: string; credential?: string } | null> {
    return call<TurnServers>("/turn")
      .then((result) => {
        const urls = (result?.urls ?? []).filter(Boolean);
        if (urls.length === 0) return null;
        return {
          urls,
          ...(result?.username ? { username: result.username } : {}),
          ...(result?.credential ? { credential: result.credential } : {}),
        };
      })
      .catch(() => null);
  },

  /** Relays a typing signal to the peer. Best effort, never blocks the composer. */
  typing(input: { chatId: string; peerEmail: string; typing: boolean }) {
    return post<{ ok: boolean }>("/typing", input).catch(() => ({ ok: false }));
  },

  // ------------------------------------------------------------------ friends

  /** Directory search by name or email. Never returns hashes or personal fields. */
  async searchPeople(query: string) {
    const q = query.trim();
    if (q.length < 2) return { ok: true as const, people: [] as DirectoryEntry[] };
    return call<{ ok: true; people: DirectoryEntry[] }>(`/people?q=${encodeURIComponent(q)}`).catch(
      () => ({ ok: true as const, people: [] as DirectoryEntry[] }),
    );
  },

  friends() {
    return call<{ ok: true; friends: FriendsSnapshot }>("/friend/list").catch(() => null);
  },

  sendFriendRequest(toEmail: string, toName: string) {
    return post<{ ok: true; id: string } | { ok: false; reason: string }>("/friend/request", {
      toEmail,
      toName,
    }).catch(() => ({ ok: false as const, reason: "network" }));
  },

  respondToFriendRequest(id: string, accept: boolean) {
    return post<{ ok: true; status: string } | { ok: false; reason: string }>("/friend/respond", {
      id,
      accept,
    }).catch(() => ({ ok: false as const, reason: "network" }));
  },

  removeFriend(id: string) {
    return post<{ ok: true } | { ok: false; reason: string }>("/friend/remove", { id }).catch(
      () => ({ ok: false as const, reason: "network" }),
    );
  },
};

export type { ChatContact, MessageChat };
