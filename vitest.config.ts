import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets `jsx: preserve` for Next, which would leave JSX untransformed
  // and fail Vite's import analysis. Vite 8 transforms via Oxc, so the override
  // goes here rather than in the tsconfig Next depends on.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
