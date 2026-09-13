import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  History,
  Home,
  Image as ImageIcon,
  Lightbulb,
  LogIn,
  Menu,
  MessageSquareText,
  Mic,
  Music,
  Palette,
  Plus,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type FormEvent,
} from "react";

import { serverAiChat, type AiChatMessage } from "../lib/ai-functions";
import {
  serverGetAiChats,
  serverSaveAiChats,
  type ChatFile,
  type ChatImage,
  type ChatMessage,
  type StoredChat,
} from "../lib/ai-chat-store";
import { useSiteSettings } from "../components/site/theme";
import {
  parseStoredJson,
  readPersistedAuthSession,
  readPersistedUserProfile,
  storageGet,
  storageSet,
} from "../lib/local-persistence";

export const Route = createFileRoute("/ai")({
  validateSearch: (search: Record<string, unknown>) => ({
    chat: typeof search["chat"] === "string" ? search["chat"] : "",
  }),
  head: () => ({
    meta: [
      { title: "TK-Bot — Todor Khristov Gaming" },
      { name: "description", content: "Изкуственият интелект асистент на Todor Khristov Gaming." },
    ],
  }),
  component: AiPage,
});

type PendingImageItem = {
  kind: "image";
  id: string;
  mimeType: string;
  dataUrl: string;
};

type PendingFileItem = {
  kind: "video" | "audio" | "file";
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
};

type PendingItem = PendingImageItem | PendingFileItem;

let itemSequence = 1;
function nextItemId(): string {
  itemSequence += 1;
  return `p${itemSequence}`;
}

const CHATS_STORAGE_KEY = "tody_ai_chats_v1";
const CHATS_DB_NAME = "tody_ai_chats";
const CHATS_DB_STORE = "chats";

function sanitizeStoredChats(parsed: unknown): StoredChat[] {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is StoredChat =>
        !!item &&
        typeof item === "object" &&
        typeof (item as StoredChat).id === "string" &&
        typeof (item as StoredChat).title === "string" &&
        typeof (item as StoredChat).updatedAt === "number" &&
        typeof (item as StoredChat).userEmail === "string" &&
        Array.isArray((item as StoredChat).messages),
    )
    .map((item) => ({
      ...item,
      userEmail: item.userEmail.trim().toLowerCase(),
      messages: item.messages.filter(
        (message) =>
          !!message &&
          (message.role === "user" || message.role === "model") &&
          typeof message.text === "string" &&
          (message.text.trim() !== "" ||
            (Array.isArray(message.images) && message.images.length > 0) ||
            (Array.isArray(message.files) && message.files.length > 0)),
      ),
    }));
}

function openChatsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(CHATS_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CHATS_DB_STORE)) {
          db.createObjectStore(CHATS_DB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexeddb"));
    } catch (error) {
      reject(error);
    }
  });
}

async function idbGetChats(): Promise<StoredChat[] | null> {
  try {
    const db = await openChatsDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(CHATS_DB_STORE, "readonly");
      const request = transaction.objectStore(CHATS_DB_STORE).get("all");
      request.onsuccess = () => {
        const value = request.result;
        resolve(Array.isArray(value) ? (value as StoredChat[]) : null);
      };
      request.onerror = () => reject(request.error ?? new Error("indexeddb"));
    });
  } catch {
    return null;
  }
}

async function idbSetChats(chats: StoredChat[]): Promise<boolean> {
  try {
    const db = await openChatsDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CHATS_DB_STORE, "readwrite");
      transaction.objectStore(CHATS_DB_STORE).put(chats, "all");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb"));
      transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb"));
    });
    return true;
  } catch {
    return false;
  }
}

async function readStoredChats(): Promise<StoredChat[]> {
  if (typeof window === "undefined") return [];

  const stored = await idbGetChats();
  if (stored) return sanitizeStoredChats(stored);

  const legacy = parseStoredJson<unknown>(storageGet(CHATS_STORAGE_KEY), []);
  return sanitizeStoredChats(legacy);
}

async function writeStoredChats(chats: StoredChat[]) {
  if (typeof window === "undefined") return;

  const stripData = (chatsToSave: StoredChat[], keepNewest: boolean) =>
    chatsToSave.map((chat, index) => {
      if (keepNewest && index <= 0) return chat;
      return {
        ...chat,
        messages: chat.messages.map((message) => ({
          ...message,
          ...(message.images
            ? { images: message.images.map((image) => ({ ...image, dataUrl: "" })) }
            : {}),
          ...(message.files
            ? { files: message.files.map((file) => ({ ...file, dataUrl: "" })) }
            : {}),
        })),
      };
    });

  for (const variant of [chats, stripData(chats, true), stripData(chats, false)]) {
    if (await idbSetChats(variant)) return;
  }

  const tryLocalStorage = (chatsToSave: StoredChat[]) => {
    try {
      window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chatsToSave));
      return true;
    } catch {
      return false;
    }
  };
  if (tryLocalStorage(chats)) return;
  if (tryLocalStorage(stripData(chats, true))) return;
  tryLocalStorage(stripData(chats, false));
}

const MAX_ATTACHMENTS = 10;
const MAX_IMAGE_DIMENSION = 1280;
const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_DOC_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_FILE_BYTES = 100 * 1024 * 1024;
const IMAGE_THUMB_MAX = 400;
const IMAGE_THUMB_QUALITY = 0.72;

const IMAGE_GALLERY_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
};

function fileToChatImage(file: File): Promise<ChatImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not-image"));
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      reject(new Error("too-big"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("canvas"));
        return;
      }

      const keepPng = file.type === "image/png";
      if (!keepPng) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);

      const mimeType = keepPng ? "image/png" : "image/jpeg";
      resolve({ mimeType, dataUrl: canvas.toDataURL(mimeType, 0.82) });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("decode"));
    };
    image.src = objectUrl;
  });
}

function readFileAsDataUrl(file: File, type?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      reject(new Error("too-big"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl || !dataUrl.startsWith("data:")) {
        reject(new Error("read"));
        return;
      }
      resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(type && type !== file.type ? new File([file], file.name, { type }) : file);
  });
}

function imageMimeForName(name: string): string {
  const match = /\.(png|jpe?g|jfif|webp|gif|avif|bmp)$/i.exec(name || "");
  const extension = (match?.[1] ?? "").toLowerCase().replace("jfif", "jpeg");
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    default:
      return "";
  }
}

function isLikelyImage(file: File): boolean {
  const mimeType = (file.type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|jfif|webp|gif|avif|bmp)$/i.test(file.name || "");
}

function fileToChatFile(file: File): Promise<ChatFile> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_FILE_BYTES) {
      reject(new Error("too-big"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl || !dataUrl.startsWith("data:")) {
        reject(new Error("read"));
        return;
      }
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

function makeImageThumb(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (!dataUrl || !dataUrl.startsWith("data:")) {
        resolve(dataUrl);
        return;
      }
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(
            1,
            IMAGE_THUMB_MAX / Math.max(image.naturalWidth, image.naturalHeight),
          );
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            resolve(dataUrl);
            return;
          }
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          const thumb = canvas.toDataURL("image/jpeg", IMAGE_THUMB_QUALITY);
          resolve(thumb.startsWith("data:image/jpeg") ? thumb : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

type MessageSegment =
  { kind: "text"; content: string } | { kind: "code"; content: string; language: string };

function parseMessageSegments(raw: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const fencePattern = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", content: raw.slice(lastIndex, match.index) });
    }
    segments.push({
      kind: "code",
      language: (match[1] || "").trim(),
      content: (match[2] ?? "").replace(/\n+$/, ""),
    });
    lastIndex = match.index + (match[0] ?? "").length;
  }

  if (lastIndex < raw.length) {
    segments.push({ kind: "text", content: raw.slice(lastIndex) });
  }

  return segments;
}

function CodeBlock({ code, language, isBg }: { code: string; language: string; isBg: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be unavailable; keep the button inert.
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-[var(--tk-border)] bg-[var(--tk-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--tk-border)] bg-[var(--tk-panel)] px-3 py-1.5">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[var(--tk-muted)]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={isBg ? "Копирай кода" : "Copy code"}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-medium text-[var(--tk-accent-text)] transition-colors hover:bg-[var(--tk-border)]"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? (isBg ? "Копирано" : "Copied") : isBg ? "Копирай" : "Copy"}</span>
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words p-3 text-[0.8rem] leading-relaxed">
        <code className="font-mono [overflow-wrap:anywhere]">{code}</code>
      </pre>
    </div>
  );
}

function renderInlineCode(text: string, keyPrefix: string) {
  return text.split(/(`[^`\n]+`)/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-[var(--tk-border)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--tk-text)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return (
      <span key={key} className="whitespace-pre-wrap">
        {part}
      </span>
    );
  });
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function MessageContent({ text, isBg }: { text: string; isBg: boolean }) {
  return (
    <>
      {parseMessageSegments(text).map((segment, index) =>
        segment.kind === "code" ? (
          <CodeBlock
            key={`code-${index}`}
            code={segment.content}
            language={segment.language}
            isBg={isBg}
          />
        ) : (
          <span key={`text-${index}`}>{renderInlineCode(segment.content, `t-${index}`)}</span>
        ),
      )}
    </>
  );
}

function getCurrentUserEmail(): string {
  const session = readPersistedAuthSession();
  const profile = readPersistedUserProfile();
  const email = session?.email || profile?.email || storageGet("currentUserEmail");
  return (email ?? "").trim().toLowerCase();
}

function createChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createInitialForName(name: string) {
  return (name || "?").charAt(0).toUpperCase();
}

const CHAT_THEME_STORAGE_KEY = "tody_ai_chat_theme";

type ChatTheme = {
  key: string;
  nameBg: string;
  nameEn: string;
  bg: string;
  sidebar: string;
  panel: string;
  border: string;
  text: string;
  subtext: string;
  muted: string;
  accent: string;
  accentHover: string;
  accent2: string;
  accentText: string;
  accent50: string;
};

const CHAT_THEMES: ChatTheme[] = [
  {
    key: "midnight",
    nameBg: "Полунощ",
    nameEn: "Midnight",
    bg: "#0f0f10",
    sidebar: "#131316",
    panel: "#1e1f20",
    border: "#282a2c",
    text: "#e3e3e3",
    subtext: "#b0b3b8",
    muted: "#8e918f",
    accent: "#4285F4",
    accentHover: "#1f71e7",
    accent2: "#9b72cb",
    accentText: "#8ab4f8",
    accent50: "#4285F480",
  },
  {
    key: "aurora",
    nameBg: "Аврора",
    nameEn: "Aurora",
    bg: "#0b0f18",
    sidebar: "#101527",
    panel: "#161d33",
    border: "#28334c",
    text: "#e8edf7",
    subtext: "#b7c0d4",
    muted: "#8b93a7",
    accent: "#7c6cf0",
    accentHover: "#5f4fd8",
    accent2: "#22d3ee",
    accentText: "#b3a8ff",
    accent50: "#7c6cf080",
  },
  {
    key: "sunset",
    nameBg: "Залез",
    nameEn: "Sunset",
    bg: "#14100f",
    sidebar: "#1a1412",
    panel: "#241b17",
    border: "#3a2c26",
    text: "#f3e9e3",
    subtext: "#c9b3a6",
    muted: "#9a8f86",
    accent: "#f97316",
    accentHover: "#ea580c",
    accent2: "#f43f5e",
    accentText: "#fdba74",
    accent50: "#f9731680",
  },
  {
    key: "forest",
    nameBg: "Гора",
    nameEn: "Forest",
    bg: "#0d120f",
    sidebar: "#121915",
    panel: "#1a241e",
    border: "#2b3a31",
    text: "#e6eee8",
    subtext: "#b9c6be",
    muted: "#8fa398",
    accent: "#22c55e",
    accentHover: "#16a34a",
    accent2: "#84cc16",
    accentText: "#86efac",
    accent50: "#22c55e80",
  },
  {
    key: "ocean",
    nameBg: "Океан",
    nameEn: "Ocean",
    bg: "#0b1014",
    sidebar: "#10171d",
    panel: "#172028",
    border: "#283945",
    text: "#e6f0f5",
    subtext: "#bbd0dc",
    muted: "#8ca3b2",
    accent: "#0ea5e9",
    accentHover: "#0284c7",
    accent2: "#6366f1",
    accentText: "#7dd3fc",
    accent50: "#0ea5e980",
  },
  {
    key: "berry",
    nameBg: "Бери",
    nameEn: "Berry",
    bg: "#120e14",
    sidebar: "#191321",
    panel: "#221a2c",
    border: "#382a44",
    text: "#efe7f5",
    subtext: "#c3b1cf",
    muted: "#a08ea8",
    accent: "#d946ef",
    accentHover: "#c026d3",
    accent2: "#8b5cf6",
    accentText: "#f0abfc",
    accent50: "#d946ef80",
  },
];

type ChatThemeVars = Record<`--tk-${string}`, string>;

function chatThemeVars(theme: ChatTheme): ChatThemeVars {
  return {
    "--tk-bg": theme.bg,
    "--tk-sidebar": theme.sidebar,
    "--tk-panel": theme.panel,
    "--tk-border": theme.border,
    "--tk-text": theme.text,
    "--tk-subtext": theme.subtext,
    "--tk-muted": theme.muted,
    "--tk-accent": theme.accent,
    "--tk-accent-hover": theme.accentHover,
    "--tk-accent-2": theme.accent2,
    "--tk-accent-text": theme.accentText,
    "--tk-accent-50": theme.accent50,
  } as ChatThemeVars;
}

function readChatThemeKey(): string {
  const stored = storageGet(CHAT_THEME_STORAGE_KEY);
  return CHAT_THEMES.some((theme) => theme.key === stored) ? (stored as string) : "midnight";
}

function writeChatThemeKey(key: string) {
  storageSet(CHAT_THEME_STORAGE_KEY, key);
}

function getChatTheme(key: string): ChatTheme {
  return CHAT_THEMES.find((theme) => theme.key === key) ?? CHAT_THEMES[0]!;
}

const suggestionItems = (isBg: boolean) =>
  isBg
    ? [
        { icon: Lightbulb, label: "Кои дни излизат нови видеа?" },
        { icon: Volume2, label: "Как да открия канала в Spotify?" },
        { icon: Sparkles, label: "Какво представлява TK-Bot?" },
        { icon: MessageSquareText, label: "Как да вляза в Discord?" },
      ]
    : [
        { icon: Lightbulb, label: "When do new videos come out?" },
        { icon: Volume2, label: "How do I find you on Spotify?" },
        { icon: Sparkles, label: "What is TK-Bot?" },
        { icon: MessageSquareText, label: "How do I join the Discord?" },
      ];

type SidebarContentProps = {
  isBg: boolean;
  mounted: boolean;
  userEmail: string | null;
  userName: string | null;
  userAvatar: string | null;
  chats: StoredChat[];
  activeChatId: string | null;
  chatThemeKey: string;
  onSelectTheme: (key: string) => void;
  onNewChat: () => void;
  onOpenChat: (chat: StoredChat) => void;
  onDeleteChat: (chatId: string) => void;
  onClose: () => void;
  showCloseButton?: boolean;
};

function SidebarContent({
  isBg,
  mounted,
  userEmail,
  userName,
  userAvatar,
  chats,
  activeChatId,
  chatThemeKey,
  onSelectTheme,
  onNewChat,
  onOpenChat,
  onDeleteChat,
  onClose,
  showCloseButton = false,
}: SidebarContentProps) {
  const scopeEmail = (userEmail ?? "").trim().toLowerCase();
  const visibleChats = chats
    .filter((chat) => chat.userEmail === scopeEmail)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--tk-border)] p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--tk-accent)]/30 bg-[var(--tk-accent)]/10">
          <span
            aria-hidden="true"
            className="font-mono text-sm font-bold leading-none tracking-[0.2em] text-[var(--tk-accent-text)]"
          >
            TK
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold tracking-[0.2em] text-[var(--tk-text)]">
            TK-BOT
          </p>
          <p className="truncate font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--tk-accent-text)]">
            {isBg ? "Google Gemini — онлайн" : "Google Gemini — online"}
          </p>
        </div>
        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={isBg ? "Затвори менюто" : "Close menu"}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--tk-border)] bg-[var(--tk-panel)] text-[var(--tk-text)] transition-colors hover:bg-[var(--tk-border)]"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <Link
          to="/"
          onClick={onClose}
          aria-label={isBg ? "Начална страница" : "Home page"}
          className="flex w-full items-center gap-3 rounded-full border border-[var(--tk-border)] bg-[var(--tk-panel)] px-4 py-2.5 text-[0.85rem] text-[var(--tk-text)] transition-all duration-200 hover:border-[var(--tk-accent)]/40 hover:bg-[var(--tk-border)]"
        >
          <Home className="size-4 text-[var(--tk-accent-text)]" />
          {isBg ? "Начало" : "Home"}
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setThemeMenuOpen((current) => !current)}
            aria-haspopup="listbox"
            aria-expanded={themeMenuOpen}
            className="flex w-full items-center gap-3 rounded-full border border-[var(--tk-border)] bg-[var(--tk-panel)] px-4 py-2.5 text-[0.85rem] text-[var(--tk-text)] transition-all duration-200 hover:border-[var(--tk-accent)]/40 hover:bg-[var(--tk-border)]"
          >
            <Palette className="size-4 text-[var(--tk-accent-text)]" />
            {isBg ? "Чат теми" : "Chat themes"}
          </button>

          {themeMenuOpen ? (
            <>
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={() => setThemeMenuOpen(false)}
              />
              <div
                role="listbox"
                aria-label={isBg ? "Чат теми" : "Chat themes"}
                className="absolute left-0 top-full z-50 mt-2 w-[238px] rounded-2xl border border-[var(--tk-border)] bg-[var(--tk-sidebar)] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.5)]"
              >
                <p className="px-2 pb-1.5 pt-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--tk-muted)]">
                  {isBg ? "Чат теми" : "Chat themes"}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CHAT_THEMES.map((theme) => {
                    const isActive = theme.key === chatThemeKey;
                    return (
                      <button
                        key={theme.key}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          onSelectTheme(theme.key);
                          setThemeMenuOpen(false);
                        }}
                        className={`group flex flex-col items-center gap-1.5 rounded-xl border p-1.5 text-center transition-colors ${
                          isActive
                            ? "border-[var(--tk-accent)]/60 bg-[var(--tk-panel)]"
                            : "border-[var(--tk-border)] hover:bg-[var(--tk-panel)]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-9 w-full place-items-center overflow-hidden rounded-lg border"
                          style={{
                            backgroundColor: theme.bg,
                            borderColor: theme.border,
                          }}
                        >
                          <span
                            className="flex w-11 items-center gap-1 rounded-full px-1 py-0.5"
                            style={{ backgroundColor: theme.panel }}
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: theme.accentText }}
                            />
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: theme.accent }}
                            />
                          </span>
                        </span>
                        <span className="w-full truncate text-[0.58rem] font-medium text-[var(--tk-text)]">
                          {isBg ? theme.nameBg : theme.nameEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-3 rounded-full border border-[var(--tk-border)] bg-[var(--tk-panel)] px-4 py-2.5 text-[0.85rem] text-[var(--tk-text)] transition-all duration-200 hover:border-[var(--tk-accent)]/40 hover:bg-[var(--tk-border)]"
        >
          <Plus className="size-4 text-[var(--tk-accent-text)]" />
          {isBg ? "Нов чат" : "New chat"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 scrollbar-thin">
        <p className="flex items-center gap-2 px-2 py-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--tk-muted)]">
          <History className="size-3.5" />
          {isBg ? "История" : "History"}
        </p>

        {visibleChats.length === 0 ? (
          <p className="px-2 py-2 text-[0.75rem] leading-relaxed text-[var(--tk-muted)]">
            {isBg ? "Няма запазени чатове." : "No saved chats yet."}
          </p>
        ) : (
          <ul className="space-y-1">
            {visibleChats.map((chat) => (
              <li key={chat.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onOpenChat(chat)}
                  title={chat.title}
                  className={`block w-full truncate rounded-xl px-3 py-2.5 pr-10 text-left text-[0.8rem] transition-colors ${
                    chat.id === activeChatId
                      ? "bg-[var(--tk-accent)]/15 text-[var(--tk-text)]"
                      : "text-[var(--tk-subtext)] hover:bg-[var(--tk-panel)] hover:text-[var(--tk-text)]"
                  }`}
                >
                  {chat.title}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteChat(chat.id)}
                  aria-label={isBg ? "Изтрий чата" : "Delete chat"}
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[var(--tk-muted)] transition-colors hover:bg-[var(--tk-border)] hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--tk-border)] p-3">
        {mounted && userEmail ? (
          <Link
            to="/profile"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-[var(--tk-panel)]"
          >
            {userAvatar ? (
              <span
                role="img"
                aria-label="User avatar"
                style={{ backgroundImage: `url(${userAvatar})` }}
                className="size-9 shrink-0 rounded-full bg-cover bg-center bg-no-repeat"
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--tk-accent)] text-sm font-bold text-white">
                {createInitialForName(userName || userEmail)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.85rem] font-semibold text-[var(--tk-text)]">
                {userName || userEmail}
              </span>
              <span className="block truncate text-[0.7rem] text-[var(--tk-muted)]">
                {isBg ? "Профил" : "Profile"}
              </span>
            </span>
            <Settings className="size-4 shrink-0 text-[var(--tk-muted)]" />
          </Link>
        ) : (
          <Link
            to="/login"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--tk-accent)]/40 bg-[var(--tk-accent)]/10 px-4 py-2.5 font-mono text-[0.7rem] font-bold tracking-[0.18em] text-[var(--tk-accent-text)] transition-colors hover:bg-[var(--tk-accent)]/20"
          >
            <LogIn className="size-4" />
            {isBg ? "ВХОД" : "LOGIN"}
          </Link>
        )}
      </div>
    </div>
  );
}

type SpeechAlternative = { transcript: string };
type SpeechResultList = { length: number; [index: number]: ArrayLike<SpeechAlternative> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = globalThis as typeof globalThis & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition;
}

function AiPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const navigate = useNavigate();
  const { chat: chatParam } = Route.useSearch();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chatThemeKey, setChatThemeKey] = useState<string>("midnight");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);
  const remoteSyncRef = useRef(false);
  const lastSyncedScopeRef = useRef<string | null>(null);
  const syncInProgressRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    setMounted(true);
    setChatThemeKey(readChatThemeKey());

    const checkUser = () => {
      const profile = readPersistedUserProfile();
      const session = readPersistedAuthSession();
      const activeEmail = session?.email || profile?.email || storageGet("currentUserEmail");
      const storedName = session?.name || profile?.name || storageGet("userName");
      const storedAvatar = profile?.avatar ?? storageGet("userAvatar");

      if (!activeEmail || activeEmail.trim() === "") {
        setUserEmail(null);
        setUserName(null);
        setUserAvatar(null);
        return;
      }

      const defaultName = activeEmail.includes("@")
        ? (activeEmail.split("@")[0] ?? activeEmail)
        : activeEmail;

      setUserEmail(activeEmail.trim().toLowerCase());
      setUserName(storedName && storedName.trim() !== "" ? storedName : defaultName);
      setUserAvatar(storedAvatar && storedAvatar.trim() !== "" ? storedAvatar : null);
    };

    checkUser();

    const handleUserChange = () => checkUser();

    window.addEventListener("storage", handleUserChange);
    window.addEventListener("userStateChanged", handleUserChange);

    return () => {
      window.removeEventListener("storage", handleUserChange);
      window.removeEventListener("userStateChanged", handleUserChange);
    };
  }, []);

  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    void (async () => {
      let stored = await readStoredChats();
      const scope = getCurrentUserEmail();

      if (scope) {
        try {
          const remote = await serverGetAiChats({ data: { email: scope } });
          if (remote?.success) {
            stored = sanitizeStoredChats(remote.chats);
            void writeStoredChats(stored);
          }
        } catch (error) {
          console.warn("Failed to load AI chats from server.", error);
        }
      }

      lastSyncedScopeRef.current = scope || null;
      remoteSyncRef.current = true;

      setChats(stored);

      const target = stored.find((chat) => chat.id === chatParam && chat.userEmail === scope);
      if (target) {
        setActiveChatId(target.id);
        setMessages(target.messages);
      }

      setHistoryLoaded(true);
    })();
  }, [chatParam]);

  useEffect(() => {
    if (!historyLoaded || messages.length === 0) return;
    let cancelled = false;

    const heavyImages = messages.flatMap((message, messageIndex) =>
      (message.images ?? [])
        .map((image, imageIndex) => ({ messageIndex, imageIndex, image }))
        .filter(({ image }) => (image.dataUrl || "").length > 250_000),
    );
    if (heavyImages.length === 0) return;

    void (async () => {
      const nextMessages: ChatMessage[] = messages.map((message) => ({ ...message }));
      for (const { messageIndex, imageIndex, image } of heavyImages) {
        if (cancelled) return;
        const thumb = await makeImageThumb(image.dataUrl);
        if (cancelled || thumb === image.dataUrl) continue;
        const messageDraft = nextMessages[messageIndex];
        if (!messageDraft?.images) continue;
        nextMessages[messageIndex] = {
          ...messageDraft,
          images: messageDraft.images.map((item, index) =>
            index === imageIndex ? { ...item, dataUrl: thumb } : item,
          ),
        };
      }
      if (cancelled) return;
      setMessages(nextMessages);
      setChats((current) =>
        current.map((chat) =>
          chat.id === activeChatId ? { ...chat, messages: nextMessages } : chat,
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [historyLoaded, messages, activeChatId]);

  useEffect(() => {
    if (!historyLoaded || !remoteSyncRef.current) return;
    const scope = (userEmail ?? "").trim().toLowerCase();
    if (lastSyncedScopeRef.current === scope) return;
    lastSyncedScopeRef.current = scope;
    if (!scope) return;

    syncInProgressRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await serverGetAiChats({ data: { email: scope } });
        if (cancelled || !remote?.success) return;
        const next = sanitizeStoredChats(remote.chats);
        if (cancelled) return;
        setChats(next);
        const stillActive = next.some((chat) => chat.id === activeChatId);
        if (!stillActive) {
          setActiveChatId(null);
          setMessages([]);
        }
        void writeStoredChats(next);
      } catch (error) {
        console.warn("Failed to re-sync AI chats after login.", error);
      } finally {
        syncInProgressRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userEmail, historyLoaded, activeChatId]);

  useEffect(() => {
    if (!historyLoaded || syncInProgressRef.current) return;
    void writeStoredChats(chats);
    const scope = (userEmail ?? "").trim().toLowerCase();
    if (!scope || !remoteSyncRef.current) return;
    void serverSaveAiChats({ data: { email: scope, chats } }).catch((error) => {
      console.warn("Failed to save AI chats to server.", error);
    });
  }, [chats, historyLoaded, userEmail]);

  const scopeEmail = (userEmail ?? "").trim().toLowerCase();

  const saveActiveMessages = (chatId: string, nextMessages: ChatMessage[]) => {
    setChats((current) => {
      const existing = current.find((chat) => chat.id === chatId);
      if (!existing) return current;
      return current.map((chat) =>
        chat.id === chatId ? { ...chat, updatedAt: Date.now(), messages: nextMessages } : chat,
      );
    });
  };

  const addFileItems = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const roomLeft = MAX_ATTACHMENTS - pendingItems.length;
    if (roomLeft <= 0) return;

    const converted: PendingItem[] = [];
    for (const file of Array.from(files).slice(0, roomLeft)) {
      const mimeType = (file.type || "").toLowerCase();
      try {
        if (isLikelyImage(file)) {
          try {
            converted.push({ kind: "image", id: nextItemId(), ...(await fileToChatImage(file)) });
          } catch {
            try {
              const rawDataUrl = await readFileAsDataUrl(file, imageMimeForName(file.name));
              converted.push({
                kind: "image",
                id: nextItemId(),
                mimeType: file.type || imageMimeForName(file.name) || "image/png",
                dataUrl: rawDataUrl,
              });
            } catch {
              // Skip files that cannot be decoded into a viewable image.
            }
          }
        } else if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
          const kind = mimeType.startsWith("video/") ? "video" : "audio";
          try {
            const chatFile = await fileToChatFile(file);
            converted.push({ kind, id: nextItemId(), ...chatFile, size: file.size });
          } catch {
            // Persist large media as metadata-only: still shown in the gallery
            // and described to the AI, but not stored as base64.
            if (file.size <= MAX_MEDIA_FILE_BYTES) {
              converted.push({
                kind,
                id: nextItemId(),
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                dataUrl: "",
                size: file.size,
              });
            }
          }
        } else {
          try {
            const chatFile = await fileToChatFile(file);
            converted.push({ kind: "file", id: nextItemId(), ...chatFile, size: file.size });
          } catch {
            // Large documents stay attachable as metadata-only (named chip,
            // described to the AI server-side, not stored as base64).
            if (file.size <= MAX_DOC_FILE_BYTES) {
              converted.push({
                kind: "file",
                id: nextItemId(),
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                dataUrl: "",
                size: file.size,
              });
            }
          }
        }
      } catch {
        // Skip files that are not valid images or too large to read.
      }
    }

    if (converted.length > 0) {
      setPendingItems((current) => [...current, ...converted].slice(-MAX_ATTACHMENTS));
    }
  };

  const removePendingItem = (id: string) => {
    setPendingItems((current) => current.filter((item) => item.id !== id));
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pastedFiles.length === 0) return;

    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
    if (pastedText.trim()) {
      setPrompt((current) => (current ? `${current} ${pastedText}` : pastedText));
    }
    void addFileItems(pastedFiles);
  };

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    const fullImages: ChatImage[] = pendingItems
      .filter((item): item is PendingImageItem => item.kind === "image")
      .map(({ mimeType, dataUrl }) => ({ mimeType, dataUrl }));
    const fullFiles: ChatFile[] = pendingItems
      .filter((item): item is PendingFileItem => item.kind !== "image")
      .map(({ name, mimeType, dataUrl, size }) => ({ name, mimeType, dataUrl, size }));
    if ((!text && fullImages.length === 0 && fullFiles.length === 0) || loading) return;

    const storedImages: ChatImage[] = [];
    for (const image of fullImages) {
      storedImages.push({
        mimeType: image.mimeType,
        dataUrl: await makeImageThumb(image.dataUrl),
      });
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      ...(storedImages.length > 0 ? { images: storedImages } : {}),
      ...(fullFiles.length > 0 ? { files: fullFiles } : {}),
    };
    const history: AiChatMessage[] = [
      ...messages.map((message) => ({
        role: message.role,
        text: message.text,
        ...(message.images ? { images: message.images } : {}),
        ...(message.files ? { files: message.files } : {}),
      })),
      {
        role: "user",
        text,
        ...(fullImages.length > 0 ? { images: fullImages } : {}),
        ...(fullFiles.length > 0 ? { files: fullFiles } : {}),
      },
    ];

    const chatId = activeChatId;
    const isNewChat = !chatId;

    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setPendingItems([]);
    setAttachMenuOpen(false);
    setLoading(true);
    setError(null);

    try {
      const result = await serverAiChat({ data: { messages: history } });
      let replyMessage: ChatMessage | null = null;

      if (result.success && result.data) {
        const replyImage = "image" in result.data ? result.data.image : undefined;
        const storedReplyImage = replyImage
          ? { mimeType: replyImage.mimeType, dataUrl: await makeImageThumb(replyImage.dataUrl) }
          : undefined;
        replyMessage = {
          id: `model-${Date.now()}`,
          role: "model",
          text: result.data.text,
          ...(storedReplyImage ? { images: [storedReplyImage] } : {}),
        };
        setMessages((current) => [...current, replyMessage as ChatMessage]);
      } else {
        setError(
          result.success
            ? isBg
              ? "Няма отговор от AI. Опитай пак."
              : "No AI response. Please try again."
            : result.error || (isBg ? "Грешка при свързване с AI." : "Failed to reach the AI."),
        );
      }

      const finalMessages: ChatMessage[] = replyMessage
        ? [...messages, userMessage, replyMessage]
        : [...messages, userMessage];

      if (isNewChat) {
        const nextChatId = createChatId();
        const nextChat: StoredChat = {
          id: nextChatId,
          title:
            text.length > 0
              ? text.length > 48
                ? `${text.slice(0, 48)}…`
                : text
              : fullImages.length > 0
                ? isBg
                  ? "Изображение"
                  : "Image"
                : isBg
                  ? "Файл"
                  : "File",
          updatedAt: Date.now(),
          userEmail: scopeEmail,
          messages: finalMessages,
        };
        setChats((current) => [nextChat, ...current]);
        setActiveChatId(nextChatId);
        navigate({ to: "/ai", search: { chat: nextChatId }, replace: true });
      } else {
        saveActiveMessages(chatId, finalMessages);
      }
    } catch (caughtError) {
      console.warn("AI chat request failed.", caughtError);
      setError(isBg ? "Грешка при свързване с AI." : "Failed to reach the AI.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(prompt);
  };

  const startVoiceInput = () => {
    const SpeechCtor = getSpeechRecognitionCtor();
    if (!SpeechCtor || loading) {
      setError(
        isBg
          ? "Гласовото въвеждане не е налично в този браузър."
          : "Voice input is not available in this browser.",
      );
      return;
    }
    try {
      const recognition = new SpeechCtor();
      recognition.lang = isBg ? "bg-BG" : "en-US";
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        let transcript = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const alternative = event.results[index];
          const word = alternative?.[0]?.transcript?.trim();
          if (word) transcript += transcript ? ` ${word}` : word;
        }
        if (transcript) {
          setPrompt((current) => (current ? `${current} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setError(null);
    setPrompt("");
    setPendingItems([]);
    setAttachMenuOpen(false);
    setSidebarOpen(false);
    navigate({ to: "/ai", search: { chat: "" }, replace: true });
  };

  const openChat = (chat: StoredChat) => {
    setActiveChatId(chat.id);
    setMessages(chat.messages);
    setError(null);
    setPrompt("");
    setPendingItems([]);
    setAttachMenuOpen(false);
    setSidebarOpen(false);
    navigate({ to: "/ai", search: { chat: chat.id }, replace: true });
  };

  const deleteChat = (chatId: string) => {
    setChats((current) => current.filter((chat) => chat.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
      setError(null);
      setPrompt("");
      setPendingItems([]);
      setAttachMenuOpen(false);
      navigate({ to: "/ai", search: { chat: "" }, replace: true });
    }
  };

  const hasMessages = messages.length > 0;

  const activeTheme = getChatTheme(chatThemeKey);
  const themeVars = chatThemeVars(activeTheme);

  const selectChatTheme = (key: string) => {
    setChatThemeKey(key);
    writeChatThemeKey(key);
  };

  const sharedSidebarProps = {
    isBg,
    mounted,
    userEmail,
    userName,
    userAvatar,
    chats,
    activeChatId,
    chatThemeKey,
    onSelectTheme: selectChatTheme,
    onNewChat: startNewChat,
    onOpenChat: openChat,
    onDeleteChat: deleteChat,
  };

  const composer = (variant: "center" | "bottom") => {
    const isCenter = variant === "center";
    const hasAttachments = pendingItems.length > 0;
    const submitDisabled = (!prompt.trim() && !hasAttachments) || loading;
    const canAttach = !loading && pendingItems.length < MAX_ATTACHMENTS;
    const pendingTotal = pendingItems.length;

    const textareaPlaceholder = isCenter
      ? isBg
        ? "Попитай Gemini"
        : "Ask Gemini"
      : isBg
        ? "Попитай нещо за канала или игрите…"
        : "Ask about the channel or games…";

    const attachControl = (
      <div className={isCenter ? "relative shrink-0" : "relative"}>
        <button
          type="button"
          aria-label={isBg ? "Прикачи изображение или файл" : "Attach image or file"}
          aria-haspopup="menu"
          aria-expanded={attachMenuOpen}
          disabled={!canAttach}
          onClick={() => setAttachMenuOpen((current) => !current)}
          className={`grid size-9 place-items-center rounded-full text-[var(--tk-accent-text)] transition-colors hover:bg-[var(--tk-border)] disabled:opacity-40 ${
            attachMenuOpen ? "bg-[var(--tk-border)]" : ""
          }`}
        >
          <Plus
            className={`size-5 transition-transform duration-200 ${
              attachMenuOpen ? "rotate-45" : ""
            }`}
          />
        </button>

        {attachMenuOpen ? (
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={() => setAttachMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-2xl border border-[var(--tk-border)] bg-[var(--tk-sidebar)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.5)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAttachMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.8rem] text-[var(--tk-text)] transition-colors hover:bg-[var(--tk-border)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--tk-border)] text-[var(--tk-accent-text)]">
                  <ImageIcon className="size-4" />
                </span>
                {isBg ? "Прикачи изображение" : "Attach image"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAttachMenuOpen(false);
                  fileFileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.8rem] text-[var(--tk-text)] transition-colors hover:bg-[var(--tk-border)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--tk-border)] text-[var(--tk-accent-text)]">
                  <FileText className="size-4" />
                </span>
                {isBg ? "Прикачи файл" : "Attach file"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAttachMenuOpen(false);
                  videoFileInputRef.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.8rem] text-[var(--tk-text)] transition-colors hover:bg-[var(--tk-border)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--tk-border)] text-[var(--tk-accent-text)]">
                  <Video className="size-4" />
                </span>
                {isBg ? "Прикачи видео" : "Attach video"}
              </button>

              <div className="my-1 h-px bg-[var(--tk-border)]" aria-hidden="true" />
              {suggestionItems(isBg).map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    void sendMessage(label);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.8rem] text-[var(--tk-text)] transition-colors hover:bg-[var(--tk-border)]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--tk-border)] text-[var(--tk-accent-text)]">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1">{label}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    );

    const microphoneControl = (
      <button
        type="button"
        aria-label={isBg ? "Микрофон" : "Microphone"}
        title={isBg ? "Гласов въпрос" : "Voice input"}
        onClick={startVoiceInput}
        className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--tk-border)] ${
          listening ? "text-[var(--tk-accent)]" : "text-[var(--tk-accent-text)]"
        }`}
      >
        <Mic className={`size-5 ${listening ? "animate-pulse" : ""}`} />
      </button>
    );

    const sendControl = (
      <button
        type="submit"
        aria-label={isBg ? "Изпрати" : "Send"}
        disabled={submitDisabled}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--tk-accent)] text-[#fff] transition-all duration-200 hover:bg-[var(--tk-accent-hover)] hover:shadow-[0_0_16px_var(--tk-accent-50)] disabled:opacity-40 disabled:hover:shadow-none"
      >
        {loading ? <Send className="size-4 animate-pulse" /> : <ArrowUp className="size-4.5" />}
      </button>
    );

    return (
      <form
        onSubmit={handleSubmit}
        className={`shrink-0 border border-[var(--tk-border)] bg-[var(--tk-panel)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] transition-colors focus-within:border-[var(--tk-accent)]/50 ${
          isCenter
            ? `mt-8 w-full max-w-[640px] ${
                pendingTotal > 0 ? "rounded-[1.75rem] px-3 py-3" : "rounded-full px-3 py-2.5"
              }`
            : "rounded-[1.75rem] px-4 py-3"
        }`}
      >
        {pendingTotal > 0 ? (
          <div className="mb-1.5 flex h-[54px] w-full flex-nowrap items-center gap-2 overflow-x-auto scrollbar-thin">
            {pendingItems.map((item) => {
              const extension =
                item.kind === "image"
                  ? ""
                  : item.name.includes(".")
                    ? (item.name.split(".").pop()?.toUpperCase() ?? "")
                    : "";
              return (
                <div
                  key={item.id}
                  className="relative shrink-0"
                  title={item.kind === "image" ? undefined : item.name}
                >
                  <div className="size-12 overflow-hidden rounded-xl border border-[var(--tk-border)] bg-black/25">
                    {item.kind === "image" ? (
                      <img src={item.dataUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-[var(--tk-accent-text)]">
                        {item.kind === "video" ? (
                          <Video className="size-5" />
                        ) : item.kind === "audio" ? (
                          <Music className="size-5" />
                        ) : (
                          <FileText className="size-5" />
                        )}
                      </span>
                    )}
                  </div>
                  {extension ? (
                    <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-px font-mono text-[0.5rem] font-semibold leading-none text-white">
                      {extension}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={isBg ? "Премахни" : "Remove"}
                    onClick={() => removePendingItem(item.id)}
                    className="absolute right-0 top-0 grid size-4 place-items-center rounded-full border border-[var(--tk-border)] bg-[var(--tk-bg)] text-[var(--tk-text)] shadow transition-colors hover:bg-[var(--tk-border)]"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFileItems(event.target.files);
            event.target.value = "";
          }}
        />

        <input
          ref={fileFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFileItems(event.target.files);
            event.target.value = "";
          }}
        />

        <input
          ref={videoFileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFileItems(event.target.files);
            event.target.value = "";
          }}
        />

        {isCenter ? (
          <div className="flex items-center gap-1.5">
            {attachControl}
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  (event.currentTarget.form as HTMLFormElement).requestSubmit();
                }
              }}
              onPaste={handlePaste}
              rows={1}
              placeholder={textareaPlaceholder}
              className="max-h-[160px] min-h-[24px] w-full resize-none bg-transparent px-1 py-2 text-[0.95rem] text-[var(--tk-text)] outline-none placeholder:text-[var(--tk-muted)]"
            />
            {microphoneControl}
            {sendControl}
          </div>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  (event.currentTarget.form as HTMLFormElement).requestSubmit();
                }
              }}
              onPaste={handlePaste}
              rows={1}
              placeholder={textareaPlaceholder}
              className="max-h-[160px] w-full resize-none bg-transparent px-1 py-1 text-[0.95rem] text-[var(--tk-text)] outline-none placeholder:text-[var(--tk-muted)]"
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {attachControl}
                {microphoneControl}
                <span className="pl-1 text-[0.65rem] font-mono uppercase tracking-[0.15em] text-[var(--tk-muted)]">
                  {"Powered by Google"}
                </span>
              </div>
              {sendControl}
            </div>
          </>
        )}
      </form>
    );
  };

  return (
    <div
      className="ai-chat-root fixed inset-0 z-[50] flex overflow-hidden bg-[var(--tk-bg)] text-[var(--tk-text)]"
      style={themeVars as unknown as CSSProperties}
    >
      <aside className="h-full w-[264px] shrink-0 border-r border-[var(--tk-border)] bg-[var(--tk-sidebar)] max-md:hidden">
        <SidebarContent {...sharedSidebarProps} onClose={() => setSidebarOpen(false)} />
      </aside>

      <div
        className={`fixed inset-0 z-50 md:hidden ${sidebarOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
            sidebarOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[280px] max-w-[85vw] border-r border-[var(--tk-border)] bg-[var(--tk-sidebar)] shadow-[0_18px_45px_rgba(0,0,0,0.5)] transition-transform duration-200 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent
            {...sharedSidebarProps}
            onClose={() => setSidebarOpen(false)}
            showCloseButton
          />
        </aside>
      </div>

      <main
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void addFileItems(event.dataTransfer.files);
        }}
      >
        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 z-[60] grid place-items-center bg-[var(--tk-bg)]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[var(--tk-accent)] bg-[var(--tk-panel)]/90 px-10 py-8 shadow-[0_18px_45px_rgba(0,0,0,0.5)]">
              <span className="grid size-14 place-items-center rounded-full bg-[var(--tk-accent)]/15 text-[var(--tk-accent)]">
                <Upload className="size-7" />
              </span>
              <p className="text-lg font-bold text-[var(--tk-text)]">
                {isBg ? "Пуснете файл тук за качване" : "Drop your file here to upload"}
              </p>
              <p className="text-sm text-[var(--tk-muted)]">
                {isBg
                  ? "Изображения и файлове — до 10 прикачени елемента"
                  : "Images and files — up to 10 attachments"}
              </p>
            </div>
          </div>
        ) : null}
        <div className="mx-auto flex h-full w-full max-w-[760px] min-h-0 flex-1 flex-col px-5 pb-5 pt-6 md:pt-10">
          <div className="mb-6 flex items-center gap-3 md:mb-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label={isBg ? "Отвори менюто" : "Open menu"}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--tk-border)] bg-[var(--tk-panel)] text-[var(--tk-text)] transition-colors hover:bg-[var(--tk-border)] md:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>

          {!hasMessages ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <h1 className="max-w-[640px] text-center font-display text-[clamp(1.8rem,5vw,3rem)] font-bold leading-tight">
                <span className="bg-gradient-to-r from-[var(--tk-accent)] via-[var(--tk-accent-2)] to-[var(--tk-accent)] bg-clip-text text-transparent">
                  {isBg
                    ? "Имате ли нови идеи за разглеждане?"
                    : "Do you have any new ideas to explore?"}
                </span>
              </h1>
              {composer("center")}
            </div>
          ) : null}

          <div
            className={`${hasMessages ? "mt-8 min-h-0 flex-1" : ""} space-y-4 overflow-y-auto overflow-x-hidden scrollbar-thin`}
          >
            {messages.map((message) => {
              const imageCount = message.images?.length ?? 0;
              const fileCount = message.files?.length ?? 0;
              const shownImageCount =
                message.images?.filter(
                  (image) => image.dataUrl && image.dataUrl.startsWith("data:"),
                ).length ?? 0;
              const shownFileCount = message.files?.length ?? 0;
              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] whitespace-pre-wrap break-words rounded-[1.25rem] px-4 py-3 text-[0.92rem] leading-relaxed ${
                      message.role === "user"
                        ? "rounded-br-md bg-[var(--tk-accent)] text-white"
                        : "rounded-bl-md border border-[var(--tk-border)] bg-[var(--tk-panel)] text-[var(--tk-text)]"
                    }`}
                  >
                    {message.images && message.images.length > 0 ? (
                      <div
                        className={
                          imageCount === 1
                            ? "mb-2"
                            : `mb-2 grid ${
                                IMAGE_GALLERY_COLUMNS[Math.min(imageCount, 10)] ?? "grid-cols-2"
                              } gap-1.5`
                        }
                      >
                        {message.images
                          .filter((image) => image.dataUrl && image.dataUrl.startsWith("data:"))
                          .map((image, imageIndex) => (
                            <img
                              key={`${image.dataUrl.slice(0, 24)}-${imageIndex}`}
                              src={image.dataUrl}
                              alt=""
                              className={
                                imageCount >= 2
                                  ? "aspect-square w-full rounded-xl border border-[var(--tk-border)]/40 object-cover"
                                  : "max-h-48 w-auto max-w-full rounded-xl object-cover"
                              }
                            />
                          ))}
                      </div>
                    ) : null}
                    {message.files && message.files.length > 0 ? (
                      <div
                        className={
                          fileCount >= 2
                            ? "mb-2 grid grid-cols-2 gap-2"
                            : "mb-2 flex flex-wrap gap-1.5"
                        }
                      >
                        {message.files.map((file, fileIndex) => {
                          const hasContent = file.dataUrl && file.dataUrl.startsWith("data:");
                          const mimeType = (file.mimeType || "").toLowerCase();
                          const isVideo = mimeType.startsWith("video/");
                          const isAudio = mimeType.startsWith("audio/");
                          if (isVideo && hasContent) {
                            return (
                              <video
                                key={`${(file.dataUrl || file.name).slice(0, 24)}-${fileIndex}`}
                                src={file.dataUrl}
                                controls
                                className={
                                  fileCount >= 2
                                    ? "col-span-2 aspect-video w-full rounded-xl border border-[var(--tk-border)]"
                                    : "max-h-56 w-auto max-w-full rounded-xl border border-[var(--tk-border)]"
                                }
                              />
                            );
                          }
                          if (isAudio && hasContent) {
                            return (
                              <audio
                                key={`${(file.dataUrl || file.name).slice(0, 24)}-${fileIndex}`}
                                src={file.dataUrl}
                                controls
                                className={fileCount >= 2 ? "col-span-2 w-full" : "max-w-full"}
                              />
                            );
                          }
                          return (
                            <a
                              key={`${(file.dataUrl || file.name).slice(0, 24)}-${fileIndex}`}
                              href={hasContent ? file.dataUrl : undefined}
                              download={file.name}
                              className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--tk-border)] bg-[var(--tk-bg)] p-2.5 text-[var(--tk-text)] transition-colors hover:border-[var(--tk-accent)]/40"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--tk-panel)] text-[var(--tk-accent-text)]">
                                <FileText className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[0.75rem] text-[var(--tk-accent-text)]">
                                  {file.name}
                                </span>
                                {file.size ? (
                                  <span className="block text-[0.65rem] text-[var(--tk-muted)]">
                                    {formatFileSize(file.size)}
                                  </span>
                                ) : null}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                    {message.role === "model" ? (
                      <MessageContent text={message.text} isBg={isBg} />
                    ) : (
                      message.text ||
                      (imageCount > 0 || fileCount > 0
                        ? shownImageCount > 0 || shownFileCount > 0
                          ? ""
                          : isBg
                            ? imageCount > 0
                              ? "Изображение"
                              : "Файл"
                            : imageCount > 0
                              ? "Image"
                              : "File"
                        : "")
                    )}
                  </div>
                </div>
              );
            })}

            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center justify-center rounded-[1.25rem] rounded-bl-md border border-[var(--tk-border)] bg-[var(--tk-panel)] px-4 py-3.5">
                  <span className="animate-tk-bounce text-sm font-bold text-[var(--tk-accent)]">
                    ТК
                  </span>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="flex justify-center">
                <p className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-[0.75rem] text-red-400">
                  {error}
                </p>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          {hasMessages ? composer("bottom") : null}
        </div>
      </main>
    </div>
  );
}
