import { describe, expect, it } from "vitest";

import {
  buildGeminiCacheKey,
  readGeminiCachedResponse,
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
});
