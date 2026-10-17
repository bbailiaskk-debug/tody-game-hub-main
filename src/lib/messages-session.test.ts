import { beforeEach, describe, expect, it, vi } from "vitest";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));

vi.mock("@tanstack/react-start/server", () => ({ setCookie }));

import { MESSAGES_COOKIE, SESSION_TTL_MS, verifySessionToken } from "./messages-auth";
import { grantMessagesSession } from "./messages-session";

/**
 * The Google path has no password to hand the chat, so this cookie is the only
 * thing standing between a Google-only account and its own conversations. The
 * assertions below are about it being a session the gateway would accept, not
 * merely a cookie that was set.
 */
describe("granting a messages session without a password", () => {
  beforeEach(() => {
    setCookie.mockReset();
  });

  it("sets the cookie the gateway already reads, with the gateway's attributes", async () => {
    expect(await grantMessagesSession("Player@Example.com")).toBe(true);

    expect(setCookie).toHaveBeenCalledTimes(1);
    const [name, , options] = setCookie.mock.calls[0] as [string, string, Record<string, unknown>];

    expect(name).toBe(MESSAGES_COOKIE);
    expect(options).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  });

  it("mints a token bound to the account that signed in", async () => {
    await grantMessagesSession("Player@Example.com");

    const [, token] = setCookie.mock.calls[0] as [string, string];
    const verified = await verifySessionToken(
      // The same fallback secret the KV-less path uses, so this reads the token
      // exactly as the gateway would when AUTH_USERS_KV is not reachable.
      "tody-game-hub-messages-dev-secret",
      token,
      "player@example.com",
    );

    expect(verified.ok).toBe(true);
  });

  it("refuses an empty address rather than minting a session for nobody", async () => {
    expect(await grantMessagesSession("   ")).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });
});
