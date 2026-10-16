import { serverFnFor } from "@/lib/server-fn";
/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverTicTacToeAuth as _serverTicTacToeAuth } from "@/lib/tictactoe-server-server";
export const serverTicTacToeAuth = serverFnFor<typeof _serverTicTacToeAuth>("/api/tictactoe/auth");
