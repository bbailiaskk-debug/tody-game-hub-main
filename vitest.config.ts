import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/nginx-proxy-manager-2.15.1/**",
      "**/dist/**",
    ],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "cloudflare:workers": fileURLToPath(
        new URL("./src/test/mocks/cloudflare-workers.ts", import.meta.url),
      ),
    },
  },
});