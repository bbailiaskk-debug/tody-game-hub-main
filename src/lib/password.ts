const PEPPER = "tody-game-hub-v1";
const PBKDF2_ITERATIONS = 100_000;

const toHex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");

const hashLegacyPassword = async (password: string, salt: string) => {
  const data = new TextEncoder().encode(`${salt}:${PEPPER}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
};

export async function hashPassword(password: string, salt?: string) {
  const safePassword = String(password ?? "");
  const safeSalt = salt ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${PEPPER}:${safePassword}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(safeSalt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return {
    hash: toHex(derivedKey),
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
  if (next.hash === passwordHash) {
    return true;
  }

  const legacyHash = await hashLegacyPassword(candidate, passwordSalt);
  return legacyHash === passwordHash;
}
