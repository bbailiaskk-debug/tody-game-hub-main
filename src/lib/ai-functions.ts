import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export type AiChatImage = {
  mimeType: string;
  dataUrl: string;
};

export type AiChatFile = {
  name: string;
  mimeType: string;
  dataUrl: string;
  size?: number;
};

export type AiChatMessage = {
  role: "user" | "model";
  text: string;
  images?: AiChatImage[];
  files?: AiChatFile[];
};

type AiChatInput = {
  messages: AiChatMessage[];
};

type GeminiKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

type GeminiCachedResponse = {
  success: boolean;
  error?: string;
  data?: { text: string; image?: AiChatImage };
};

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

const MAX_ATTACHMENTS = 10;

const GEMINI_TIMEOUT_MS_DEFAULT = 90_000;

const GEMINI_THINKING_BUDGET_DEFAULT = 1024;

const MAX_INLINE_MEDIA_BYTES = 8 * 1024 * 1024;

const IMAGE_GEN_MODEL_DEFAULT = "gemini-3.1-flash-image";

const IMAGE_INTENT_DRAW =
  /(^|[\s,.;:!?(-])(нарисувай ми|нарисувай|рисувай|draw me|draw)([\s,.;:!?)-]|$)/i;
const IMAGE_INTENT_GEN = /(генерирай|създай|generate|create|make)\b/i;
const IMAGE_INTENT_NOUN = /\b(image|picture|изображение|снимка|картинка|илюстрация)\b/i;

const IMAGE_PROMPT_STRIP = new RegExp(
  "^(моля[\\s,!]*)?(?:нарисувай ми|нарисувай|рисувай|draw me|draw|" +
    "генерирай изображение на|генерирай изображение|генерирай снимка на|генерирай снимка|" +
    "генерирай картинка на|генерирай картинка|генерирай|" +
    "създай изображение на|създай изображение|създай снимка на|създай снимка|" +
    "създай картинка на|създай картинка|създай|" +
    "generate an? image of|generate an? image|generate a picture|generate picture|generate|" +
    "create an? image of|create an? image|create a picture|create picture|create|" +
    "make me an? image of|make an? image of|make me a picture of|make an? image|make a picture|" +
    "make)" +
    "\\s*",
  "i",
);

const SYSTEM_PROMPT = `Ти си TK-Bot — официалният AI асистент на Todor Khristov Gaming.
Отговаряй кратко, ясно и полезно. По подразбиране отговаряй на български; ако потребителят пише на друг език, отговори на същия език.

Когато отговорът съдържа код, конфигурационни променливи (например .env ключове), команди за терминал или друг текст, който потребителят би искал да копира, ВИНАГИ го поставяй в markdown код блок, ограден с тройни обратни кавички (\`\`\`), като посочиш езика за синтаксис (например \`\`\`bash, \`\`\`ts, \`\`\`env, \`\`\`json). Никога не показвай такива стойности като обикновен текст в изречение — винаги ги слагай в отделен код блок.

Никога не казвай, че не можеш да отваряш или четеш линкове. Когато получиш линк, разпознай към какво сочи и отговори полезно.

Можеш да приемаш и анализираш снимки и файлове, изпратени чрез бутона „Прикачи" или копирани и поставени (paste, Ctrl+V) директно в чата. Когато получиш изображение, го разгледай детайлно, извади нужната информация и отговори на въпросите на потребителя на базата на съдържанието му. Когато получиш файл (например текст, код или документ), го прочети внимателно и го използвай, за да помогнеш на потребителя.

Можеш да приемаш, копираш и поставяш (paste) видеоклипове и мултимедийни файлове директно в чата. Когато получиш видео, го анализирай по неговите кадри или метаданта, извлечи полезна информация и отговори на базата на съдържанието му.

Структура на сайта Tody Game Hub:
- / — начална страница.
- /games — списък с игрите на сайта.
- /ai — AI чатът (TK-Bot); параметърът ?chat=... в URL-а сочи конкретен разговор от историята на чата.
- /music — музикална секция на канала.
- /info — инфо и контакт страница.
- /login — вход в акаунт; /profile — профилът на потребителя.
- Игри в сайта: 2048, Шах, Кръстче-Нуличка и Chrome Dinosaur.

Познания за канала:
- YouTube канал: https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ (Todor Khristov Gaming)
- TikTok: https://www.tiktok.com/@todorkhristovgmaing
- Spotify: https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20g
- Discord сървър: https://discord.gg/uRNGhKf7vC
- Нови видеа излизат всеки вторник и петък.
Ако не знаеш отговора, признай честно и предложи контакт с Discord общността.`;

function readSecret(name: string): string {
  try {
    const workerEnv = env as unknown as Record<string, unknown>;
    const workerValue = workerEnv[name];
    if (typeof workerValue === "string" && workerValue.trim()) return workerValue.trim();
  } catch {
    // Fall through to other sources.
  }

  try {
    const nodeValue = globalThis.process?.env?.[name];
    if (nodeValue?.trim()) return nodeValue.trim();
  } catch {
    // Fall through to other sources.
  }

  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const metaValue = metaEnv?.[name];
    if (typeof metaValue === "string" && metaValue.trim()) return metaValue.trim();
  } catch {
    // Fall through to other sources.
  }

  try {
    const cfEnv = (globalThis as typeof globalThis & { CF_ENV?: Record<string, unknown> }).CF_ENV;
    const cfValue = cfEnv?.[name];
    if (typeof cfValue === "string" && cfValue.trim()) return cfValue.trim();
  } catch {
    // Fall through.
  }

  return "";
}

function getApiKey(): string {
  return readSecret("GEMINI_API_KEY");
}

function getGeminiTimeoutMs(): number {
  const raw = readSecret("GEMINI_TIMEOUT_MS")?.trim();
  if (!raw) return GEMINI_TIMEOUT_MS_DEFAULT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : GEMINI_TIMEOUT_MS_DEFAULT;
}

function getThinkingBudget(): number {
  const raw = readSecret("GEMINI_THINKING_BUDGET")?.trim();
  if (!raw) return GEMINI_THINKING_BUDGET_DEFAULT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : GEMINI_THINKING_BUDGET_DEFAULT;
}

type GenerationConfig = {
  temperature?: number;
  maxOutputTokens: number;
  thinkingConfig?: { thinkingBudget: number };
};

function buildGenerationConfig(includeThinking: boolean): GenerationConfig {
  const thinkingBudget = getThinkingBudget();
  if (includeThinking && thinkingBudget > 0) {
    return { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget } };
  }
  return { temperature: 0.9, maxOutputTokens: 1024 };
}

function getModel(): string {
  return readSecret("GEMINI_MODEL") || "gemini-3.5-flash-lite";
}

function getVisionModel(): string {
  return readSecret("GEMINI_VISION_MODEL") || getModel() || "gemini-3.5-flash-lite";
}

function getImageGenerationModel(): string {
  return readSecret("GEMINI_IMAGE_GEN_MODEL") || IMAGE_GEN_MODEL_DEFAULT;
}

function getGeminiCacheKv(): GeminiKvNamespace | null {
  const workerEnv = env as unknown as {
    GEMINI_CACHE_KV?: GeminiKvNamespace;
    AUTH_USERS_KV?: GeminiKvNamespace;
  };
  if (workerEnv.GEMINI_CACHE_KV) return workerEnv.GEMINI_CACHE_KV;
  if (workerEnv.AUTH_USERS_KV) return workerEnv.AUTH_USERS_KV;

  const globalEnv = (
    globalThis as typeof globalThis & {
      CF_ENV?: { GEMINI_CACHE_KV?: GeminiKvNamespace; AUTH_USERS_KV?: GeminiKvNamespace };
    }
  ).CF_ENV;
  if (globalEnv?.GEMINI_CACHE_KV) return globalEnv.GEMINI_CACHE_KV;
  if (globalEnv?.AUTH_USERS_KV) return globalEnv.AUTH_USERS_KV;

  return null;
}

export function buildGeminiCacheKey(model: string, prompt: string): string {
  let hash = 2166136261;
  for (let index = 0; index < prompt.length; index += 1) {
    hash ^= prompt.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const key = (hash >>> 0).toString(16).padStart(8, "0");
  return `gemini:${model}:${key}`;
}

export async function readGeminiCachedResponse<T>(
  kv: GeminiKvNamespace | null,
  key: string,
): Promise<T | null> {
  if (!kv) return null;

  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeGeminiCachedResponse<T>(
  kv: GeminiKvNamespace | null,
  key: string,
  value: T,
): Promise<void> {
  if (!kv) return;

  try {
    await kv.put(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures; the API request still succeeds.
  }
}

async function fetchWithGeminiTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = getGeminiTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isImageRequest(text: string): boolean {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;
  return (
    IMAGE_INTENT_DRAW.test(value) || (IMAGE_INTENT_GEN.test(value) && IMAGE_INTENT_NOUN.test(value))
  );
}

function extractImagePrompt(text: string): string {
  const cleaned = text.trim().replace(IMAGE_PROMPT_STRIP, "");
  const prompt = cleaned.replace(/[.!?\s]+$/g, "").trim();
  if (!prompt) return "красива, цветна илюстрация в артистичен стил";
  return prompt;
}

async function requestImageGeneration(
  apiKey: string,
  prompt: string,
): Promise<{ success: boolean; error?: string; data?: { text: string; image?: AiChatImage } }> {
  const model = getImageGenerationModel();
  const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 2048,
    },
  });

  const cacheKv = getGeminiCacheKv();
  const cacheKey = buildGeminiCacheKey(model, requestBody);
  const cached = await readGeminiCachedResponse<GeminiCachedResponse>(cacheKv, cacheKey);
  if (cached) {
    return cached;
  }

  let response!: Response;
  for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
    try {
      response = await fetchWithGeminiTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        success: false,
        error: isTimeout
          ? `Gemini API не отговори в рамките на ${getGeminiTimeoutMs() / 1000} секунди (Timeout). Моля, опитай отново.`
          : "Неуспешна заявка към Gemini API.",
      };
    }

    if ((response.status === 429 || response.status === 503) && attempt < MAX_GEMINI_RETRIES) {
      await waitForGeminiRetry(response, attempt);
      continue;
    }

    break;
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      // Ignore malformed error bodies.
    }

    if (response.status === 429) {
      return {
        success: false,
        error:
          "Генерирането на изображения временно не е налично (лимит на заявките). Моля, опитай по-късно.",
      };
    }

    if (response.status === 503) {
      return {
        success: false,
        error:
          "Моделът за изображения е претоварен в момента (503). Моля, опитай отново след малко.",
      };
    }

    return {
      success: false,
      error: `Грешка при генериране на изображение (${response.status}). ${detail || ""}`,
    };
  }

  const result = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }>;
      };
    }>;
  };

  const parts = result?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part?.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    return { success: false, error: "Моделът не върна изображение. Опитай пак с друга заявка." };
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  const textPart = parts.find((part) => part?.text)?.text?.trim() ?? "";
  const payload = {
    success: true,
    data: {
      text: textPart ? `Ето твоята снимка. ${textPart}` : "Ето твоята снимка.",
      image: { mimeType, dataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}` },
    },
  } satisfies GeminiCachedResponse;

  await writeGeminiCachedResponse(cacheKv, cacheKey, payload);

  return payload;
}

const MAX_GEMINI_RETRIES = 3;

function isThinkingUnsupportedError(detail: string): boolean {
  if (!detail) return false;
  const lower = detail.toLowerCase();
  return (
    lower.includes("thinking") ||
    lower.includes("thought") ||
    lower.includes("reasoning") ||
    lower.includes("thinking budget")
  );
}

function waitForGeminiRetry(response: Response, attempt: number): Promise<void> {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
  const backoffMs = Math.min(
    retryAfterMs > 0 ? retryAfterMs : 1000 * 2 ** Math.min(attempt, 4),
    20000,
  );
  return new Promise((resolve) => setTimeout(resolve, backoffMs));
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== "string") return null;
  const groups = /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );
  if (!groups) return null;
  return {
    mimeType: `image/${groups[1] === "jpg" ? "jpeg" : groups[1]}`,
    base64: groups[2] as string,
  };
}

function parseFileDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== "string") return null;
  const groups = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );
  if (!groups) return null;
  return { mimeType: groups[1] as string, base64: groups[2] as string };
}

export const serverAiChat = createServerFn({ method: "POST" })
  .validator((data: AiChatInput) => data)
  .handler(async ({ data }) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: "AI ключът не е настроен. Добави GEMINI_API_KEY в настройките на сайта.",
      };
    }

    const rawMessages = data.messages ?? [];
    const lastUserMessage = [...rawMessages].reverse().find((message) => message?.role === "user");
    const lastUserText =
      lastUserMessage && typeof lastUserMessage.text === "string"
        ? lastUserMessage.text.trim()
        : "";

    if (lastUserText && isImageRequest(lastUserText)) {
      return await requestImageGeneration(apiKey, extractImagePrompt(lastUserText));
    }

    const sanitizedMessages: Array<{
      role: "user" | "model";
      parts: Array<{ text?: string; ["inline_data"]?: { ["mime_type"]: string; data: string } }>;
    }> = [];

    for (const message of (data.messages ?? []).slice(-20)) {
      if (!message || (message.role !== "user" && message.role !== "model")) continue;

      const text = typeof message.text === "string" ? message.text.trim() : "";
      const parts: Array<{
        text?: string;
        ["inline_data"]?: { ["mime_type"]: string; data: string };
      }> = [];
      const mediaNotes: string[] = [];
      let inlineCount = 0;
      let inlineBytes = 0;

      const canInline = (base64Length: number) =>
        inlineCount < MAX_ATTACHMENTS && inlineBytes + base64Length <= MAX_INLINE_MEDIA_BYTES;

      if (message.role === "user") {
        for (const image of Array.isArray(message.images) ? message.images : []) {
          if (!image) continue;
          const parsed = parseImageDataUrl(image?.dataUrl);
          if (!parsed) {
            mediaNotes.push(
              "Потребителят е прикачил изображение, но съдържанието му не е налично.",
            );
            continue;
          }
          if (!canInline(parsed.base64.length)) {
            mediaNotes.push(
              `Прикачено изображение (${parsed.mimeType}) е пропуснато поради ограничение на общия размер.`,
            );
            continue;
          }
          inlineCount += 1;
          inlineBytes += parsed.base64.length;
          parts.push({
            ["inline_data"]: { ["mime_type"]: parsed.mimeType, data: parsed.base64 },
          });
        }
        for (const file of Array.isArray(message.files) ? message.files : []) {
          if (!file) continue;
          const mimeType = typeof file.mimeType === "string" ? file.mimeType.toLowerCase() : "";
          const size = typeof file.size === "number" && file.size > 0 ? file.size : 0;
          const sizeLabel = formatSize(size);

          if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
            mediaNotes.push(
              `Прикачен медиен файл: ${file.name || "файл"}, тип: ${mimeType}, размер: ${sizeLabel}.`,
            );
            continue;
          }

          const parsed = parseFileDataUrl(file?.dataUrl);
          if (parsed && !parsed.mimeType.startsWith("image/") && canInline(parsed.base64.length)) {
            inlineCount += 1;
            inlineBytes += parsed.base64.length;
            parts.push({
              ["inline_data"]: { ["mime_type"]: parsed.mimeType, data: parsed.base64 },
            });
          } else {
            mediaNotes.push(
              `Прикачен файл: ${file.name || "файл"}, тип: ${mimeType}, размер: ${sizeLabel}.`,
            );
          }
        }
      }

      const combinedText =
        mediaNotes.length > 0 ? [...(text ? [text] : []), ...mediaNotes].join("\n") : text;
      if (combinedText) parts.push({ text: combinedText });
      if (parts.length === 0) continue;

      sanitizedMessages.push({ role: message.role, parts });
    }

    if (sanitizedMessages.length === 0) {
      return { success: false, error: "Няма въпрос или изображение за изпращане." };
    }

    const hasImages = sanitizedMessages.some((message) =>
      message.parts.some((part) => part["inline_data"]),
    );
    const model = hasImages ? getVisionModel() : getModel();

    try {
      const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const cacheKv = getGeminiCacheKv();
      const wantThinking = getThinkingBudget() > 0;
      const timeoutMs = getGeminiTimeoutMs();

      const requestBody = (includeThinking: boolean) =>
        JSON.stringify({
          contents: sanitizedMessages,
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          generationConfig: buildGenerationConfig(includeThinking),
        });

      // Deep thinking: ask the model to reason with a thinking budget first. If
      // the selected model does not support thinkingConfig, the request is
      // transparently retried once without it so TK-Bot keeps answering anyway.
      const performRequest = async (includeThinking: boolean): Promise<GeminiCachedResponse> => {
        const body = requestBody(includeThinking);
        const cacheKey = buildGeminiCacheKey(model, body);
        const cached = await readGeminiCachedResponse<GeminiCachedResponse>(cacheKv, cacheKey);
        if (cached) {
          return cached;
        }

        let response!: Response;
        for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
          try {
            response = await fetchWithGeminiTimeout(
              url,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
              },
              timeoutMs,
            );
          } catch (error) {
            const isTimeout = error instanceof Error && error.name === "AbortError";
            return {
              success: false,
              error: isTimeout
                ? `Gemini API не отговори в рамките на ${timeoutMs / 1000} секунди (Timeout). Моля, опитай отново.`
                : "Неуспешна заявка към Gemini API.",
            };
          }

          if (
            (response.status === 429 || response.status === 503) &&
            attempt < MAX_GEMINI_RETRIES
          ) {
            await waitForGeminiRetry(response, attempt);
            continue;
          }

          break;
        }

        if (!response.ok) {
          let detail = "";
          try {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            detail = body?.error?.message ?? "";
          } catch {
            // Ignore malformed error bodies.
          }

          if (includeThinking && isThinkingUnsupportedError(detail)) {
            return await performRequest(false);
          }

          return {
            success: false,
            error:
              response.status === 429
                ? "Gemini API достигна лимита на заявките (429). Моля, опитай отново след малко."
                : response.status === 503
                  ? "AI моделът е претоварен в момента (503). Моля, опитай отново след малко."
                  : response.status === 404 || response.status === 400
                    ? hasImages
                      ? `Грешка при обработка на изображението (${response.status}). ${detail || `Моделът "${model}" може да не поддържа снимки.`}`
                      : `AI моделът "${model}" не е достъпен (${response.status}). Провери GEMINI_MODEL / GEMINI_API_KEY.`
                    : `Грешка от Gemini API (${response.status}): ${detail || "неизвестна грешка"}`,
          };
        }

        const result = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) {
          return { success: false, error: "Gemini не върна текст. Моля, опитай пак." };
        }

        const payload = { success: true, data: { text } } satisfies GeminiCachedResponse;
        await writeGeminiCachedResponse(cacheKv, cacheKey, payload);

        return payload;
      };

      return await performRequest(wantThinking);
    } catch (error) {
      console.warn("Gemini request failed.", error);
      return { success: false, error: "Неуспешна заявка към Gemini API." };
    }
  });
