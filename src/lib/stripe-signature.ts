const DEFAULT_TOLERANCE_SECONDS = 300;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

async function signHmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export function parseStripeSignatureHeader(header: string): {
  timestamp: number;
  signatures: string[];
} {
  const timestampPart = header
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("t="));
  const signatures = header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  const timestamp = Number.parseInt((timestampPart ?? "t=").slice(2), 10);
  return { timestamp: Number.isFinite(timestamp) ? timestamp : 0, signatures };
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header || !secret) return false;

  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  if (!timestamp || signatures.length === 0) return false;

  if (toleranceSeconds > 0 && Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = await signHmacSha256(secret, `${timestamp}.${payload}`);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}
