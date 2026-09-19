import { fileURLToPath } from "node:url";

const shimPath = fileURLToPath(new URL("./cloudflare-workers-shim.mjs", import.meta.url));

export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") {
    return {
      url: new URL("./cloudflare-workers-shim.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}
