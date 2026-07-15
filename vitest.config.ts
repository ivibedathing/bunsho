import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Root config. The suites themselves are defined in `vitest.workspace.ts`
 * (unit + integration); what lives here is shared across both — notably
 * coverage, which is reported over the union of the two runs.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
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
