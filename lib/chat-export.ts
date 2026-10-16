/**
 * Taking a conversation out of the app: the transcript a person reads and the
 * record a program reads.
 *
 * Both are built as plain strings here, so what is downloaded can be asserted
 * without a browser. Only the file hand off lives in the view, because it is the
 * one part that needs a document.
 *
 * What a message can say is all there is to keep: the objects hold the text and
 * the attachment names, while the attachment payloads themselves stay in the
 * object, so an export names them rather than pretending to carry them.
 */

import {
  isVisibleMessage,
  type ChatContact,
  type MessageChat,
  type MessagesProfile,
} from "./messages-protocol";

/** `2024-03-11_14-27-08` — sorts by time and is legal in every file system. */
const stampFor = (value: number) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

const clockFor = (value: number, lang: string) =>
  new Date(value).toLocaleTimeString(lang === "bg" ? "bg-BG" : lang === "zh" ? "zh-CN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

const dayFor = (value: number, lang: string) =>
  new Date(value).toLocaleDateString(lang === "bg" ? "bg-BG" : lang === "zh" ? "zh-CN" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const safeName = (value: string) =>
  (value.trim() || "chat")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60);

/** The label a person wants to see: their contact's name, or the address. */
const peerNameFor = (chat: MessageChat, contact: ChatContact | null) =>
  contact?.name?.trim() || chat.peerEmail || "chat";

/**
 * The transcript, the way it reads in the app: a day heading, then one line per
 * message with who said it. Deleted messages are left out entirely, so a
 * deletion is a deletion in the export too.
 */
export const exportChatAsText = (
  chat: MessageChat,
  contact: ChatContact | null,
  profile: MessagesProfile,
  lang: string,
) => {
  const mine = profile.name || profile.email;
  const peer = peerNameFor(chat, contact);
  const lines: string[] = [`${t("title", lang)} — ${peer}`, ""];

  let day = "";
  for (const message of chat.messages) {
    if (!isVisibleMessage(message)) continue;
    const when = dayFor(message.at, lang);
    if (when !== day) {
      day = when;
      lines.push(`— ${when} —`, "");
    }
    const who = message.fromMe ? mine : peer;
    const time = clockFor(message.at, lang);
    const body = message.text.trim() || "";
    const files = (message.attachments ?? [])
      .map((item) => `[${item.kind === "image" ? "🖼" : "📎"} ${item.name}]`)
      .join(" ");
    const parts = [body, files].filter(Boolean).join(" ");
    lines.push(`[${time}] ${who}: ${parts || "—"}`);
    if (message.editedAt) lines.push(`        (${t("edited", lang)})`);
  }

  return `${lines.join("\n")}\n`;
};

/**
 * The whole record: every message with its ids, timestamps and attachment
 * metadata, plus who the two sides are. Enough to restore the conversation
 * somewhere else.
 */
export const exportChatAsJson = (
  chat: MessageChat,
  contact: ChatContact | null,
  profile: MessagesProfile,
) => ({
  format: "tody-game-hub/chat",
  version: 1,
  exportedAt: new Date().toISOString(),
  account: { email: profile.email, name: profile.name },
  peer: {
    email: chat.peerEmail,
    name: contact?.name ?? "",
    avatar: contact?.avatar ?? null,
  },
  chat: {
    id: chat.id,
    pinned: chat.pinned,
    muted: chat.muted,
    createdAt: chat.updatedAt,
  },
  messages: chat.messages.filter(isVisibleMessage).map((message) => ({
    id: message.id,
    fromMe: message.fromMe,
    text: message.text,
    at: new Date(message.at).toISOString(),
    editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null,
    attachments: (message.attachments ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
    })),
  })),
});

/** Every conversation the account holds, as one file. */
export const exportAllAsJson = (
  chats: MessageChat[],
  contacts: ChatContact[],
  profile: MessagesProfile,
) => ({
  format: "tody-game-hub/chats",
  version: 1,
  exportedAt: new Date().toISOString(),
  account: { email: profile.email, name: profile.name },
  chats: chats.map((chat) => {
    const contact = contacts.find((item) => item.peerEmail === chat.peerEmail) ?? null;
    return exportChatAsJson(chat, contact, profile);
  }),
});

/** The file name a download should carry. */
export const exportFileName = (peer: string, extension: "txt" | "json") =>
  `${stampFor(Date.now())}_${safeName(peer)}.${extension}`;

/**
 * Hands a string to the browser as a file. A no server, no upload: the export
 * never leaves the device.
 */
export const downloadText = (fileName: string, contents: string, mime: string) => {
  if (typeof document === "undefined") return false;
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // The object url is released on the next tick, once the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
};

const COPY = {
  bg: {
    title: "История на разговора",
    edited: "редактирано",
  },
  en: { title: "Conversation history", edited: "edited" },
  zh: { title: "聊天记录", edited: "已编辑" },
} as const;

const t = (key: keyof typeof COPY.bg, lang: string) =>
  COPY[(lang as keyof typeof COPY) ?? "en"]?.[key] ?? COPY.en[key];
