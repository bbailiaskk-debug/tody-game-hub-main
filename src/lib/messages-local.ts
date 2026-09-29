import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_CALLS_PER_CHAT,
  MAX_CHATS,
  MAX_MESSAGES_PER_CHAT,
  MAX_TEXT_LENGTH,
  createMessageId,
  initialsForName,
  isOnlineAt,
  normalizePresenceStatus,
  type CallOutcome,
  type CallRecord,
  type ChatContact,
  type ChatMessage,
  type IncomingAttachment,
  type MessageAttachment,
  type MessageChat,
  type MessagesProfile,
  type MessagesSnapshot,
} from "./messages-protocol";
import { parseStoredJson, storageGet, storageSet } from "./local-persistence";

/** A stored outcome is only ever one of the six, whatever the row claims. */
const sanitizeCallOutcome = (value: unknown): CallOutcome => {
  const outcomes: CallOutcome[] = [
    "completed",
    "missed",
    "declined",
    "cancelled",
    "busy",
    "failed",
  ];
  return outcomes.includes(value as CallOutcome) ? (value as CallOutcome) : "missed";
};

/**
 * Offline fallback for the messages hub.
 *
 * Implements the same surface as `messagesApi` but keeps everything in
 * localStorage, so the page is fully usable when the cloud cannot be reached.
 * Conversations opened here are explicitly marked as device-local and can be
 * pushed to the cloud later through `drainPendingUploads`.
 */

const KEY = "tk-messages-local";
const PENDING_KEY = "tk-messages-local-pending";
const SESSION_KEY = "tk-messages-local-session";

const minutes = (value: number) => value * 60 * 1000;
const hours = (value: number) => value * 60 * minutes(1);
const days = (value: number) => value * 24 * hours(1);

export type LocalData = {
  profile: MessagesProfile;
  contacts: ChatContact[];
  chats: MessageChat[];
};

export type PendingUpload = {
  id: string;
  chatId: string;
  peerEmail: string;
  text: string;
  at: number;
  attachments: IncomingAttachment[];
};

const seed = (now: number): LocalData => {
  const contacts: ChatContact[] = [
    {
      id: "local-tk",
      peerEmail: "",
      name: "Todor Khristov",
      initials: "TK",
      about: "Р РЋРЎвЂљРЎР‚Р С‘Р в„–Р С Р Р†РЎРѓРЎРЏР С”Р В° Р Р†Р ВµРЎвЂЎР ВµРЎР‚ Р Р† 20:00",
      accent: "#1DB954",
      avatar: null,
      online: true,
      lastSeenAt: now,
      lastSeenLabel: "",
      linked: false,
      status: "online",
    },
    {
      id: "local-nelka",
      peerEmail: "",
      name: "Р СњР ВµР В»Р С”Р В°",
      initials: "Р Сњ",
      about: "Р РЋР В°Р СР С• Р С‘Р С–РЎР‚Р С‘ Р С‘ Р СРЎС“Р В·Р С‘Р С”Р В°",
      accent: "#22d3ee",
      avatar: null,
      online: true,
      lastSeenAt: now - minutes(4),
      lastSeenLabel: "",
      linked: false,
      status: "online",
    },
    {
      id: "local-katiya",
      peerEmail: "",
      name: "Р С™Р В°РЎвЂљРЎРЏ",
      initials: "Р С™",
      about:
        "Р СњР Вµ Р СР Вµ Р С—Р С‘РЎв‚¬Р С‘ Р Р…Р В° РЎР‚Р В°Р В±Р С•РЎвЂљР В°РЎвЂљР В° СЂСџв„ўвЂљ",
      accent: "#f97316",
      avatar: null,
      online: false,
      lastSeenAt: now - hours(5),
      lastSeenLabel: "",
      linked: false,
      status: "online",
    },
  ];

  const message = (id: string, fromMe: boolean, text: string, at: number): ChatMessage => ({
    id,
    fromMe,
    text,
    at,
    status: "read",
  });

  return {
    profile: {
      email: "",
      name: "",
      about: "",
      accent: "#1DB954",
      avatar: null,
      online: true,
      lastSeenAt: now,
      status: "online",
    },
    contacts,
    chats: [
      {
        id: "local-chat-tk",
        peerEmail: "",
        pinned: true,
        muted: false,
        updatedAt: now - minutes(12),
        messages: [
          message(
            "l1",
            false,
            "Р вЂ”Р Т‘РЎР‚Р В°Р Р†Р ВµР в„–! Р В Р В°Р В·Р Т‘Р ВµР В»РЎР‰РЎвЂљ РЎР‚Р В°Р В±Р С•РЎвЂљР С‘ Р С‘ Р В±Р ВµР В· Р Р†РЎР‚РЎР‰Р В·Р С”Р В° СЂСџв„ўвЂљ",
            now - hours(2),
          ),
          message(
            "l2",
            true,
            "Р РЋРЎС“Р С—Р ВµРЎР‚, Р В±Р В»Р В°Р С–Р С•Р Т‘Р В°РЎР‚РЎРЏ!",
            now - hours(2) + 4,
          ),
          message(
            "l3",
            false,
            "Р В©Р Вµ РЎРѓР Вµ Р Р†РЎР‰РЎР‚Р Р…Р В° Р С”РЎР‰Р С Р С•Р В±Р В»Р В°Р С”Р В°, Р С”Р С•Р С–Р В°РЎвЂљР С• Р С‘Р СР В°Р С Р С‘Р Р…РЎвЂљР ВµРЎР‚Р Р…Р ВµРЎвЂљ.",
            now - minutes(12),
          ),
        ],
      },
      {
        id: "local-chat-nelka",
        peerEmail: "",
        pinned: false,
        muted: false,
        updatedAt: now - hours(1),
        messages: [
          message(
            "l4",
            true,
            "Р С™Р С•РЎРЏ РЎвЂ°Р Вµ Р С‘Р С–РЎР‚Р В°Р ВµР С Р Т‘Р Р…Р ВµРЎРѓ?",
            now - days(1),
          ),
          message("l5", false, "2048 Р Т‘Р С• 10? СЂСџВвЂћ", now - days(1) + minutes(3)),
        ],
      },
      {
        id: "local-chat-katiya",
        peerEmail: "",
        pinned: false,
        muted: true,
        updatedAt: now - days(2),
        messages: [
          message(
            "l6",
            false,
            "Р ВР СР В°РЎв‚¬ Р В»Р С‘ Р С‘Р Т‘Р ВµРЎРЏ Р С”Р В°Р С”Р Р†Р С• Р Т‘Р В° Р С—Р С•Р Т‘Р В°РЎР‚Р С‘Р С Р Р…Р В° Р СћР С•Р Т‘Р С•РЎР‚?",
            now - days(2),
          ),
          message(
            "l7",
            true,
            "Р СњР ВµРЎвЂ°Р С• Р В·Р ВµР В»Р ВµР Р…Р С• Р С‘ Р В±РЎР‰РЎР‚Р В·Р С• СЂСџВР‹",
            now - days(2) + hours(1),
          ),
        ],
      },
    ],
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitize = (value: unknown, now: number): LocalData => {
  const fallback = seed(now);
  if (!isRecord(value)) return fallback;

  const rawContacts = Array.isArray(value["contacts"]) ? value["contacts"] : [];
  const rawChats = Array.isArray(value["chats"]) ? value["chats"] : [];
  const rawProfile = isRecord(value["profile"]) ? value["profile"] : {};

  const contacts = rawContacts
    .map((entry): ChatContact | null => {
      if (!isRecord(entry)) return null;
      const id = String(entry["id"] ?? "").trim();
      const name = String(entry["name"] ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        peerEmail: String(entry["peerEmail"] ?? ""),
        name,
        initials: String(entry["initials"] ?? initialsForName(name)),
        about: String(entry["about"] ?? ""),
        accent: String(entry["accent"] ?? "#1DB954"),
        avatar: typeof entry["avatar"] === "string" ? entry["avatar"] : null,
        online: Boolean(entry["online"]),
        lastSeenAt: Number(entry["lastSeenAt"]) || 0,
        lastSeenLabel: String(entry["lastSeenLabel"] ?? ""),
        linked: Boolean(entry["linked"]),
        status: normalizePresenceStatus(entry["status"]),
      };
    })
    .filter((item): item is ChatContact => item !== null);

  const chats = rawChats
    .map((entry): MessageChat | null => {
      if (!isRecord(entry)) return null;
      const id = String(entry["id"] ?? "").trim();
      if (!id) return null;
      const rawMessages = Array.isArray(entry["messages"]) ? entry["messages"] : [];
      const messages = rawMessages
        .map((item, index): ChatMessage | null => {
          if (!isRecord(item)) return null;
          const text = String(item["text"] ?? "").trim();
          const rawAttachments = Array.isArray(item["attachments"]) ? item["attachments"] : [];
          const attachments: MessageAttachment[] = rawAttachments
            .filter((attachment): attachment is Record<string, unknown> => isRecord(attachment))
            .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
            .map((attachment) => {
              const dataUrl =
                typeof attachment["dataUrl"] === "string" ? attachment["dataUrl"] : "";
              return {
                id: String(attachment["id"] ?? `att-${index}`),
                kind: attachment["kind"] === "image" ? ("image" as const) : ("file" as const),
                name: String(attachment["name"] ?? "file"),
                mimeType: String(attachment["mimeType"] ?? "application/octet-stream"),
                size: Number(attachment["size"]) || 0,
                stored: true,
                ...(dataUrl ? { dataUrl } : {}),
              };
            });
          if (!text && attachments.length === 0 && !item["deletedAt"]) return null;
          const editedAt = Number(item["editedAt"]) || 0;
          const deletedAt = Number(item["deletedAt"]) || 0;
          return {
            id: String(item["id"] ?? `${id}-${index}`),
            fromMe: Boolean(item["fromMe"]),
            text,
            at: Number(item["at"]) || Date.now(),
            status: "read",
            ...(attachments.length ? { attachments } : {}),
            // Kept so an edit or a delete survives a reload of the fallback.
            ...(editedAt ? { editedAt } : {}),
            ...(deletedAt ? { deletedAt } : {}),
          };
        })
        .filter((item): item is ChatMessage => item !== null)
        .slice(-MAX_MESSAGES_PER_CHAT);
      // The call log is kept through a reload, so a missed call is still there
      // the next time the conversation is opened.
      const rawCalls = Array.isArray(entry["calls"]) ? entry["calls"] : [];
      const calls = rawCalls
        .filter((item): item is Record<string, unknown> => isRecord(item))
        .slice(-MAX_CALLS_PER_CHAT)
        .map((item) => ({
          callId: String(item["callId"] ?? ""),
          caller: String(item["caller"] ?? "")
            .trim()
            .toLowerCase(),
          starts: item["starts"] === "video" ? ("video" as const) : ("audio" as const),
          at: Number(item["at"]) || 0,
          endedAt: Number(item["endedAt"]) || 0,
          durationMs: Math.max(0, Number(item["durationMs"]) || 0),
          outcome: sanitizeCallOutcome(item["outcome"]),
          endedBy: String(item["endedBy"] ?? "")
            .trim()
            .toLowerCase(),
        }))
        .filter((item) => item.callId !== "");
      return {
        id,
        peerEmail: String(entry["peerEmail"] ?? ""),
        pinned: Boolean(entry["pinned"]),
        muted: Boolean(entry["muted"]),
        updatedAt: Number(entry["updatedAt"]) || Date.now(),
        messages,
        ...(calls.length ? { calls } : {}),
      };
    })
    .filter((item): item is MessageChat => item !== null)
    .slice(0, MAX_CHATS);

  return {
    profile: {
      email: String(rawProfile["email"] ?? ""),
      name: String(rawProfile["name"] ?? ""),
      about: String(rawProfile["about"] ?? ""),
      accent: String(rawProfile["accent"] ?? "#1DB954"),
      avatar: typeof rawProfile["avatar"] === "string" ? rawProfile["avatar"] : null,
      online: true,
      lastSeenAt: Date.now(),
      status: normalizePresenceStatus(rawProfile["status"]),
    },
    contacts: contacts.length ? contacts : fallback.contacts,
    chats: chats.length ? chats : fallback.chats,
  };
};

const read = (): LocalData => sanitize(parseStoredJson<unknown>(storageGet(KEY), null), Date.now());
const write = (data: LocalData) => storageSet(KEY, JSON.stringify(data));

const readPending = (): PendingUpload[] => {
  const parsed = parseStoredJson<unknown>(storageGet(PENDING_KEY), []);
  return Array.isArray(parsed) ? (parsed as PendingUpload[]) : [];
};

const writePending = (pending: PendingUpload[]) => {
  if (pending.length === 0) storageSet(PENDING_KEY, "[]");
  else storageSet(PENDING_KEY, JSON.stringify(pending.slice(-100)));
};

export const localModeAvailable = () => storageGet(SESSION_KEY) !== null;

export const messagesLocal = {
  seedNow() {
    const fresh = seed(Date.now());
    write(fresh);
    return fresh;
  },

  read,

  markUnlocked() {
    storageSet(SESSION_KEY, "1");
  },

  isUnlocked() {
    return storageGet(SESSION_KEY) === "1";
  },

  clear() {
    storageSet(KEY, JSON.stringify(seed(Date.now())));
    storageSet(PENDING_KEY, "[]");
  },

  toSnapshot(data: LocalData = read()): MessagesSnapshot {
    const now = Date.now();
    return {
      profile: data.profile,
      contacts: data.contacts.map((contact) => ({
        ...contact,
        online: isOnlineAt(contact.lastSeenAt, now),
      })),
      chats: data.chats,
      rev: now,
      serverTime: now,
      // Typing is a live signal; it is never replayed from a cached snapshot.
      typing: [],
    };
  },

  setProfile(patch: Partial<MessagesProfile>) {
    const data = read();
    data.profile = { ...data.profile, ...patch };
    write(data);
    return data;
  },

  addContact(input: {
    name: string;
    about?: string;
    accent?: string;
    avatar?: string | null;
    peerEmail?: string;
  }) {
    const data = read();
    const name = input.name.trim();
    if (!name) return { ok: false as const, reason: "invalid-name" };
    const contact: ChatContact = {
      id: `local-${createMessageId()}`,
      peerEmail: (input.peerEmail ?? "").trim().toLowerCase(),
      name,
      initials: initialsForName(name),
      about: input.about ?? "",
      accent: input.accent ?? "#1DB954",
      avatar: input.avatar ?? null,
      online: false,
      lastSeenAt: Date.now(),
      lastSeenLabel: "",
      linked: Boolean(input.peerEmail),
      status: "online",
    };
    data.contacts = [contact, ...data.contacts];
    write(data);
    return { ok: true as const, id: contact.id };
  },

  removeContact(id: string) {
    const data = read();
    const target = data.contacts.find((contact) => contact.id === id);
    data.contacts = data.contacts.filter((contact) => contact.id !== id);
    if (target) {
      data.chats = data.chats.filter((chat) => chat.peerEmail !== target.peerEmail);
    }
    write(data);
    return { ok: true as const };
  },

  removeChat(chatId: string) {
    const data = read();
    data.chats = data.chats.filter((chat) => chat.id !== chatId);
    write(data);
    return { ok: true as const };
  },

  /**
   * Appends a finished call to a conversation's history.
   *
   * The same rule as the cloud: one row per call, keyed by the call itself, so a
   * retried write lands on the same place instead of doubling the entry.
   */
  addCall(chatId: string, record: CallRecord) {
    const data = read();
    let written = false;
    data.chats = data.chats.map((chat) => {
      if (chat.id !== chatId) return chat;
      written = true;
      return {
        ...chat,
        calls: [
          ...(chat.calls ?? []).filter((entry) => entry.callId !== record.callId),
          record,
        ].slice(-MAX_CALLS_PER_CHAT),
      };
    });
    if (!written) return { ok: false as const, reason: "unknown-chat" as const };
    write(data);
    return { ok: true as const };
  },

  markRead(chatId: string) {
    const data = read();
    data.chats = data.chats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            messages: chat.messages.map((message) =>
              message.fromMe ? message : { ...message, status: "read" as const },
            ),
          }
        : chat,
    );
    write(data);
    return { ok: true as const };
  },

  /** Appends locally and queues the message for a later cloud upload. */
  send(input: {
    id: string;
    chatId: string;
    peerEmail: string;
    text: string;
    at: number;
    attachments: IncomingAttachment[];
  }) {
    const data = read();
    const message: ChatMessage = {
      id: input.id,
      fromMe: true,
      text: input.text.slice(0, MAX_TEXT_LENGTH).trim(),
      at: input.at,
      status: "read",
      ...(input.attachments.length
        ? {
            attachments: input.attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE).map((item) => ({
              id: item.id,
              kind: item.kind,
              name: item.name,
              mimeType: item.mimeType,
              size: item.size,
              stored: true,
              dataUrl: item.dataUrl,
            })),
          }
        : {}),
    };

    let found = false;
    data.chats = data.chats.map((chat) => {
      if (chat.id !== input.chatId) return chat;
      found = true;
      return { ...chat, updatedAt: input.at, messages: [...chat.messages, message] };
    });
    if (!found) {
      data.chats = [
        {
          id: input.chatId,
          peerEmail: input.peerEmail,
          pinned: false,
          muted: false,
          updatedAt: input.at,
          messages: [message],
        },
        ...data.chats,
      ];
    }
    write(data);

    const pending = readPending();
    pending.push({
      id: input.id,
      chatId: input.chatId,
      peerEmail: input.peerEmail,
      text: message.text,
      at: input.at,
      attachments: input.attachments,
    });
    writePending(pending);

    return { ok: true as const, id: input.id };
  },

  /**
   * Edits or deletes a message in the device-local fallback. There is no peer to
   * converge with here, so the tombstone is simply kept in localStorage.
   */
  changeMessage(chatId: string, messageId: string, action: "edit" | "delete", text?: string) {
    const data = read();
    let found = false;
    data.chats = data.chats.map((chat) => {
      if (chat.id !== chatId) return chat;
      return {
        ...chat,
        messages: chat.messages.map((message) => {
          if (message.id !== messageId || !message.fromMe) return message;
          found = true;
          return action === "edit"
            ? {
                ...message,
                text: (text ?? message.text).slice(0, MAX_TEXT_LENGTH).trim(),
                editedAt: Date.now(),
              }
            : { ...message, deletedAt: Date.now() };
        }),
      };
    });
    if (!found) return { ok: false as const };
    write(data);
    return { ok: true as const };
  },

  pending(): PendingUpload[] {
    return readPending();
  },
  clearPending(id: string) {
    writePending(readPending().filter((item) => item.id !== id));
  },
};
