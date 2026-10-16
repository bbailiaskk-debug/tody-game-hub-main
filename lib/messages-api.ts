import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CHATS,
  MAX_REACTION_CODE_POINTS,
  MAX_TEXT_LENGTH,
  type CallSignal,
  type ChatContact,
  type DirectoryEntry,
  type FriendsSnapshot,
  type Guild,
  type GuildTextChannel,
  type GuildVoiceChannel,
  type IncomingAttachment,
  type MessageChangeAction,
  type MessageChat,
  type MessagesProfile,
  type MessagesSnapshot,
  type PresenceStatus,
  type UploadedPart,
  type UploadSession,
  type VoiceRoster,
  type VoiceSignal,
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
        ...(init.body ? { "content-type": applicationJson } : {}),
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
      const body = (await response.json()) as { error?: string; reason?: string };
      if (body?.error) reason = body.error;
      else if (body?.reason) reason = body.reason;
    } catch {
      // Keep the http fallback reason.
    }
    throw new MessagesApiError(response.status, reason);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const applicationJson = "application/json";

/**
 * Sends bytes, rather than a description of bytes.
 *
 * The other calls in this file are all JSON and none of them set a content type
 * of their own, because JSON.stringify has already made the body into text. A
 * part of a file is not that: it is handed over as the stream it is, with the
 * type the file itself claims, and the browser reads it from disk rather than
 * from a string this process had to build first.
 */
async function callBytes(
  path: string,
  body: Blob,
  contentType: string,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "PUT",
      body,
      signal: signal ?? null,
      credentials: "same-origin",
      headers: { "content-type": contentType },
    });
  } catch {
    throw new MessagesApiError(0, "network");
  }
  if (!response.ok) {
    let reason = `http-${response.status}`;
    try {
      const parsed = (await response.json()) as { error?: string; reason?: string };
      if (parsed?.error) reason = parsed.error;
      else if (parsed?.reason) reason = parsed.reason;
    } catch {
      // Keep the http fallback reason.
    }
    throw new MessagesApiError(response.status, reason);
  }
  return response;
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
      attachments: (input.attachments ?? [])
        .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
        // The payload is a browser-side field and must never be serialised. A
        // message carrying one is a message carrying four gigabytes into a JSON
        // body, and the gateway would refuse it — or worse, try.
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
          ...(item.dataUrl ? { dataUrl: item.dataUrl } : {}),
        })),
    });
  },

  // ---------------------------------------------------------------- uploads

  /**
   * Opens an upload and returns the handle the parts are sent against.
   *
   * The gateway works out where the file will land from the session and the
   * attachment id, so this carries a size and nothing else about where.
   */
  openUpload(input: { id: string; size: number; mimeType: string }, signal?: AbortSignal) {
    const query = new URLSearchParams({
      id: input.id,
      size: String(Math.max(1, Math.round(input.size))),
      type: input.mimeType || "application/octet-stream",
    });
    return call<UploadSession | { ok: false; error: string }>(`/upload?${query.toString()}`, {
      method: "POST",
      ...(signal ? { signal } : {}),
    });
  },

  /** A whole file, for one that fits in a single part. */
  putUpload(input: { id: string; mimeType: string }, body: Blob, signal?: AbortSignal) {
    const query = new URLSearchParams({
      id: input.id,
      type: input.mimeType || "application/octet-stream",
    });
    return callBytes(`/upload/object?${query.toString()}`, body, input.mimeType, signal);
  },

  /** One part of a file that is too big to send at once. */
  async putUploadPart(
    input: { id: string; uploadId: string; partNumber: number; mimeType: string },
    body: Blob,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      id: input.id,
      upload: input.uploadId,
      part: String(input.partNumber),
      type: input.mimeType || "application/octet-stream",
    });
    const response = await callBytes(
      `/upload/part?${query.toString()}`,
      body,
      input.mimeType,
      signal,
    );
    return (await response.json()) as { ok: true; etag: string; partNumber: number };
  },

  /** Closes the upload, which is the moment the object actually exists. */
  completeUpload(input: { id: string; uploadId: string }, parts: UploadedPart[]) {
    const query = new URLSearchParams({ id: input.id, upload: input.uploadId });
    return post<{ ok: true; key: string; size: number } | { ok: false; reason: string }>(
      `/upload/complete?${query.toString()}`,
      { parts },
    );
  },

  /**
   * Throws the parts away.
   *
   * Only worth calling when an upload will not be finished: the service keeps
   * unfinished parts until a lifecycle rule clears them, which is a day or more
   * later and costs storage in the meantime.
   */
  abortUpload(input: { id: string; uploadId: string }) {
    const query = new URLSearchParams({ id: input.id, upload: input.uploadId });
    return post<{ ok: true } | { ok: false; reason: string }>(
      `/upload/abort?${query.toString()}`,
    ).catch(() => ({ ok: false as const, reason: "network" }));
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
   * Adds or takes off one person's reaction to one message.
   *
   * Its own route because the rule is the opposite one to `changeMessage`: a
   * reaction is the only change either side may make to the other's message. The
   * gateway mirrors it, so it reaches both objects in one request.
   */
  react(input: { id: string; chatId: string; emoji: string; on: boolean }) {
    return post<{ ok: true } | { ok: false; reason: string }>("/message/react", {
      ...input,
      // One emoji and nothing else. Cut here as well as at the gateway, because
      // this is the half a paste takes the long way round.
      emoji: (input.emoji ?? "").trim().slice(0, MAX_REACTION_CODE_POINTS * 4),
      on: input.on === true,
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

  // ---------------------------------------------------------- servers & voice

  /**
   * Makes a server, with the caller as its owner.
   *
   * The gateway answers with the stored row rather than echoing what was sent,
   * so the two letters on the roundel and the owner are whatever the object
   * settled on and every device draws the same one.
   */
  createGuild(input: { id: string; name: string; accent?: string }) {
    return post<{ ok: true; guild: Guild } | { ok: false; reason: string }>("/guild/create", {
      ...input,
      name: input.name.trim().slice(0, 60),
    }).catch(() => ({ ok: false as const, reason: "network" }));
  },

  renameGuild(id: string, name: string) {
    return post<{ ok: true; guild: Guild } | { ok: false; reason: string }>("/guild/upsert", {
      id,
      name: name.trim().slice(0, 60),
    }).catch(() => ({ ok: false as const, reason: "network" }));
  },

  deleteGuild(id: string) {
    return post<{ ok: true } | { ok: false; reason: string }>("/guild/remove", { id }).catch(
      () => ({
        ok: false as const,
        reason: "network",
      }),
    );
  },

  /** Puts somebody in a server, or takes them out of it. */
  guildMember(input: { guildId: string; email: string; remove?: boolean }) {
    return post<{ ok: true } | { ok: false; reason: string }>("/guild/member", input).catch(() => ({
      ok: false as const,
      reason: "network",
    }));
  },

  /**
   * Walks everybody who is already a friend into a new server.
   *
   * One request for the whole list. The client cannot say who: the server reads
   * the addresses out of the caller's own friendship list, so this only carries
   * which server, and a fifty-person invitation is one round trip rather than
   * fifty.
   */
  guildMembers(input: { guildId: string }) {
    return post<{ ok: true; added: number; wanted: number } | { ok: false; reason: string }>(
      "/guild/members",
      input,
    ).catch(() => ({ ok: false as const, reason: "network" }));
  },

  /** Adds, renames or removes a channel. The object checks who may. */
  guildChannel(input: {
    guildId: string;
    id: string;
    kind: "text" | "voice";
    name: string;
    topic?: string;
    remove?: boolean;
    order?: number;
  }) {
    return post<
      | { ok: true; channel: GuildTextChannel | GuildVoiceChannel | null }
      | { ok: false; reason: string }
    >("/guild/channel", input).catch(() => ({ ok: false as const, reason: "network" }));
  },

  /**
   * Sends one frame about a voice channel.
   *
   * The roster comes back on a join, which is how a phone learns who it has to
   * offer a connection to. It is asked for here rather than waited for on the
   * websocket because the object that answers knows the room even when this
   * device's copy of it is a moment behind.
   */
  async voiceSignal(
    input: Omit<VoiceSignal, "roster" | "from">,
  ): Promise<{ ok: true; roster?: VoiceRoster } | { ok: false; reason: string }> {
    return post<{ ok: true; roster?: VoiceRoster } | { ok: false; reason: string }>("/voice", input)
      .then((result) => {
        // A roster with nobody in it is one that does not know yet, not one
        // announcing an empty room, so it is dropped rather than applied.
        if (result.ok && result.roster && result.roster.presences.length === 0) {
          return { ok: true as const };
        }
        return result.ok
          ? { ok: true as const, ...(result.roster ? { roster: result.roster } : {}) }
          : { ok: false as const, reason: result.reason };
      })
      .catch(() => ({ ok: false as const, reason: "network" }));
  },
};

export type { ChatContact, MessageChat };
