import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/nginx-proxy-manager-2.15.1/**", "**/dist/**"],
    /**
     * One file at a time, because these tests share state on purpose.
     *
     * The view tests drive the real `messagesStore` singleton: the page is
     * rendered against the same object the production code talks to, which is
     * the only reason a click on a contact can be followed all the way to the
     * cloud. That object outlives a file, so two of those files running at the
     * same time see each other's conversations, and the result is a suite that
     * is red on a Tuesday and green on a Wednesday with no change in between.
     *
     * A flaky suite is worse than a slow one, because it teaches people to
     * re-run instead of read, and a failure that comes and goes is a failure
     * nobody is looking for. The whole suite is well inside a minute, so the
     * files are run in sequence instead.
     */
    fileParallelism: false,
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "cloudflare:workers": fileURLToPath(
        new URL("./src/test/mocks/cloudflare-workers.ts", import.meta.url),
      ),
    },
  },
});
