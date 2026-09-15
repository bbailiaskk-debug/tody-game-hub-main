import { readFile, writeFile } from "node:fs/promises";

const headersPath = ".output/public/_headers";
const generatedHeaders = await readFile(headersPath, "utf8");
const normalizedHeaders = generatedHeaders.replace(
  /\r?\n\/assets\/\*\r?\n\s+cache-control:\s+public,\s+max-age=31536000,\s+immutable\s*$/gim,
  "\n",
);

if (normalizedHeaders !== generatedHeaders) {
  await writeFile(headersPath, normalizedHeaders, "utf8");
}
