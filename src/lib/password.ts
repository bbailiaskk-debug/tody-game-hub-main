const PEPPER = "tody-game-hub-v1";

export async function hashPassword(password: string, salt?: string) {
  const safePassword = String(password ?? "");
  const safeSalt = salt ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const data = new TextEncoder().encode(`${safeSalt}:${PEPPER}:${safePassword}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return {
    hash,
    salt: safeSalt,
  };
}

export async function passwordMatches(
  candidate: string,
  passwordHash?: string,
  passwordSalt?: string,
) {
  if (!candidate || !passwordHash || !passwordSalt) {
    return false;
  }

  const next = await hashPassword(candidate, passwordSalt);
  return next.hash === passwordHash;
}
