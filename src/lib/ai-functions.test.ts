import { describe, expect, it } from "vitest";

import {
  buildGeminiCacheKey,
  compileMeshPlan,
  encodeBinaryStl,
  extractMediaPrompt,
  extractUrls,
  is3dRequest,
  isBlockedHostname,
  isMusicRequest,
  isVideoRequest,
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

describe("media intent detection", () => {
  it.each([
    "Направи ми песен",
    "създай музика за моята игра",
    "Generate a song",
    "генерирай мелодия",
    "make me a beat",
  ])("detects music request: %s", (text) => {
    expect(isMusicRequest(text)).toBe(true);
  });

  it.each([
    "Каква музика слушаш?",
    "разкажи ми за песните му",
    "как се качва видео в YouTube",
    "обясни какво прави музиката",
  ])("rejects non-music request: %s", (text) => {
    expect(isMusicRequest(text)).toBe(false);
  });

  it.each([
    "Направи ми видео",
    "Генерирай клип",
    "create an animation",
    "създай видеоклип за канала",
  ])("detects video request: %s", (text) => {
    expect(isVideoRequest(text)).toBe(true);
  });

  it.each(["Какво е видео?", "разгледай този видеоклип"])(
    "rejects non-video request: %s",
    (text) => {
      expect(isVideoRequest(text)).toBe(false);
    },
  );

  it.each([
    "Направи ми 3D модел за печат",
    "генерирай STL файл",
    "създай фигурка за принтера",
    "make a 3d printable model",
  ])("detects 3D request: %s", (text) => {
    expect(is3dRequest(text)).toBe(true);
  });

  it.each(["как работи 3d принтерът", "какво е stl формат"])(
    "rejects non-3D request: %s",
    (text) => {
      expect(is3dRequest(text)).toBe(false);
    },
  );
});

describe("media prompt extraction", () => {
  it("strips the leading verb and noun", () => {
    expect(extractMediaPrompt("Направи ми песен за моята игра")).toBe("за моята игра");
  });

  it("strips English phrases too", () => {
    expect(extractMediaPrompt("Make me a song about dogs")).toBe("about dogs");
  });

  it("returns an empty string when only the command is present", () => {
    expect(extractMediaPrompt("създай 3d модел")).toBe("");
  });
});

describe("url handling", () => {
  it("extracts public http(s) urls only", () => {
    const urls = extractUrls(
      "Виж https://example.com/abc, локалния fix-at http://localhost/x и https://10.0.0.5/a",
    );
    expect(urls).toEqual(["https://example.com/abc"]);
  });

  it("blocks private and service hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
    expect(isBlockedHostname("10.0.0.1")).toBe(true);
    expect(isBlockedHostname("192.168.1.1")).toBe(true);
    expect(isBlockedHostname("172.16.0.1")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});

describe("stl generation", () => {
  const boxPlan = {
    name: "cube",
    parts: [{ name: "body", type: "box", params: { size: [2, 2, 2] } }],
  };

  it("compiles a simple box plan into triangles", () => {
    const triangles = compileMeshPlan(boxPlan);
    expect(triangles).not.toBeNull();
    expect(triangles!.length).toBe(12);
  });

  it("compiles compound plans with mixed primitives", () => {
    const triangles = compileMeshPlan({
      name: "robot",
      parts: [
        { name: "head", type: "sphere", params: { radius: 1 }, position: [0, 2, 0] },
        { name: "body", type: "box", params: { size: [2, 2, 2] } },
        { name: "nose", type: "cone", params: { radius: 0.2, height: 0.4 }, position: [1.2, 2, 0] },
      ],
    });
    expect(triangles).not.toBeNull();
    expect(triangles!.length).toBeGreaterThan(50);
  });

  it("returns null for unknown primitive types", () => {
    expect(
      compileMeshPlan({ name: "x", parts: [{ name: "bad", type: "pyramid", params: {} }] }),
    ).toBeNull();
  });

  it("encodes binary STL with correct size and header", () => {
    const triangles = compileMeshPlan(boxPlan);
    const bytes = encodeBinaryStl(triangles!);
    expect(bytes.byteLength).toBe(84 + 50 * 12);
    expect(new DataView(bytes.buffer).getUint32(80, true)).toBe(12);
    for (let index = 0; index < 80; index += 1) {
      expect(bytes[index]).toBe(0);
    }
  });

  it("round-trips a compiled mesh through the encoder", () => {
    const triangles = compileMeshPlan({
      name: "holder",
      parts: [
        { name: "base", type: "cylinder", params: { radius: 2, height: 0.4 } },
        { name: "ring", type: "torus", params: { major: 0.8, minor: 0.15 }, position: [0, 0.8, 0] },
      ],
    });
    const bytes = encodeBinaryStl(triangles!);
    expect(new DataView(bytes.buffer).getUint32(80, true)).toBe(triangles!.length);
  });
});
