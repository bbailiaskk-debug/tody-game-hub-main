import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type CloudflareEnv = {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
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

  // Keep HTML aligned with the latest hashed asset manifest.
  if (nextHeaders.get("content-type")?.includes("text/html")) {
    nextHeaders.set("Cache-Control", "no-store, max-age=0");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

function redirectToHttps(request: Request): Response | null {
  const url = new URL(request.url);
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

// Initialize Cloudflare Worker environment for server functions
function initializeCloudflareEnv(env: unknown): void {
  (globalThis as typeof globalThis & { CF_ENV?: unknown }).CF_ENV = env;
}

async function serveSitemap(request: Request, env: unknown): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/sitemap.xml") return null;

  const assets = (env as CloudflareEnv).ASSETS;
  if (!assets) return null;

  const assetUrl = new URL(request.url);
  assetUrl.search = "";
  const response = await assets.fetch(new Request(assetUrl, { method: "GET" }));
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("xml")) {
    return new Response("Sitemap asset not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/xml; charset=utf-8");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Initialize Cloudflare environment for server functions
    initializeCloudflareEnv(env);

    const httpsRedirect = redirectToHttps(request);
    if (httpsRedirect) {
      return httpsRedirect;
    }

    const sitemapResponse = await serveSitemap(request, env);
    if (sitemapResponse) {
      return withHsts(sitemapResponse);
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
