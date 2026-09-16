import { readFile, writeFile } from "node:fs/promises";

const headersPath = ".output/public/_headers";
const baseHeaders = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-XSS-Protection: 0
  Vary: Accept-Encoding

/assets/*
  Cache-Control: public, max-age=2592000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
  CDN-Cache-Control: max-age=31536000
  Access-Control-Allow-Origin: *

/images/*
  Cache-Control: public, max-age=2592000, immutable
  CDN-Cache-Control: max-age=2592000

/favicon.ico
  Cache-Control: public, max-age=86400
  CDN-Cache-Control: max-age=86400

/robots.txt
  Cache-Control: public, max-age=86400
  CDN-Cache-Control: max-age=86400

/site.webmanifest
  Cache-Control: public, max-age=86400
  CDN-Cache-Control: max-age=86400

/.well-known/assetlinks.json
  Content-Type: application/json
  Cache-Control: no-store, must-revalidate
  CDN-Cache-Control: no-store

/sw.js
  Content-Type: application/javascript
  Cache-Control: no-cache, max-age=0, must-revalidate
  CDN-Cache-Control: no-cache, max-age=0, must-revalidate

/sitemap.xml
  Content-Type: application/xml; charset=utf-8
  Cache-Control: public, max-age=3600
  CDN-Cache-Control: max-age=3600
`;

let generatedHeaders;
try {
  generatedHeaders = await readFile(headersPath, "utf8");
} catch {
  generatedHeaders = baseHeaders;
}

const normalizedHeaders = generatedHeaders
  .replace(/\r\n/g, "\n")
  .replace(
    /\n\/assets\/\*\n\s+cache-control:\s+public,\s+max-age=31536000,\s+immutable\s*$/gim,
    "\n/assets/*\n  Cache-Control: public, max-age=2592000, immutable\n",
  )
  .replace(/\n\/assets\/\*\n\s+cache-control:\s+public,\s+max-age=2592000,\s+immutable\s*$/gim, "\n")
  .replace(/\n\/assets\/\*\n\s+cache-control:\s+public,\s+max-age=86400,\s+immutable\s*$/gim, "\n")
  .replace(/\n\/assets\/\*\n\s+cache-control:\s+public,\s+max-age=1,\s+immutable\s*$/gim, "\n")
  .trimEnd();

const finalHeaders = normalizedHeaders.includes("/assets/*")
  ? normalizedHeaders
  : `${baseHeaders.trimEnd()}\n\n${normalizedHeaders.trimStart()}`;

if (finalHeaders !== generatedHeaders.replace(/\r\n/g, "\n").trimEnd()) {
  await writeFile(headersPath, `${finalHeaders}\n`, "utf8");
}
