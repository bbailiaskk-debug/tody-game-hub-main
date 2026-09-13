// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: true,
      allowedHosts: true,
    },
    plugins: [
      {
        name: "cloudflare-workers-dev-env",
        apply: "serve",
        enforce: "pre",
        resolveId(id) {
          if (id === "cloudflare:workers") return "\0cloudflare-workers";
          return undefined;
        },
        load(id) {
          if (id !== "\0cloudflare-workers") return;
          return [
            "const processEnv = typeof process !== 'undefined' && process.env ? process.env : {};",
            "export const env = processEnv;",
          ].join("\n");
        },
      },
    ],
    build: {
      rollupOptions: {
        external: ["cloudflare:workers"],
      },
    },
  },
});
