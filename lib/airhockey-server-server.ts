import "server-only";


import { getChessSecret, getRegisteredUser, mintChessToken, normalizeEmail } from "./chess-auth";


/**
 * Discriminated on `ok`, so a caller's `if (result.ok !== true) return`
 * narrows the rest of the object. See the note where this type is declared.
 */
export type GameAuthResult =
  | { ok: false; error: string }
  | { ok: true; token: string; email: string; name: string };

/* --- server handlers: reached only through app/api/[...path]/route.ts --- */

export const serverAirHockeyAuth = async (data: { gameId: string; email: string }): Promise<GameAuthResult> =>  {
    const gameId = (data.gameId ?? "").trim();
    const email = normalizeEmail(data.email ?? "");

    if (!gameId || !email) {
      return { ok: false, error: "invalid-request" };
    }

    const user = await getRegisteredUser(email);
    if (!user) {
      return { ok: false, error: "unauthorized" };
    }

    const secret = await getChessSecret();
    const token = await mintChessToken(secret, gameId, user.email);

    return { ok: true, token, email: user.email, name: user.name || email.split("@")[0] };
  }
