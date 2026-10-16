import { serverFnFor } from "@/lib/server-fn";
/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverAirHockeyAuth as _serverAirHockeyAuth } from "@/lib/airhockey-server-server";
export const serverAirHockeyAuth = serverFnFor<typeof _serverAirHockeyAuth>("/api/airhockey/auth");
