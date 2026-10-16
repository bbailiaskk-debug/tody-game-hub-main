import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suite was colocated under src/lib and src/components and reached its
    // modules through relative paths; in this tree those paths are flat.
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "components/**/*.test.ts?(x)"],
    exclude: ["**/node_modules/**", ".next/**"],
    globals: false,
    // Most of the suite is plain logic and runs in node. The handful that render
    // React or read the DOM opt into jsdom with a `@vitest-environment` docblock.
    environment: "node",

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
     * Carried over verbatim from the original vitest.config.ts — it is not a
     * performance setting, it is the suite's correctness condition.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      /*
       * `server-only` exists to make a mistake loud: importing a server module
       * into a client component throws at build time. Under vitest there is no
       * client/server split, so the marker is stubbed out and the modules it
       * guards are imported directly — which is exactly what the tests want.
       *
       * The original config aliased `cloudflare:workers` to a mock instead;
       * that import is gone entirely now that storage resolves through
       * `lib/kv.ts`, so there is nothing left to mock.
       */
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
});