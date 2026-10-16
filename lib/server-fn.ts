/**
 * Client-side stand-in for TanStack Start's `createServerFn`.
 *
 * Every server function in the Vite build was declared with
 *
 *   export const serverRegister = createServerFn({ method: "POST" })
 *     .validator((data: RegisterInput) => data)
 *     .handler(async ({ data }) => { ... })
 *
 * and called from the client as `serverRegister({ data })`. TanStack derived the
 * URL from the function name and shipped the request over its own transport.
 * App Router has no equivalent, so the declaration moved to `serverFn("/api/...")`
 * — the call sites are unchanged, only the declaration line moved.
 *
 * The handlers themselves live in `*-server.ts` modules and are reached through
 * `app/api/[...path]/route.ts`. That split is deliberate: if the client shim
 * imported its own handler, the body of every one of them — password hashing,
 * the Stripe secret, the Gemini key — would be in the browser bundle.
 */

export type ServerFn<TIn, TOut> = (opts: { data: TIn }) => Promise<TOut>;

/** The argument a handler takes, or `void` when it takes none. */
export type InputOf<T> = T extends (arg: infer A) => unknown ? A : void;

async function postJson<TIn, TOut>(route: string, data: TIn): Promise<TOut> {
  const response = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data ?? {}),
  });

  const payload = (await response.json().catch(() => null)) as (TOut & { error?: string }) | null;

  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(detail ?? `${route} failed with ${response.status}`);
  }

  return payload as TOut;
}

export function serverFn<TIn, TOut>(route: string): ServerFn<TIn, TOut> {
  return ({ data }) => postJson<TIn, TOut>(route, data);
}

/**
 * The form the ported modules actually use: the route's types are taken from the
 * server handler it fronts.
 *
 *   import type { serverRegister as _impl } from "@/lib/auth-functions-server";
 *   export const serverRegister = serverFnFor<typeof _impl>("/api/auth/register");
 *
 * `typeof _impl` in an `import type` position is erased at build time, so this
 * inherits the handler's real input and output types without pulling a single
 * line of it into the browser bundle. Spelling the types out by hand instead
 * would be a second, silently drifting copy of every signature.
 */
export function serverFnFor<T extends (...args: never[]) => unknown>(
  route: string,
): (opts: { data: InputOf<T> }) => Promise<Awaited<ReturnType<T>>> {
  return ({ data }) => postJson<InputOf<T>, Awaited<ReturnType<T>>>(route, data);
}

/**
 * Same URL, same call signature, but issued as a GET. Nothing in the ported app
 * needs one yet; it exists so a future `method: "GET"` server function does not
 * have to be built from `fetch` by hand.
 */
export function serverGetFn<TOut>(route: string): () => Promise<TOut> {
  return async () => {
    const response = await fetch(route, { method: "GET" });
    const payload = (await response.json().catch(() => null)) as TOut | null;
    if (!response.ok) throw new Error(`${route} failed with ${response.status}`);
    return payload as TOut;
  };
}