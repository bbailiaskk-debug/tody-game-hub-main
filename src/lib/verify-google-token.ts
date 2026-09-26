import { createServerFn } from "@tanstack/react-start";

type GoogleCodeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce?: string;
};

export type GoogleProfile = {
  name: string;
  email: string;
  birthday?: string;
  gender?: string;
};

type GoogleCodeResult =
  { success: true; profile: GoogleProfile } | { success: false; error: string };

type GoogleIdTokenResult =
  { ok: true; profile: GoogleProfile; sub?: string } | { ok: false; reason: string };

type GoogleKvNamespace = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
};

type GoogleConnection = {
  email: string;
  sub?: string;
  refreshToken: string;
  scope?: string;
  expiresAt?: number;
  updatedAt: number;
};

type GoogleTokenInfo = {
  aud?: string;
  iss?: string;
  exp?: number | string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

function getServerEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): string {
  const cloudflareEnv = (globalThis as typeof globalThis & { CF_ENV?: Record<string, unknown> })
    .CF_ENV;
  const cloudflareValue = cloudflareEnv?.[name];
  if (typeof cloudflareValue === "string" && cloudflareValue.trim()) {
    return cloudflareValue.trim();
  }
  try {
    return globalThis.process?.env?.[name]?.trim() ?? "";
  } catch {
    return "";
  }
}

function getGoogleKv(): GoogleKvNamespace | null {
  const cloudflareEnv = (
    globalThis as typeof globalThis & { CF_ENV?: { AUTH_USERS_KV?: GoogleKvNamespace } }
  ).CF_ENV;
  return cloudflareEnv?.AUTH_USERS_KV ?? null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) return null;
  try {
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce?: string,
): Promise<GoogleIdTokenResult> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!response.ok) {
    console.warn("Google token info request failed.", response.status);
    return { ok: false, reason: `tokeninfo_http_${response.status}` };
  }

  const token = (await response.json()) as GoogleTokenInfo;
  const emailVerified = token.email_verified === true || token.email_verified === "true";
  const issuerValid =
    !token.iss ||
    token.iss === "https://accounts.google.com" ||
    token.iss === "accounts.google.com";
  const expiresAt = typeof token.exp === "number" ? token.exp : Number(token.exp);
  const tokenNotExpired = !Number.isFinite(expiresAt) || expiresAt > Date.now() / 1000;
  if (token.aud !== clientId) {
    console.warn("Google token audience verification failed.");
    return { ok: false, reason: "audience_mismatch" };
  }
  if (!emailVerified) {
    console.warn("Google token email verification failed.");
    return { ok: false, reason: "email_not_verified" };
  }
  if (!token.email) {
    console.warn("Google token has no email.");
    return { ok: false, reason: "email_missing" };
  }
  if (!issuerValid) {
    console.warn("Google token issuer verification failed.");
    return { ok: false, reason: "issuer_mismatch" };
  }
  if (!tokenNotExpired) {
    console.warn("Google token is expired.");
    return { ok: false, reason: "token_expired" };
  }

  if (expectedNonce) {
    const payload = decodeJwtPayload(idToken);
    if (!payload || payload["nonce"] !== expectedNonce) {
      console.warn("Google token nonce verification failed.");
      return { ok: false, reason: "nonce_mismatch" };
    }
  }

  const email = token.email.toLowerCase();
  return {
    ok: true,
    profile: {
      name: token.name?.trim() || email.split("@")[0] || "Google user",
      email,
    },
    ...(token.sub ? { sub: token.sub } : {}),
  };
}

async function persistGoogleConnection(connection: GoogleConnection): Promise<void> {
  const kv = getGoogleKv();
  if (!kv) return;
  try {
    await kv.put(
      `google-connection:${encodeURIComponent(connection.sub ?? connection.email)}`,
      JSON.stringify(connection),
    );
  } catch (error) {
    console.warn("Failed to persist the Google connection.", error);
  }
}

export const exchangeGoogleCode = createServerFn({ method: "POST" })
  .validator((data: GoogleCodeInput) => data)
  .handler(async ({ data }): Promise<GoogleCodeResult> => {
    const clientId = getServerEnv("GOOGLE_CLIENT_ID");
    const clientSecret = getServerEnv("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return {
        success: false,
        error: "Google OAuth server configuration is incomplete.",
      };
    }
    if (!data.code.trim() || !data.codeVerifier.trim() || !data.redirectUri.trim()) {
      return { success: false, error: "Google authorization data is incomplete." };
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: data.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: data.redirectUri,
          grant_type: "authorization_code",
          code_verifier: data.codeVerifier,
        }).toString(),
      });
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        let errorCode = `http_${tokenResponse.status}`;
        try {
          const parsed = JSON.parse(errorText) as { error?: unknown };
          if (typeof parsed.error === "string" && parsed.error.trim()) {
            errorCode = parsed.error.trim();
          }
        } catch {
          errorCode = `http_${tokenResponse.status}`;
        }
        console.warn("Google authorization code exchange failed.", tokenResponse.status, errorCode);
        return {
          success: false,
          error: `Google authorization could not be completed (${errorCode}).`,
        };
      }

      const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
      if (!tokens.id_token || !tokens.access_token) {
        return { success: false, error: "Google did not return a complete authorization." };
      }

      const verified = await verifyGoogleIdToken(tokens.id_token, clientId, data.nonce);
      if (!verified.ok) {
        return {
          success: false,
          error: `Google authorization could not be verified (${verified.reason}).`,
        };
      }

      if (tokens.refresh_token) {
        await persistGoogleConnection({
          email: verified.profile.email,
          refreshToken: tokens.refresh_token,
          updatedAt: Date.now(),
          ...(verified.sub ? { sub: verified.sub } : {}),
          ...(tokens.scope ? { scope: tokens.scope } : {}),
          expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        });
      }

      return { success: true, profile: verified.profile };
    } catch (error) {
      console.warn("Google authorization exchange failed.", error);
      return { success: false, error: "Google authorization could not be completed." };
    }
  });
