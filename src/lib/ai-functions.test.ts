import { describe, expect, it, vi } from "vitest";

import {
  buildAnthropicMessages,
  buildGeminiCacheKey,
  extractImagePrompt,
  getGeminiRetryDelayMs,
  isImageRequest,
  readGeminiCachedResponse,
  requestAnthropicChat,
  writeGeminiCachedResponse,
} from "./ai-functions";

describe("gemini request cache", () => {
  it("stores and reads a cached response keyed by prompt and model", async () => {
    const store = new Map<string, string>();
    const kv = {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    };

    const model = "gemini-3.5-flash-lite";
    const prompt = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Какво е 2+2?" }] }],
      systemInstruction: { parts: [{ text: "Бъди кратък" }] },
    });

    const key = buildGeminiCacheKey(model, prompt);

    await writeGeminiCachedResponse(kv as never, key, {
      success: true,
      data: { text: "4" },
    });

    await expect(readGeminiCachedResponse(kv as never, key)).resolves.toEqual({
      success: true,
      data: { text: "4" },
    });
  });

  it("uses bounded exponential backoff for rate limits", () => {
    const response = new Response(null, { status: 429 });

    expect(getGeminiRetryDelayMs(response, 1)).toBe(1000);
    expect(getGeminiRetryDelayMs(response, 2)).toBe(2000);
    expect(getGeminiRetryDelayMs(response, 3)).toBe(4000);
  });

  it("honors Retry-After without allowing an unbounded wait", () => {
    const response = new Response(null, {
      status: 429,
      headers: { "retry-after": "20" },
    });

    expect(getGeminiRetryDelayMs(response, 1)).toBe(8000);
  });
});

describe("image generation intent", () => {
  it("recognizes Bulgarian and English image prompts", () => {
    expect(isImageRequest("Генерирай снимка на киберпейп град")).toBe(true);
    expect(isImageRequest("Generate an image of a cyberpunk city")).toBe(true);
    expect(isImageRequest("Опиши тази снимка")).toBe(false);
  });

  it("extracts a usable prompt from an image request", () => {
    expect(extractImagePrompt("Генерирай снимка на динозавър в космоса")).toBe(
      "динозавър в космоса",
    );
  });
});

describe("anthropic message conversion", () => {
  it("maps model history and image data to Anthropic content blocks", () => {
    const messages = buildAnthropicMessages([
      { role: "user", text: "Виж изображението" },
      {
        role: "user",
        text: "",
        images: [{ mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" }],
      },
      { role: "model", text: "Готово" },
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Виж изображението" },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
          },
        ],
      },
      { role: "assistant", content: [{ type: "text", text: "Готово" }] },
    ]);
  });

  it("keeps file metadata without embedding file contents", () => {
    const messages = buildAnthropicMessages([
      {
        role: "user",
        text: "Провери файла",
        files: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            dataUrl: "data:text/plain;base64,c2VjcmV0",
            size: 6,
          },
        ],
      },
    ]);

    expect(messages[0]?.content).toEqual([
      { type: "text", text: "Провери файла" },
      { type: "text", text: "Прикачен файл: notes.txt, тип: text/plain, размер: 6 B." },
    ]);
  });

  it("handles a Claude 429 response without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await requestAnthropicChat(
        "test-key",
        { messages: [{ role: "user", text: "Здрасти" }], model: "claude-opus-4.8" },
        "Избраният модел в интерфейса: claude-opus-4.8.",
      );

      expect(result).toEqual({
        success: false,
        error: "Claude API достигна лимита на заявките (429). Моля, опитай отново след малко.",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          headers: expect.objectContaining({ "x-api-key": "test-key" }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("explains an exhausted Claude credit balance without exposing provider details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Your credit balance is too low to access the Anthropic API." },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    try {
      const result = await requestAnthropicChat(
        "test-key",
        { messages: [{ role: "user", text: "Здрасти" }], model: "claude-opus-4.8" },
        "Избраният модел в интерфейса: claude-opus-4.8.",
      );

      expect(result).toEqual({
        success: false,
        error:
          "Claude API няма достатъчно кредити. Добави кредити в Anthropic или избери друг модел за да продължиш.",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("converts Claude network failures into a safe error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    try {
      const result = await requestAnthropicChat(
        "test-key",
        { messages: [{ role: "user", text: "Здрасти" }], model: "claude-opus-4.8" },
        "Избраният модел в интерфейса: claude-opus-4.8.",
      );

      expect(result).toEqual({
        success: false,
        error: "Неуспешна заявка към Claude API.",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
