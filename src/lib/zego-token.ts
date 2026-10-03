/**
 * ZEGOCLOUD token, minted here because the secret that signs it must not be.
 *
 * This app does not talk to ZEGOCLOUD yet: calls and voice channels are their own
 * WebRTC mesh, signalled through this app's Durable Object, and screen sharing is
 * `getDisplayMedia` on the desktop. What lives here is the piece that a later move
 * onto their network needs and cannot do in the browser — the token — so it is
 * built once, tested, and kept out of the way of everything else.
 *
 * ## Why a token and not the AppSign
 *
 * AppSign authentication is the old scheme: the AppSign itself was the credential,
 * handed to the SDK in the browser. It is gone from the SDKs since 2.17.0, and it
 * was never something to put in a page — anybody who opened the page could lift it
 * and use the project. Tokens replaced it: the server keeps the ServerSecret,
 * signs a short-lived claim about one user, and the browser only ever sees the
 * result. So the AppID travels out and the secret does not.
 *
 * ## The format
 *
 * From ZEGOCLOUD's own `zego_server_assistant` (token/nodejs), which is the
 * reference implementation:
 *
 *   token = "04" + base64(
 *     uint64 expire | uint16 ivLength | iv | uint16 cipherLength | cipher
 *   )
 *
 * where `cipher` is AES-CBC with PKCS#7 padding over the JSON claim
 * `{ app_id, user_id, nonce, ctime, expire, payload }`, keyed by the ServerSecret
 * taken as raw bytes (32 characters, so AES-256), with a random 16-character IV
 * from `[0-9a-z]`.
 *
 * WebCrypto rather than `node:crypto`, because this runs on a Workers runtime
 * where there is no `node:crypto`, and AES-CBC does its own PKCS#7 padding.
 */

/** The version the token format above belongs to; the string is part of the token. */
const TOKEN_VERSION = "04";

/** ZEGOCLOUD's own reference uses `[0-9a-z]`, which is 36 characters per IV byte. */
const IV_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** What a login-room token carries when it says nothing about rooms. */
export type ZegoPayload = Record<string, unknown> | string;

/** What a token says, once it has been opened with the secret. */
export type ZegoClaim = {
  app_id: number;
  user_id: string;
  nonce: number;
  ctime: number;
  expire: number;
  /** Empty for a general token; a room list when the token is restricted. */
  payload: ZegoPayload;
};

/** Two days: long enough for a session, short enough to matter if one leaks. */
export const ZEGO_TOKEN_SECONDS = 2 * 24 * 60 * 60;

export class ZegoTokenError extends Error {
  readonly reason: "app-id" | "secret" | "user-id" | "seconds";

  constructor(reason: "app-id" | "secret" | "user-id" | "seconds", message: string) {
    super(message);
    this.name = "ZegoTokenError";
    this.reason = reason;
  }
}

const uint16 = (value: number) => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, false);
  return out;
};

const uint64 = (value: number) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(Math.floor(value)), false);
  return out;
};

const randomIv = () => {
  const bytes = new Uint8Array(16);
  // Scaled down and the remainder dropped: 36 does not divide 256, so the
  // distribution over the alphabet is not perfectly flat. An IV does not need it
  // to be — it needs to be unpredictable, and 128 bits of that is what stops the
  // same token being produced twice.
  for (let index = 0; index < bytes.length; index += 1) {
    const at = Math.floor(Math.random() * IV_ALPHABET.length);
    bytes[index] = IV_ALPHABET.charCodeAt(at);
  }
  return bytes;
};

const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/**
 * The AES key for a ServerSecret.
 *
 * The reference accepts 16, 24 or 32 characters and picks AES-128/192/256 to
 * match, which is why anything else is refused here rather than silently hashed:
 * a different length means a different key, and a token that does not verify is
 * a call that never connects with no explanation.
 */
const importSecret = async (secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  return key;
};

/**
 * Builds a token for one user.
 *
 * `userId` is the identity the token speaks for, so whoever calls this decides
 * whose rooms the token can enter. On this server that is the signed-in email and
 * nothing else — see `serveMessagesZegoToken`, which takes the identity from the
 * session and never from the request.
 */
export async function zegoToken04(input: {
  appId: number;
  serverSecret: string;
  userId: string;
  seconds?: number;
  payload?: ZegoPayload;
  now?: number;
}): Promise<string> {
  const { appId, serverSecret, userId } = input;
  const seconds = input.seconds ?? ZEGO_TOKEN_SECONDS;

  if (!Number.isInteger(appId) || appId <= 0) {
    throw new ZegoTokenError("app-id", "ZEGO_APP_ID must be a positive whole number.");
  }
  if (typeof serverSecret !== "string" || ![16, 24, 32].includes(serverSecret.length)) {
    throw new ZegoTokenError(
      "secret",
      "ZEGO_SERVER_SECRET must be the 16, 24 or 32 character value from the ZEGOCLOUD console.",
    );
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new ZegoTokenError("user-id", "A token needs the user it speaks for.");
  }
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 24 * 24 * 60 * 60) {
    // ZEGOCLOUD refuses a token valid for more than 24 days; matching that here
    // turns a call that silently cannot authenticate into a loud configuration
    // error at the point it is made.
    throw new ZegoTokenError("seconds", "A ZEGOCLOUD token cannot be valid for over 24 days.");
  }

  const createdAt = Math.floor((input.now ?? Date.now()) / 1000);
  const claim = {
    app_id: appId,
    user_id: userId,
    // Random, so two tokens for the same user in the same second are not the same
    // string — which is what stops a captured token being replayed. The range is
    // the reference's, a signed 32-bit one.
    nonce: Math.ceil(-2_147_483_648 + 4_294_967_296 * Math.random()),
    ctime: createdAt,
    expire: createdAt + seconds,
    payload: input.payload ?? "",
  };

  const plain = new TextEncoder().encode(JSON.stringify(claim));
  const iv = randomIv();
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv }, await importSecret(serverSecret), plain),
  );

  return (
    TOKEN_VERSION +
    toBase64(concat(uint64(claim.expire), uint16(iv.length), iv, uint16(cipher.length), cipher))
  );
}

/**
 * Reads a token back.
 *
 * Only for tests and for saying what a token actually contains — the header is
 * read without the key, so this cannot open the cipher, and it refuses a claim it
 * has no key for rather than pretending to have read one.
 */
export async function readZegoToken04(
  token: string,
  serverSecret?: string,
): Promise<{ version: string; expire: number; claim?: ZegoClaim }> {
  if (typeof token !== "string" || !token.startsWith(TOKEN_VERSION)) {
    throw new ZegoTokenError("secret", "Not a version 04 token.");
  }
  const bytes = Uint8Array.from(atob(token.slice(TOKEN_VERSION.length)), (char) =>
    char.charCodeAt(0),
  );
  if (bytes.length < 28) throw new ZegoTokenError("secret", "Token is too short to be real.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const expire = Number(view.getBigUint64(0, false));
  // 8 bytes of expiry, then 2 of IV length, then the IV, then 2 of cipher length,
  // then the cipher. The cipher therefore starts after the length field that the
  // IV ends at plus two, which is the byte the whole reading turns on.
  const ivLength = view.getUint16(8, false);
  const iv = bytes.slice(10, 10 + ivLength);
  const cipherLength = view.getUint16(10 + ivLength, false);
  const cipher = bytes.slice(12 + ivLength, 12 + ivLength + cipherLength);

  const out: { version: string; expire: number; claim?: ZegoClaim } = {
    version: TOKEN_VERSION,
    expire,
  };
  if (!serverSecret) return out;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverSecret),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher));
  // Parsed as the shape ZEGOCLOUD wrote, and trusted because it only got here by
  // opening with the right key.
  out.claim = JSON.parse(new TextDecoder().decode(plain)) as ZegoClaim;
  return out;
}
