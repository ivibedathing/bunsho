import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./src/test/env";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// tsconfig sets `jsx: preserve` for Next, which would leave JSX untransformed
// and fail Vite's import analysis. Vite 8 transforms via Oxc, so the override
// goes here rather than in the tsconfig Next depends on.
const oxc = { jsx: { runtime: "automatic" } } as const;

/**
 * Two suites:
 *   unit        — pure logic, no infrastructure. `pnpm test`.
 *   integration — real Postgres, so the DB triggers that carry Bunsho's audit
 *                 guarantees are actually exercised. `pnpm test:db`.
 *
 * Coverage is defined once at the root and reported over the union of both.
 */
export default defineConfig({
  oxc,
  resolve: { alias },
  test: {
    projects: [
      {
        oxc,
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["src/**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        oxc,
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["./src/test/global-setup.ts"],
          setupFiles: ["./src/test/setup-db.ts"],
          pool: "forks",
          // One shared database, so files must not run concurrently: the
          // per-test TRUNCATE would pull the rug from under a parallel file.
          // `false` pins maxWorkers to 1. (Vitest 4 removed `poolOptions`; a
          // nested `singleFork` here is silently ignored, which shows up as
          // hundreds of failures rather than a config error.)
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL },
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "html"],
      reportsDirectory: "coverage",
      // The business logic. UI components and route handlers are out of scope
      // for this suite; `src/lib` is where the invariants live.
      include: ["src/lib/**"],
      exclude: [
        "src/generated/**",
        "src/test/**",
        "src/**/*.test.ts",
        // Thin, generated, or environment-bound edges with no logic to assert:
        // the Prisma singleton, the pg-boss wiring, and the LLM SDK wrapper.
        "src/lib/db.ts",
        "src/lib/jobs/**",
        "src/lib/ai/anthropic.ts",
      ],
    },
  },
});
