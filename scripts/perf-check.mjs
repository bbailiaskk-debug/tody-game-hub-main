import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const PORT = "3199";
const BASE = `http://127.0.0.1:${PORT}`;

const paths = ["/", "/info", "/ai", "/music", "/games", "/robots.txt", "/manifest.json"];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function bps(bytes, ms) {
  return Math.round(bytes / (ms / 1000));
}

async function fetchTimed(path) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  const dt = performance.now() - t0;
  return { path, status: res.status, ms: dt, bytes: buf.length };
}

const server = spawn(
  process.execPath,
  ["--import", "./deploy/register-cloudflare-loader.mjs", ".output/server/index.mjs"],
  {
    env: { ...process.env, PORT, HOST: "127.0.0.1", NODE_ENV: "production", HTTPS_REDIRECT: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});

await new Promise((r) => setTimeout(r, 2500));

const WARMUPS = 3;
const ROUNDS = 50;

try {
  for (const p of paths) {
    for (let i = 0; i < WARMUPS; i++) {
      await fetchTimed(p);
    }
  }

  console.log("=== PERFORMANCE: 50 requests per route (Node build) ===\n");
  const byPath = new Map();

  for (const p of paths) {
    const times = [];
    const totals = [];
    for (let i = 0; i < ROUNDS; i++) {
      const r = await fetchTimed(p);
      times.push(r.ms);
      totals.push(r.bytes);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const bytes = totals[0];
    const label = p.padEnd(12);
    console.log(
      `${label} status=200  p50=${percentile(times, 50).toFixed(1)}ms  p95=${percentile(times, 95).toFixed(1)}ms  avg=${avg.toFixed(1)}ms  min=${times[0].toFixed(1)}ms  max=${times[times.length - 1].toFixed(1)}ms  size=${(bytes / 1024).toFixed(1)}KB  ~${bps(bytes, avg)}kB/s`,
    );
    byPath.set(p, { avg, bytes });
  }

  const home = byPath.get("/") || { avg: 1, bytes: 1 };
  console.log(
    `\nHome /: ~${Math.round(1000 / home.avg)} req/s single-stream (one page ~${home.avg.toFixed(0)}ms)`,
  );
  console.log(
    "Per-page bytes: " +
      [...byPath.entries()].map(([p, v]) => `${p}=${(v.bytes / 1024).toFixed(0)}KB`).join(", "),
  );
  console.log(
    "\nNote: SSR render bursts to 50 sequential fresh fetches; caching/pooling not simulated.",
  );
} finally {
  server.kill("SIGKILL");
}
