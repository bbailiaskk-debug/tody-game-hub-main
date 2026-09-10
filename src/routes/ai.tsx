import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  History,
  Home,
  Lightbulb,
  LogIn,
  Menu,
  MessageSquareText,
  Paperclip,
  Plus,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { serverAiChat, type AiChatMessage } from "../lib/ai-functions";
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

type ChatImage = {
  mimeType: string;
  dataUrl: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  images?: ChatImage[];
};

type StoredChat = {
  id: string;
  title: string;
  updatedAt: number;
  userEmail: string;
  messages: ChatMessage[];
};

const CHATS_STORAGE_KEY = "tody_ai_chats_v1";

function readStoredChats(): StoredChat[] {
  const parsed = parseStoredJson<unknown>(storageGet(CHATS_STORAGE_KEY), []);
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
          Boolean((message.id && message.text) || message.text),
      ),
    }));
}

function writeStoredChats(chats: StoredChat[]) {
  storageSet(CHATS_STORAGE_KEY, JSON.stringify(chats));
}

const MAX_ATTACHED_IMAGES = 4;
const MAX_IMAGE_DIMENSION = 1280;
const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024;

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[#282a2c] p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[#4285F4]/30 bg-[#4285F4]/10">
          <span
            aria-hidden="true"
            className="font-mono text-sm font-bold leading-none tracking-[0.2em] text-[#8ab4f8]"
          >
            TK
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold tracking-[0.2em] text-[#e3e3e3]">TK-BOT</p>
          <p className="truncate font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[#8ab4f8]">
            {isBg ? "Google Gemini — онлайн" : "Google Gemini — online"}
          </p>
        </div>
        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={isBg ? "Затвори менюто" : "Close menu"}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[#282a2c] bg-[#1e1f20] text-[#e3e3e3] transition-colors hover:bg-[#282a2c]"
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
          className="flex w-full items-center gap-3 rounded-full border border-[#282a2c] bg-[#1e1f20] px-4 py-2.5 text-[0.85rem] text-[#e3e3e3] transition-all duration-200 hover:border-[#4285F4]/40 hover:bg-[#282a2c]"
        >
          <Home className="size-4 text-[#8ab4f8]" />
          {isBg ? "Начало" : "Home"}
        </Link>
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-3 rounded-full border border-[#282a2c] bg-[#1e1f20] px-4 py-2.5 text-[0.85rem] text-[#e3e3e3] transition-all duration-200 hover:border-[#4285F4]/40 hover:bg-[#282a2c]"
        >
          <Plus className="size-4 text-[#8ab4f8]" />
          {isBg ? "Нов чат" : "New chat"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <p className="flex items-center gap-2 px-2 py-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[#8e918f]">
          <History className="size-3.5" />
          {isBg ? "История" : "History"}
        </p>

        {visibleChats.length === 0 ? (
          <p className="px-2 py-2 text-[0.75rem] leading-relaxed text-[#8e918f]">
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
                      ? "bg-[#4285F4]/15 text-[#e3e3e3]"
                      : "text-[#b0b3b8] hover:bg-[#1e1f20] hover:text-[#e3e3e3]"
                  }`}
                >
                  {chat.title}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteChat(chat.id)}
                  aria-label={isBg ? "Изтрий чата" : "Delete chat"}
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#8e918f] transition-colors hover:bg-[#282a2c] hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[#282a2c] p-3">
        {mounted && userEmail ? (
          <Link
            to="/profile"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-[#1e1f20]"
          >
            {userAvatar ? (
              <span
                role="img"
                aria-label="User avatar"
                style={{ backgroundImage: `url(${userAvatar})` }}
                className="size-9 shrink-0 rounded-full bg-cover bg-center bg-no-repeat"
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#4285F4] text-sm font-bold text-white">
                {createInitialForName(userName || userEmail)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.85rem] font-semibold text-[#e3e3e3]">
                {userName || userEmail}
              </span>
              <span className="block truncate text-[0.7rem] text-[#8e918f]">
                {isBg ? "Профил" : "Profile"}
              </span>
            </span>
            <Settings className="size-4 shrink-0 text-[#8e918f]" />
          </Link>
        ) : (
          <Link
            to="/login"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#4285F4]/40 bg-[#4285F4]/10 px-4 py-2.5 font-mono text-[0.7rem] font-bold tracking-[0.18em] text-[#8ab4f8] transition-colors hover:bg-[#4285F4]/20"
          >
            <LogIn className="size-4" />
            {isBg ? "ВХОД" : "LOGIN"}
          </Link>
        )}
      </div>
    </div>
  );
}

function AiPage() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const navigate = useNavigate();
  const { chat: chatParam } = Route.useSearch();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    setMounted(true);

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

    const stored = readStoredChats();
    setChats(stored);

    const scope = getCurrentUserEmail();
    const target = stored.find((chat) => chat.id === chatParam && chat.userEmail === scope);
    if (target) {
      setActiveChatId(target.id);
      setMessages(target.messages);
    }

    setHistoryLoaded(true);
  }, [chatParam]);

  useEffect(() => {
    if (!historyLoaded) return;
    writeStoredChats(chats);
  }, [chats, historyLoaded]);

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

  const addImageFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const roomLeft = MAX_ATTACHED_IMAGES - pendingImages.length;
    if (roomLeft <= 0) return;

    const converted: ChatImage[] = [];
    for (const file of Array.from(files).slice(0, roomLeft)) {
      try {
        converted.push(await fileToChatImage(file));
      } catch {
        // Skip files that are not valid images or too large.
      }
    }

    if (converted.length > 0) {
      setPendingImages((current) => [...current, ...converted].slice(-MAX_ATTACHED_IMAGES));
    }
  };

  const removePendingImage = (index: number) => {
    setPendingImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  };

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    const images = pendingImages;
    if ((!text && images.length === 0) || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
      ...(images.length > 0 ? { images } : {}),
    };
    const history: AiChatMessage[] = [
      ...messages.map((message) => ({
        role: message.role,
        text: message.text,
        ...(message.images ? { images: message.images } : {}),
      })),
      { role: "user", text, ...(images.length > 0 ? { images } : {}) },
    ];

    const chatId = activeChatId;
    const isNewChat = !chatId;

    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setPendingImages([]);
    setLoading(true);
    setError(null);

    try {
      const result = await serverAiChat({ data: { messages: history } });
      let replyMessage: ChatMessage | null = null;

      if (result.success && result.data) {
        const replyImage = "image" in result.data ? result.data.image : undefined;
        replyMessage = {
          id: `model-${Date.now()}`,
          role: "model",
          text: result.data.text,
          ...(replyImage ? { images: [replyImage] } : {}),
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
              : isBg
                ? "Изображение"
                : "Image",
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

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setError(null);
    setPrompt("");
    setPendingImages([]);
    setSidebarOpen(false);
    navigate({ to: "/ai", search: { chat: "" }, replace: true });
  };

  const openChat = (chat: StoredChat) => {
    setActiveChatId(chat.id);
    setMessages(chat.messages);
    setError(null);
    setPrompt("");
    setPendingImages([]);
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
      setPendingImages([]);
      navigate({ to: "/ai", search: { chat: "" }, replace: true });
    }
  };

  const hasMessages = messages.length > 0;

  const sharedSidebarProps = {
    isBg,
    mounted,
    userEmail,
    userName,
    userAvatar,
    chats,
    activeChatId,
    onNewChat: startNewChat,
    onOpenChat: openChat,
    onDeleteChat: deleteChat,
  };

  return (
    <div className="fixed inset-0 z-[50] flex overflow-hidden bg-[#0f0f10] text-[#e3e3e3]">
      <aside className="h-full w-[264px] shrink-0 border-r border-[#282a2c] bg-[#131316] max-md:hidden">
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
          className={`absolute left-0 top-0 h-full w-[280px] max-w-[85vw] border-r border-[#282a2c] bg-[#131316] shadow-[0_18px_45px_rgba(0,0,0,0.5)] transition-transform duration-200 ${
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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[760px] min-h-0 flex-1 flex-col px-5 pb-5 pt-6 md:pt-10">
          <div className="mb-6 flex items-center gap-3 md:mb-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label={isBg ? "Отвори менюто" : "Open menu"}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-[#282a2c] bg-[#1e1f20] text-[#e3e3e3] transition-colors hover:bg-[#282a2c] md:hidden"
            >
              <Menu className="size-5" />
            </button>
          </div>

          {!hasMessages ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <h1 className="max-w-[640px] text-center font-display text-[clamp(1.8rem,5vw,3rem)] font-bold leading-tight">
                <span className="bg-gradient-to-r from-[#4285F4] via-[#9b72cb] to-[#4285F4] bg-clip-text text-transparent">
                  {isBg ? "С какво мога да ти помогна днес?" : "How can I help you today?"}
                </span>
              </h1>
              <p className="mt-4 max-w-[520px] text-center text-sm text-[#8e918f]">
                {isBg
                  ? "Въпросите се изпращат в реално време към Google Gemini от сайта."
                  : "Questions are sent in real time to Google Gemini from this site."}
              </p>
            </div>
          ) : null}

          <div className={`${hasMessages ? "mt-8 min-h-0 flex-1" : ""} space-y-4 overflow-y-auto`}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] whitespace-pre-wrap rounded-[1.25rem] px-4 py-3 text-[0.92rem] leading-relaxed ${
                    message.role === "user"
                      ? "rounded-br-md bg-[#4285F4] text-white"
                      : "rounded-bl-md border border-[#282a2c] bg-[#1e1f20] text-[#e3e3e3]"
                  }`}
                >
                  {message.images && message.images.length > 0 ? (
                    <div className="mb-2 grid gap-1.5">
                      {message.images.map((image, imageIndex) => (
                        <img
                          key={`${image.dataUrl.slice(0, 24)}-${imageIndex}`}
                          src={image.dataUrl}
                          alt=""
                          className="max-h-48 w-auto max-w-full rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {message.text}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center justify-center rounded-[1.25rem] rounded-bl-md border border-[#282a2c] bg-[#1e1f20] px-4 py-3.5">
                  <span className="animate-tk-bounce text-sm font-bold text-[#4285F4]">ТК</span>
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

          {!hasMessages ? (
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {suggestionItems(isBg).map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void sendMessage(label)}
                  className="group flex items-center gap-3 rounded-2xl border border-[#282a2c] bg-[#1e1f20] px-4 py-3.5 text-left text-[0.85rem] text-[#e3e3e3] transition-all duration-200 hover:border-[#4285F4]/40 hover:bg-[#282a2c]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#282a2c] text-[#8ab4f8] transition-colors group-hover:bg-[#4285F4]/15 group-hover:text-[#4285F4]">
                    <Icon className="size-4" />
                  </span>
                  <span className="leading-snug">{label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className={`${hasMessages ? "mt-8" : "mt-6"} shrink-0 rounded-[1.75rem] border border-[#282a2c] bg-[#1e1f20] px-4 py-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] transition-colors focus-within:border-[#4285F4]/50`}
          >
            {pendingImages.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingImages.map((image, imageIndex) => (
                  <div key={`${image.dataUrl.slice(0, 24)}-${imageIndex}`} className="relative">
                    <img
                      src={image.dataUrl}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-[#282a2c] bg-black/20 object-cover"
                    />
                    <button
                      type="button"
                      aria-label={isBg ? "Премахни изображението" : "Remove image"}
                      onClick={() => removePendingImage(imageIndex)}
                      className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-[#282a2c] bg-[#0f0f10] text-[#e3e3e3] transition-colors hover:bg-[#282a2c]"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void addImageFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  (event.currentTarget.form as HTMLFormElement).requestSubmit();
                }
              }}
              rows={1}
              placeholder={
                isBg ? "Попитай нещо за канала или игрите…" : "Ask about the channel or games…"
              }
              className="max-h-[160px] w-full resize-none bg-transparent px-1 py-1 text-[0.95rem] text-[#e3e3e3] outline-none placeholder:text-[#8e918f]"
            />
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={isBg ? "Прикачи изображение" : "Attach image"}
                  disabled={loading || pendingImages.length >= MAX_ATTACHED_IMAGES}
                  onClick={() => fileInputRef.current?.click()}
                  className="grid size-9 place-items-center rounded-full text-[#8ab4f8] transition-colors hover:bg-[#282a2c] disabled:opacity-40"
                >
                  <Paperclip className="size-4.5" />
                </button>
                <span className="pl-1 text-[0.65rem] font-mono uppercase tracking-[0.15em] text-[#8e918f]">
                  {"Powered by Google"}
                </span>
              </div>
              <button
                type="submit"
                aria-label={isBg ? "Изпрати" : "Send"}
                disabled={(!prompt.trim() && pendingImages.length === 0) || loading}
                className="grid size-9 place-items-center rounded-full bg-[#4285F4] text-[#fff] transition-all duration-200 hover:bg-[#1f71e7] hover:shadow-[0_0_16px_rgba(66,133,244,0.5)] disabled:opacity-40 disabled:hover:shadow-none"
              >
                {loading ? (
                  <Send className="size-4 animate-pulse" />
                ) : (
                  <ArrowUp className="size-4.5" />
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
