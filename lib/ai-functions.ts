import { serverFnFor } from "@/lib/server-fn";
import type {
  AiChatImage,
  AiChatFile,
  AiChatMessage,
  AiModelId,
  AiChatInput,
  GeminiKvNamespace,
  GeminiCachedResponse,
  AnthropicContentBlock,
  AnthropicMessage,
  GenerationConfig,
} from "@/lib/ai-functions-server";

/* Re-exported so the call sites that imported these types from here keep working. */
export type {
  AiChatImage,
  AiChatFile,
  AiChatMessage,
  AiModelId,
  AiChatInput,
  GeminiKvNamespace,
  GeminiCachedResponse,
  AnthropicContentBlock,
  AnthropicMessage,
  GenerationConfig,
} from "@/lib/ai-functions-server";

/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverAiChat as _serverAiChat } from "@/lib/ai-functions-server";
export const serverAiChat = serverFnFor<typeof _serverAiChat>("/api/ai/chat");
