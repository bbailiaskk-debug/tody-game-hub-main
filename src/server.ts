import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getChessSecret, getRegisteredUser } from "./lib/chess-auth";
import { getAuthStore, verifyCredentials } from "./lib/auth-functions";
import {
  MESSAGES_COOKIE,
  MIRROR_HEADER,
  SESSION_EMAIL_HEADER,
  SESSION_HEADER,
  SESSION_TTL_MS,
  getMessagesSecret,
  messagesDoName,
  mintSessionToken,
  normalizeMessagesEmail,
  parseCookieHeader,
  verifySessionToken,
} from "./lib/messages-auth";
import { handleStripeWebhookEvent } from "./lib/plan-webhook";
import { readServerEnv } from "./lib/stripe";
import { verifyStripeSignature } from "./lib/stripe-signature";
import { friendshipId } from "./lib/messages-protocol";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} вЂ” try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function withHsts(response: Response): Response {
  const nextHeaders = new Headers(response.headers);
  if (!nextHeaders.has("strict-transport-security")) {
    nextHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // Mirror the public/_headers stanza for SSR-rendered documents. Cloudflare's
  // _headers/_rules apply to static assets only, but the HTML for each route is
  // produced by the worker fetch handler on the fly, so the same security
  // headers have to be attached here for the real (spider-facing) documents.
  if (nextHeaders.get("content-type")?.includes("text/html")) {
    // Referrer dropped on cross-origin to avoid leaking the query string
    // (the private chat/lang tokens are the kind of thing we keep off referers).
    if (!nextHeaders.has("referrer-policy")) {
      nextHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
    }
    if (!nextHeaders.has("x-content-type-options")) {
      nextHeaders.set("X-Content-Type-Options", "nosniff");
    }
    // Keep the app embeddable only where we host previews (lovable.app and
    // local dev), rejecting framing anywhere else.
    if (!nextHeaders.has("x-frame-options")) {
      nextHeaders.set("X-Frame-Options", "SAMEORIGIN");
    }
    if (!nextHeaders.has("content-security-policy")) {
      nextHeaders.set(
        "Content-Security-Policy",
        "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://*.lovable.app",
      );
    }
    if (!nextHeaders.has("permissions-policy")) {
      // The microphone and the camera have to be allowed to this origin, or the
      // browser refuses `getUserMedia` on policy grounds before the person is
      // even asked: an empty allowlist denies the top level document too, not
      // only framed ones, so `microphone=()` is a call nobody can be heard on
      // rather than a protection. Geolocation is still off, because nothing here
      // has any use for it.
      nextHeaders.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    }

    // HTML references hashed assets, so serving a stale document after a deploy
    // can point browsers at assets that no longer exist. Keep the document
    // revalidated while immutable assets remain cacheable by their own headers.
    nextHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

function redirectToHttps(request: Request): Response | null {
  const url = new URL(request.url);

  // The production Workers edge terminates TLS and this handler is the origin
  // that must upgrade http to https. During `vite dev` (including the LAN IP and
  // cloudflared trycloudflare tunnels) the origin is plain http вЂ” redirecting to
  // https would loop forever against the same host.
  if (import.meta.env.DEV) {
    return null;
  }

  // NGINX Unit deployment: Unit terminates TLS and redirects :80 -> :443 itself
  // (Unit does NOT inject x-forwarded-proto when proxying to this app, so the
  // internal URL here is always plain http вЂ” trusting it would redirect every
  // request and loop). The systemd unit sets HTTPS_REDIRECT=off in that case.
  if (typeof process !== "undefined" && process.env?.["HTTPS_REDIRECT"] === "off") {
    return null;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");

  let isHttpRequest: boolean;
  if (forwardedProto) {
    // Trust the edge/proxy (NGINX Unit, Cloudflare) for protocol detection:
    // behind a TLS terminator the internal URL is plain http even on https requests.
    isHttpRequest = forwardedProto === "http";
  } else {
    isHttpRequest = url.protocol === "http:";
  }

  if (!isHttpRequest || url.hostname === "localhost" || url.hostname.endsWith("localhost")) {
    return null;
  }

  const redirectUrl = new URL(request.url);
  redirectUrl.protocol = "https:";
  redirectUrl.port = "";

  return Response.redirect(redirectUrl.toString(), 301);
}

// Initialize Cloudflare Worker environment for server functions. Nitro dispatches
// the ssr service with only the Request (env param is undefined), but it stashes
// the real env on globalThis.__env__ before the service runs вЂ” fall back to it.
function initializeCloudflareEnv(env: unknown): void {
  const realEnv = env ?? (globalThis as typeof globalThis & { __env__?: unknown }).__env__;
  (globalThis as typeof globalThis & { CF_ENV?: unknown }).CF_ENV = realEnv;
}

function buildSitemapXml(): string {
  const baseUrl = "https://tody-game-hub.bbailiaskk.workers.dev";
  const pages = [
    { loc: "/", changefreq: "daily", priority: "1.0" },
    { loc: "/games", changefreq: "daily", priority: "0.9" },
    { loc: "/chess", changefreq: "weekly", priority: "0.7" },
    { loc: "/game2048", changefreq: "weekly", priority: "0.7" },
    { loc: "/tictactoe", changefreq: "weekly", priority: "0.7" },
    { loc: "/dino", changefreq: "weekly", priority: "0.7" },
    { loc: "/airhockey", changefreq: "weekly", priority: "0.7" },
    { loc: "/wordle", changefreq: "weekly", priority: "0.7" },
    { loc: "/sudoku", changefreq: "weekly", priority: "0.7" },
    { loc: "/candycrush", changefreq: "weekly", priority: "0.7" },
    { loc: "/ddlc", changefreq: "weekly", priority: "0.7" },
    { loc: "/crystalrealm", changefreq: "weekly", priority: "0.7" },
    { loc: "/prismheart", changefreq: "weekly", priority: "0.7" },
    { loc: "/streamer", changefreq: "weekly", priority: "0.7" },
    { loc: "/beatbattle", changefreq: "weekly", priority: "0.7" },
    { loc: "/tetris", changefreq: "weekly", priority: "0.7" },
    { loc: "/ai", changefreq: "weekly", priority: "0.8" },
    { loc: "/rules", changefreq: "monthly", priority: "0.5" },
    { loc: "/tutorial", changefreq: "monthly", priority: "0.5" },
    { loc: "/music", changefreq: "weekly", priority: "0.8" },
    { loc: "/info", changefreq: "weekly", priority: "0.8" },
  ];

  const urls = pages
    .map(
      (page) =>
        `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function serveSitemap(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/sitemap.xml") return null;

  return new Response(buildSitemapXml(), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

type ChessGameNamespace = {
  idFromName: (name: string) => unknown;
  idFromString?: (id: string) => unknown;
  get: (id: unknown) => { fetch: (request: Request) => Promise<Response> };
};

type ChessEnvLike = { CHESS_GAME_DO?: ChessGameNamespace };

// Nitro dispatches the ssr service with only the web Request, so the fetch
// handler's `env` argument is undefined in production. The real worker env is
// exposed by Nitro on request.runtime.cloudflare.env, globalThis.__env__, and
// on globalThis.CF_ENV (set locally via initializeCloudflareEnv).
function resolveChessNamespace(request: Request, env: unknown): ChessGameNamespace | null {
  if (env && typeof env === "object") {
    const direct = (env as ChessEnvLike).CHESS_GAME_DO;
    if (direct) return direct;
  }

  const runtimeRequest = request as Request & { runtime?: { cloudflare?: { env?: unknown } } };
  const runtimeEnv = runtimeRequest.runtime?.cloudflare?.env;
  if (runtimeEnv && typeof runtimeEnv === "object") {
    const fromRuntime = (runtimeEnv as ChessEnvLike).CHESS_GAME_DO;
    if (fromRuntime) return fromRuntime;
  }

  const globals = globalThis as typeof globalThis & { __env__?: unknown; CF_ENV?: unknown };
  for (const candidate of [globals.__env__, globals.CF_ENV]) {
    if (candidate && typeof candidate === "object") {
      const ns = (candidate as ChessEnvLike).CHESS_GAME_DO;
      if (ns) return ns;
    }
  }

  return null;
}

type TttGameNamespace = {
  idFromName: (name: string) => unknown;
  idFromString?: (id: string) => unknown;
  get: (id: unknown) => { fetch: (request: Request) => Promise<Response> };
};

type TttEnvLike = { TTT_GAME_DO?: TttGameNamespace };

function resolveTttNamespace(request: Request, env: unknown): TttGameNamespace | null {
  if (env && typeof env === "object") {
    const direct = (env as TttEnvLike).TTT_GAME_DO;
    if (direct) return direct;
  }

  const runtimeRequest = request as Request & { runtime?: { cloudflare?: { env?: unknown } } };
  const runtimeEnv = runtimeRequest.runtime?.cloudflare?.env;
  if (runtimeEnv && typeof runtimeEnv === "object") {
    const fromRuntime = (runtimeEnv as TttEnvLike).TTT_GAME_DO;
    if (fromRuntime) return fromRuntime;
  }

  const globals = globalThis as typeof globalThis & { __env__?: unknown; CF_ENV?: unknown };
  for (const candidate of [globals.__env__, globals.CF_ENV]) {
    if (candidate && typeof candidate === "object") {
      const ns = (candidate as TttEnvLike).TTT_GAME_DO;
      if (ns) return ns;
    }
  }

  return null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readMessagesSession(request: Request): Promise<string | null> {
  const secret = await getMessagesSecret();
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const session = await verifySessionToken(secret, cookies[MESSAGES_COOKIE] ?? null);
  return session.ok ? session.email : null;
}

/**
 * The relay list, as the environment holds it.
 *
 * `TURN_URL` takes several addresses, comma separated, because a relay is
 * normally reached on more than one port and a call is better off trying the
 * next one than giving up. The username and credential are Cloudflare Realtime
 * TURN's, which are short lived, so a long-lived deployment mints them per day
 * rather than once.
 *
 * An unset relay is not an error, so the endpoint answers with nothing to add
 * rather than failing the call. It is also not harmless: without a relay the app
 * works only where two devices can meet directly, and one side of a symmetric
 * NAT has no reachable address of its own to offer. That is most mobile
 * carriers and many office and school networks, so the gap is worth saying out
 * loud rather than leaving a call to hang on it.
 */
function serveMessagesTurn(env: unknown): Response {
  const vars = (env ?? {}) as {
    TURN_URL?: string;
    TURN_USER?: string;
    TURN_CRED?: string;
  };
  const urls = (vars.TURN_URL ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    // Said on every call rather than once at boot, because what the person
    // watching is a call that will not come up, and this is the line that
    // explains it.
    console.warn(
      "No TURN relay is configured, so a call has no relayed route to fall back on. " +
        "Set TURN_URL, TURN_USER and TURN_CRED in the server environment. Until then a " +
        "call connects only where the two devices can meet directly, and one side of a " +
        "symmetric NAT (most mobile carriers, many office and school networks) waits on " +
        "the connecting state for good.",
    );
    return jsonResponse({ ok: true, urls: [] });
  }
  return jsonResponse({
    ok: true,
    urls,
    username: (vars.TURN_USER ?? "").trim(),
    credential: (vars.TURN_CRED ?? "").trim(),
  });
}

/** Bounded cross-account profile read used only to refresh contact presence. */
async function serveMessagesPeerProfile(request: Request, env: unknown): Promise<Response | null> {
  const caller = await readMessagesSession(request);
  if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

  const target = normalizeMessagesEmail(new URL(request.url).searchParams.get("email") ?? "");
  if (!target || target === caller) return jsonResponse({ error: "invalid-peer" }, 400);

  // The peer must actually be a contact, otherwise this becomes a free
  // directory lookup for any signed-in visitor.
  const namespace = resolveMessagesNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "messages-not-configured" }, 503);

  const ownId = namespace.idFromName(await messagesDoName(caller));
  const contactsResponse = await namespace.get(ownId).fetch(new Request("https://messages-do/"));
  if (!contactsResponse.ok) return jsonResponse({ error: "storage-unavailable" }, 502);
  const snapshot = (await contactsResponse.json()) as { contacts?: Array<{ peerEmail: string }> };
  const isContact = (snapshot.contacts ?? []).some(
    (contact) => normalizeMessagesEmail(contact.peerEmail ?? "") === target,
  );
  if (!isContact) return jsonResponse({ error: "not-a-contact" }, 403);

  const peerId = namespace.idFromName(await messagesDoName(target));
  const peerResponse = await namespace
    .get(peerId)
    .fetch(new Request("https://messages-do/profile"));
  if (!peerResponse.ok) return jsonResponse({ error: "storage-unavailable" }, 502);
  return new Response(await peerResponse.text(), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** One-shot lift of conversations that previously lived only in localStorage. */
async function serveMessagesImport(request: Request, env: unknown): Promise<Response | null> {
  const caller = await readMessagesSession(request);
  if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

  const namespace = resolveMessagesNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "messages-not-configured" }, 503);

  let payload: { contacts?: unknown[]; chats?: unknown[] } = {};
  try {
    payload = (await request.json()) as { contacts?: unknown[]; chats?: unknown[] };
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const stubFor = async (email: string) =>
    namespace.get(namespace.idFromName(await messagesDoName(email)));
  const own = await stubFor(caller);

  const contacts = (Array.isArray(payload.contacts) ? payload.contacts : []).slice(0, 200);
  const chats = (Array.isArray(payload.chats) ? payload.chats : []).slice(0, 200);

  let importedContacts = 0;
  let importedChats = 0;
  let importedMessages = 0;

  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const contact = raw as Record<string, unknown>;
    const name = String(contact["name"] ?? "")
      .trim()
      .slice(0, 80);
    if (!name) continue;
    const response = await own.fetch(
      new Request("https://messages-do/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: String(contact["id"] ?? `contact-${importedContacts}`).slice(0, 80),
          peerEmail: normalizeMessagesEmail(String(contact["peerEmail"] ?? "")),
          name,
          about: String(contact["about"] ?? ""),
          accent: String(contact["accent"] ?? "#1DB954"),
          avatar: typeof contact["avatar"] === "string" ? contact["avatar"] : null,
        }),
      }),
    );
    if (response.ok) importedContacts += 1;
  }

  for (const raw of chats) {
    if (!raw || typeof raw !== "object") continue;
    const chat = raw as Record<string, unknown>;
    const chatId = String(chat["id"] ?? "").slice(0, 80);
    if (!chatId) continue;
    const messages = (Array.isArray(chat["messages"]) ? chat["messages"] : []).slice(-200);
    for (const message of messages) {
      if (!message || typeof message !== "object") continue;
      const entry = message as Record<string, unknown>;
      const response = await own.fetch(
        new Request("https://messages-do/message", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: String(entry["id"] ?? `${chatId}-${importedMessages}`).slice(0, 80),
            chatId,
            peerEmail: normalizeMessagesEmail(String(chat["peerEmail"] ?? "")),
            text: String(entry["text"] ?? "").slice(0, 4000),
            at: Number.isFinite(entry["at"]) ? entry["at"] : Date.now(),
            fromMe: Boolean(entry["fromMe"]),
          }),
        }),
      );
      if (response.ok) importedMessages += 1;
    }
    importedChats += 1;
  }

  return jsonResponse(
    { ok: true, contacts: importedContacts, chats: importedChats, messages: importedMessages },
    200,
  );
}

async function serveChessGameRequest(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  const prefix = "/api/ws/chess/";
  if (!url.pathname.startsWith(prefix)) return null;

  const gameId = url.pathname.slice(prefix.length).split("/")[0] ?? "";
  if (!gameId) return jsonResponse({ error: "invalid-game" }, 400);

  const namespace = resolveChessNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "chess-not-configured" }, 503);

  const id = namespace.idFromName(gameId);
  const stub = namespace.get(id);

  // For WebSocket upgrades, mint (or read) the chess secret on the SSR side вЂ”
  // the same secret serverChessAuth uses вЂ” and pass it to the DO as a header so
  // token verification and minting always agree, independent of the DO's KV
  // binding resolution.
  let doRequest = request;
  if ((request.headers.get("Upgrade") ?? "").toLowerCase() === "websocket") {
    const secret = await getChessSecret();
    const doHeaders = new Headers(request.headers);
    doHeaders.set("x-chess-secret", secret);
    doRequest = new Request(request, { headers: doHeaders });
  }

  try {
    return await stub.fetch(doRequest);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Chess DO fetch failed.", error);
    return jsonResponse({ error: "do-fetch-failed", message: detail }, 502);
  }
}

async function serveTicTacToeGameRequest(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  const prefix = "/api/ws/ttt/";
  if (!url.pathname.startsWith(prefix)) return null;

  const gameId = url.pathname.slice(prefix.length).split("/")[0] ?? "";
  if (!gameId) return jsonResponse({ error: "invalid-game" }, 400);

  const namespace = resolveTttNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "ttt-not-configured" }, 503);

  const id = namespace.idFromName(gameId);
  const stub = namespace.get(id);

  // For WebSocket upgrades, mint (or read) the shared chess secret on the SSR
  // side вЂ” the same secret serverTicTacToeAuth uses вЂ” and pass it to the DO as
  // a header so token verification and minting always agree.
  let doRequest = request;
  if ((request.headers.get("Upgrade") ?? "").toLowerCase() === "websocket") {
    const secret = await getChessSecret();
    const doHeaders = new Headers(request.headers);
    doHeaders.set("x-chess-secret", secret);
    doRequest = new Request(request, { headers: doHeaders });
  }

  try {
    return await stub.fetch(doRequest);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("TicTacToe DO fetch failed.", error);
    return jsonResponse({ error: "do-fetch-failed", message: detail }, 502);
  }
}

type AirHockeyGameNamespace = {
  idFromName: (name: string) => unknown;
  idFromString?: (id: string) => unknown;
  get: (id: unknown) => { fetch: (request: Request) => Promise<Response> };
};

type AirHockeyEnvLike = { AIR_HOCKEY_DO?: AirHockeyGameNamespace };

function resolveAirHockeyNamespace(request: Request, env: unknown): AirHockeyGameNamespace | null {
  if (env && typeof env === "object") {
    const direct = (env as AirHockeyEnvLike).AIR_HOCKEY_DO;
    if (direct) return direct;
  }

  const runtimeRequest = request as Request & { runtime?: { cloudflare?: { env?: unknown } } };
  const runtimeEnv = runtimeRequest.runtime?.cloudflare?.env;
  if (runtimeEnv && typeof runtimeEnv === "object") {
    const fromRuntime = (runtimeEnv as AirHockeyEnvLike).AIR_HOCKEY_DO;
    if (fromRuntime) return fromRuntime;
  }

  const globals = globalThis as typeof globalThis & { __env__?: unknown; CF_ENV?: unknown };
  for (const candidate of [globals.__env__, globals.CF_ENV]) {
    if (candidate && typeof candidate === "object") {
      const ns = (candidate as AirHockeyEnvLike).AIR_HOCKEY_DO;
      if (ns) return ns;
    }
  }

  return null;
}

async function serveAirHockeyGameRequest(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  const prefix = "/api/ws/airhockey/";
  if (!url.pathname.startsWith(prefix)) return null;

  const gameId = url.pathname.slice(prefix.length).split("/")[0] ?? "";
  if (!gameId) return jsonResponse({ error: "invalid-game" }, 400);

  const namespace = resolveAirHockeyNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "air-hockey-not-configured" }, 503);

  const id = namespace.idFromName(gameId);
  const stub = namespace.get(id);

  // For WebSocket upgrades, mint (or read) the shared chess secret on the SSR
  // side вЂ” the same secret serverAirHockeyAuth uses вЂ” and pass it to the DO as
  // a header so token verification and minting always agree.
  let doRequest = request;
  if ((request.headers.get("Upgrade") ?? "").toLowerCase() === "websocket") {
    const secret = await getChessSecret();
    const doHeaders = new Headers(request.headers);
    doHeaders.set("x-chess-secret", secret);
    doRequest = new Request(request, { headers: doHeaders });
  }

  try {
    return await stub.fetch(doRequest);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("AirHockey DO fetch failed.", error);
    return jsonResponse({ error: "do-fetch-failed", message: detail }, 502);
  }
}

// Stripe sends plan entitlements through this endpoint: checkout.session.completed
// grants the plan, subscription.deleted downgrades back to the free tier.
async function serveStripeWebhook(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/stripe/webhook" || request.method !== "POST") return null;

  const webhookSecret = readServerEnv("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return jsonResponse({ error: "stripe-webhook-not-configured" }, 503);
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const isValid = await verifyStripeSignature(payload, signature, webhookSecret);
  if (!isValid) {
    return jsonResponse({ error: "invalid-signature" }, 400);
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonResponse({ error: "invalid-payload" }, 400);
  }

  try {
    const outcome = await handleStripeWebhookEvent(event);
    return jsonResponse({ received: true, ...outcome }, 200);
  } catch (error) {
    console.error("Stripe webhook handling failed.", error);
    return jsonResponse({ error: "webhook-handler-failed" }, 500);
  }
}

type MessagesNamespace = {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => { fetch: (request: Request) => Promise<Response> };
};

/** The same namespace under the name the helper below takes. */
type DurableObjectNamespaceLike = MessagesNamespace;

type MessagesEnvLike = { MESSAGES_DO?: MessagesNamespace };

function resolveMessagesNamespace(request: Request, env: unknown): MessagesNamespace | null {
  if (env && typeof env === "object") {
    const direct = (env as MessagesEnvLike).MESSAGES_DO;
    if (direct) return direct;
  }

  const runtimeRequest = request as Request & { runtime?: { cloudflare?: { env?: unknown } } };
  const runtimeEnv = runtimeRequest.runtime?.cloudflare?.env;
  if (runtimeEnv && typeof runtimeEnv === "object") {
    const fromRuntime = (runtimeEnv as MessagesEnvLike).MESSAGES_DO;
    if (fromRuntime) return fromRuntime;
  }

  const globals = globalThis as typeof globalThis & { __env__?: unknown; CF_ENV?: unknown };
  for (const candidate of [globals.__env__, globals.CF_ENV]) {
    if (candidate && typeof candidate === "object") {
      const ns = (candidate as MessagesEnvLike).MESSAGES_DO;
      if (ns) return ns;
    }
  }

  return null;
}

/**
 * Issues the HttpOnly session cookie. Implemented as a plain endpoint rather
 * than a server function so the cookie is written with ordinary Response
 * headers — no dependency on private request-context internals.
 */
async function serveMessagesSessionRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/messages/session" && request.method === "GET") {
    const secret = await getMessagesSecret();
    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const session = await verifySessionToken(secret, cookies[MESSAGES_COOKIE] ?? null);
    if (!session.ok) {
      return jsonResponse({ ok: false }, 401);
    }
    const user = await getRegisteredUser(session.email);
    return jsonResponse({ ok: true, email: session.email, name: user?.name ?? "" });
  }

  if (url.pathname === "/api/messages/session" && request.method === "POST") {
    let payload: { email?: string; password?: string } = {};
    try {
      payload = (await request.json()) as { email?: string; password?: string };
    } catch {
      return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
    }

    const account = await verifyCredentials(payload.email ?? "", payload.password ?? "");
    if (!account) return jsonResponse({ ok: false, reason: "invalid-credentials" }, 401);

    const secret = await getMessagesSecret();
    const token = await mintSessionToken(secret, account.email);
    const response = jsonResponse({ ok: true, email: account.email, name: account.name });
    response.headers.append(
      "set-cookie",
      `${MESSAGES_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${Math.floor(
        SESSION_TTL_MS / 1000,
      )}`,
    );
    return response;
  }

  if (url.pathname === "/api/messages/logout" && request.method === "POST") {
    const response = jsonResponse({ ok: true });
    response.headers.append(
      "set-cookie",
      `${MESSAGES_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
    );
    return response;
  }

  return null;
}

/**
 * Single gateway for the messages hub: verifies the HttpOnly session cookie,
 * resolves the caller's object, then forwards the request with the signing
 * secret attached. Every messages read and write therefore passes an identity
 * check here first — the object never trusts a client-supplied email.
 */
/**
 * Writes a profile change to the caller's object, then asks that object to fan
 * the new presence out to the caller's contacts. The write and the fan-out are
 * separate calls on purpose: the fan-out reaches other objects and must never
 * run inside the caller's concurrency gate.
 */
async function serveMessagesProfile(request: Request): Promise<Response> {
  const caller = await readMessagesSession(request);
  if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ error: "messages-not-configured" }, 503);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid-payload" }, 400);
  }

  const id = namespace.idFromName(await messagesDoName(caller));
  const stub = namespace.get(id);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set(SESSION_HEADER, "1");
  headers.set(SESSION_EMAIL_HEADER, caller);

  const written = await stub.fetch(
    new Request("https://messages-do/profile", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
  );
  if (!written.ok) return written;

  // Fire and forget: the profile is already stored, so a fan-out hiccup must
  // not fail the user's own save.
  await stub
    .fetch(
      new Request("https://messages-do/mirror", {
        method: "POST",
        headers,
        body: "{}",
      }),
    )
    .catch(() => {
      console.warn("Failed to fan a messages profile change out to contacts.");
    });

  return written;
}

async function serveMessagesRequest(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/messages")) return null;

  const sessionRoute = await serveMessagesSessionRoute(request);
  if (sessionRoute) return sessionRoute;

  const peopleSearch = await serveMessagesPeopleSearch(request);
  if (peopleSearch) return peopleSearch;

  const friendsRoute = await serveMessagesFriends(request);
  if (friendsRoute) return friendsRoute;

  // Sending needs the session twice (verify, then mirror), so it is handled here
  // rather than proxied blindly to a single object.
  if (url.pathname === "/api/messages/message" && request.method === "POST") {
    const sender = await readMessagesSession(request);
    if (!sender) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesSend(request, sender);
  }

  // An edit or a delete has to land in both objects, and the peer is resolved
  // from the author's own chat row rather than from anything the client says.
  if (url.pathname === "/api/messages/message/change" && request.method === "POST") {
    const editor = await readMessagesSession(request);
    if (!editor) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesChange(request, editor);
  }

  // A call frame has to reach the other participant's open sockets, and only
  // that participant: the peer comes from the caller's own chat row.
  if (url.pathname === "/api/messages/call" && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);
    return serveCallSignal(request, caller);
  }

  if (url.pathname === "/api/messages/chat" && request.method === "POST") {
    const opener = await readMessagesSession(request);
    if (!opener) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesEnsureChat(request, opener);
  }

  if (url.pathname === "/api/messages/typing" && request.method === "POST") {
    const typer = await readMessagesSession(request);
    if (!typer) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesTyping(request, typer);
  }

  // A profile change can alter the presence the contacts see, so the object is
  // asked to fan out afterwards. The fan-out itself is cross-object I/O and
  // must stay outside the object, which is why it is triggered here and not
  // inside the write.
  if (url.pathname === "/api/messages/profile" && request.method === "POST") {
    return serveMessagesProfile(request);
  }

  // Cross-account profile reads used to refresh contact presence, bounded to
  // the account's own contact list.
  if (url.pathname === "/api/messages/profile" && request.method === "GET") {
    return serveMessagesPeerProfile(request, env);
  }

  if (url.pathname === "/api/messages/import" && request.method === "POST") {
    return serveMessagesImport(request, env);
  }

  /**
   * The relay a call falls back to, read at call time rather than at build time.
   *
   * Two devices can only talk directly when their networks let them. Behind a
   * carrier's or an office's shared address neither can be reached, and the only
   * way through is a relay both are willing to talk to. That relay is a
   * deployment input, not a code input, so it is read from the environment on
   * every call: setting three variables turns this on, and nothing has to be
   * rebuilt to turn it off again.
   *
   * Behind the session, because the relay credentials are a password for the
   * call itself and nobody unauthenticated should be handed them.
   */
  if (url.pathname === "/api/messages/turn" && request.method === "GET") {
    const turnCaller = await readMessagesSession(request);
    if (!turnCaller) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesTurn(env);
  }

  const namespace = resolveMessagesNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "messages-not-configured" }, 503);

  const secret = await getMessagesSecret();
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const session = await verifySessionToken(secret, cookies[MESSAGES_COOKIE] ?? null);
  if (!session.ok) {
    return jsonResponse({ error: "unauthorized", reason: session.reason }, 401);
  }

  const id = namespace.idFromName(await messagesDoName(session.email));
  const stub = namespace.get(id);

  const doHeaders = new Headers(request.headers);
  doHeaders.set(SESSION_HEADER, secret);
  doHeaders.set(SESSION_EMAIL_HEADER, normalizeMessagesEmail(session.email));
  // The marker that lets a write touch a message this account did not send is
  // the gateway's alone, so it never survives a client request.
  doHeaders.delete(MIRROR_HEADER);
  const doRequest = new Request(request, { headers: doHeaders });

  try {
    const response = await stub.fetch(doRequest);

    // The object answers a snapshot read with the bare snapshot. Normalise it
    // into the { ok, snapshot } envelope the client contract expects, otherwise
    // a perfectly good 200 is read as a failure.
    const isSnapshotRead = request.method === "GET" && url.pathname === "/api/messages/";
    if (isSnapshotRead && response.ok) {
      const raw = (await response.json()) as unknown;
      return jsonResponse(
        raw && typeof raw === "object"
          ? { ok: true, snapshot: raw }
          : { ok: false, reason: "invalid-snapshot" },
        200,
      );
    }

    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Messages DO fetch failed.", error);
    return jsonResponse({ error: "do-fetch-failed", message: detail }, 502);
  }
}

/**
 * People search over the account store.
 *
 * Only the minimum needed to start a request is returned: display name, email
 * and avatar. Password hashes, birthday and gender are never serialised here.
 */
async function serveMessagesPeopleSearch(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/messages/people" || request.method !== "GET") return null;

  const caller = await readMessagesSession(request);
  if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

  const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
  if (query.length < 2) return jsonResponse({ ok: true, people: [] }, 200);

  const store = await getAuthStore();
  const people = store.users
    .filter((user) => user.email !== caller)
    .filter(
      (user) => user.email.includes(query) || user.name.trim().toLocaleLowerCase().includes(query),
    )
    .slice(0, 12)
    .map((user) => ({
      email: user.email,
      name: user.name || user.email.split("@")[0] || user.email,
      avatar: user.avatar ? user.avatar : null,
    }));

  return jsonResponse({ ok: true, people }, 200);
}

/**
 * Internal object-to-object call.
 *
 * These hops do not carry the user's cookie, so they must present the identity
 * headers the object trusts. The object only accepts them together with the
 * secret marker, which is why the value is a literal rather than a real secret.
 */
function objectCall(
  email: string,
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
  extraHeaders?: Record<string, string>,
) {
  return async (namespace: MessagesNamespace) => {
    const id = namespace.idFromName(await messagesDoName(email));
    return namespace.get(id).fetch(
      new Request(`https://messages-do${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          [SESSION_HEADER]: "1",
          [SESSION_EMAIL_HEADER]: normalizeMessagesEmail(email),
          ...(extraHeaders ?? {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  };
}

/** Writes a friendship row into both participants' objects. */
async function writeFriendshipBoth(
  request: Request,
  record: {
    id: string;
    fromEmail: string;
    fromName: string;
    fromAvatar: string | null;
    toEmail: string;
    toName: string;
    status: "pending" | "accepted" | "rejected";
  },
) {
  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return false;

  const results = await Promise.all(
    [record.fromEmail, record.toEmail].map(async (email) => {
      try {
        const call = objectCall(email, "/friend/upsert", record);
        const response = await call(namespace);
        return response.ok;
      } catch (error) {
        console.warn("Failed to write a friendship row into an object.", error);
        return false;
      }
    }),
  );

  return results.every(Boolean);
}

async function serveMessagesFriends(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/api/messages/friend/request" && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

    let payload: { toEmail?: string; toName?: string } = {};
    try {
      payload = (await request.json()) as { toEmail?: string; toName?: string };
    } catch {
      return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
    }

    const toEmail = normalizeMessagesEmail(payload.toEmail ?? "");
    if (!toEmail || toEmail === caller) {
      return jsonResponse({ ok: false, reason: "invalid-target" }, 400);
    }

    const store = await getAuthStore();
    const target = store.users.find((user) => user.email === toEmail);
    if (!target) return jsonResponse({ ok: false, reason: "unknown-user" }, 404);

    const self = store.users.find((user) => user.email === caller);
    const me = await readMessagesProfile(caller);

    // Inviting someone you are already friends with must not demote the
    // friendship back to pending, so the row is left untouched.
    const existing = await readFriendshipRow(request, caller, friendshipId(caller, toEmail));
    if (existing?.status === "accepted") {
      return jsonResponse({ ok: true, id: existing.id, alreadyFriends: true });
    }

    const written = await writeFriendshipBoth(request, {
      id: friendshipId(caller, toEmail),
      fromEmail: caller,
      fromName: me?.name || self?.name || caller,
      fromAvatar: me?.avatar ?? null,
      toEmail,
      toName: target.name || toEmail,
      status: "pending",
    });
    if (!written) return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);

    return jsonResponse({ ok: true, id: friendshipId(caller, toEmail) });
  }

  if (url.pathname === "/api/messages/friend/respond" && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

    let payload: { id?: string; accept?: boolean } = {};
    try {
      payload = (await request.json()) as { id?: string; accept?: boolean };
    } catch {
      return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
    }

    const id = String(payload.id ?? "").slice(0, 80);
    if (!id) return jsonResponse({ ok: false, reason: "invalid-id" }, 400);

    const me = await readMessagesProfile(caller);
    const record = await readFriendshipRow(request, caller, id);
    // Only the recipient may answer, and never your own outgoing request.
    if (!record || record.toEmail !== caller) {
      return jsonResponse({ ok: false, reason: "not-your-request" }, 403);
    }

    const accept = payload.accept === true;
    const written = await writeFriendshipBoth(request, {
      ...record,
      status: accept ? "accepted" : "rejected",
    });
    if (!written) return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);

    // Accepting should leave both sides ready to chat, so link the pair for
    // each participant: a contact row plus a conversation, both in both objects.
    if (accept) {
      await linkPairForBoth(request, record.fromEmail, record.toEmail, record);
    }

    return jsonResponse({ ok: true, status: accept ? "accepted" : "rejected" });
  }

  if (url.pathname === "/api/messages/friend/remove" && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);

    let payload: { id?: string } = {};
    try {
      payload = (await request.json()) as { id?: string };
    } catch {
      return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
    }

    const id = String(payload.id ?? "").slice(0, 80);
    const record = await readFriendshipRow(request, caller, id);
    if (!record || (record.fromEmail !== caller && record.toEmail !== caller)) {
      return jsonResponse({ ok: false, reason: "not-found" }, 404);
    }

    await writeFriendshipBoth(request, { ...record, status: "rejected" });
    return jsonResponse({ ok: true });
  }

  return null;
}

async function readFriendshipRow(request: Request, email: string, id: string) {
  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return null;
  try {
    const call = objectCall(email, "/friend/list", undefined, "GET");
    const response = await call(namespace);
    if (!response.ok) return null;
    const body = (await response.json()) as {
      friends?: {
        incoming?: Array<Record<string, unknown>>;
        outgoing?: Array<Record<string, unknown>>;
        friends?: Array<Record<string, unknown>>;
        declined?: Array<Record<string, unknown>>;
      };
    };
    const all = [
      ...(body.friends?.incoming ?? []),
      ...(body.friends?.outgoing ?? []),
      ...(body.friends?.friends ?? []),
      ...(body.friends?.declined ?? []),
    ];
    const found = all.find((row) => String(row["id"] ?? "") === id);
    return (found ?? null) as {
      id: string;
      fromEmail: string;
      fromName: string;
      fromAvatar: string | null;
      toEmail: string;
      toName: string;
      status: "pending" | "accepted" | "rejected";
    } | null;
  } catch (error) {
    console.warn("Failed to read a friendship row.", error);
    return null;
  }
}

async function readMessagesProfile(email: string) {
  try {
    const account = await getRegisteredUser(email);
    if (!account) return null;
    return { name: account.name, email: account.email, avatar: "" };
  } catch {
    return null;
  }
}

/**
 * Puts a newly accepted pair in each other's contact list and opens the
 * conversation on both sides, so neither account has to create anything before
 * they can write. The chat id is derived from the pair, so both objects hold
 * the same conversation.
 */
async function linkPairForBoth(
  request: Request,
  fromEmail: string,
  toEmail: string,
  record: { fromName: string; fromAvatar: string | null; toName: string; toEmail: string },
) {
  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return;
  const chatId = `chat-${friendshipId(fromEmail, toEmail)}`.slice(0, 80);

  // Each side's row carries the other side's face, which means looking up the
  // acceptor's own profile: a friendship row only holds a picture for whoever
  // sent it, so without this the person who added somebody would meet them in
  // their own contact list with no face at all.
  const [fromProfile, toProfile] = await Promise.all([
    readMessagesProfile(fromEmail),
    readMessagesProfile(toEmail),
  ]);

  const pairs: Array<{ owner: string; peer: string; peerName: string; peerAvatar: string | null }> =
    [
      {
        owner: fromEmail,
        peer: toEmail,
        peerName: record.toName,
        peerAvatar: toProfile?.avatar ?? null,
      },
      {
        owner: toEmail,
        peer: fromEmail,
        peerName: record.fromName,
        peerAvatar: fromProfile?.avatar ?? record.fromAvatar ?? null,
      },
    ];

  await Promise.all(
    pairs.map(async ({ owner, peer, peerName, peerAvatar }) => {
      const contact = objectCall(owner, "/contact", {
        id: `contact-${friendshipId(owner, peer)}`.slice(0, 80),
        peerEmail: peer,
        name: peerName,
        about: "",
        accent: "#1DB954",
        avatar: peerAvatar,
      });
      const conversation = objectCall(owner, "/chat/ensure", {
        chatId,
        peerEmail: peer,
        peerName,
        peerAvatar,
      });
      try {
        await contact(namespace);
        await conversation(namespace);
      } catch (error) {
        console.warn("Failed to link a newly accepted pair.", error);
      }
    }),
  );
}

/**
 * Sends a message to both sides.
 *
 * The object only ever sees the caller's own row, so a message has to be
 * written twice: once into the sender's object as `fromMe` and once into the
 * recipient's object as an incoming message. Each user then reads only their
 * own object, and a peer is never written to directly by a client.
 */
async function serveMessagesSend(request: Request, caller: string): Promise<Response> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const id = String(payload["id"] ?? "").slice(0, 80);
  const chatId = String(payload["chatId"] ?? "").slice(0, 80);
  const peerEmail = normalizeMessagesEmail(String(payload["peerEmail"] ?? ""));
  const text = String(payload["text"] ?? "").slice(0, 4000);
  const at = Number.isFinite(payload["at"]) ? (payload["at"] as number) : Date.now();
  const attachments = Array.isArray(payload["attachments"]) ? payload["attachments"] : [];

  if (!id || !chatId || (!text.trim() && !Array.isArray(attachments))) {
    return jsonResponse({ ok: false, reason: "empty" }, 400);
  }

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const own = objectCall(caller, "/message", {
    ...payload,
    id,
    chatId,
    text,
    at,
    peerEmail,
    fromMe: true,
    attachments,
  });

  try {
    const ownResponse = await own(namespace);
    if (!ownResponse.ok) {
      return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
    }

    if (peerEmail && peerEmail !== caller) {
      // Best effort: a contact without an account simply has no mirror.
      const mirrored = objectCall(peerEmail, "/message", {
        ...payload,
        id,
        chatId,
        text,
        at,
        peerEmail: caller,
        fromMe: false,
        attachments,
      });
      try {
        await mirrored(namespace);
      } catch (error) {
        console.warn("Failed to mirror a message into the recipient's object.", error);
      }
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.warn("Failed to deliver a message.", error);
    return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
  }
}

/**
 * Edits or deletes a message the caller sent.
 *
 * The author's own object applies the change first and answers with the peer it
 * found in storage, so a client can never name a third account. Only then is the
 * change mirrored into that peer's object, marked as a mirror so it is allowed
 * to touch a message stored there with `fromMe: false`. Both objects bump their
 * revision, so every device of both participants picks the change up on the next
 * sync frame.
 */
async function serveMessagesChange(request: Request, caller: string): Promise<Response> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const id = String(payload["id"] ?? "")
    .trim()
    .slice(0, 80);
  const chatId = String(payload["chatId"] ?? "")
    .trim()
    .slice(0, 80);
  const action =
    payload["action"] === "edit" ? "edit" : payload["action"] === "delete" ? "delete" : "";
  const text =
    action === "edit"
      ? String(payload["text"] ?? "")
          .slice(0, 4000)
          .trim()
      : "";

  if (!id || !chatId || !action || (action === "edit" && !text)) {
    return jsonResponse({ ok: false, reason: "invalid-change" }, 400);
  }

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const body = {
    id,
    chatId,
    action,
    ...(action === "edit" ? { text } : {}),
  };

  try {
    const own = await objectCall(caller, "/message/change", body)(namespace);
    if (!own.ok) return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);

    const applied = (await own.json().catch(() => ({}))) as {
      ok?: boolean;
      peerEmail?: string;
    };
    if (applied.ok === false) {
      // The object refused: not this account's message.
      return jsonResponse({ ok: false, reason: "not-your-message" }, 403);
    }

    const peerEmail = normalizeMessagesEmail(applied.peerEmail ?? "");
    if (peerEmail && peerEmail !== caller) {
      // Best effort: a contact without an account simply has no mirror, and the
      // next send from that side will carry the authoritative row anyway.
      const mirrored = objectCall(peerEmail, "/message/change", body, "POST", {
        [MIRROR_HEADER]: "1",
      });
      try {
        await mirrored(namespace);
      } catch (error) {
        console.warn("Failed to mirror a message change into the recipient's object.", error);
      }
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.warn("Failed to change a message.", error);
    return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
  }
}

/**
 * Relays one call frame to the other participant.
 *
 * The caller's own object is asked first and answers with the peer it has on
 * file, so a client cannot ring a third account; the frame then goes out to that
 * peer's object, whose sockets deliver it. A frame nobody receives costs a call
 * that has to be placed again, so a failure is reported but never fatal.
 */
/**
 * Moves one call frame to every object that still has to hear it.
 *
 * The gateway used to hand a call to the one peer it could find in the caller's
 * own chat row, which is exactly what a call with four people cannot be. The
 * object now keeps the list of who is in the call and answers with the addresses
 * that are left, so this only has to write the same body into each of them.
 *
 * A call that ends also writes its history into every participant's own chat with
 * the host, so each of them finds the call in the conversation they had with the
 * person who placed it.
 */
async function serveCallSignal(request: Request, caller: string): Promise<Response> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const chatId = String(payload["chatId"] ?? "")
    .trim()
    .slice(0, 80);
  const callId = String(payload["callId"] ?? "")
    .trim()
    .slice(0, 80);
  const kind = String(payload["kind"] ?? "");
  if (!chatId || !callId) return jsonResponse({ ok: false, reason: "invalid-call" }, 400);

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const body = { ...payload, chatId, callId, kind };

  type Applied = {
    ok?: boolean;
    peerEmail?: string;
    peers?: string[];
    roster?: unknown;
    /** On the frame that ends a call: everybody who was still in it. */
    members?: string[];
  };

  let applied: Applied = {};
  try {
    const own = await objectCall(caller, "/call", body)(namespace);
    applied = (await own.json().catch(() => ({}))) as Applied;
  } catch (error) {
    console.warn("Failed to handle a call frame.", error);
    return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
  }
  if (applied.ok === false) {
    return jsonResponse({ ok: false, reason: "unknown-chat" }, 404);
  }

  // The object named who is left in the call. An older one names a single peer,
  // so both shapes are understood rather than a call lost to a deployment.
  const targets =
    Array.isArray(applied.peers) && applied.peers.length > 0
      ? applied.peers
      : [normalizeMessagesEmail(applied.peerEmail ?? "")].filter(
          (email) => email && email !== caller,
        );

  let relayed = 0;
  for (const email of targets) {
    try {
      await objectCall(email, "/call", body, "POST", { [MIRROR_HEADER]: "1" })(namespace);
      relayed += 1;
    } catch (error) {
      // One person unreachable is not a call for the others to fail on.
      console.warn("Failed to relay a call frame to a participant.", error);
    }
  }

  // The call is over: everyone who was in it gets the line in their own history.
  if (kind === "end") {
    await writeGroupCallLog(caller, chatId, body, applied.members ?? [], namespace);
  }

  return jsonResponse({ ok: true, relayed });
}

/**
 * Puts one finished call into the history of everybody who was in it.
 *
 * Each person's conversation with the host is their own row in their own object,
 * so the record is written once per participant, in the chat that participant
 * already has with the person who placed the call. Somebody who never spoke to
 * the host has no such chat, and no line is invented for them.
 */
async function writeGroupCallLog(
  caller: string,
  chatId: string,
  body: Record<string, unknown>,
  members: string[],
  namespace: DurableObjectNamespaceLike,
) {
  const log = body["log"];
  if (!log || typeof log !== "object") return;
  const everyone = [...new Set([caller, ...members])].filter((email) => email && email !== caller);
  if (everyone.length === 0) return;

  for (const email of everyone) {
    // The host writes their own through the call frame they already sent; this
    // is for everybody else, in their own chat with the host.
    const targetChat = await findChatBetween(namespace, email, caller, chatId);
    if (!targetChat) continue;
    try {
      await objectCall(email, "/call", { ...body, chatId: targetChat, kind: "log", log }, "POST", {
        [MIRROR_HEADER]: "1",
      })(namespace);
    } catch (error) {
      console.warn("Failed to write a finished group call to a participant's history.", error);
    }
  }
}

/**
 * The conversation one person already has with another.
 *
 * Read from that person's own object, so the answer cannot be steered by the
 * client that is asking. `fallback` is the host's own chat id, which is the
 * right row whenever the two of them already had one.
 */
async function findChatBetween(
  namespace: MessagesNamespace,
  email: string,
  peer: string,
  fallback = "",
) {
  try {
    const response = await objectCall(email, "/", undefined, "GET")(namespace);
    if (!response.ok) return "";
    const snapshot = (await response.json()) as {
      chats?: Array<{ id: string; peerEmail: string }>;
    };
    const wanted = normalizeMessagesEmail(peer);
    const found = (snapshot.chats ?? []).find(
      (chat) => normalizeMessagesEmail(chat.peerEmail) === wanted,
    );
    return found?.id ?? fallback;
  } catch {
    return "";
  }
}

/**
 * Opens a conversation between two accounts.
 *
 * The row is written to both objects so the pair sees the same conversation
 * immediately, before anyone has sent a message. Without this a chat created on
 * one device would be removed by the next sync.
 */
async function serveMessagesEnsureChat(request: Request, caller: string): Promise<Response> {
  let payload: {
    chatId?: string;
    peerEmail?: string;
    peerName?: string;
    peerAvatar?: string | null;
  } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const chatId = String(payload.chatId ?? "").slice(0, 80);
  const peerEmail = normalizeMessagesEmail(payload.peerEmail ?? "");
  if (!chatId) return jsonResponse({ ok: false, reason: "invalid-id" }, 400);

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const own = objectCall(caller, "/chat/ensure", {
    chatId,
    peerEmail,
    peerName: payload.peerName ?? "",
    peerAvatar: payload.peerAvatar ?? null,
  });

  try {
    if (!(await own(namespace)).ok) {
      return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
    }

    if (peerEmail && peerEmail !== caller) {
      const mirrored = objectCall(peerEmail, "/chat/ensure", {
        chatId,
        peerEmail: caller,
        peerName: "",
        peerAvatar: null,
      });
      try {
        await mirrored(namespace);
      } catch (error) {
        console.warn("Failed to mirror a new conversation to the peer.", error);
      }
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.warn("Failed to open a conversation.", error);
    return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
  }
}

/**
 * Relays a typing signal to the other participant.
 *
 * The signal is stored in the recipient's object as well as pushed, so their
 * other devices show it too, and so a device opened mid-compose still renders
 * the indicator instead of waiting for the next keystroke.
 */
async function serveMessagesTyping(request: Request, caller: string): Promise<Response> {
  let payload: { chatId?: string; peerEmail?: string; typing?: boolean } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const chatId = String(payload.chatId ?? "").slice(0, 80);
  const peerEmail = normalizeMessagesEmail(payload.peerEmail ?? "");
  if (!chatId) return jsonResponse({ ok: false, reason: "invalid-id" }, 400);

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const typing = payload.typing !== false;
  const relay = objectCall(peerEmail, "/typing", {
    chatId,
    peerEmail: caller,
    typing,
  });

  try {
    if (peerEmail && peerEmail !== caller) await relay(namespace);
    return jsonResponse({ ok: true });
  } catch (error) {
    // The bubble is cosmetic, so a failure must never block the composer.
    console.warn("Failed to relay a typing signal.", error);
    return jsonResponse({ ok: true, relayed: false });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Initialize Cloudflare environment for server functions
    initializeCloudflareEnv(env);

    const httpsRedirect = redirectToHttps(request);
    if (httpsRedirect) {
      return httpsRedirect;
    }

    const sitemapResponse = serveSitemap(request);
    if (sitemapResponse) {
      return withHsts(sitemapResponse);
    }

    const stripeResponse = await serveStripeWebhook(request);
    if (stripeResponse) {
      return stripeResponse;
    }

    const chessResponse = await serveChessGameRequest(request, env);
    if (chessResponse) {
      return chessResponse;
    }

    const tttResponse = await serveTicTacToeGameRequest(request, env);
    if (tttResponse) {
      return tttResponse;
    }

    const airHockeyResponse = await serveAirHockeyGameRequest(request, env);
    if (airHockeyResponse) {
      return airHockeyResponse;
    }

    const messagesResponse = await serveMessagesRequest(request, env);
    if (messagesResponse) {
      return messagesResponse;
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withHsts(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withHsts(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
