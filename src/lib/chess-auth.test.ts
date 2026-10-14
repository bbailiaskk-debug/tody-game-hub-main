import { describe, expect, it, vi } from "vitest";

import { getChessSecret, mintChessToken, normalizeEmail, verifyChessToken } from "./chess-auth";

describe("chess auth input safety", () => {
  it("normalizes only real string emails and rejects nullish or non-string values", () => {
    expect(normalizeEmail("  PLAYER@Example.com ")).toBe("player@example.com");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(123 as unknown as string)).toBe("");
  });

  it("rejects malformed multiplayer auth inputs and accepts valid tokens", async () => {
    await expect(mintChessToken("secret", "GAME123", 42 as unknown as string)).rejects.toThrow(
      "invalid-chess-token-input",
    );
    await expect(mintChessToken("secret", 42 as unknown as string, "player@example.com")).rejects.toThrow(
      "invalid-chess-token-input",
    );

    const token = await mintChessToken("secret", "GAME123", "Player@Example.com");
    expect(await verifyChessToken("secret", "GAME123", "player@example.com", token)).toBe(true);
    expect(await verifyChessToken("secret", "GAME123", "player@example.com", "bogus")).toBe(false);
    expect(await verifyChessToken("", "GAME123", "player@example.com", token)).toBe(false);
  });

  it("reuses a stable secret when the KV is empty", async () => {
    const kv = {
      get: async () => null,
      put: async (_key: string, value: string) => {
        expect(value).toBe("tody-game-hub-chess-dev-secret");
      },
    };

    const first = await getChessSecret(kv);
    const second = await getChessSecret(kv);

    expect(first).toBe("tody-game-hub-chess-dev-secret");
    expect(second).toBe(first);
  });

  it("accepts a multiplayer token across isolated server and websocket runtimes", async () => {
    vi.resetModules();
    const serverAuth = await import("./chess-auth");
    const serverSecret = await serverAuth.getChessSecret(null);
    const token = await serverAuth.mintChessToken(serverSecret, "GAME123", "player@example.com");

    vi.resetModules();
    const websocketAuth = await import("./chess-auth");
    const websocketSecret = await websocketAuth.getChessSecret(null);

    expect(websocketSecret).toBe(serverSecret);
    await expect(
      websocketAuth.verifyChessToken(websocketSecret, "GAME123", "player@example.com", token),
    ).resolves.toBe(true);
    await expect(
      websocketAuth.verifyChessToken(websocketSecret, "OTHER1", "player@example.com", token),
    ).resolves.toBe(false);
  });

  it("shares the persisted secret between the server and Durable Object runtimes", async () => {
    const entries = new Map<string, string>();
    const kv = {
      get: async (key: string) => entries.get(key) ?? null,
      put: async (key: string, value: string) => {
        entries.set(key, value);
      },
    };

    vi.resetModules();
    const serverAuth = await import("./chess-auth");
    const serverSecret = await serverAuth.getChessSecret(kv);
    const token = await serverAuth.mintChessToken(serverSecret, "GAME123", "player@example.com");

    vi.resetModules();
    const durableObjectAuth = await import("./chess-auth");
    const objectSecret = await durableObjectAuth.getChessSecret(kv);

    expect(objectSecret).toBe(serverSecret);
    await expect(
      durableObjectAuth.verifyChessToken(objectSecret, "GAME123", "player@example.com", token),
    ).resolves.toBe(true);
  });
});
