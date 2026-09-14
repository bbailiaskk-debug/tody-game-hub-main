import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getChessSecret } from "./lib/chess-auth";

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

function withHsts(response: Response): Response {
  const nextHeaders = new Headers(response.headers);
  if (!nextHeaders.has("strict-transport-security")) {
    nextHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // Keep HTML fresh for browsers while letting the Cloudflare edge cache it
  // briefly (s-maxage) and serve stale copies during revalidation to keep
  // TTFB/LCP low. max-age=0 keeps the page in lock-step with the latest
  // hashed asset manifest on every browser visit.
  if (nextHeaders.get("content-type")?.includes("text/html")) {
    nextHeaders.set(
      "Cache-Control",
      "public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=300",
    );
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

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttpRequest = forwardedProto === "http" || url.protocol === "http:";

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
    { loc: "/music", changefreq: "daily", priority: "0.9" },
    { loc: "/games", changefreq: "weekly", priority: "0.8" },
    { loc: "/info", changefreq: "weekly", priority: "0.8" },
    { loc: "/ai", changefreq: "weekly", priority: "0.8" },
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

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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

    const chessResponse = await serveChessGameRequest(request, env);
    if (chessResponse) {
      return chessResponse;
    }

    const tttResponse = await serveTicTacToeGameRequest(request, env);
    if (tttResponse) {
      return tttResponse;
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
