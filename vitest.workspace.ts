import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";
import { TEST_DATABASE_URL } from "./src/test/env";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Two suites:
 *   unit        — pure logic, no infrastructure. `pnpm test`.
 *   integration — real Postgres, so the DB triggers that carry Bunsho's audit
 *                 guarantees are actually exercised. `pnpm test:db`.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "unit",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
      exclude: ["src/**/*.db.test.ts", "**/node_modules/**"],
    },
  },
  {
    resolve: { alias },
    test: {
      name: "integration",
      environment: "node",
      include: ["src/**/*.db.test.ts"],
      globalSetup: ["./src/test/global-setup.ts"],
      setupFiles: ["./src/test/setup-db.ts"],
      // One shared database: a single fork runs every file sequentially in one
      // process, so the per-test TRUNCATE can't pull the rug from under a
      // concurrently-running file.
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      env: { DATABASE_URL: TEST_DATABASE_URL },
      testTimeout: 20_000,
      hookTimeout: 60_000,
    },
  },
]);
