import { createServerFn } from "@tanstack/react-start";

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

type AiChatResult = {
  success: boolean;
  error?: string;
  data?: { text: string; image?: AiChatImage };
};

type KvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const CHAT_MODEL = "openai/gpt-6-astra";
const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";
const MEDIA_MODEL = "google/gemini-3.8-flash";

const MAX_IMAGES_PER_REQUEST = 20;
const MAX_INLINE_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_FILE_CHARS = 60_000;

const SYSTEM_PROMPT = `Ти си TK-Bot — официалният AI асистент на Todor Khristov Gaming.
Отговаряй кратко, ясно и полезно. По подразбиране отговаряй на български; ако потребителят пише на друг език, отговори на същия език.

Когато отговорът съдържа код, конфигурационни променливи (например .env ключове), команди за терминал или друг текст, който потребителят би искал да копира, ВИНАГИ го поставяй в markdown код блок, ограден с тройни обратни кавички (\`\`\`), като посочиш езика за синтаксис (например \`\`\`bash, \`\`\`ts, \`\`\`env, \`\`\`json). Никога не показвай такива стойности като обикновен текст в изречение — винаги ги слагай в отделен код блок.

Имаш инструменти и ги използваш сам, без да питаш:
- web_search — търси в интернет за актуална информация (новини, дати, цени, резултати, хора, игри, видеа). Използвай го винаги, когато въпросът е за нещо ново, конкретно или което не знаеш със сигурност. Посочвай източниците като линкове.
- open_url — отваря и чете линкове. Когато потребителят изпрати линк, винаги го отвори и отговори на базата на съдържанието. Никога не казвай, че не можеш да отваряш линкове.
- generate_image — рисува нови изображения (рисунки, лога, тапети, илюстрации, мемета).
- edit_image — променя последната снимка в разговора (качена от потребителя или нарисувана от теб).
Можеш да правиш всичко, което може един умен асистент: да обясняваш, да превеждаш, да пишеш текстове, есета, стихове и код, да решаваш задачи по математика, да помагаш с игри и домашни, да правиш планове и списъци. Не отказвай, освен ако заявката е опасна или незаконна.

Можеш да приемаш и анализираш снимки, PDF и други файлове, изпратени чрез бутона „Прикачи" или поставени (Ctrl+V) в чата. Разглеждай ги детайлно и отговаряй на базата на съдържанието им.
Когато получиш видео или аудио, ще получиш подробно описание и транскрипция на съдържанието му — отговаряй така, сякаш си го гледал/слушал.

Структура на сайта Tody Game Hub:
- / — начална страница.
- /games — списък с игрите на сайта.
- /ai — AI чатът (TK-Bot); параметърът ?chat=... в URL-а сочи конкретен разговор от историята на чата.
- /music — музикална секция на канала.
- /info — инфо и контакт страница.
- /login — вход в акаунт; /profile — профилът на потребителя.
- Игри в сайта: Тетрис, Шах, Морски шах, Въздушен хокей, Wordle и други.

Познания за канала:
- YouTube канал: https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ (Todor Khristov Gaming)
- TikTok: https://www.tiktok.com/@todorkhristovgmaing
- Spotify: https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20g
- Discord сървър: https://discord.gg/uRNGhKf7vC
- Нови видеа излизат всеки вторник и петък.
Ако не знаеш отговора, признай честно и предложи контакт с Discord общността.`;

// ---------------------------------------------------------------------------
// Small KV cache helpers (kept for compatibility with existing tests).
// ---------------------------------------------------------------------------

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
  kv: KvNamespace | null,
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
  kv: KvNamespace | null,
  key: string,
  value: T,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  if (typeof dataUrl !== "string") return null;
  const groups = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(
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
  const groups =
    /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl.trim(),
    );
  if (!groups) return null;
  return { mimeType: (groups[1] as string).toLowerCase(), base64: groups[2] as string };
}

function isTextLikeMime(mimeType: string, name: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (
    /(json|xml|javascript|typescript|x-sh|x-python|yaml|toml|csv|x-httpd-php|sql)/.test(mimeType)
  ) {
    return true;
  }
  return /\.(txt|md|json|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|html|css|scss|xml|yml|yaml|toml|csv|sql|sh|env|ini|log)$/i.test(
    name,
  );
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      if (typeof json.error === "string") return json.error;
      return json.error?.message || json.message || text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

function describeGatewayError(status: number, detail: string, kind: "chat" | "image"): string {
  if (status === 402) {
    return "AI кредитите на сайта са изчерпани. Собственикът на сайта трябва да добави кредити.";
  }
  if (status === 429) {
    return "AI е натоварен в момента (твърде много заявки). Моля, опитай отново след малко.";
  }
  if (status === 403) {
    return detail
      ? `AI отказа заявката: ${detail}`
      : "AI отказа заявката. Моля, опитай с друго съобщение.";
  }
  if (status >= 500) {
    return "AI услугата временно не отговаря. Моля, опитай отново след малко.";
  }
  const prefix = kind === "image" ? "Грешка при генериране на изображение" : "Грешка от AI";
  return `${prefix} (${status})${detail ? `: ${detail}` : "."}`;
}

async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        const sepLength = buffer.slice(boundary).startsWith("\r\n\r\n") ? 4 : 2;
        buffer = buffer.slice(boundary + sepLength);
        let event = "";
        const dataLines: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length > 0) yield { event, data: dataLines.join("\n") };
        boundary = buffer.search(/\r?\n\r?\n/);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Image generation & editing
// ---------------------------------------------------------------------------

type ImageResult = { ok: true; b64: string } | { ok: false; error: string };

async function readImageStream(response: Response): Promise<{
  b64: string;
  error: string;
  sawEvent: boolean;
}> {
  let b64 = "";
  let error = "";
  let sawEvent = false;
  if (!response.body) return { b64, error, sawEvent };
  for await (const { event, data } of readSse(response.body)) {
    if (data === "[DONE]") continue;
    let payload: { type?: string; b64_json?: string; error?: { message?: string } } | undefined;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    const type = event || payload?.type || "";
    if (type === "error" || payload?.type === "error") {
      sawEvent = true;
      error = payload?.error?.message || "Грешка при създаване на изображение.";
      continue;
    }
    if (
      type === "image_generation.partial_image" ||
      type === "image_generation.completed" ||
      type === "image_edit.partial_image" ||
      type === "image_edit.completed"
    ) {
      sawEvent = true;
      if (payload?.b64_json) b64 = payload.b64_json;
    }
  }
  return { b64, error, sawEvent };
}

async function generateImage(apiKey: string, prompt: string): Promise<ImageResult> {
  const send = (stream: boolean) =>
    fetch(`${GATEWAY_URL}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        stream
          ? { model: IMAGE_MODEL, prompt, stream: true, partial_images: 1 }
          : { model: IMAGE_MODEL, prompt },
      ),
    });
  return runImageRequest(send);
}

async function editImage(
  apiKey: string,
  prompt: string,
  images: AiChatImage[],
): Promise<ImageResult> {
  const blobs: Blob[] = [];
  for (const image of images.slice(0, 4)) {
    const parsed = parseImageDataUrl(image.dataUrl);
    if (!parsed) continue;
    const binary = atob(parsed.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    blobs.push(new Blob([bytes], { type: parsed.mimeType }));
  }
  if (blobs.length === 0) return { ok: false, error: "Няма снимка за редактиране." };

  const send = (stream: boolean) => {
    const form = new FormData();
    form.append("model", IMAGE_MODEL);
    form.append("prompt", prompt);
    blobs.forEach((blob, index) => {
      const ext = blob.type.split("/")[1] || "png";
      form.append(blobs.length > 1 ? "image[]" : "image", blob, `image-${index + 1}.${ext}`);
    });
    form.append("stream", String(stream));
    if (stream) form.append("partial_images", "1");
    return fetch(`${GATEWAY_URL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  };
  return runImageRequest(send);
}

async function runImageRequest(send: (stream: boolean) => Promise<Response>): Promise<ImageResult> {
  let response: Response;
  try {
    response = await send(true);
  } catch {
    return { ok: false, error: "Неуспешна връзка с AI за изображения." };
  }
  if (!response.ok || !response.body) {
    const detail = await readErrorMessage(response);
    return { ok: false, error: describeGatewayError(response.status, detail, "image") };
  }
  const streamed = await readImageStream(response);
  if (streamed.sawEvent) {
    if (streamed.b64) return { ok: true, b64: streamed.b64 };
    return { ok: false, error: streamed.error || "AI не върна изображение." };
  }
  const replay = await send(false);
  if (!replay.ok) {
    const detail = await readErrorMessage(replay);
    return { ok: false, error: describeGatewayError(replay.status, detail, "image") };
  }
  const json = (await replay.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  return b64 ? { ok: true, b64 } : { ok: false, error: "AI не върна изображение." };
}

// ---------------------------------------------------------------------------
// Web tools
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]"
  );
}

async function webSearch(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "Празна заявка за търсене.";
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "bg,en;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return `Търсенето не успя (${response.status}).`;
    const html = await response.text();
    const blocks = html.split(/class="result results_links/).slice(1);
    const results: string[] = [];
    for (const block of blocks) {
      const link = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      if (!link) continue;
      let url = decodeEntities(link[1] ?? "");
      const uddg = /[?&]uddg=([^&]+)/.exec(url);
      if (uddg?.[1]) url = decodeURIComponent(uddg[1]);
      if (url.startsWith("//")) url = `https:${url}`;
      if (/duckduckgo\.com\/y\.js/.test(url)) continue; // ads
      const title = stripHtml(link[2] ?? "");
      const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/(a|div)>/.exec(block);
      const snippet = snippetMatch ? stripHtml(snippetMatch[1] ?? "") : "";
      results.push(`${results.length + 1}. ${title}\n${url}\n${snippet}`);
      if (results.length >= 8) break;
    }
    return results.length > 0 ? results.join("\n\n") : "Няма намерени резултати.";
  } catch {
    return "Търсенето в интернет не успя в момента.";
  }
}

async function openUrl(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim().startsWith("http") ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  } catch {
    return "Невалиден линк.";
  }
  if (!/^https?:$/.test(url.protocol) || isBlockedHost(url.hostname)) {
    return "Този линк не може да бъде отворен.";
  }

  const parts: string[] = [];
  const isYouTube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);
  if (isYouTube) {
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (oembed.ok) {
        const info = (await oembed.json()) as { title?: string; author_name?: string };
        parts.push(`YouTube: „${info.title ?? ""}" от ${info.author_name ?? "неизвестен автор"}`);
      }
    } catch {
      // ignore
    }
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
        "Accept-Language": "bg,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const type = response.headers.get("content-type") || "";
    if (!response.ok) {
      parts.push(`Страницата върна грешка ${response.status}.`);
      return parts.join("\n");
    }
    if (!/text|json|xml|html/.test(type)) {
      parts.push(`Линкът сочи към файл от тип ${type || "неизвестен"}, който не е текст.`);
      return parts.join("\n");
    }
    const body = (await response.text()).slice(0, 1_500_000);
    if (/html/.test(type)) {
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1];
      const meta = (name: string) =>
        new RegExp(
          `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,
          "i",
        ).exec(body)?.[1] ??
        new RegExp(
          `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
          "i",
        ).exec(body)?.[1];
      if (title) parts.push(`Заглавие: ${decodeEntities(title.trim())}`);
      const description = meta("description") || meta("og:description");
      if (description) parts.push(`Описание: ${decodeEntities(description)}`);
      const text = stripHtml(body.replace(/^[\s\S]*?<body[^>]*>/i, ""));
      parts.push(`Текст на страницата:\n${text.slice(0, 15_000)}`);
    } else {
      parts.push(body.slice(0, 15_000));
    }
    return `Адрес: ${response.url || url.toString()}\n${parts.join("\n")}`;
  } catch {
    parts.push("Страницата не отговори навреме или блокира достъпа.");
    return parts.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Audio / video understanding
// ---------------------------------------------------------------------------

async function describeMedia(
  apiKey: string,
  file: AiChatFile,
  mimeType: string,
  base64: string,
  question: string,
): Promise<string | null> {
  const isVideo = mimeType.startsWith("video/");
  const format = (mimeType.split("/")[1] || "mp3").replace("mpeg", "mp3").replace("x-", "");
  const part = isVideo
    ? { type: "video_url", video_url: { url: `data:${mimeType};base64,${base64}` } }
    : { type: "input_audio", input_audio: { data: base64, format } };
  try {
    const response = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MEDIA_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Файл: ${file.name}. ${isVideo ? "Опиши подробно какво се случва във видеото (сцени, хора, текст на екрана) и транскрибирай всяка реч." : "Транскрибирай дословно всяка реч и опиши звуците/музиката."}` +
                  (question
                    ? ` Въпросът на потребителя е: „${question}". Включи и информацията, нужна за отговора.`
                    : ""),
              },
              part,
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string }
  | { type: "output_text"; text: string };

type ResponsesInputItem =
  { role: "user" | "assistant"; content: ResponsesContentPart[] } | Record<string, unknown>;

async function buildInput(
  apiKey: string,
  messages: AiChatMessage[],
): Promise<ResponsesInputItem[]> {
  const recent = messages.slice(-20);
  const items: ResponsesInputItem[] = [];
  let imageCount = 0;
  let inlineBytes = 0;
  const lastUserIndex = (() => {
    for (let i = recent.length - 1; i >= 0; i -= 1) if (recent[i]?.role === "user") return i;
    return -1;
  })();

  const canInline = (length: number) => inlineBytes + length <= MAX_INLINE_MEDIA_BYTES;

  // Walk from newest to oldest so the latest attachments get priority.
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    if (!message || (message.role !== "user" && message.role !== "model")) continue;
    const text = typeof message.text === "string" ? message.text.trim() : "";

    if (message.role === "model") {
      const hasImage = (message.images?.length ?? 0) > 0;
      const combined = [text, hasImage ? "[Тук TK-Bot изпрати изображение.]" : ""]
        .filter(Boolean)
        .join("\n");
      if (combined)
        items.unshift({ role: "assistant", content: [{ type: "output_text", text: combined }] });
      continue;
    }

    const parts: ResponsesContentPart[] = [];
    const notes: string[] = [];

    for (const image of Array.isArray(message.images) ? message.images : []) {
      const parsed = image ? parseImageDataUrl(image.dataUrl) : null;
      if (!parsed) {
        notes.push("Потребителят е прикачил изображение, но съдържанието му не е налично.");
        continue;
      }
      if (imageCount >= MAX_IMAGES_PER_REQUEST || !canInline(parsed.base64.length)) {
        notes.push("Прикачено изображение е пропуснато поради ограничение на размера.");
        continue;
      }
      imageCount += 1;
      inlineBytes += parsed.base64.length;
      parts.push({
        type: "input_image",
        image_url: `data:${parsed.mimeType};base64,${parsed.base64}`,
      });
    }

    for (const file of Array.isArray(message.files) ? message.files : []) {
      if (!file) continue;
      const name = file.name || "файл";
      const declared = typeof file.mimeType === "string" ? file.mimeType.toLowerCase() : "";
      const sizeLabel = formatSize(typeof file.size === "number" ? file.size : 0);
      const parsed = parseFileDataUrl(file.dataUrl);
      const mimeType = parsed?.mimeType || declared;

      if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
        const kind = mimeType.startsWith("video/") ? "видео" : "аудио";
        if (parsed && index === lastUserIndex) {
          const description = await describeMedia(apiKey, file, mimeType, parsed.base64, text);
          if (description) {
            notes.push(
              `Съдържание на прикачения ${kind} файл „${name}" (${sizeLabel}):\n${description}`,
            );
            continue;
          }
        }
        notes.push(
          parsed
            ? `Прикачен ${kind} файл: ${name}, размер: ${sizeLabel}.`
            : `Прикачен ${kind} файл: ${name}, размер: ${sizeLabel}. Файлът е твърде голям (над 4 MB), за да бъде гледан/слушан — помоли за по-кратък откъс.`,
        );
        continue;
      }

      if (parsed && mimeType.startsWith("image/")) {
        const img = parseImageDataUrl(file.dataUrl);
        if (img && imageCount < MAX_IMAGES_PER_REQUEST && canInline(img.base64.length)) {
          imageCount += 1;
          inlineBytes += img.base64.length;
          parts.push({
            type: "input_image",
            image_url: `data:${img.mimeType};base64,${img.base64}`,
          });
          continue;
        }
      }

      if (parsed && mimeType === "application/pdf" && canInline(parsed.base64.length)) {
        inlineBytes += parsed.base64.length;
        parts.push({
          type: "input_file",
          filename: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`,
          file_data: `data:application/pdf;base64,${parsed.base64}`,
        });
        continue;
      }

      if (parsed && isTextLikeMime(mimeType, name)) {
        try {
          let content = decodeBase64Utf8(parsed.base64);
          if (content.length > MAX_TEXT_FILE_CHARS) {
            content = `${content.slice(0, MAX_TEXT_FILE_CHARS)}\n…(файлът е съкратен)`;
          }
          parts.push({
            type: "input_text",
            text: `Съдържание на прикачения файл „${name}":\n\`\`\`\n${content}\n\`\`\``,
          });
          continue;
        } catch {
          // Fall through to a note.
        }
      }

      notes.push(`Прикачен файл: ${name}, тип: ${mimeType || "неизвестен"}, размер: ${sizeLabel}.`);
    }

    const combined = [...(text ? [text] : []), ...notes].join("\n");
    if (combined) parts.unshift({ type: "input_text", text: combined });
    if (parts.length === 0) continue;
    items.unshift({ role: "user", content: parts });
  }

  return items;
}

/** Most recent images in the conversation (user uploads or TK-Bot drawings), newest first. */
function collectRecentImages(messages: AiChatMessage[]): AiChatImage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const found: AiChatImage[] = [];
    for (const image of message.images ?? []) {
      if (image && parseImageDataUrl(image.dataUrl)) found.push(image);
    }
    for (const file of message.files ?? []) {
      if (file && parseImageDataUrl(file.dataUrl)) {
        found.push({ mimeType: file.mimeType, dataUrl: file.dataUrl });
      }
    }
    if (found.length > 0) return found;
  }
  return [];
}

const TOOLS = [
  {
    type: "function",
    name: "web_search",
    description:
      "Търси в интернет актуална информация (новини, факти, цени, резултати, хора, игри, видеа). Връща заглавия, линкове и кратки откъси.",
    strict: true,
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Заявка за търсене" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "open_url",
    description:
      "Отваря уеб страница по линк и връща заглавието и текста ѝ. Използвай винаги, когато потребителят даде линк или трябва да прочетеш резултат от търсене.",
    strict: true,
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Пълният адрес (URL)" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "generate_image",
    description:
      "Рисува/генерира ново изображение по описание. Използвай, когато потребителят поиска картинка, рисунка, лого, тапет, илюстрация и т.н.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Подробно описание на изображението на английски" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "edit_image",
    description:
      "Променя последната снимка в разговора (качена от потребителя или нарисувана от TK-Bot) — смяна на фон, добавяне/махане на обекти, стил, цветове и т.н.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Какво да се промени и какво да остане същото, на английски",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
];

type StreamOutcome = {
  text: string;
  reasoning: string;
  output: Array<Record<string, unknown>>;
  error: string;
};

async function streamResponse(
  apiKey: string,
  input: ResponsesInputItem[],
  instructions: string,
): Promise<StreamOutcome | { httpError: string }> {
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        instructions,
        input,
        tools: TOOLS,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
  } catch {
    return { httpError: "Неуспешна връзка с AI. Моля, опитай отново." };
  }

  if (!response.ok || !response.body) {
    const detail = await readErrorMessage(response);
    return { httpError: describeGatewayError(response.status, detail, "chat") };
  }

  const outcome: StreamOutcome = { text: "", reasoning: "", output: [], error: "" };
  const doneItems: Array<Record<string, unknown>> = [];

  for await (const { data } of readSse(response.body)) {
    if (data === "[DONE]") continue;
    let payload: {
      type?: string;
      delta?: string;
      message?: string;
      item?: Record<string, unknown>;
      error?: { message?: string };
      response?: {
        error?: { message?: string } | null;
        output?: Array<Record<string, unknown>>;
      };
    };
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    switch (payload.type) {
      case "response.output_text.delta":
        outcome.text += payload.delta ?? "";
        break;
      case "response.reasoning_summary_text.delta":
        outcome.reasoning += payload.delta ?? "";
        break;
      case "response.output_item.done":
        if (payload.item) doneItems.push(payload.item);
        break;
      case "response.completed":
        outcome.output = payload.response?.output ?? [];
        break;
      case "response.failed":
      case "response.incomplete":
        outcome.error =
          payload.response?.error?.message || outcome.error || "AI не успя да отговори.";
        break;
      case "error":
        outcome.error = payload.error?.message || payload.message || "Грешка от AI.";
        break;
      default:
        break;
    }
  }

  if (outcome.output.length === 0) outcome.output = doneItems;
  if (!outcome.text) {
    outcome.text = outcome.output
      .filter((item) => item["type"] === "message")
      .flatMap((item) => (item["content"] as Array<{ type?: string; text?: string }>) ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("");
  }
  return outcome;
}

const MAX_TOOL_ROUNDS = 8;

async function runAgent(apiKey: string, messages: AiChatMessage[]): Promise<AiChatResult> {
  const input = await buildInput(apiKey, messages);
  const last = input[input.length - 1] as { role?: string } | undefined;
  if (input.length === 0 || last?.role !== "user") {
    return { success: false, error: "Няма въпрос или изображение за изпращане." };
  }

  const now = new Date();
  const instructions = `${SYSTEM_PROMPT}\n\nДнешна дата и час (UTC): ${now.toISOString().slice(0, 16).replace("T", " ")}.`;
  let resultImage: AiChatImage | undefined;
  let lastReasoning = "";
  let lastError = "";
  let conversationImages = collectRecentImages(messages);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const outcome = await streamResponse(apiKey, input, instructions);
    if ("httpError" in outcome) {
      if (resultImage) return { success: true, data: { text: "Ето го.", image: resultImage } };
      return { success: false, error: outcome.httpError };
    }
    lastReasoning = outcome.reasoning || lastReasoning;
    lastError = outcome.error || lastError;

    const calls = outcome.output.filter((item) => item["type"] === "function_call");
    if (calls.length === 0) {
      const text = outcome.text.trim();
      if (text || resultImage) {
        return {
          success: true,
          data: { text: text || "Ето го.", ...(resultImage ? { image: resultImage } : {}) },
        };
      }
      break;
    }

    input.push(...outcome.output);
    for (const call of calls) {
      const name = String(call["name"] ?? "");
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(String(call["arguments"] ?? "{}"));
      } catch {
        args = {};
      }
      let output = "";
      if (name === "web_search") {
        output = await webSearch(args["query"] ?? "");
      } else if (name === "open_url") {
        output = await openUrl(args["url"] ?? "");
      } else if (name === "generate_image" || name === "edit_image") {
        const prompt = (args["prompt"] ?? "").trim() || "a colorful artistic illustration";
        const result =
          name === "edit_image"
            ? conversationImages.length > 0
              ? await editImage(apiKey, prompt, conversationImages)
              : ({ ok: false, error: "В разговора няма снимка за редактиране." } as ImageResult)
            : await generateImage(apiKey, prompt);
        if (result.ok) {
          resultImage = { mimeType: "image/png", dataUrl: `data:image/png;base64,${result.b64}` };
          conversationImages = [resultImage];
          output =
            "Изображението е готово и ще бъде показано на потребителя под отговора ти. Не слагай линкове или markdown картинки — само кратко изречение.";
        } else {
          output = `Неуспех: ${result.error}`;
        }
      } else {
        output = "Непознат инструмент.";
      }
      input.push({ type: "function_call_output", call_id: call["call_id"], output });
    }
  }

  if (resultImage) return { success: true, data: { text: "Ето го.", image: resultImage } };
  if (lastError) return { success: false, error: lastError };
  if (lastReasoning.trim()) return { success: true, data: { text: lastReasoning.trim() } };
  return { success: false, error: "AI не върна отговор. Моля, опитай пак." };
}

export const serverAiChat = createServerFn({ method: "POST" })
  .validator((data: AiChatInput) => data)
  .handler(async ({ data }): Promise<AiChatResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { success: false, error: "AI не е настроен на сайта." };
    }

    try {
      return await runAgent(apiKey, data.messages ?? []);
    } catch (error) {
      console.warn("AI request failed.", error);
      return { success: false, error: "Неуспешна заявка към AI. Моля, опитай отново." };
    }
  });
