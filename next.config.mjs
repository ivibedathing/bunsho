import { fileURLToPath } from "node:url";

const workerModule = fileURLToPath(new URL("./src/lib/jobs/worker.ts", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single self-contained server bundle for the one Docker image (PRD §8).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // pg-boss (and its pg dependency) must stay a runtime require — bundling it
  // breaks the instrumentation compile in dev ("Can't resolve 'fs'").
  serverExternalPackages: ["pg-boss"],
  webpack: (config, { nextRuntime }) => {
    // instrumentation.ts is also compiled for the edge runtime, where the
    // pg-boss worker can never run (guarded by NEXT_RUNTIME) but its Node-only
    // module graph (pg, node:crypto, …) still fails to resolve.
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/lib/jobs/worker": false,
        [workerModule]: false,
      };
    }
    return config;
  },
};

export default nextConfig;
