import { serverFnFor } from "@/lib/server-fn";
/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverChessAuth as _serverChessAuth } from "@/lib/chess-server-server";
export const serverChessAuth = serverFnFor<typeof _serverChessAuth>("/api/chess/auth");
