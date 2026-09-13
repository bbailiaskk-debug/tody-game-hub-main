import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export type ChatImage = {
  mimeType: string;
  dataUrl: string;
};

export type ChatFile = {
  name: string;
  mimeType: string;
  dataUrl: string;
  size?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  images?: ChatImage[];
  files?: ChatFile[];
};

export type StoredChat = {
  id: string;
  title: string;
  updatedAt: number;
  userEmail: string;
  messages: ChatMessage[];
};

const MAX_CHATS_BYTES = 5 * 1024 * 1024;

type ChatKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

const keyForEmail = (email: string) => `ai-chats:${email.trim().toLowerCase()}`;

const getKv = (): ChatKvNamespace | null => {
  const workerEnv = env as unknown as { AUTH_USERS_KV?: ChatKvNamespace };
  if (workerEnv.AUTH_USERS_KV) return workerEnv.AUTH_USERS_KV;

  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: ChatKvNamespace } }
  ).CF_ENV;
  if (!cloudflareEnv?.AUTH_USERS_KV) return null;
  return cloudflareEnv.AUTH_USERS_KV;
};

const stripInlineData = (chats: StoredChat[]): StoredChat[] =>
  chats.map((chat) => ({
    ...chat,
    messages: (chat.messages ?? []).map((message) => ({
      ...message,
      images: (message.images ?? []).map((image) => ({ ...image, dataUrl: "" })),
      files: (message.files ?? []).map((file) => ({ ...file, dataUrl: "" })),
    })),
  }));

const noStoreChats: StoredChat[] = [];

export const serverGetAiChats = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email) return { success: false, chats: noStoreChats };

    const kv = getKv();
    if (!kv) return { success: false, chats: noStoreChats };

    try {
      const raw = await kv.get(keyForEmail(email));
      if (!raw) return { success: true, chats: noStoreChats };

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return { success: true, chats: noStoreChats };

      return { success: true, chats: parsed as StoredChat[] };
    } catch (error) {
      console.warn("Failed to read AI chats from KV.", error);
      return { success: false, chats: noStoreChats };
    }
  });

export const serverSaveAiChats = createServerFn({ method: "POST" })
  .validator((data: { email: string; chats: StoredChat[] }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email) return { success: false };

    const kv = getKv();
    if (!kv) return { success: false };

    try {
      const chats = Array.isArray(data.chats) ? data.chats : [];
      const json = JSON.stringify(chats);
      if (json.length <= MAX_CHATS_BYTES) {
        await kv.put(keyForEmail(email), json);
        return { success: true };
      }

      const strippedJson = JSON.stringify(stripInlineData(chats));
      if (strippedJson.length > MAX_CHATS_BYTES) return { success: false };
      await kv.put(keyForEmail(email), strippedJson);
      return { success: true };
    } catch (error) {
      console.warn("Failed to save AI chats to KV.", error);
      return { success: false };
    }
  });
