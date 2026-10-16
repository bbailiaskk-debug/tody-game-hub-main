// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  MESSAGES_COOKIE,
  messagesDoName,
  mintSessionToken,
  normalizeMessagesEmail,
  parseCookieHeader,
  verifySessionToken,
} from "./messages-auth";
import {
  ONLINE_WINDOW_MS,
  friendshipId,
  initialsForName,
  isOnlineAt,
  splitFriendRequests,
  type FriendRequest,
} from "./messages-protocol";

const SECRET = "test-secret-value";
const OTHER_SECRET = "attacker-secret-value";

describe("messages session tokens", () => {
  it("round-trips a freshly minted token", async () => {
    const token = await mintSessionToken(SECRET, "Player@Example.com");
    const verified = await verifySessionToken(SECRET, token);

    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.email).toBe("player@example.com");
    expect(verified.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await mintSessionToken(OTHER_SECRET, "victim@example.com");
    const verified = await verifySessionToken(SECRET, forged);

    expect(verified).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered payload", async () => {
    const token = await mintSessionToken(SECRET, "player@example.com");
    const [version, expiresAt, , signature] = token.split(".");
    // Swap in a different identity while keeping the original signature.
    const swapped = [version, expiresAt, btoa("victim@example.com"), signature].join(".");
    const verified = await verifySessionToken(SECRET, swapped);

    expect(verified).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a token that does not match the expected identity", async () => {
    const token = await mintSessionToken(SECRET, "player@example.com");
    const verified = await verifySessionToken(SECRET, token, "someone-else@example.com");

    expect(verified).toEqual({ ok: false, reason: "mismatch" });
  });

  it("accepts a token bound to the expected identity", async () => {
    const token = await mintSessionToken(SECRET, "player@example.com");
    const verified = await verifySessionToken(SECRET, token, "PLAYER@example.com");

    expect(verified.ok).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await mintSessionToken(SECRET, "player@example.com", -1_000);
    const verified = await verifySessionToken(SECRET, token);

    expect(verified).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed and missing tokens", async () => {
    expect(await verifySessionToken(SECRET, null)).toEqual({ ok: false, reason: "missing" });
    expect(await verifySessionToken(SECRET, "")).toEqual({ ok: false, reason: "missing" });
    expect(await verifySessionToken(SECRET, "garbage")).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await verifySessionToken(SECRET, "1.abc.def")).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("cannot be confused by dots inside the email local part", async () => {
    const email = "first.last@example.com";
    const token = await mintSessionToken(SECRET, email);
    const verified = await verifySessionToken(SECRET, token);

    expect(token.split(".")).toHaveLength(4);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.email).toBe(email);
  });
});

describe("messages object naming", () => {
  it("derives a stable, non-reversible name per account", async () => {
    const a = await messagesDoName("player@example.com");
    const b = await messagesDoName("Player@Example.com");
    const c = await messagesDoName("other@example.com");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("player");
  });
});

describe("cookie parsing", () => {
  it("reads the session cookie out of a header", () => {
    const header = `theme=dark; ${MESSAGES_COOKIE}=abc.def.ghi; other=1`;
    expect(parseCookieHeader(header)[MESSAGES_COOKIE]).toBe("abc.def.ghi");
  });

  it("tolerates a missing or empty header", () => {
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader("")).toEqual({});
  });
});

describe("presence helpers", () => {
  it("treats recent activity as online", () => {
    expect(isOnlineAt(Date.now())).toBe(true);
    expect(isOnlineAt(Date.now() - ONLINE_WINDOW_MS + 5_000)).toBe(true);
  });

  it("treats stale or never-seen accounts as offline", () => {
    expect(isOnlineAt(Date.now() - ONLINE_WINDOW_MS - 5_000)).toBe(false);
    expect(isOnlineAt(0)).toBe(false);
  });
});

describe("initials", () => {
  it("uses the first and last word", () => {
    expect(initialsForName("Todor Khristov")).toBe("TK");
    expect(initialsForName("Мартин Петков")).toBe("МП");
  });

  it("falls back sensibly", () => {
    expect(initialsForName("nelka")).toBe("NE");
    expect(initialsForName("   ")).toBe("?");
  });
});

describe("email normalisation", () => {
  it("lowercases and trims", () => {
    expect(normalizeMessagesEmail("  Player@Example.COM ")).toBe("player@example.com");
  });
});

describe("friendship records", () => {
  const record = (over: Partial<FriendRequest> = {}): FriendRequest => ({
    id: "a~b",
    fromEmail: "a@example.com",
    fromName: "A",
    fromAvatar: null,
    toEmail: "b@example.com",
    toName: "B",
    status: "pending",
    createdAt: 1,
    updatedAt: 1,
    ...over,
  });

  it("derives the same id for both participants regardless of order", () => {
    expect(friendshipId("a@example.com", "b@example.com")).toBe(
      friendshipId("B@Example.com", "A@example.com"),
    );
  });

  it("puts an incoming request in the recipient's inbox and outgoing in the sender's", () => {
    const pending = record();

    const forRecipient = splitFriendRequests([pending], "b@example.com");
    expect(forRecipient.incoming).toHaveLength(1);
    expect(forRecipient.outgoing).toHaveLength(0);

    const forSender = splitFriendRequests([pending], "a@example.com");
    expect(forSender.outgoing).toHaveLength(1);
    expect(forSender.incoming).toHaveLength(0);
  });

  it("treats accepted as a two-way friendship for both sides", () => {
    const accepted = record({ status: "accepted" });

    expect(splitFriendRequests([accepted], "a@example.com").friends).toHaveLength(1);
    expect(splitFriendRequests([accepted], "b@example.com").friends).toHaveLength(1);
  });

  it("hides rejected rows from the pending buckets", () => {
    const rejected = record({ status: "rejected" });
    const view = splitFriendRequests([rejected], "b@example.com");

    expect(view.incoming).toHaveLength(0);
    expect(view.outgoing).toHaveLength(0);
    expect(view.declined).toHaveLength(1);
  });

  it("never mixes up a stranger's request", () => {
    const pending = record();
    const view = splitFriendRequests([pending], "c@example.com");

    expect(view.incoming).toHaveLength(0);
    expect(view.outgoing).toHaveLength(0);
  });

  it("orders incoming requests newest first", () => {
    const older = record({ id: "x~z", toEmail: "c@example.com", updatedAt: 10 });
    const newer = record({ id: "y~z", toEmail: "c@example.com", updatedAt: 99 });
    const view = splitFriendRequests([older, newer], "c@example.com");

    expect(view.incoming.map((item) => item.id)).toEqual(["y~z", "x~z"]);
  });
});
