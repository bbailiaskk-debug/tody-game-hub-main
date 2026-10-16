import { serverFnFor } from "@/lib/server-fn";
import type {
  ChatImage,
  ChatFile,
  ChatMessage,
  StoredChat,
  ChatKvNamespace,
} from "@/lib/ai-chat-store-server";

/* Re-exported so the call sites that imported these types from here keep working. */
export type {
  ChatImage,
  ChatFile,
  ChatMessage,
  StoredChat,
  ChatKvNamespace,
} from "@/lib/ai-chat-store-server";

/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverGetAiChats as _serverGetAiChats } from "@/lib/ai-chat-store-server";
export const serverGetAiChats = serverFnFor<typeof _serverGetAiChats>("/api/ai/chats");

import type { serverSaveAiChats as _serverSaveAiChats } from "@/lib/ai-chat-store-server";
export const serverSaveAiChats = serverFnFor<typeof _serverSaveAiChats>("/api/ai/chats");
