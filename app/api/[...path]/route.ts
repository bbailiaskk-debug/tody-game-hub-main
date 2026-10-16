import { apiRoutes } from "@/lib/api-registry.server";
import {
  getMessagesSecret,
  messagesDoName,
  MESSAGES_COOKIE,
  parseCookieHeader,
  verifySessionToken,
} from "@/lib/messages-auth";

export const dynamic = "force-dynamic";

/**
 * The single door every ported server function comes through.
 *
 * The shims in `lib/*.ts` POST to `/api/...`; the URL table lives in
 * `lib/api-registry.server.ts`. This route is the other half of that pair.
 *
 * A handler that throws answers 500 with the message rather than letting the
 * error escape: TanStack's server functions rejected with the same text, and
 * the login and checkout flows read `.error` off the payload to show the user a
 * message, so losing it would turn every failure into a blank screen.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const route = `/api/${path.join("/")}`;

  const handler = apiRoutes[route];
  if (!handler) {
    return Response.json({ error: `No handler for ${route}` }, { status: 404 });
  }

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    // A handler with no input (the checkout-links one) is POSTed `{}` by the
    // shim, but an empty body from anything else should not be a 400 before
    // the handler gets a chance to ignore it.
    data = {};
  }

  try {
    return Response.json(await handler(data));
  } catch (error) {
    console.error(`[api] ${route} failed`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const route = `/api/${path.join("/")}`;

  /*
   * The messages hub is the one part of this app that was never plain HTTP.
   *
   * Its gateway was a Cloudflare Durable Object with a WebSocket Hibernation
   * API, holding every message, presence, call, voice channel and guild in a
   * sqlite-backed instance, and `src/server.ts` proxied `/api/messages/*` into
   * it. That runtime has no Next.js equivalent, so it did not come across.
   *
   * Its session handshake is the exception: it is a signed cookie over the same
   * secret the rest of the app already stores, with no Durable Object involved.
   * So `/session` answers for real — a valid cookie gets the identity, an
   * absent or forged one gets `{ ok: false }` — and the page behind it can tell
   * "logged in" from "logged out" without a console error. Everything below it
   * is the realtime layer that did not come across, and says so.
   */
  if (route === "/api/messages/session") {
    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const token = cookies[MESSAGES_COOKIE] ?? null;
    const secret = await getMessagesSecret();
    const verified = await verifySessionToken(secret, token);

    return Response.json(
      verified.ok
        ? { ok: true, email: verified.email, name: await messagesDoName(verified.email) }
        : { ok: false },
    );
  }

  return Response.json(
    {
      error:
        "The messages gateway was a Cloudflare Durable Object and has no Next.js equivalent. " +
        "It was not part of this port; only the session handshake answers.",
      route,
    },
    { status: 501 },
  );
}