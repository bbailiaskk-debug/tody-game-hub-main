import { describe, expect, it, vi } from "vitest";

import worker from "./server";

describe("multiplayer websocket gateway", () => {
  it.each([
    ["/api/ws/chess", "CHESS_GAME_DO"],
    ["/api/ws/ttt", "TTT_GAME_DO"],
    ["/api/ws/airhockey", "AIR_HOCKEY_DO"],
  ])("preserves the %s websocket request and upgrade response", async (path, binding) => {
    const gameId = "GAME1";
    const request = new Request(`https://example.test${path}/${gameId}`, {
      headers: { Upgrade: "websocket" },
    });
    const upgradeResponse = { status: 101 } as Response;
    const fetch = vi.fn(async (forwardedRequest: Request) => {
      expect(forwardedRequest).toBe(request);
      return upgradeResponse;
    });
    const namespace = {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => ({ fetch })),
    };

    const response = await worker.fetch(request, { [binding]: namespace }, {});

    expect(namespace.idFromName).toHaveBeenCalledWith(gameId);
    expect(fetch).toHaveBeenCalledOnce();
    expect(response).toBe(upgradeResponse);
  });
});
