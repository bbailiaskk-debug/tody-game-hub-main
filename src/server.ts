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
  VOICE_FROM_HEADER,
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
import {
  AUTO_JOIN_BATCH,
  attachmentObjectKey,
  contentRangeHeader,
  friendshipId,
  isAttachmentObjectKey,
  isUsableReaction,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_VALUE_CHARS,
  MAX_AUTO_JOIN_FRIENDS,
  MAX_BUCKET_FILE_BYTES,
  MAX_REACTION_CODE_POINTS,
  MAX_UPLOAD_PARTS,
  parseByteRange,
  UPLOAD_PART_BYTES,
  type Guild,
  type GuildTextChannel,
  type GuildVoiceChannel,
} from "./lib/messages-protocol";
import { readZegoToken04, zegoToken04 } from "./lib/zego-token";

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
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
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

/**
 * The path a response was served from, or nothing at all if it has none.
 *
 * `response.url` is the resource the response came *from*, and the Workers runtime
 * leaves it empty for a body this process built rather than received. Passing that
 * empty string to `new URL` throws `TypeError: Invalid URL string` — which is how
 * every route on the site came back 500 the moment this was introduced.
 *
 * The empty case is not a path, so the answer is nothing rather than a guess at
 * "/". A response with no URL is one this process constructed: the error page, a
 * redirect, an API reply, and none of those can be a download.
 */
function responseUrlPath(response: Response): string | null {
  if (!response.url) return null;
  try {
    return new URL(response.url).pathname;
  } catch {
    return null;
  }
}

/**
 * The transport policy, in one place, and the same on every response.
 *
 * The static side already says `max-age=63072000; includeSubDomains; preload` in
 * `public/_headers`. This used to set a shorter one without `preload` for the
 * documents the worker renders, so the two halves of the same site answered with
 * different policies — and a crawler that saw one response without `preload`
 * reported the site as having no HSTS at all, which is the one thing a transport
 * policy is measured on.
 *
 * A year and a half is past the two-year floor browsers want before `preload`,
 * and it is a floor rather than a ceiling: raising it is one edit here and one in
 * `_headers`.
 */
const HSTS_POLICY = "max-age=63072000; includeSubDomains; preload";

function withHsts(response: Response): Response {
  const nextHeaders = new Headers(response.headers);
  if (!nextHeaders.has("strict-transport-security")) {
    nextHeaders.set("Strict-Transport-Security", HSTS_POLICY);
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
      //
      // `display-capture` is named for the same reason and was simply absent. It
      // defaults to `self`, so sharing from this origin works either way — but a
      // browser or a proxy that reads the header as the whole policy has no way to
      // tell that from a deliberate denial, and the failure it produces is a share
      // that silently does nothing. Stated, it cannot be misread.
      nextHeaders.set(
        "Permissions-Policy",
        "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
      );
    }

    // HTML references hashed assets, so serving a stale document after a deploy
    // can point browsers at assets that no longer exist. Keep the document
    // revalidated while immutable assets remain cacheable by their own headers.
    nextHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }

  /**
   * The installer, when this handler is the one serving it.
   *
   * `public/_headers` already says this for the edge, but that file only covers
   * static assets. A self-hosted deployment serves `public/` through this worker
   * too, so without the same headers here the file would be cached for as long as
   * the deployment lives — which, for something replaced by hand a few times a
   * year, means people running a build from months ago and filing bugs against
   * the current one. And without `Content-Disposition` the browser renders the
   * `.exe` instead of saving it, so the chat vanishes behind Windows.
   *
   * Read off the response, because that is all this function is given.
   */
  const servedPath = responseUrlPath(response);

  if (servedPath && servedPath.startsWith("/downloads/")) {
    if (!nextHeaders.has("cache-control")) {
      nextHeaders.set("Cache-Control", "public, max-age=3600, must-revalidate");
    }
    if (!nextHeaders.has("content-disposition")) {
      nextHeaders.set("Content-Disposition", "attachment");
    }
    if (!nextHeaders.has("x-content-type-options")) {
      nextHeaders.set("X-Content-Type-Options", "nosniff");
    }
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
  // cloudflared trycloudflare tunnels) the origin is plain http — redirecting to
  // https would loop forever against the same host.
  if (import.meta.env.DEV) {
    return null;
  }

  // NGINX Unit deployment: Unit terminates TLS and redirects :80 -> :443 itself
  // (Unit does NOT inject x-forwarded-proto when proxying to this app, so the
  // internal URL here is always plain http — trusting it would redirect every
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
// the real env on globalThis.__env__ before the service runs — fall back to it.
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

/**
 * A ZEGOCLOUD token for the person asking, and nothing else.
 *
 * The identity is the session's, never the request's. A token is a claim about
 * one user — it says "this is that person" and it is checked by ZEGOCLOUD before
 * it opens a room — so taking the user id from a query parameter would let any
 * signed-in visitor mint a token for anybody else and then join their rooms.
 * There is no parameter here to get wrong.
 *
 * The AppID goes out with it: the client SDK needs it, and it names a project
 * rather than opening one. The ServerSecret does not leave this function, which
 * is the only reason a token is minted here instead of in the page.
 *
 * Unset secrets are answered rather than ignored, because the alternative is a
 * client waiting on a token that is never coming: the SDK asks, gets a 404 for
 * something that is really a deployment input, and the call quietly never starts.
 */
async function serveMessagesZegoToken(request: Request, env: unknown, caller: string) {
  const vars = (env ?? {}) as { ZEGO_APP_ID?: string; ZEGO_SERVER_SECRET?: string };
  const appId = Number((vars.ZEGO_APP_ID ?? "").trim());
  const serverSecret = (vars.ZEGO_SERVER_SECRET ?? "").trim();

  if (!Number.isInteger(appId) || appId <= 0 || !serverSecret) {
    console.warn(
      "ZEGO_APP_ID and ZEGO_SERVER_SECRET are not both set, so no ZEGOCLOUD token can be " +
        "minted. Set them as Worker secrets (wrangler secret put ZEGO_SERVER_SECRET).",
    );
    return jsonResponse({ error: "zego-not-configured" }, 503);
  }

  try {
    const token = await zegoToken04({
      appId,
      serverSecret,
      // The account's own address, which is also what the app shows as a name, so
      // a token names the same person everywhere rather than an id nobody can map.
      userId: normalizeMessagesEmail(caller),
    });
    const read = await readZegoToken04(token);
    return jsonResponse({
      ok: true,
      appId,
      userId: normalizeMessagesEmail(caller),
      token,
      // Handed over so the client can ask again before the old one dies rather
      // than being told it expired mid-call.
      expiresAt: read.expire,
    });
  } catch (error) {
    // The reason is a configuration detail, so it goes to the log rather than to
    // the person: the answer they get says the token could not be made.
    console.warn("ZEGOCLOUD token could not be minted.", error);
    return jsonResponse({ error: "token-failed" }, 500);
  }
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

  // For WebSocket upgrades, mint (or read) the chess secret on the SSR side —
  // the same secret serverChessAuth uses — and pass it to the DO as a header so
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
  // side — the same secret serverTicTacToeAuth uses — and pass it to the DO as
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
  // side — the same secret serverAirHockeyAuth uses — and pass it to the DO as
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

/**
 * The bucket that holds uploaded files, resolved the same way the object
 * namespace is.
 *
 * Absent in every environment that has not been given one — a `vite dev` on its
 * own, a self-hosted build without the binding — and the upload routes answer
 * with a refusal rather than a crash, so the rest of the chat keeps working and
 * only the large files are unavailable.
 */
type R2BucketLike = {
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<{
    body: ReadableStream | null;
    range?: { offset: number; length: number };
    size: number;
    httpEtag: string;
    httpMetadata?: { contentType?: string };
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ uploadId: string; key: string }>;
  resumeMultipartUpload(
    key: string,
    uploadId: string,
  ): {
    uploadPart(
      partNumber: number,
      value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream,
    ): Promise<{ partNumber: number; etag: string }>;
    complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>;
    abort(): Promise<void>;
  };
};

function resolveMessagesBucket(request: Request, env: unknown): R2BucketLike | null {
  const candidates: unknown[] = [
    env,
    (request as Request & { runtime?: { cloudflare?: { env?: unknown } } }).runtime?.cloudflare
      ?.env,
    (globalThis as typeof globalThis & { __env__?: unknown }).__env__,
    (globalThis as typeof globalThis & { CF_ENV?: unknown }).CF_ENV,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      const bucket = (candidate as { MESSAGES_FILES?: R2BucketLike }).MESSAGES_FILES;
      if (bucket) return bucket;
    }
  }
  return null;
}

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

  // A file is uploaded before the message that carries it exists, so these are
  // the only routes that move bytes. Everything else in the feature is a few
  // hundred bytes of JSON, which is what makes a four-gigabyte attachment a
  // thing the rest of the protocol can ignore.
  if (url.pathname.startsWith("/api/messages/upload")) {
    const uploader = await readMessagesSession(request);
    if (!uploader) return jsonResponse({ error: "unauthorized" }, 401);
    return serveAttachmentUpload(request, uploader, resolveMessagesBucket(request, env));
  }

  // Downloading is here rather than behind the object proxy below because the
  // bytes are somebody else's problem: the object is asked only whether this
  // account may have the file, and the file itself is streamed straight out of
  // the bucket without being carried through a Durable Object that would have
  // nothing to do with it.
  if (url.pathname === "/api/messages/attachment") {
    const reader = await readMessagesSession(request);
    if (!reader) return jsonResponse({ error: "unauthorized" }, 401);
    return serveAttachmentDownload(request, reader, env, resolveMessagesBucket(request, env));
  }

  // Sending needs the session twice (verify, then mirror), so it is handled here
  // rather than proxied blindly to a single object.
  if (url.pathname === "/api/messages/message" && request.method === "POST") {
    const sender = await readMessagesSession(request);
    if (!sender) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesSend(request, sender, env);
  }

  // An edit or a delete has to land in both objects, and the peer is resolved
  // from the author's own chat row rather than from anything the client says.
  if (url.pathname === "/api/messages/message/change" && request.method === "POST") {
    const editor = await readMessagesSession(request);
    if (!editor) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesChange(request, editor);
  }

  /**
   * A reaction, which unlike an edit or a delete either side may make — to the
   * other's message as much as to their own.
   */
  if (url.pathname === "/api/messages/message/react" && request.method === "POST") {
    const reactor = await readMessagesSession(request);
    if (!reactor) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesReact(request, reactor);
  }

  // A call frame has to reach the other participant's open sockets, and only
  // that participant: the peer comes from the caller's own chat row.
  if (url.pathname === "/api/messages/call" && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);
    return serveCallSignal(request, caller);
  }

  // A voice frame is routed by the object, which knows the channel's occupants
  // and which of them the frame is for.
  if (url.pathname === "/api/messages/voice" && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);
    return serveVoiceSignal(request, caller);
  }

  // A server is a row mirrored into every member's object, so every change has
  // to be written into all of them before anybody sees it.
  if (url.pathname.startsWith("/api/messages/guild/") && request.method === "POST") {
    const caller = await readMessagesSession(request);
    if (!caller) return jsonResponse({ error: "unauthorized" }, 401);
    return serveGuildWrite(request, caller);
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

  /**
   * A ZEGOCLOUD token for this account.
   *
   * Behind the session, like the relay: the token is a credential, and it is
   * minted for the caller and nobody else.
   */
  if (url.pathname === "/api/messages/zego/token" && request.method === "GET") {
    const zegoCaller = await readMessagesSession(request);
    if (!zegoCaller) return jsonResponse({ error: "unauthorized" }, 401);
    return serveMessagesZegoToken(request, env, zegoCaller);
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

// ------------------------------------------------------------------ attachments

/**
 * Turns what a client claimed to attach into what may actually be attached.
 *
 * Two things happen here, and both are the reason this function exists. The
 * payload is stripped — a four-gigabyte file is not in the body, and a base64 one
 * is not either, because the body is parsed into memory before anything gets a
 * say. And the destination is never taken from the client at all: this answers
 * with a flag saying "the file for this id is in the bucket, and its real length
 * is this", and the object works out the key itself from the address the gateway
 * stamps on the message.
 *
 * That is the whole authorisation story for an attachment, and it is worth being
 * explicit about why it is shaped this way. A key a client could name is a key a
 * client could point at somebody else's namespace, and the object would have no
 * way to tell: it can check that a key *looks* right, not that it belongs to the
 * person sending. Deriving it at the far end from an address the gateway has
 * already verified removes the question.
 *
 * An attachment whose object is not there is kept with `stored: false` rather
 * than dropped, so a message that failed halfway through sending still shows the
 * name it was going to carry instead of quietly losing it.
 */
async function resolveSentAttachments(
  raw: unknown[],
  caller: string,
  bucket: R2BucketLike | null,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];

  for (const entry of raw.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const id = String(source["id"] ?? "")
      .trim()
      .slice(0, 80);
    if (!id) continue;

    const kind =
      source["kind"] === "image" || String(source["mimeType"] ?? "").startsWith("image/")
        ? "image"
        : "file";
    const mimeType = String(source["mimeType"] ?? "application/octet-stream")
      .trim()
      .slice(0, 80);
    const declaredSize = Number(source["size"]);
    const size =
      Number.isFinite(declaredSize) && declaredSize > 0
        ? Math.min(Math.round(declaredSize), MAX_BUCKET_FILE_BYTES)
        : 0;
    const name =
      String(source["name"] ?? "file")
        .trim()
        .slice(0, 120) || "file";

    // The inline path, kept for a conversation with no bucket to upload to. The
    // object still bounds it, so this is a cheap duplicate of a check rather
    // than the only one.
    const dataUrl = typeof source["dataUrl"] === "string" ? source["dataUrl"] : "";
    if (dataUrl.startsWith("data:") && dataUrl.length <= MAX_ATTACHMENT_VALUE_CHARS) {
      out.push({ id, kind, name, mimeType, size, dataUrl });
      continue;
    }

    if (!bucket) {
      out.push({ id, kind, name, mimeType, size, dataUrl: "" });
      continue;
    }

    // Whether the file is really there is a question only the bucket can answer,
    // and the answer is what decides whether the message claims to carry it. The
    // key itself is not sent: the object derives it from the author this gateway
    // stamps on the message, which is why there is nothing here for a client to
    // have forged.
    const object = await bucket.head(await attachmentObjectKey(caller, id)).catch(() => null);
    out.push({
      id,
      kind,
      name,
      mimeType,
      // The bucket is the authority on how long the file is. The client's number
      // is what the bubble shows while it is still going up, and it is right
      // about that; it is not what anybody is told afterwards.
      size: object ? object.size : size,
      ...(object ? { inBucket: true } : {}),
    });
  }

  return out;
}

/** A filename that is safe in a header and still readable in one. */
function contentDispositionFor(name: string, inline: boolean): string {
  const cleaned = name.replace(/["\\\r\n]/g, "").trim() || "file";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/[^\x21-\x7e]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(
    cleaned,
  )}`;
}

/**
 * Moves one file into the bucket, in parts.
 *
 * The key is derived here rather than taken from the request, which is the whole
 * of the authorisation: a part can only ever be written under the namespace of
 * the account whose session is on the request, so there is no upload id to leak,
 * forge or look up. The id the client chose is the nonce inside that namespace.
 *
 * The body is handed to the bucket as the stream it arrived as, so a part is
 * never held whole in memory on the way through.
 */
async function serveAttachmentUpload(
  request: Request,
  caller: string,
  bucket: R2BucketLike | null,
): Promise<Response> {
  if (!bucket) return jsonResponse({ ok: false, reason: "attachments-not-configured" }, 503);

  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/messages\/upload/, "") || "/";

  const attachmentId = (url.searchParams.get("id") ?? "").trim().slice(0, 80);
  if (!attachmentId) return jsonResponse({ ok: false, reason: "invalid-attachment" }, 400);
  const key = await attachmentObjectKey(caller, attachmentId);
  const mimeType =
    (url.searchParams.get("type") ?? "application/octet-stream").trim().slice(0, 80) ||
    "application/octet-stream";

  try {
    if (route === "/" && request.method === "POST") {
      const declared = Number(url.searchParams.get("size"));
      if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_BUCKET_FILE_BYTES) {
        return jsonResponse({ ok: false, reason: "file-too-big" }, 413);
      }
      const parts = Math.max(1, Math.ceil(declared / UPLOAD_PART_BYTES));
      if (parts > MAX_UPLOAD_PARTS) {
        return jsonResponse({ ok: false, reason: "too-many-parts" }, 413);
      }
      const opened = await bucket.createMultipartUpload(key, {
        httpMetadata: { contentType: mimeType },
      });
      return jsonResponse({
        ok: true,
        uploadId: opened.uploadId,
        partBytes: UPLOAD_PART_BYTES,
        parts,
      });
    }

    if (route === "/object" && request.method === "PUT") {
      const body = request.body;
      if (!body) return jsonResponse({ ok: false, reason: "empty-body" }, 400);
      await bucket.put(key, body, { httpMetadata: { contentType: mimeType } });
      return jsonResponse({ ok: true, key });
    }

    if (route === "/part" && request.method === "PUT") {
      const uploadId = (url.searchParams.get("upload") ?? "").trim().slice(0, 200);
      const partNumber = Number(url.searchParams.get("part"));
      if (
        !uploadId ||
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > MAX_UPLOAD_PARTS
      ) {
        return jsonResponse({ ok: false, reason: "invalid-part" }, 400);
      }
      const body = request.body;
      if (!body) return jsonResponse({ ok: false, reason: "empty-body" }, 400);
      const part = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, body);
      return jsonResponse({ ok: true, etag: part.etag, partNumber: part.partNumber });
    }

    if (route === "/complete" && request.method === "POST") {
      const uploadId = (url.searchParams.get("upload") ?? "").trim().slice(0, 200);
      if (!uploadId) return jsonResponse({ ok: false, reason: "invalid-upload" }, 400);

      let payload: { parts?: unknown } = {};
      try {
        payload = (await request.json()) as { parts?: unknown };
      } catch {
        return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
      }
      if (!Array.isArray(payload.parts) || payload.parts.length === 0) {
        return jsonResponse({ ok: false, reason: "no-parts" }, 400);
      }
      if (payload.parts.length > MAX_UPLOAD_PARTS) {
        return jsonResponse({ ok: false, reason: "too-many-parts" }, 413);
      }

      const parts: { partNumber: number; etag: string }[] = [];
      for (const entry of payload.parts) {
        const record = (entry ?? {}) as Record<string, unknown>;
        const partNumber = Number(record["partNumber"]);
        const etag = String(record["etag"] ?? "")
          .trim()
          .slice(0, 200);
        if (
          !Number.isInteger(partNumber) ||
          partNumber < 1 ||
          partNumber > MAX_UPLOAD_PARTS ||
          !etag
        ) {
          return jsonResponse({ ok: false, reason: "invalid-part" }, 400);
        }
        parts.push({ partNumber, etag });
      }
      parts.sort((left, right) => left.partNumber - right.partNumber);

      await bucket.resumeMultipartUpload(key, uploadId).complete(parts);
      const object = await bucket.head(key);
      if (!object) return jsonResponse({ ok: false, reason: "upload-incomplete" }, 502);
      return jsonResponse({ ok: true, key, size: object.size });
    }

    if (route === "/abort" && request.method === "POST") {
      const uploadId = (url.searchParams.get("upload") ?? "").trim().slice(0, 200);
      // Best effort: an upload that was never opened has nothing to abort, and
      // the client is already on its way out either way.
      if (uploadId) {
        await bucket
          .resumeMultipartUpload(key, uploadId)
          .abort()
          .catch(() => undefined);
      }
      return jsonResponse({ ok: true });
    }
  } catch (error) {
    console.warn("Failed to store an uploaded attachment.", error);
    return jsonResponse({ ok: false, reason: "upload-failed" }, 502);
  }

  return jsonResponse({ ok: false, reason: "unknown-upload-route" }, 404);
}

/**
 * Hands back a file, as much of it as was asked for.
 *
 * The object is asked one question — is this attachment part of one of my
 * conversations — and answers with the key it holds. Everything after that is the
 * bucket, streamed, so a download that stops halfway has cost a range rather than
 * a file.
 */
async function serveAttachmentDownload(
  request: Request,
  caller: string,
  env: unknown,
  bucket: R2BucketLike | null,
): Promise<Response> {
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim().slice(0, 80);
  if (!id) return jsonResponse({ error: "invalid-attachment" }, 400);

  const namespace = resolveMessagesNamespace(request, env);
  if (!namespace) return jsonResponse({ error: "messages-not-configured" }, 503);

  let record: Record<string, unknown>;
  try {
    const response = await objectCall(
      caller,
      `/attachment?id=${encodeURIComponent(id)}`,
      undefined,
      "GET",
    )(namespace);
    if (!response.ok) return new Response(null, { status: response.status === 404 ? 404 : 502 });
    record = (await response.json()) as Record<string, unknown>;
  } catch (error) {
    console.warn("Failed to resolve an attachment for download.", error);
    return jsonResponse({ error: "storage-unavailable" }, 502);
  }

  const name = String(record["name"] ?? "file");
  const mimeType = String(record["mimeType"] ?? "application/octet-stream");

  // Written before object storage existed and still read, because a conversation
  // that holds one of these is a conversation from before.
  const legacy = typeof record["data"] === "string" ? record["data"] : "";
  if (legacy) {
    const bytes = base64ToBytes(legacy);
    return new Response(bytes, {
      headers: {
        "content-type": mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": contentDispositionFor(name, mimeType.startsWith("image/")),
        "cache-control": "private, max-age=31536000, immutable",
        "accept-ranges": "none",
      },
    });
  }

  const key = String(record["key"] ?? "");
  if (!bucket) return jsonResponse({ error: "attachments-not-configured" }, 503);
  if (!isAttachmentObjectKey(key)) return jsonResponse({ error: "not-found" }, 404);

  let head: { size: number; httpMetadata?: { contentType?: string } } | null = null;
  try {
    head = await bucket.head(key);
  } catch (error) {
    console.warn("Failed to stat an attachment.", error);
    return jsonResponse({ error: "storage-unavailable" }, 502);
  }
  if (!head) return jsonResponse({ error: "not-found" }, 404);

  const range = parseByteRange(request.headers.get("range"), head.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${head.size}`, "accept-ranges": "bytes" },
    });
  }

  try {
    const object = range
      ? await bucket.get(key, { range: { offset: range.offset, length: range.length } })
      : await bucket.get(key);
    if (!object?.body) return jsonResponse({ error: "not-found" }, 404);

    const served = object.range ?? range;
    const headers = new Headers({
      "content-type": object.httpMetadata?.contentType || mimeType,
      "cache-control": "private, max-age=31536000, immutable",
      "accept-ranges": "bytes",
      etag: object.httpEtag,
    });
    headers.set(
      "content-disposition",
      contentDispositionFor(
        name,
        (object.httpMetadata?.contentType ?? mimeType).startsWith("image/"),
      ),
    );
    if (served) {
      headers.set("content-length", String(served.length));
      headers.set("content-range", contentRangeHeader(served, head.size));
    } else {
      headers.set("content-length", String(head.size));
    }

    return new Response(object.body, { status: served ? 206 : 200, headers });
  } catch (error) {
    console.warn("Failed to read an attachment.", error);
    return jsonResponse({ error: "storage-unavailable" }, 502);
  }
}

/** Base64 to bytes, for an attachment written before the bucket existed. */
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Sends a message to both sides.
 *
 * The object only ever sees the caller's own row, so a message has to be
 * written twice: once into the sender's object as `fromMe` and once into the
 * recipient's object as an incoming message. Each user then reads only their
 * own object, and a peer is never written to directly by a client.
 */
async function serveMessagesSend(
  request: Request,
  caller: string,
  env: unknown,
): Promise<Response> {
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

  const attachments = await resolveSentAttachments(
    Array.isArray(payload["attachments"]) ? (payload["attachments"] as unknown[]) : [],
    caller,
    resolveMessagesBucket(request, env),
  );

  if (!id || !chatId || (!text.trim() && attachments.length === 0)) {
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
    // Stamped here from the session that has already been verified, and never
    // taken from the body. The object derives an attachment's storage key from
    // this, which is what stops a message naming a file its sender did not put
    // there.
    authorEmail: caller,
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
        // The author is the same person in both writes, which is the point: both
        // objects work out the same storage key for the same attachment, so the
        // file is stored once and read by both sides.
        authorEmail: caller,
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
 * One person's reaction to one message, on both sides.
 *
 * A gateway route of its own for the same reason the edit and delete have one: the
 * caller's object is asked first and answers with the peer it has on file, so a
 * client cannot react inside somebody else's conversation, and the frame is then
 * written into that peer's object too. A reaction stored on one side only is a
 * reaction the other person never sees, which is the one outcome worse than not
 * having the feature.
 *
 * Who reacted travels in the mirrored body, and that is safe here because the mirror
 * marker is a header the gateway sets after stripping the client's own copy — so a
 * client cannot put themselves in that field, and cannot make the mirror branch run
 * at all.
 */
async function serveMessagesReact(request: Request, caller: string): Promise<Response> {
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
  // Cut here rather than in the object: this arrives from a button holding one
  // emoji, and a paste of a paragraph has no business becoming a reaction.
  const emoji = String(payload["emoji"] ?? "")
    .trim()
    .slice(0, MAX_REACTION_CODE_POINTS * 4);
  /**
   * On or off, never a toggle.
   *
   * The object cannot work it out — its own owner reacting to their own message
   * and somebody else's reaction arriving through a mirror are the same write from
   * there — and a toggle cannot be mirrored safely, because a copy that arrives
   * twice would take the reaction back off.
   *
   * Not defaulted: a body without the field has not said which way it went.
   */
  const on = payload["on"];

  if (!id || !chatId || !isUsableReaction(emoji)) {
    return jsonResponse({ ok: false, reason: "invalid-reaction" }, 400);
  }
  // Asked for rather than assumed. A body that arrives without one has said nothing
  // about which way it went, and reading that silence as `off` would quietly take
  // somebody's reaction away over a field a client forgot to send.
  if (typeof on !== "boolean") {
    return jsonResponse({ ok: false, reason: "invalid-reaction" }, 400);
  }

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const own = { id, chatId, emoji, on };

  try {
    const applied = await objectCall(caller, "/message/react", own)(namespace);
    if (!applied.ok) return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);

    const result = (await applied.json().catch(() => ({}))) as {
      ok?: boolean;
      peerEmail?: string;
    };
    if (result.ok === false) {
      return jsonResponse({ ok: false, reason: "reaction-refused" }, 403);
    }

    const peerEmail = normalizeMessagesEmail(result.peerEmail ?? "");
    if (peerEmail && peerEmail !== caller) {
      try {
        await objectCall(peerEmail, "/message/react", { ...own, authorEmail: caller }, "POST", {
          [MIRROR_HEADER]: "1",
        })(namespace);
      } catch (error) {
        // Best effort, like every other mirror: the peer's own next sync carries
        // the authoritative row anyway.
        console.warn("Failed to mirror a reaction into the recipient's object.", error);
      }
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.warn("Failed to react to a message.", error);
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
      await objectCall(email, "/call", body, "POST", {
        [MIRROR_HEADER]: "1",
        // Who is speaking, which the object cannot work out on its own: the
        // request it receives is authenticated as the recipient. Read as the
        // speaker, an invitation is recorded as the recipient inviting themselves,
        // and the person who was actually invited is never told they were called.
        [VOICE_FROM_HEADER]: caller,
      })(namespace);
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
 * Relays one voice frame to everybody it is for.
 *
 * The caller is applied first, so the object that decides who is in the channel
 * is one that has already been told. It answers with the addresses, and each of
 * those is written the same frame: a room is converged the way a conversation
 * is, by the identical row landing in every member's own object rather than by
 * one shared read.
 */
async function serveVoiceSignal(request: Request, caller: string): Promise<Response> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const channelId = String(payload["channelId"] ?? "")
    .trim()
    .slice(0, 120);
  const kind = String(payload["kind"] ?? "");
  if (!channelId || !kind) return jsonResponse({ ok: false, reason: "invalid-frame" }, 400);

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  const to = normalizeMessagesEmail(String(payload["to"] ?? ""));
  const body = { ...payload, channelId, kind, ...(to ? { to } : {}) };

  type Applied = {
    ok?: boolean;
    reason?: string;
    guildId?: string;
    peers?: string[];
    roster?: unknown;
    members?: string[];
  };

  let applied: Applied = {};
  try {
    const own = await objectCall(caller, "/voice", body)(namespace);
    applied = (await own.json().catch(() => ({}))) as Applied;
  } catch (error) {
    console.warn("Failed to handle a voice frame.", error);
    return jsonResponse({ ok: false, reason: "storage-unavailable" }, 502);
  }
  if (applied.ok === false) {
    // The object refuses anything it cannot vouch for: a channel this account
    // is not in, a text channel, or a frame kind it does not know.
    return jsonResponse({ ok: false, reason: applied.reason ?? "unknown-channel" }, 404);
  }

  const targets = (applied.peers ?? []).filter(
    (email) => email && normalizeMessagesEmail(email) !== caller,
  );

  let relayed = 0;
  await Promise.all(
    targets.map(async (email) => {
      try {
        await objectCall(email, "/voice", body, "POST", {
          [MIRROR_HEADER]: "1",
          /**
           * Who is speaking, which the object cannot work out on its own.
           *
           * The request it receives is authenticated as the recipient, so read as
           * the speaker it records the recipient's own presence as whatever the
           * frame says, never adds the person who actually spoke, and hands the
           * recipient a frame that claims to be its own — which the client then
           * discards as an echo. The room stays two people who cannot see each
           * other, and the only trace is a presence that changes on the wrong
           * account.
           */
          [VOICE_FROM_HEADER]: caller,
        })(namespace);
        relayed += 1;
      } catch (error) {
        // One person unreachable is not a room for the others to fail on. Their
        // own copy catches up on their next sync.
        console.warn("Failed to relay a voice frame to a member.", error);
      }
    }),
  );

  /**
   * The answer to "who is in there", for somebody who has just walked in.
   *
   * A room is not symmetric. The object a join goes through knows only that the
   * joiner is in it; the people already standing there hear about the joiner, and
   * nothing comes back the other way. So the accounts just told are asked
   * directly, and their occupants are merged into one roster to hand over.
   *
   * Without this the joiner is in a room whose only occupant is themselves: the
   * stage stays empty, no connection is offered to anybody, and the screen says
   * nothing about why.
   */
  if (kind === "voice-join" && targets.length > 0) {
    const known = applied.roster as
      | { channelId?: string; guildId?: string; ownerEmail?: string; presences?: unknown[] }
      | undefined;
    const seen = new Map<string, unknown>();
    for (const row of known?.presences ?? []) {
      const entry = row as { email?: string };
      if (entry.email) seen.set(normalizeMessagesEmail(entry.email), row);
    }
    await Promise.all(
      targets.map(async (email) => {
        try {
          const response = await objectCall(
            email,
            `/voice/roster?channel=${encodeURIComponent(channelId)}`,
            undefined,
            "GET",
          )(namespace);
          const body_ = (await response.json()) as {
            roster?: { presences?: Array<{ email?: string }> } | null;
          };
          for (const row of body_.roster?.presences ?? []) {
            if (row.email) seen.set(normalizeMessagesEmail(row.email), row);
          }
        } catch (error) {
          // One member not answering costs one tile, not the room.
          console.warn("Failed to read a channel's occupants from a member.", error);
        }
      }),
    );
    const presences = [...seen.values()];
    // The caller's own object has already recorded the join it sent, so what is
    // left to add is exactly the occupants the accounts just told reported.
    if (presences.length > 0) {
      return jsonResponse({
        ok: true,
        relayed,
        roster: {
          channelId,
          guildId: String(known?.guildId ?? ""),
          ownerEmail: String(known?.ownerEmail ?? ""),
          presences,
        },
      });
    }
  }

  return jsonResponse({
    ok: true,
    relayed,
    ...(applied.roster ? { roster: applied.roster } : {}),
  });
}

/**
 * Every change to a server, written into the objects of everyone in it.
 *
 * Mirrored rows are what keep an account from ever reading another account's
 * object, so a channel that only existed in the owner's object would be invisible
 * to everybody else. The owner is checked by the object; what is added here is
 * the fan-out, which is cross-object I/O and has to stay out of the object.
 */
async function serveGuildWrite(request: Request, caller: string): Promise<Response> {
  const url = new URL(request.url);
  let payload: Record<string, unknown> = {};
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, reason: "invalid-payload" }, 400);
  }

  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return jsonResponse({ ok: false, reason: "messages-not-configured" }, 503);

  type Applied = {
    ok?: boolean;
    reason?: string;
    guild?: Guild;
    guildId?: string;
    members?: Array<{ email: string }>;
    membersAdded?: unknown;
    added?: { email: string; name: string; avatar: string | null } | string;
    removed?: string | false;
    channel?: GuildTextChannel | GuildVoiceChannel;
  };

  const apply = async (email: string, path: string, body: unknown, mirror = false) => {
    const response = await objectCall(
      email,
      path,
      body,
      "POST",
      mirror ? { [MIRROR_HEADER]: "1" } : {},
    )(namespace);
    return (await response.json().catch(() => ({}))) as Applied;
  };

  const mine = normalizeMessagesEmail(caller);

  if (url.pathname === "/api/messages/guild/create") {
    const id = String(payload["id"] ?? "")
      .trim()
      .slice(0, 80);
    const name = String(payload["name"] ?? "")
      .trim()
      .slice(0, 60);
    if (!id || !name) return jsonResponse({ ok: false, reason: "invalid-guild" }, 400);

    const me = await readMessagesProfile(caller);
    const created = await apply(caller, "/guild/create", {
      ...payload,
      id,
      name,
      ownerName: me?.name || name,
      ownerAvatar: me?.avatar ?? null,
    });
    if (created.ok === false) {
      return jsonResponse({ ok: false, reason: created.reason ?? "cannot-create" }, 400);
    }
    return jsonResponse({ ok: true, guild: created.guild });
  }

  // Everything else is a change to a server somebody is already in, so the
  // member list is read out of the caller's own object and that list is the
  // fan-out. A client cannot widen it: the addresses come from storage.
  const guildId = String(payload["guildId"] ?? payload["id"] ?? "")
    .trim()
    .slice(0, 80);
  const shape = await readGuildShape(request, mine, guildId);
  const roster = shape?.members ?? null;
  if (!roster) return jsonResponse({ ok: false, reason: "unknown-guild" }, 404);

  const path = url.pathname.slice("/api/messages/guild/".length);

  if (path === "member") {
    const target = normalizeMessagesEmail(String(payload["email"] ?? ""));
    if (!target) return jsonResponse({ ok: false, reason: "invalid-member" }, 400);

    /**
     * The fan-out for a change to the member list: everybody in the server, and
     * the person the change is about.
     *
     * The address book has to be complete in *every* copy, not just the caller's.
     * A channel join is broadcast to the members the object knows about, so an
     * object that is missing a row is a room with nobody in it: somebody walks
     * into a full channel and stands there alone, with not even an offer of a
     * connection, and the screen gives them no reason for any of it.
     *
     * The person being removed is in the list too, because the row is still in
     * the caller's roster and their own copy of it has to go as well.
     */
    const everyone = [mine, ...roster, target].filter(
      (email, index, all) => all.indexOf(email) === index,
    );

    if (payload["remove"] === true) {
      const applied = await apply(caller, "/guild/member", payload);
      if (applied.ok === false) {
        return jsonResponse({ ok: false, reason: applied.reason ?? "cannot-change" }, 400);
      }
      await Promise.all(
        everyone.map(async (email) => {
          await apply(email, "/guild/member", payload, true).catch((error) => {
            console.warn("Failed to remove a member from an account's copy.", error);
          });
        }),
      );
      return jsonResponse({ ok: true });
    }

    const recorded = await recordMemberLocally({ guildId, target, caller, apply });
    if (!recorded) return jsonResponse({ ok: false, reason: "cannot-change" }, 400);
    await mirrorMemberEverywhere({ guildId, target, mine, roster, shape, apply });
    const newcomer = typeof recorded.added === "string" ? null : recorded.added;
    return jsonResponse({ ok: true, member: newcomer ?? null });
  }

  /**
   * Several people at once, which is what a new server is: everybody who is
   * already a friend walks in with it.
   *
   * One request rather than one per person. The client would otherwise hold a
   * phone's worth of round trips open at the same time, and a connection that
   * drops halfway through would leave a server with an arbitrary number of the
   * invited people in it and no way to tell which. Here the whole list goes in
   * and one answer comes back.
   *
   * The addresses are still the server's to choose: this route reads them out of
   * the caller's friendship list, so a client cannot name a stranger.
   */
  if (path === "members") {
    // The addresses come from the caller's own friendship list, read out of their
    // object rather than taken from the request: a client that could name the list
    // could put a stranger in a server.
    const namespace = resolveMessagesNamespace(request, null);
    const snapshot = namespace
      ? await objectCall(
          caller,
          "/friend/list",
          undefined,
          "GET",
        )(namespace)
          .then(
            (response) =>
              response.json() as Promise<{
                friends?: { friends?: Array<Record<string, unknown>> };
              }>,
          )
          .catch(() => ({}) as { friends?: { friends?: [] } })
      : ({} as { friends?: { friends?: [] } });

    const already = new Set(roster.map((email) => normalizeMessagesEmail(email)));
    const wanted = (snapshot.friends?.friends ?? [])
      .map((row) => {
        const iAsked = normalizeMessagesEmail(String(row["fromEmail"] ?? "")) === mine;
        return normalizeMessagesEmail(String((iAsked ? row["toEmail"] : row["fromEmail"]) ?? ""));
      })
      .filter((email) => email && email !== mine && !already.has(email))
      .filter((email, index, all) => all.indexOf(email) === index)
      .slice(0, MAX_AUTO_JOIN_FRIENDS);

    /**
     * The owner's own member list first, one at a time.
     *
     * One array, read and written whole, so two of these at the same moment each
     * read the list before either writes it and the slower one wins — which with
     * fifty invitations firing in parallel leaves the owner with whichever handful
     * happened to land last and no way to see that it is short. Sequential here;
     * only the fan-out below is allowed to run in parallel.
     */
    const accepted: string[] = [];
    for (const target of wanted) {
      const recorded = await recordMemberLocally({ guildId, target, caller, apply });
      if (recorded) accepted.push(target);
    }

    // And then everybody else's copies, a few at a time.
    await inBatches(accepted, AUTO_JOIN_BATCH, (target) =>
      mirrorMemberEverywhere({ guildId, target, mine, roster, shape, apply }),
    );

    return jsonResponse({ ok: true, added: accepted.length, wanted: wanted.length });
  }

  if (path === "channel") {
    const applied = await apply(caller, "/guild/channel", payload);
    if (applied.ok === false) {
      return jsonResponse({ ok: false, reason: applied.reason ?? "cannot-change" }, 400);
    }
    const channel = applied.channel;
    // A renamed channel is the same row everywhere, and a removed one has to be
    // deleted from every object that holds it or a sidebar keeps drawing it.
    await Promise.all(
      roster.map(async (email) => {
        await apply(email, "/guild/channel", payload, true).catch((error) => {
          console.warn("Failed to mirror a channel into an account.", error);
        });
      }),
    );
    return jsonResponse({ ok: true, channel: channel ?? null });
  }

  if (path === "upsert") {
    const applied = await apply(caller, "/guild/upsert", payload);
    if (applied.ok === false) {
      return jsonResponse({ ok: false, reason: applied.reason ?? "cannot-change" }, 400);
    }
    const guild = applied.guild;
    if (!guild) return jsonResponse({ ok: false, reason: "invalid-guild" }, 400);
    await Promise.all(
      roster.map(async (email) => {
        await apply(
          email,
          "/guild/upsert",
          {
            id: guild.id,
            name: guild.name,
            accent: guild.accent,
            ownerEmail: guild.ownerEmail,
          },
          true,
        ).catch((error) => {
          console.warn("Failed to mirror a server rename into an account.", error);
        });
      }),
    );
    return jsonResponse({ ok: true, guild });
  }

  if (path === "remove") {
    const applied = await apply(caller, "/guild/remove", payload);
    if (applied.ok === false) {
      return jsonResponse({ ok: false, reason: applied.reason ?? "cannot-change" }, 400);
    }
    // Deleting a server from every member's object, the caller's included.
    await Promise.all(
      [mine, ...roster].map(async (email) => {
        await apply(email, "/guild/remove", payload, true).catch((error) => {
          console.warn("Failed to remove a server from an account.", error);
        });
      }),
    );
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, reason: "unknown-guild-route" }, 404);
}

/**
 * A server as one of its members' objects holds it: the row, its channels, and
 * everybody in it.
 *
 * Read from storage rather than taken from the request, because this is both the
 * fan-out list for every change and the source of the rows a new member has to
 * receive — a client that could name its own recipients could write a server row
 * into an account that is not in that server.
 *
 * `null` means the account is not in it at all, which is different from it being
 * a server with nobody in it yet.
 */
/**
 * Adds one member row to the caller's own object.
 *
 * Split out from the mirroring because of how it has to be *timed*. The member
 * list is one array in one object, read and written whole, so two of these at the
 * same moment both read the list before either writes it and the second write
 * throws the first away. Fifty invitations fired in parallel therefore leave an
 * owner with whichever handful happened to land last — so the bulk route runs
 * these one at a time and only the fan-out in parallel.
 */
async function recordMemberLocally({
  guildId,
  target,
  caller,
  apply,
}: {
  guildId: string;
  target: string;
  caller: string;
  apply: (
    email: string,
    path: string,
    body: unknown,
    mirror?: boolean,
  ) => Promise<{ ok?: boolean; reason?: string; added?: unknown }>;
}) {
  const applied = await apply(caller, "/guild/member", { guildId, email: target });
  return applied.ok === false ? null : applied;
}

/**
 * Tells the other copies of the server that this person is in it.
 *
 * The order is not incidental.
 *
 * The server and its channels go into the newcomer's object **first**. A member
 * row is written against a server that already exists in that object, and the
 * object refuses a row for a server it has never heard of — so writing the member
 * first and the server second leaves the newcomer holding a server they can see
 * and every channel refusing them with a 404, which is an invitation that appears
 * to have worked and left a person in a room they cannot enter.
 *
 * Then the newcomer's own place, who was already there, and finally the rest of
 * the world told about the newcomer. The newcomer has to know the rest of the
 * list: a voice channel join is broadcast to the members an object knows about, so
 * an object missing a row is a room with nobody in it — somebody walks into a full
 * channel and stands there alone, with not even an offer of a connection.
 */
async function mirrorMemberEverywhere({
  guildId,
  target,
  mine,
  roster,
  shape,
  apply,
}: {
  guildId: string;
  target: string;
  mine: string;
  roster: string[];
  shape: {
    guild: Guild;
    channels: { text: GuildTextChannel[]; voice: GuildVoiceChannel[] };
    members: string[];
  } | null;
  apply: (
    email: string,
    path: string,
    body: unknown,
    mirror?: boolean,
  ) => Promise<{ ok?: boolean; reason?: string }>;
}): Promise<void> {
  const targetProfile = await readMessagesProfile(target);
  const targetName = targetProfile?.name || target;
  const targetAvatar = targetProfile?.avatar ?? null;

  if (shape) {
    await apply(
      target,
      "/guild/upsert",
      {
        id: shape.guild.id,
        name: shape.guild.name,
        accent: shape.guild.accent,
        ownerEmail: shape.guild.ownerEmail,
      },
      true,
    ).catch((error) => {
      console.warn("Failed to mirror a server into a new member's account.", error);
    });
    for (const channel of [...shape.channels.text, ...shape.channels.voice]) {
      await apply(
        target,
        "/guild/channel",
        {
          guildId,
          id: channel.id,
          kind: channel.kind,
          name: channel.name,
          ...("topic" in channel ? { topic: channel.topic } : {}),
          order: channel.order,
        },
        true,
      ).catch((error) => {
        console.warn("Failed to mirror a channel into a new member's account.", error);
      });
    }
  }

  await apply(
    target,
    "/guild/member",
    { guildId, email: target, name: targetName, avatar: targetAvatar },
    true,
  ).catch((error) => {
    console.warn("Failed to write a new member's own place in a server.", error);
  });

  await Promise.all(
    roster
      .filter((member) => member !== target)
      .map(async (member) => {
        const profile = await readMessagesProfile(member);
        await apply(
          target,
          "/guild/member",
          {
            guildId,
            email: member,
            name: profile?.name || member,
            avatar: profile?.avatar ?? null,
          },
          true,
        ).catch((error) => {
          console.warn("Failed to write a server's existing members into a new one.", error);
        });
      }),
  );

  const everyone = [mine, ...roster, target].filter(
    (email, index, all) => all.indexOf(email) === index,
  );
  await Promise.all(
    everyone.map(async (email) => {
      const profile = email === mine ? null : await readMessagesProfile(email);
      await apply(
        email,
        "/guild/member",
        { guildId, email: target, name: targetName, avatar: targetAvatar },
        true,
      ).catch((error) => {
        console.warn("Failed to mirror a member into an account.", error);
      });
    }),
  );
}

/**
 * Runs a batch of work a few at a time rather than all at once.
 *
 * Fifty people at fifty simultaneous fan-outs is a request that times out, and a
 * request that times out halfway is a server with an arbitrary number of the
 * invited people in it. Six at a time is enough to be quick and few enough that
 * each batch answers.
 */
async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let at = 0; at < items.length; at += size) {
    const batch = items.slice(at, at + size);
    results.push(...(await Promise.all(batch.map((item) => work(item)))));
  }
  return results;
}

async function readGuildShape(
  request: Request,
  email: string,
  guildId: string,
): Promise<{
  guild: Guild;
  channels: { text: GuildTextChannel[]; voice: GuildVoiceChannel[] };
  members: string[];
} | null> {
  if (!guildId) return null;
  const namespace = resolveMessagesNamespace(request, null);
  if (!namespace) return null;
  try {
    const response = await objectCall(email, "/", undefined, "GET")(namespace);
    const snapshot = (await response.json()) as {
      guilds?: {
        guilds?: Array<Guild & { id: string }>;
        members?: Array<{ guildId: string; email: string }>;
        channels?: { text?: GuildTextChannel[]; voice?: GuildVoiceChannel[] };
      };
    };
    const guild = snapshot.guilds?.guilds?.find((entry) => entry.id === guildId);
    if (!guild) return null;
    const text = (snapshot.guilds?.channels?.text ?? []).filter(
      (channel) => channel.guildId === guildId,
    );
    const voice = (snapshot.guilds?.channels?.voice ?? []).filter(
      (channel) => channel.guildId === guildId,
    );
    const members = (snapshot.guilds?.members ?? [])
      .filter((member) => member.guildId === guildId)
      .map((member) => normalizeMessagesEmail(member.email))
      .filter(Boolean);
    return { guild, channels: { text, voice }, members };
  } catch (error) {
    console.warn("Failed to read a server's shape.", error);
    return null;
  }
}

/**
 * Puts one finished call into the history of everybody who was in it.
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

    /**
     * Every answer this worker gives carries the transport policy, not just the
     * documents.
     *
     * The first three returns below used to go out bare: the https redirect, the
     * game endpoints and the messages gateway. HSTS is a header a crawler reads
     * once per response, and a redirect is a response — so a site that sends the
     * policy on its pages and not on its redirects is a site reported as having no
     * HSTS support at all, which is the one thing the policy exists to establish.
     */
    const httpsRedirect = redirectToHttps(request);
    if (httpsRedirect) {
      return withHsts(httpsRedirect);
    }

    const sitemapResponse = serveSitemap(request);
    if (sitemapResponse) {
      return withHsts(sitemapResponse);
    }

    const stripeResponse = await serveStripeWebhook(request);
    if (stripeResponse) {
      return withHsts(stripeResponse);
    }

    const chessResponse = await serveChessGameRequest(request, env);
    if (chessResponse) {
      return withHsts(chessResponse);
    }

    const tttResponse = await serveTicTacToeGameRequest(request, env);
    if (tttResponse) {
      return withHsts(tttResponse);
    }

    const airHockeyResponse = await serveAirHockeyGameRequest(request, env);
    if (airHockeyResponse) {
      return withHsts(airHockeyResponse);
    }

    const messagesResponse = await serveMessagesRequest(request, env);
    if (messagesResponse) {
      return withHsts(messagesResponse);
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
