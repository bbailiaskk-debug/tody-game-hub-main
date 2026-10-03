// The ZEGOCLOUD token endpoint, driven through the worker itself.
//
// Two things about this route are worth a test rather than a reading. The first is
// that it is behind the session at all. The second is that it takes the identity
// from the session and not from the request: a token is a claim about one user, so
// a `userId` in the query would let any signed-in visitor mint one for somebody
// else and walk into their rooms. That is a one-line mistake with no symptom until
// it is exploited, which is exactly the kind that gets made and shipped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MESSAGES_COOKIE, mintSessionToken } from "./messages-auth";
import { readZegoToken04 } from "./zego-token";

const APP_ID = 1523622791;
const SECRET = "0123456789abcdef0123456789abcdef";

/**
 * The worker falls back to this when there is no KV binding, which is what makes
 * a session mintable here without standing a Durable Object up.
 */
const DEV_SECRET = "tody-game-hub-messages-dev-secret";

const ORIGIN = "https://tody-game-hub.test";

type Fetch = (request: Request, env: unknown, ctx: unknown) => Promise<Response>;

const call = async (
  path: string,
  options: { cookie?: string; env?: Record<string, string> } = {},
): Promise<Response> => {
  const worker = (await import("../server")) as unknown as { default: { fetch: Fetch } };
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  return worker.default.fetch(
    new Request(`${ORIGIN}${path}`, { headers }),
    { ZEGO_APP_ID: String(APP_ID), ZEGO_SERVER_SECRET: SECRET, ...options.env },
    { waitUntil: () => undefined, passThroughOnException: () => undefined },
  );
};

const sessionFor = async (email: string) =>
  `${MESSAGES_COOKIE}=${await mintSessionToken(DEV_SECRET, email)}`;

describe("the ZEGOCLOUD token endpoint", () => {
  beforeEach(() => {
    // The endpoint warns when it is not configured, and the warning is the point
    // of the test below rather than noise in this one.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses anybody who is not signed in", async () => {
    // The token is a credential: handing one to a stranger is handing over a
    // room. This is the same gate the relay sits behind, for the same reason.
    expect((await call("/api/messages/zego/token")).status).toBe(401);
    expect((await call("/api/messages/zego/token", { cookie: "garbage" })).status).toBe(401);
  });

  it("says so when the project is not configured, rather than handing out nothing", async () => {
    // An empty 200 here would leave an SDK waiting on a token that never comes, so
    // the deployment input is reported as one.
    const response = await call("/api/messages/zego/token", {
      cookie: await sessionFor("me@example.com"),
      env: { ZEGO_APP_ID: "", ZEGO_SERVER_SECRET: "" },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "zego-not-configured" });
  });

  it("gives the signed-in account a token it can be checked against", async () => {
    const response = await call("/api/messages/zego/token", {
      cookie: await sessionFor("Me@Example.com"),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      appId: number;
      userId: string;
      token: string;
      expiresAt: number;
    };

    expect(body.ok).toBe(true);
    // The AppID is handed out: the client SDK needs it, and it names a project
    // rather than opening one.
    expect(body.appId).toBe(APP_ID);
    expect(body.userId).toBe("me@example.com");
    expect(body.token.startsWith("04")).toBe(true);

    // Opened with the secret that never leaves the server. If the claim inside
    // names anybody else, this is where it shows.
    const read = await readZegoToken04(body.token, SECRET);
    expect(read.claim).toMatchObject({ app_id: APP_ID, user_id: "me@example.com" });
    expect(read.expire).toBe(body.expiresAt);
    expect(read.expire).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("mints for the session and not for whoever the request asks about", async () => {
    // The whole reason this route reads no parameter. A visitor who asks for
    // somebody else's token gets one about themselves, which is harmless and easy
    // to see happening; a route that honoured the query would not look different
    // from this one until somebody joined a room they were not in.
    const response = await call("/api/messages/zego/token?userId=victim@example.com", {
      cookie: await sessionFor("me@example.com"),
    });
    const body = (await response.json()) as { userId: string; token: string };
    expect(body.userId).toBe("me@example.com");
    expect((await readZegoToken04(body.token, SECRET)).claim?.user_id).toBe("me@example.com");
  });

  it("never sends the secret, in any answer", async () => {
    const configured = await call("/api/messages/zego/token", {
      cookie: await sessionFor("me@example.com"),
    });
    const text = await configured.text();
    // Not in the body, and not in the headers either: a secret in a header is a
    // secret in every log and every trace along the way.
    expect(text).not.toContain(SECRET);
    for (const [, value] of configured.headers) expect(value).not.toContain(SECRET);

    const unconfigured = await call("/api/messages/zego/token", {
      cookie: await sessionFor("me@example.com"),
      env: { ZEGO_SERVER_SECRET: "" },
    });
    expect(await unconfigured.text()).not.toContain(APP_ID);
  });

  it("is a GET and gives nothing away to another verb", async () => {
    // It hands out a credential, so it stays a GET: no body, nothing a third
    // party's page can trigger with a simple request. Anything else falls through
    // to the object gateway rather than being answered here, and what matters is
    // that none of it returns a token.
    const get = await call("/api/messages/zego/token", {
      cookie: await sessionFor("me@example.com"),
    });
    expect(get.status).toBe(200);

    for (const method of ["POST", "PUT", "DELETE"]) {
      const other = await worker(method);
      expect(other.status).not.toBe(200);
      expect(await other.text()).not.toContain("04");
    }
  });
});

/** A raw call, for the one case that needs a different verb. */
async function worker(method: string): Promise<Response> {
  const entry = (await import("../server")) as unknown as { default: { fetch: Fetch } };
  return entry.default.fetch(
    new Request(`${ORIGIN}/api/messages/zego/token`, { method }),
    { ZEGO_APP_ID: String(APP_ID), ZEGO_SERVER_SECRET: SECRET },
    { waitUntil: () => undefined, passThroughOnException: () => undefined },
  );
}
