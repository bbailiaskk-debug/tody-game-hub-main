import { readFile, writeFile } from "node:fs/promises";

/**
 * Drop Nitro's auto-appended `/assets/*` rule from the generated _headers.
 *
 * Nitro appends `/assets/*` with `max-age=31536000, immutable` at the end of the
 * file, after ours. Last rule wins, so that one year overrides the 30 days
 * public/_headers asks for. Stripping it leaves the project rule in charge.
 *
 * Only the built copy is touched; public/_headers is left as written.
 */

const headersPath = ".output/public/_headers";
const nitroAssetsRule =
  /\r?\n\/assets\/\*\r?\n\s+cache-control:\s+public,\s+max-age=31536000,\s+immutable\s*$/gim;

const generatedHeaders = await readFile(headersPath, "utf8");
const normalizedHeaders = generatedHeaders.replace(nitroAssetsRule, "\n");

if (normalizedHeaders !== generatedHeaders) {
  await writeFile(headersPath, normalizedHeaders, "utf8");
} else {
  // Nitro has changed the shape of the rule it appends. Nothing is broken, but
  // the intended 30-day policy is silently not the one being served, so say so
  // rather than leaving it to be discovered in production.
  console.warn(
    "[normalize-asset-cache] no Nitro /assets/* rule found to strip; check what is overriding it.",
  );
}
