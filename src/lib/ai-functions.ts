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
  data?: { text: string; image?: AiChatImage; files?: AiChatFile[] };
};

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

const MAX_ATTACHMENTS = 10;

const GEMINI_TIMEOUT_MS_DEFAULT = 90_000;

const GEMINI_THINKING_BUDGET_DEFAULT = 1024;

const MAX_INLINE_MEDIA_BYTES = 8 * 1024 * 1024;

const IMAGE_GEN_MODEL_DEFAULT = "gemini-3.1-flash-image";

const IMAGE_INTENT_DRAW =
  /(^|[\s,.;:!?(-])(нарисувай ми|нарисувай|рисувай|draw me|draw)([\s,.;:!?)-]|$)/i;
const IMAGE_INTENT_GEN = /(?<![\p{L}\d])(генерирай|създай|generate|create|make)(?![\p{L}])/iu;
const IMAGE_INTENT_NOUN =
  /(?<![\p{L}\d])(image\p{L}*|picture\p{L}*|изображени\p{L}*|снимк\p{L}*|картинк\p{L}*|илюстраци\p{L}*)(?![\p{L}])/iu;

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

const MEDIA_VERB =
  /(?<![\p{L}\d])(?:направи ми|направи|създай ми|създай|генерирай ми|генерирай|съчини ми|съчини|напиши ми|напиши|пусни ми|пусни|свири ми|make me|make|create me|create|generate|compose|write|produce|play)(?![\p{L}])/iu;

const MUSIC_INTENT_NOUN =
  /(?<![\p{L}\d])(?:музик\p{L}*|(?:песн|песен)\p{L}*|мелоди\p{L}*|инструментал\p{L}*|бийт\p{L}*|ремик\p{L}*|джем|бас|хук|рит\p{L}*|music|song|melody|instrumental|beat|track|remix|tune|jam)(?![\p{L}])/iu;

const VIDEO_INTENT_NOUN =
  /(?<![\p{L}\d])(?:видео\p{L}*|клип\p{L}*|анимаци\p{L}*|филм\p{L}*|video|clip|animation|film|reel)(?![\p{L}])/iu;

const STL_INTENT_MARKER =
  /(?<![\p{L}\d])(?:3d|3д|stl|принт\p{L}*|фигурк\p{L}*|статуетк\p{L}*|бюст\p{L}*|скулптур\p{L}*|модел за печат|за печат)(?![\p{L}])/iu;

export function isMusicRequest(text: string): boolean {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;
  return MEDIA_VERB.test(value) && MUSIC_INTENT_NOUN.test(value);
}

export function isVideoRequest(text: string): boolean {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;
  return MEDIA_VERB.test(value) && VIDEO_INTENT_NOUN.test(value);
}

export function is3dRequest(text: string): boolean {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;
  const wantsCreate =
    MEDIA_VERB.test(value) || /(?<![\p{L}\d])(искам|дай ми)(?![\p{L}])/iu.test(value);
  return wantsCreate && STL_INTENT_MARKER.test(value);
}

const MEDIA_PROMPT_STRIP = new RegExp(
  "^(моля[\\s,!]*)?(?:" +
    "направи ми|направи|създай ми|създай|генерирай ми|генерирай|съчини ми|съчини|" +
    "напиши ми|напиши|пусни ми|пусни|свири ми|make me|make|create me|create|generate|" +
    "compose|write|produce|play" +
    ")" +
    "\\s*(?:a|an|една|един|едно)?\\s*(?:музикален клип|музикална|музика|песен|песничка|мелодия|инструментал|бийт|ремикс|" +
    "видеоклип|клип|анимация|видео|филм|3d модел|3д модел|stl файл|модел|фигурка|статуетка|" +
    "song|music|melody|instrumental|beat|track|remix|video|clip|animation|model|stl)?\\s*",
  "i",
);

export function extractMediaPrompt(text: string): string {
  const cleaned = text
    .trim()
    .replace(MEDIA_PROMPT_STRIP, "")
    .replace(/[.!?\s]+$/g, "")
    .trim();
  return cleaned;
}

const SYSTEM_PROMPT = `Ти си TK-Bot — официалният AI асистент на Todor Khristov Gaming.
Отговаряй кратко, ясно и полезно. По подразбиране отговаряй на български; ако потребителят пише на друг език, отговори на същия език.

Когато отговорът съдържа код, конфигурационни променливи (например .env ключове), команди за терминал или друг текст, който потребителят би искал да копира, ВИНАГИ го поставяй в markdown код блок, ограден с тройни обратни кавички (\`\`\`), като посочиш езика за синтаксис (например \`\`\`bash, \`\`\`ts, \`\`\`env, \`\`\`json). Никога не показвай такива стойности като обикновен текст в изречение — винаги ги слагай в отделен код блок.

Никога не казвай, че не можеш да отваряш или четеш линкове. Когато получиш линк, отвори го и го разгледай внимателно — ако е налично, съдържанието на страницата ще бъде добавено към контекста на разговора. Отговори полезно на базата на извлеченото съдържание. Ако страницата не може да бъде отворена, обясни коректно какво се случва.

Можеш да приемаш и анализираш снимки и файлове, изпратени чрез бутона „Прикачи" или копирани и поставени (paste, Ctrl+V) директно в чата. Когато получиш изображение, го разгледай детайлно, извади нужната информация и отговори на въпросите на потребителя на базата на съдържанието му. Когато получиш файл (например текст, код или документ), го прочети внимателно и го използвай, за да помогнеш на потребителя.

Можеш да приемаш, копираш и поставяш (paste) видеоклипове и мултимедийни файлове директно в чата. Когато получиш видео, го анализирай по неговите кадри или метаданта, извлечи полезна информация и отговори на базата на съдържанието му.

Ти можеш да ГЕНЕРИРАШ медия директно в разговора:
- Снимки и изображения — когато потребителят поиска да нарисуваш нещо, създай изображение.
- Видеоклипове — когато потребителят поиска „направи/създай/генерирай видео/клип/анимация", генерирай кратък видеоклип (с аудио).
- Музика — когато потребителят поиска „направи/създай/генерирай песен/музика/мелодия/бийт", генерирай музикален клип.
- 3D модели за принтиране — когато потребителят поиска „3D модел", „STL файл", „фигурка/статуетка за печат" или „модел за принтера", създай 3D модел в STL формат и го прикачи към отговора.
Генерираната медия (песни, видеа, 3D модели) се прикачва автоматично към отговора под формата на файл/плейър — не обяснявай „не мога", а просто изпълни заявката.

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

function getMusicModel(): string {
  return readSecret("GEMINI_MUSIC_MODEL") || "lyria-3-clip-preview";
}

function getVideoModel(): string {
  return readSecret("GEMINI_VIDEO_MODEL") || "veo-3.1-generate-preview";
}

function get3dPlanningModel(): string {
  return readSecret("GEMINI_3D_MODEL") || getModel();
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
  if (hasLovableBackend()) {
    const lovableImage = await requestLovableImage(prompt, getGeminiTimeoutMs());
    if (lovableImage.success || !apiKey) return lovableImage;
    if (lovableImage.status === 401 || lovableImage.status === 403) return lovableImage;
  }

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
          ? `TK-Bot не отговори в рамките на ${getGeminiTimeoutMs() / 1000} секунди (Timeout). Моля, опитай отново.`
          : "Неуспешна заявка към TK-Bot.",
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

const MAX_ATTACHMENT_BYTES = 14 * 1024 * 1024;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, Math.min(index + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/* ---------------- Lovable AI Gateway backend ---------------- */

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1";

function getLovableApiKey(): string {
  return readSecret("LOVABLE_API_KEY");
}

function getLovableChatModel(): string {
  return readSecret("LOVABLE_CHAT_MODEL") || "google/gemini-3.8-flash";
}

function getLovableImageModel(): string {
  return readSecret("LOVABLE_IMAGE_MODEL") || "google/gemini-3.1-flash-image";
}

function hasLovableBackend(): boolean {
  return Boolean(getLovableApiKey().trim());
}

async function lovableGatewayRequest(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ ok: boolean; json?: unknown; error?: string; status?: number }> {
  const key = getLovableApiKey();
  let response!: Response;
  for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
    try {
      response = await fetchWithGeminiTimeout(
        `${LOVABLE_GATEWAY}${path}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${key}`,
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "tk-bot",
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        ok: false,
        error: isTimeout
          ? `TK-Bot не отговори в рамките на ${timeoutMs / 1000} секунди (Timeout). Моля, опитай отново.`
          : "Неуспешна заявка към AI услугата.",
        status: 0,
      };
    }

    if ((response.status === 429 || response.status === 503) && attempt < MAX_GEMINI_RETRIES) {
      await waitForGeminiRetry(response, attempt);
      continue;
    }

    break;
  }

  if (!response) {
    return { ok: false, error: "Неуспешна заявка към AI услугата.", status: 0 };
  }

  if (!response.ok) {
    if (response.status === 429) {
      return {
        ok: false,
        error: "AI услугата има временен лимит на заявките (429). Моля, опитай след малко.",
        status: response.status,
      };
    }
    if (response.status === 402) {
      return {
        ok: false,
        error: "Кредитите за AI са изчерпани. Добави кредити в настройките на проекта.",
        status: response.status,
      };
    }
    let detail = "";
    try {
      const errorBody = (await response.json()) as { error?: { message?: string } };
      detail = errorBody?.error?.message ?? "";
    } catch {
      // Ignore malformed error bodies.
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error:
          "Достъпът до Lovable AI е отказан (401). Провери дали са добавени LOVABLE_API_KEY / LOVABLE_CHAT_MODEL в настройките на проекта.",
        status: response.status,
      };
    }
    return {
      ok: false,
      error: `Грешка от AI услугата (${response.status}). ${detail}`,
      status: response.status,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: "Невалиден отговор от AI услугата.", status: response.status };
  }

  return { ok: true, json };
}

function getLovableText(json: unknown): string | null {
  const content = (
    json as {
      choices?: Array<{ message?: { content?: unknown } }>;
    }
  )?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          typeof (part as { text?: unknown }).text === "string",
      )
      .map((part) => (part as { text?: string }).text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

function getLovableImageUrl(json: unknown): string | null {
  const images = (
    json as {
      choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    }
  )?.choices?.[0]?.message?.images;
  return images?.[0]?.image_url?.url ?? null;
}

function fileNameFromMime(mime: string): string {
  const normalized = mime.toLowerCase();
  if (normalized.includes("pdf")) return "document.pdf";
  if (normalized.startsWith("text/") || normalized.includes("json") || normalized.includes("csv"))
    return "document.txt";
  if (normalized.startsWith("audio/"))
    return normalized.includes("mpeg") ? "audio.mp3" : "audio.wav";
  if (normalized.startsWith("video/")) return "video.mp4";
  return "file.bin";
}

async function requestLovableChat(
  sanitizedMessages: Array<{
    role: "user" | "model";
    parts: Array<{ text?: string; ["inline_data"]?: { ["mime_type"]: string; data: string } }>;
  }>,
  timeoutMs: number,
): Promise<GeminiCachedResponse & { status?: number }> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const message of sanitizedMessages) {
    const content: unknown[] = [];
    for (const part of message.parts) {
      if (part.text) content.push({ type: "text", text: part.text });
      const inline = part["inline_data"];
      if (inline?.data) {
        const mime = inline["mime_type"] || "";
        if (mime.startsWith("image/")) {
          content.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${inline.data}` },
          });
        } else {
          content.push({
            type: "file",
            file: { file_data: inline.data, filename: fileNameFromMime(mime) },
          });
        }
      }
    }
    if (content.length === 0) continue;
    const role = message.role === "model" ? "assistant" : "user";
    messages.push({ role, content });
  }

  const body: Record<string, unknown> = {
    model: getLovableChatModel(),
    messages,
    temperature: 0.7,
  };

  const result = await lovableGatewayRequest("/chat/completions", body, timeoutMs);
  if (!result.ok) {
    return {
      success: false,
      error: result.error ?? "Неуспешна заявка към AI услугата.",
      status: result.status,
    };
  }

  const text = getLovableText(result.json);
  if (!text) {
    return { success: false, error: "TK-Bot не върна текст. Моля, опитай пак." };
  }

  return { success: true, data: { text } };
}

async function requestLovableImage(
  prompt: string,
  timeoutMs: number,
): Promise<{
  success: boolean;
  error?: string;
  status?: number;
  data?: { text: string; image: AiChatImage };
}> {
  const body: Record<string, unknown> = {
    model: getLovableImageModel(),
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
  };

  const result = await lovableGatewayRequest("/chat/completions", body, timeoutMs);
  if (!result.ok) {
    return {
      success: false,
      error: result.error ?? "Неуспешна заявка към AI услугата.",
      status: result.status,
    };
  }

  const imageUrl = getLovableImageUrl(result.json);
  if (!imageUrl) {
    return { success: false, error: "Моделът не върна изображение. Опитай пак с друга заявка." };
  }

  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma <= 0) return { success: false, error: "Невалиден формат на изображението." };
    const meta = imageUrl.slice(5, comma);
    const mimeType = (meta.split(";")[0] || "image/png").trim();
    const safeMime = mimeType.startsWith("image/") ? mimeType : "image/png";
    const bytes = base64ToBytes(imageUrl.slice(comma + 1));
    if (bytes.byteLength === 0) {
      return { success: false, error: "Генерираното изображение е празно. Опитай пак." };
    }
    return {
      success: true,
      data: {
        text: "Ето твоята снимка.",
        image: { mimeType: safeMime, dataUrl: `data:${safeMime};base64,${toBase64(bytes)}` },
      },
    };
  }

  let imgResponse: Response;
  try {
    imgResponse = await fetchWithGeminiTimeout(imageUrl, {}, Math.max(timeoutMs, 90_000));
  } catch {
    return { success: false, error: "Не успях да изтегля генерираното изображение. Опитай пак." };
  }
  if (!imgResponse.ok) {
    return {
      success: false,
      error: `Не успях да изтегля генерираното изображение (${imgResponse.status}).`,
    };
  }

  const bytes = new Uint8Array(await imgResponse.arrayBuffer());
  if (bytes.byteLength === 0) {
    return { success: false, error: "Генерираното изображение е празно. Опитай пак." };
  }

  const rawMime = imgResponse.headers.get("content-type") || "image/png";
  const safeMime = rawMime.startsWith("image/") ? rawMime : "image/png";
  return {
    success: true,
    data: {
      text: "Ето твоята снимка.",
      image: { mimeType: safeMime, dataUrl: `data:${safeMime};base64,${toBase64(bytes)}` },
    },
  };
}

function retryableGeminiFetch(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; response?: Response; error?: string }> {
  return Promise.resolve({ ok: false, error: "" }).then(async () => {
    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
      try {
        response = await fetchWithGeminiTimeout(url, options, timeoutMs);
      } catch (error) {
        const isTimeout = error instanceof Error && error.name === "AbortError";
        return {
          ok: false,
          error: isTimeout
            ? `TK-Bot не отговори в рамките на ${timeoutMs / 1000} секунди (Timeout).`
            : "Неуспешна заявка към TK-Bot.",
        };
      }
      if ((response.status === 429 || response.status === 503) && attempt < MAX_GEMINI_RETRIES) {
        await waitForGeminiRetry(response, attempt);
        continue;
      }
      break;
    }
    if (!response) {
      return { ok: false, error: "Неуспешна заявка към TK-Bot." };
    }
    return { ok: response.ok, status: response.status, response };
  });
}

async function requestMusicGeneration(
  apiKey: string,
  prompt: string,
): Promise<GeminiCachedResponse> {
  const model = getMusicModel();
  const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const { ok, status, response, error } = await retryableGeminiFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    },
    getGeminiTimeoutMs(),
  );
  if (!ok) {
    if (status === 429) {
      return {
        success: false,
        error: "Генерирането на музика временно не е налично (лимит на заявките). Опитай по-късно.",
      };
    }
    return { success: false, error: error || `Грешка при генериране на музика (${status ?? 0}).` };
  }

  const result = (await response!.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }>;
      };
    }>;
  };

  const parts = result?.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find(
    (part) =>
      part?.inlineData?.data && (part.inlineData.mimeType || "").toLowerCase().startsWith("audio/"),
  );
  const base64 = audioPart?.inlineData?.data;
  if (!base64) {
    return { success: false, error: "Моделът не върна аудио. Моля, опитай пак." };
  }

  const mimeType = audioPart.inlineData?.mimeType || "audio/mpeg";
  const size = Math.ceil((base64.length / 4) * 3);
  if (size > MAX_ATTACHMENT_BYTES) {
    return { success: false, error: "Генерираната песен е твърде голяма за изпращане в чата." };
  }

  const textParts = parts
    .filter((part) => part?.text)
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean);
  const text = textParts.join("\n\n") || "Ето твоята музика. Прикачих я като файл в отговора. 🎵";
  const extension = mimeType.includes("wav") ? "wav" : "mp3";

  return {
    success: true,
    data: {
      text,
      files: [
        {
          name: `tk-music-${Date.now()}.${extension}`,
          mimeType,
          dataUrl: `data:${mimeType};base64,${base64}`,
          size,
        },
      ],
    },
  };
}

type VeoGeneratedSample = {
  video?: { uri?: string };
};

async function requestVideoGeneration(
  apiKey: string,
  prompt: string,
): Promise<GeminiCachedResponse> {
  const model = getVideoModel();
  const startUrl = `${GEMINI_ENDPOINT}/models/${model}:predictLongRunning`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-goog-api-key": apiKey,
  };
  const startBody = JSON.stringify({
    instances: [{ prompt }],
    parameters: {
      aspectRatio: "16:9",
      resolution: "720p",
      durationSeconds: 8,
      sampleCount: 1,
    },
  });

  const started = await retryableGeminiFetch(
    `${startUrl}?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", headers, body: startBody },
    getGeminiTimeoutMs(),
  );
  if (!started.ok || !started.response) {
    return {
      success: false,
      error:
        started.status === 429
          ? "Генерирането на видео временно не е налично (лимит на заявките). Опитай по-късно."
          : started.error || "Грешка при стартиране на генерирането на видео.",
    };
  }

  const startResult = (await started.response.json()) as {
    name?: string;
    error?: { message?: string };
  };
  if (startResult.error?.message) {
    return {
      success: false,
      error: `Грешка при генериране на видео: ${startResult.error.message}`,
    };
  }
  const operationName = startResult.name;
  if (!operationName) {
    return { success: false, error: "API-то не върна задание за генериране на видео." };
  }

  const pollUrl = `${GEMINI_ENDPOINT}/${operationName}?key=${encodeURIComponent(apiKey)}`;
  const pollHeaders: Record<string, string> = { "x-goog-api-key": apiKey };
  const maxPolls = 30;
  let videoUri = "";

  for (let poll = 0; poll < maxPolls; poll += 1) {
    const polled = await retryableGeminiFetch(
      pollUrl,
      { method: "GET", headers: pollHeaders },
      getGeminiTimeoutMs(),
    );
    if (!polled.ok || !polled.response) {
      await sleep(5000);
      continue;
    }

    const pollResult = (await polled.response.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: VeoGeneratedSample[] } };
    };

    if (pollResult.error?.message) {
      return {
        success: false,
        error: `Грешка при генериране на видео: ${pollResult.error.message}`,
      };
    }

    if (pollResult.done) {
      videoUri =
        pollResult.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? "";
      if (videoUri) break;
      return { success: false, error: "Моделът не върна видео файл. Моля, опитай пак." };
    }

    await sleep(5000);
  }

  if (!videoUri) {
    return {
      success: false,
      error: "Генерирането на видео отнема твърде много време. Моля, опитай отново след малко.",
    };
  }

  let videoResponse: Response;
  try {
    videoResponse = await fetchWithGeminiTimeout(
      videoUri,
      { headers: { "x-goog-api-key": apiKey } },
      Math.max(getGeminiTimeoutMs(), 120_000),
    );
  } catch {
    return { success: false, error: "Не успях да изтегля генерираното видео. Моля, опитай пак." };
  }
  if (!videoResponse.ok) {
    return { success: false, error: "Не успях да изтегля генерираното видео. Моля, опитай пак." };
  }

  const bytes = new Uint8Array(await videoResponse.arrayBuffer());
  if (bytes.byteLength === 0) {
    return { success: false, error: "Генерираното видео е празно. Моля, опитай пак." };
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return { success: false, error: "Генерираното видео е твърде голямо за изпращане в чата." };
  }

  return {
    success: true,
    data: {
      text: "Ето твоето видео — 8 секунди, с аудио. Прикачих го като файл в отговора. 🎬",
      files: [
        {
          name: `tk-video-${Date.now()}.mp4`,
          mimeType: "video/mp4",
          dataUrl: `data:video/mp4;base64,${toBase64(bytes)}`,
          size: bytes.byteLength,
        },
      ],
    },
  };
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

type Vec3 = [number, number, number];

type MeshTriangle = { v0: Vec3; v1: Vec3; v2: Vec3 };

const STL_PLAN_PROMPT = `Ти си програма, която планира прости 3D модели за 3D принтиране. Отговори САМО с валиден JSON (без markdown, без пояснения, без коментари).

Изисквания:
- Колекция от 1 до 8 части. Типове (само тези): box, sphere, cylinder, cone, torus.
- Всички части трябва да се допират и да образуват ЕДНО свързано, устойчиво цяло, което може да се печата без подпори. Поставяй по-големи/тежки части долу като основа.
- Размери в сантиметри. Общият размер на модела: между 3 и 8 cm.
- Не използвай тънки стени или остри елементи под 0.2 cm.
- Реалистичен, печатаем и максимално близък до описанието на потребителя.

Формат (единствено тези полета):
{
  "name": "кратко име на модела",
  "parts": [
    {
      "name": "име на част",
      "type": "box|sphere|cylinder|cone|torus",
      "params": { ... },
      "position": [x, y, z],
      "rotation": [x_deg, y_deg, z_deg],
      "scale": [sx, sy, sz]
    }
  ]
}

Параметри по тип:
- box: { "size": [x_len, y_len, z_len] }
- sphere: { "radius": r }
- cylinder: { "radius": r, "height": h }
- cone: { "radius": r, "height": h }
- torus: { "major": R, "minor": r }

position (по подразбиране [0,0,0]), rotation в градуси (по подразбиране [0,0,0]), scale (по подразбиране [1,1,1]).`;

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toVec3(value: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      toFiniteNumber(value[0], fallback[0]),
      toFiniteNumber(value[1], fallback[1]),
      toFiniteNumber(value[2], fallback[2]),
    ];
  }
  return fallback;
}

function parsePlanJson(text: string): unknown {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function rotatePoint(point: Vec3, rotation: Vec3): Vec3 {
  let [x, y, z] = point;
  const [rx, ry, rz] = rotation.map((value) => (value * Math.PI) / 180);

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  y = y1;
  z = z1;

  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x1 = x * cosY + z * sinY;
  const z2 = -x * sinY + z * cosY;
  x = x1;
  z = z2;

  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x2 = x * cosZ - y * sinZ;
  const y2 = x * sinZ + y * cosZ;

  return [x2, y2, z];
}

function transformTriangle(
  triangle: MeshTriangle,
  scale: Vec3,
  rotation: Vec3,
  position: Vec3,
): MeshTriangle {
  const apply = (vertex: Vec3): Vec3 => {
    let point: Vec3 = [vertex[0] * scale[0], vertex[1] * scale[1], vertex[2] * scale[2]];
    point = rotatePoint(point, rotation);
    return [point[0] + position[0], point[1] + position[1], point[2] + position[2]];
  };
  return { v0: apply(triangle.v0), v1: apply(triangle.v1), v2: apply(triangle.v2) };
}

function buildBoxTriangles(size: Vec3): MeshTriangle[] {
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  const c0: Vec3 = [-hx, -hy, -hz];
  const c1: Vec3 = [hx, -hy, -hz];
  const c2: Vec3 = [hx, hy, -hz];
  const c3: Vec3 = [-hx, hy, -hz];
  const c4: Vec3 = [-hx, -hy, hz];
  const c5: Vec3 = [hx, -hy, hz];
  const c6: Vec3 = [hx, hy, hz];
  const c7: Vec3 = [-hx, hy, hz];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): MeshTriangle[] => [
    { v0: a, v1: b, v2: c },
    { v0: a, v1: c, v2: d },
  ];
  return [
    ...quad(c0, c4, c5, c1), // -Y
    ...quad(c1, c5, c6, c2), // -Z
    ...quad(c2, c6, c7, c3), // +Y
    ...quad(c3, c7, c4, c0), // +Z
    ...quad(c0, c1, c2, c3), // -X
    ...quad(c4, c7, c6, c5), // +X
  ];
}

function buildSphereTriangles(radius: number): MeshTriangle[] {
  const slices = 16;
  const stacks = 12;
  const triangles: MeshTriangle[] = [];
  const point = (row: number, column: number): Vec3 => {
    const phi = (row / stacks) * Math.PI;
    const theta = (column / slices) * Math.PI * 2;
    return [
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    ];
  };
  for (let row = 0; row < stacks; row += 1) {
    for (let column = 0; column < slices; column += 1) {
      const a0 = point(row, column);
      const a1 = point(row + 1, column);
      const a2 = point(row + 1, column + 1);
      const a3 = point(row, column + 1);
      triangles.push({ v0: a0, v1: a1, v2: a2 }, { v0: a0, v1: a2, v2: a3 });
    }
  }
  return triangles;
}

function buildCylinderTriangles(radius: number, height: number): MeshTriangle[] {
  const sides = 22;
  const triangles: MeshTriangle[] = [];
  const topY = height / 2;
  const bottomY = -height / 2;
  const ring = (row: number, angle: number, y: number): Vec3 => [
    radius * Math.cos(angle),
    y,
    radius * Math.sin(angle),
  ];
  for (let side = 0; side < sides; side += 1) {
    const angle0 = (side / sides) * Math.PI * 2;
    const angle1 = ((side + 1) / sides) * Math.PI * 2;
    const bottom0 = ring(0, angle0, bottomY);
    const bottom1 = ring(0, angle1, bottomY);
    const top0 = ring(0, angle0, topY);
    const top1 = ring(0, angle1, topY);
    triangles.push({ v0: top0, v1: top1, v2: bottom1 }, { v0: top0, v1: bottom1, v2: bottom0 });
    const centerBottom: Vec3 = [0, bottomY, 0];
    const centerTop: Vec3 = [0, topY, 0];
    triangles.push({ v0: centerBottom, v1: bottom0, v2: bottom1 });
    triangles.push({ v0: top0, v1: centerTop, v2: top1 });
  }
  return triangles;
}

function buildConeTriangles(radius: number, height: number): MeshTriangle[] {
  const sides = 22;
  const triangles: MeshTriangle[] = [];
  const apex: Vec3 = [0, height / 2, 0];
  const bottomY = -height / 2;
  const center: Vec3 = [0, bottomY, 0];
  for (let side = 0; side < sides; side += 1) {
    const angle0 = (side / sides) * Math.PI * 2;
    const angle1 = ((side + 1) / sides) * Math.PI * 2;
    const base0: Vec3 = [radius * Math.cos(angle0), bottomY, radius * Math.sin(angle0)];
    const base1: Vec3 = [radius * Math.cos(angle1), bottomY, radius * Math.sin(angle1)];
    triangles.push({ v0: apex, v1: base0, v2: base1 });
    triangles.push({ v0: center, v1: base1, v2: base0 });
  }
  return triangles;
}

function buildTorusTriangles(major: number, minor: number): MeshTriangle[] {
  const majorSides = 22;
  const minorSides = 10;
  const triangles: MeshTriangle[] = [];
  const point = (u: number, v: number): Vec3 => {
    const theta = (u / majorSides) * Math.PI * 2;
    const phi = (v / minorSides) * Math.PI * 2;
    const x = (major + minor * Math.cos(phi)) * Math.cos(theta);
    const y = minor * Math.sin(phi);
    const z = (major + minor * Math.cos(phi)) * Math.sin(theta);
    return [x, y, z];
  };
  for (let u = 0; u < majorSides; u += 1) {
    for (let v = 0; v < minorSides; v += 1) {
      const a0 = point(u, v);
      const a1 = point(u + 1, v);
      const a2 = point(u + 1, v + 1);
      const a3 = point(u, v + 1);
      triangles.push({ v0: a0, v1: a2, v2: a1 }, { v0: a0, v1: a3, v2: a2 });
    }
  }
  return triangles;
}

function orientOutward(triangles: MeshTriangle[], centroid: Vec3): MeshTriangle[] {
  return triangles.map((triangle) => {
    const triCenter: Vec3 = [
      (triangle.v0[0] + triangle.v1[0] + triangle.v2[0]) / 3,
      (triangle.v0[1] + triangle.v1[1] + triangle.v2[1]) / 3,
      (triangle.v0[2] + triangle.v1[2] + triangle.v2[2]) / 3,
    ];
    const ux = triangle.v1[0] - triangle.v0[0];
    const uy = triangle.v1[1] - triangle.v0[1];
    const uz = triangle.v1[2] - triangle.v0[2];
    const wx = triangle.v2[0] - triangle.v0[0];
    const wy = triangle.v2[1] - triangle.v0[1];
    const wz = triangle.v2[2] - triangle.v0[2];
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const toCenterX = triCenter[0] - centroid[0];
    const toCenterY = triCenter[1] - centroid[1];
    const toCenterZ = triCenter[2] - centroid[2];
    if (nx * toCenterX + ny * toCenterY + nz * toCenterZ < 0) {
      return { ...triangle, v1: triangle.v2, v2: triangle.v1 };
    }
    return triangle;
  });
}

function buildPartTriangles(planPart: {
  type?: unknown;
  params?: Record<string, unknown>;
  position?: unknown;
  rotation?: unknown;
  scale?: unknown;
}): MeshTriangle[] | null {
  const type = String(planPart.type ?? "").toLowerCase();
  const params = planPart.params && typeof planPart.params === "object" ? planPart.params : {};
  const position = toVec3(planPart.position, [0, 0, 0]);
  const rotation = toVec3(planPart.rotation, [0, 0, 0]);
  const scale = toVec3(planPart.scale, [1, 1, 1]);

  let local: MeshTriangle[];
  switch (type) {
    case "box":
      local = buildBoxTriangles(toVec3(params.size, [1, 1, 1]));
      break;
    case "sphere": {
      const radius = Math.max(0.1, toFiniteNumber(params.radius, 1));
      local = buildSphereTriangles(radius);
      break;
    }
    case "cylinder": {
      const radius = Math.max(0.1, toFiniteNumber(params.radius, 0.5));
      const height = Math.max(0.1, toFiniteNumber(params.height, 1));
      local = buildCylinderTriangles(radius, height);
      break;
    }
    case "cone": {
      const radius = Math.max(0.1, toFiniteNumber(params.radius, 0.5));
      const height = Math.max(0.1, toFiniteNumber(params.height, 1));
      local = buildConeTriangles(radius, height);
      break;
    }
    case "torus": {
      const major = Math.max(0.2, toFiniteNumber(params.major, 1));
      const minor = Math.max(0.1, toFiniteNumber(params.minor, 0.3));
      local = buildTorusTriangles(major, minor);
      break;
    }
    default:
      return null;
  }

  const transformed = local.map((triangle) =>
    transformTriangle(triangle, scale, rotation, position),
  );
  const centroid: Vec3 = [
    transformed.reduce(
      (sum, triangle) => sum + triangle.v0[0] + triangle.v1[0] + triangle.v2[0],
      0,
    ) /
      (transformed.length * 3),
    transformed.reduce(
      (sum, triangle) => sum + triangle.v0[1] + triangle.v1[1] + triangle.v2[1],
      0,
    ) /
      (transformed.length * 3),
    transformed.reduce(
      (sum, triangle) => sum + triangle.v0[2] + triangle.v1[2] + triangle.v2[2],
      0,
    ) /
      (transformed.length * 3),
  ];
  return orientOutward(transformed, centroid);
}

export function compileMeshPlan(plan: unknown): MeshTriangle[] | null {
  if (!plan || typeof plan !== "object") return null;
  const parts = (plan as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const triangles: MeshTriangle[] = [];
  for (const part of parts.slice(0, 10)) {
    if (!part || typeof part !== "object") continue;
    const built = buildPartTriangles(part as Record<string, unknown>);
    if (built) triangles.push(...built);
  }
  return triangles.length > 0 ? triangles : null;
}

export function encodeBinaryStl(triangles: MeshTriangle[]): Uint8Array {
  const buffer = new ArrayBuffer(84 + 50 * triangles.length);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  let offset = 84;

  for (const triangle of triangles) {
    const ux = triangle.v1[0] - triangle.v0[0];
    const uy = triangle.v1[1] - triangle.v0[1];
    const uz = triangle.v1[2] - triangle.v0[2];
    const wx = triangle.v2[0] - triangle.v0[0];
    const wy = triangle.v2[1] - triangle.v0[1];
    const wz = triangle.v2[2] - triangle.v0[2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    const vertices = [triangle.v0, triangle.v1, triangle.v2];
    let vertexOffset = offset + 12;
    for (const vertex of vertices) {
      view.setFloat32(vertexOffset, vertex[0], true);
      view.setFloat32(vertexOffset + 4, vertex[1], true);
      view.setFloat32(vertexOffset + 8, vertex[2], true);
      vertexOffset += 12;
    }
    offset += 50;
  }

  return new Uint8Array(buffer);
}

async function request3dPlan(apiKey: string, prompt: string): Promise<unknown> {
  const model = get3dPlanningModel();
  const url = `${GEMINI_ENDPOINT}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestBody = JSON.stringify({
    contents: [
      { role: "user", parts: [{ text: `${STL_PLAN_PROMPT}\n\nПотребителска заявка: ${prompt}` }] },
    ],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  });

  const { ok, response } = await retryableGeminiFetch(
    url,
    { method: "POST", headers: { "content-type": "application/json" }, body: requestBody },
    getGeminiTimeoutMs(),
  );
  if (!ok || !response) return null;

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result?.candidates?.[0]?.content?.parts?.find((part) => part?.text)?.text;
  return text ? parsePlanJson(text) : null;
}

async function request3dGeneration(apiKey: string, prompt: string): Promise<GeminiCachedResponse> {
  const rawPrompt = extractMediaPrompt(prompt);
  const planPrompt = rawPrompt || "Абстрактна декоративна фигурка с широка основа";
  const plan = await request3dPlan(apiKey, planPrompt);
  if (!plan) {
    return {
      success: false,
      error: "Не успях да планирам 3D модела. Моля, опитай с по-кратко описание.",
    };
  }

  const triangles = compileMeshPlan(plan);
  if (!triangles) {
    return { success: false, error: "Не успях да построя мрежата на 3D модела. Моля, опитай пак." };
  }

  const stlBytes = encodeBinaryStl(triangles);
  if (stlBytes.byteLength === 0) {
    return { success: false, error: "Полученият 3D модел е празен. Моля, опитай пак." };
  }

  const planName = (plan as { name?: unknown }).name;
  const slug =
    String(planName ?? "model")
      .toLowerCase()
      .replace(/[^a-z0-9а-я]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tk-model";

  return {
    success: true,
    data: {
      text: `Ето един 3D модел за принтиране (.stl). Свали файла и го отвори в слайсър софтуер (Cura, PrusaSlicer, Bambu Studio или OrcaSlicer), за да го прегледаш и отпечаташ. 🖨️`,
      files: [
        {
          name: `${slug}.stl`,
          mimeType: "model/stl",
          dataUrl: `data:model/stl;base64,${toBase64(stlBytes)}`,
          size: stlBytes.byteLength,
        },
      ],
    },
  };
}

const MAX_URLS = 3;
const MAX_FETCH_BYTES = 1_200_000;
const MAX_URL_CHARS = 7000;

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "0.0.0.0" || host === "::1" || host === "localhost") return true;
  if (host.endsWith(".local")) return true;
  if (host === "metadata.google.internal" || host === "169.254.169.254") return true;

  const ipMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipMatch) {
    const a = Number(ipMatch[1]);
    const b = Number(ipMatch[2]);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>{}]+/gi) ?? [];
  const urls: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[),.;!?]+$/g, "");
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (isBlockedHostname(parsed.hostname)) continue;
      if (!urls.includes(cleaned)) urls.push(cleaned);
    } catch {
      continue;
    }
    if (urls.length >= MAX_URLS) break;
  }
  return urls;
}

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function readBodyWithLimit(res: Response, limitBytes: number): Promise<string> {
  try {
    const reader = res.body?.getReader?.();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (total + value.byteLength > limitBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
        total += value.byteLength;
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(bytes);
    }
  } catch {
    return "";
  }
  const text = await res.text();
  return text.slice(0, limitBytes);
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const response = await fetchWithGeminiTimeout(
      url,
      { headers: { "user-agent": "Mozilla/5.0 (compatible; TK-Bot/1.0)" } },
      20_000,
    );
    if (!response.ok) return "";
    const raw = await readBodyWithLimit(response, MAX_FETCH_BYTES);
    return cleanHtml(raw).slice(0, MAX_URL_CHARS);
  } catch {
    return "";
  }
}

async function buildUrlContext(text: string): Promise<string> {
  const urls = extractUrls(text);
  if (urls.length === 0) return "";
  const snippets: string[] = [];
  for (const url of urls) {
    const body = await fetchPageText(url);
    snippets.push(
      body ? `- ${url}:\n${body}` : `- ${url}:\n(страницата не можа да бъде прочетена)`,
    );
  }
  return `\n\n[Съдържание, което потребителят поиска да отвориш и разгледаш — извадка:]\n${snippets.join("\n\n")}`;
}

export const serverAiChat = createServerFn({ method: "POST" })
  .validator((data: AiChatInput) => data)
  .handler(async ({ data }) => {
    const apiKey = getApiKey();
    if (!apiKey && !hasLovableBackend()) {
      return {
        success: false,
        error:
          "AI услугата не е настроена. Добави LOVABLE_API_KEY или GEMINI_API_KEY в настройките на сайта.",
      };
    }

    const rawMessages = data.messages ?? [];
    const lastUserMessage = [...rawMessages].reverse().find((message) => message?.role === "user");
    const lastUserText =
      lastUserMessage && typeof lastUserMessage.text === "string"
        ? lastUserMessage.text.trim()
        : "";

    if (lastUserText && is3dRequest(lastUserText)) {
      if (hasLovableBackend() && !apiKey) {
        return {
          success: false,
          error: "3D моделите ще бъдат налични скоро. Дотогава опитай снимка, линк или въпрос.",
        };
      }
      return await request3dGeneration(apiKey, lastUserText);
    }
    if (lastUserText && isImageRequest(lastUserText)) {
      return await requestImageGeneration(apiKey, extractImagePrompt(lastUserText));
    }
    if (lastUserText && isVideoRequest(lastUserText)) {
      if (hasLovableBackend() && !apiKey) {
        return {
          success: false,
          error:
            "Генерирането на видео ще бъде налично скоро. Дотогава опитай снимка, линк или въпрос.",
        };
      }
      const prompt =
        extractMediaPrompt(lastUserText) ||
        "Кратък кинематографичен клип с красив кадър и плавно движение на камерата";
      return await requestVideoGeneration(apiKey, prompt);
    }
    if (lastUserText && isMusicRequest(lastUserText)) {
      if (hasLovableBackend() && !apiKey) {
        return {
          success: false,
          error:
            "Генерирането на музика ще бъде налично скоро. Дотогава опитай снимка, линк или въпрос.",
        };
      }
      const prompt =
        extractMediaPrompt(lastUserText) || "Енергично, весело и модерно инструментално парче";
      return await requestMusicGeneration(apiKey, prompt);
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

    const urlContext = await buildUrlContext(lastUserText);
    if (urlContext && sanitizedMessages.length > 0) {
      const lastPart = sanitizedMessages[sanitizedMessages.length - 1];
      if (lastPart && lastPart.role === "user") {
        const textPart = lastPart.parts.find((part) => part.text);
        if (textPart) {
          textPart.text = `${textPart.text}\n\n${urlContext}`;
        } else {
          lastPart.parts.push({ text: urlContext });
        }
      }
    }

    if (sanitizedMessages.length === 0) {
      return { success: false, error: "Няма въпрос или изображение за изпращане." };
    }

    const hasImages = sanitizedMessages.some((message) =>
      message.parts.some((part) => part["inline_data"]),
    );
    const model = hasImages ? getVisionModel() : getModel();

    if (hasLovableBackend()) {
      const lovableResult = await requestLovableChat(sanitizedMessages, getGeminiTimeoutMs());
      if (lovableResult.success || !apiKey) return lovableResult;
      if (lovableResult.status === 401 || lovableResult.status === 403) return lovableResult;
    }

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
                ? `TK-Bot не отговори в рамките на ${timeoutMs / 1000} секунди (Timeout). Моля, опитай отново.`
                : "Неуспешна заявка към TK-Bot.",
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
                ? "TK-Bot достигна лимита на заявките (429). Моля, опитай отново след малко."
                : response.status === 503
                  ? "AI моделът е претоварен в момента (503). Моля, опитай отново след малко."
                  : response.status === 401 || response.status === 403
                    ? "Текущият GEMINI_API_KEY е невалиден или изтекъл (401). Обнови ключа или използвай TK-Bot през Lovable."
                    : response.status === 404 || response.status === 400
                      ? hasImages
                        ? `Грешка при обработка на изображението (${response.status}). ${detail || `Моделът "${model}" може да не поддържа снимки.`}`
                        : `AI моделът "${model}" не е достъпен (${response.status}). Провери GEMINI_MODEL / GEMINI_API_KEY.`
                      : `Грешка от TK-Bot (${response.status}): ${detail || "неизвестна грешка"}`,
          };
        }

        const result = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) {
          return { success: false, error: "TK-Bot не върна текст. Моля, опитай пак." };
        }

        const payload = { success: true, data: { text } } satisfies GeminiCachedResponse;
        await writeGeminiCachedResponse(cacheKv, cacheKey, payload);

        return payload;
      };

      return await performRequest(wantThinking);
    } catch (error) {
      console.warn("Gemini request failed.", error);
      return { success: false, error: "Неуспешна заявка към TK-Bot." };
    }
  });
