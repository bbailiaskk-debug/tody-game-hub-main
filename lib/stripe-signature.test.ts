import { describe, expect, it } from "vitest";

import { parseStripeSignatureHeader, verifyStripeSignature } from "./stripe-signature";
import { isPaidCheckoutSession, resolveAppOrigin, LIVE_APP_ORIGIN } from "./stripe";

const SECRET = "whsec_test_secret";

async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

describe("stripe signature verification", () => {
  it("parses timestamp and v1 signatures", () => {
    const parsed = parseStripeSignatureHeader("t=1700000000,v1=abc123,v1=def456");
    expect(parsed.timestamp).toBe(1700000000);
    expect(parsed.signatures).toEqual(["abc123", "def456"]);
  });

  it("accepts a matching signature", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
    const timestamp = 1700000000;
    const signature = await hmacHex(SECRET, `${timestamp}.${payload}`);

    const valid = await verifyStripeSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      SECRET,
      300,
      timestamp + 10,
    );

    expect(valid).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const timestamp = 1700000000;
    const signature = await hmacHex(SECRET, `${timestamp}.{"a":1}`);

    const valid = await verifyStripeSignature(
      JSON.stringify({ a: 2 }),
      `t=${timestamp},v1=${signature}`,
      SECRET,
      300,
      timestamp,
    );

    expect(valid).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const payload = "{}";
    const timestamp = 1700000000;
    const signature = await hmacHex("whsec_other", `${timestamp}.${payload}`);

    const valid = await verifyStripeSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      SECRET,
      300,
      timestamp,
    );

    expect(valid).toBe(false);
  });

  it("rejects stale timestamps", async () => {
    const payload = "{}";
    const timestamp = 1700000000;
    const signature = await hmacHex(SECRET, `${timestamp}.${payload}`);

    const valid = await verifyStripeSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      SECRET,
      300,
      timestamp + 4000,
    );

    expect(valid).toBe(false);
  });

  it("rejects missing headers or secrets", async () => {
    expect(await verifyStripeSignature("{}", null, SECRET)).toBe(false);
    expect(await verifyStripeSignature("{}", "t=1,v1=abc", "")).toBe(false);
  });
});

describe("isPaidCheckoutSession", () => {
  it("accepts only complete and paid sessions", () => {
    expect(isPaidCheckoutSession({ status: "complete", payment_status: "paid" })).toBe(true);
    expect(isPaidCheckoutSession({ status: "complete", payment_status: "unpaid" })).toBe(false);
    expect(isPaidCheckoutSession({ status: "open", payment_status: "paid" })).toBe(false);
    expect(isPaidCheckoutSession(null)).toBe(false);
  });
});

describe("resolveAppOrigin", () => {
  it("keeps known origins", () => {
    expect(resolveAppOrigin(LIVE_APP_ORIGIN)).toBe(LIVE_APP_ORIGIN);
    expect(resolveAppOrigin("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("falls back to the live origin for unknown hosts", () => {
    expect(resolveAppOrigin("https://evil.example.com")).toBe(LIVE_APP_ORIGIN);
    expect(resolveAppOrigin(undefined)).toBe(LIVE_APP_ORIGIN);
  });
});
