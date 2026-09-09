import { createServerFn } from "@tanstack/react-start";

import { getChessSecret, getRegisteredUser, mintChessToken, normalizeEmail } from "./chess-auth";

export const serverTicTacToeAuth = createServerFn({ method: "POST" })
  .validator((data: { gameId: string; email: string }) => data)
  .handler(async ({ data }) => {
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
  });
