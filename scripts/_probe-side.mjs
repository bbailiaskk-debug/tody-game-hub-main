import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const PUBLIC = ".output/public";
const T = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
};
const assets = {
  async fetch(r) {
    const p = join(PUBLIC, decodeURIComponent(new URL(r.url).pathname).replace(/^\/+/, ""));
    try {
      if (!(await stat(p)).isFile()) throw 0;
      return new Response(await readFile(p), {
        headers: { "content-type": T[extname(p)] ?? "application/octet-stream" },
      });
    } catch {
      return new Response("nf", { status: 404 });
    }
  },
};
const w = await import(pathToFileURL(resolve(".output/server/index.mjs")).href);
const pages = {};
for (const r of ["/", "/messages"]) {
  pages[r] = await (
    await w.default.fetch(
      new Request("https://x" + r),
      { ASSETS: assets },
      { waitUntil() {}, passThroughOnException() {} },
    )
  ).text();
}
const files = new Map();
for (const f of await readdir(PUBLIC, { recursive: true }))
  files.set("/" + String(f).replace(/\\/g, "/"), join(PUBLIC, String(f).replace(/\\/g, "/")));
const srv = createServer(async (q, s) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (pages[p]) {
    s.writeHead(200, { "content-type": "text/html" });
    s.end(pages[p]);
    return;
  }
  const f = files.get(p);
  if (f) {
    try {
      s.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" });
      s.end(await readFile(f));
      return;
    } catch {}
  }
  s.writeHead(404).end();
});
const port = await new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv.address().port)));

const browser = await chromium.launch({ channel: "msedge" });

for (const [route, sel] of [
  ["/", ".site-sidebar"],
  ["/messages", ".discord-shell > [class*='hidden']"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
  if (!nodeId) {
    console.log(`\n${route} ${sel}: NOT FOUND`);
    await ctx.close();
    continue;
  }

  const m = await cdp.send("CSS.getMatchedStylesForNode", { nodeId });
  const display = [];
  for (const entry of m.matchedCSSRules) {
    const d = entry.rule.style.cssProperties.find((p) => p.name === "display");
    if (d) {
      display.push({
        selector: entry.rule.selectorList.text.slice(0, 70),
        value: d.value,
        origin: entry.rule.origin,
        media: entry.rule.media?.slice(0, 40) ?? "",
      });
    }
  }
  console.log(
    `\n${route} ${sel}  computed=${m.inlineStyle?.cssProperties?.find((p) => p.name === "display")?.value ?? ""}`,
  );
  console.log("  display declarations in match order:");
  display.forEach((d, i) =>
    console.log(
      `   ${i === display.length - 1 ? "->" : "  "} ${d.selector} = ${d.value}  [${d.origin}${d.media ? ", " + d.media : ""}]`,
    ),
  );

  // Also report the layer ordering the browser actually resolved.
  const layers = await page.evaluate(() => {
    const out = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules ?? []) {
        if (rule.constructor.name === "CSSLayerStatementRule")
          out.push("statement: " + rule.nameList.join(","));
      }
    }
    return out;
  });
  console.log("  layer statements:", JSON.stringify(layers));
  await ctx.close();
}
await browser.close();
srv.close();
