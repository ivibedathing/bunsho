import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets jsx: "preserve" for Next's compiler, leaving JSX intact.
  // Vite transforms with Oxc, which follows that setting, so without this any
  // .tsx reachable from a test is emitted with JSX still in it and fails to
  // parse. React 19 uses the automatic runtime.
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
