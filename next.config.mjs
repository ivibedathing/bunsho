import { fileURLToPath } from "node:url";

const workerModule = fileURLToPath(new URL("./src/lib/jobs/worker.ts", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single self-contained server bundle for the one Docker image (PRD §8).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Attachment uploads go through server actions; the default 1 MB body cap
  // would reject them. Headroom above MAX_ATTACHMENT_BYTES (20 MB).
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  // pg-boss (and its pg dependency) must stay a runtime require — bundling it
  // breaks the instrumentation compile in dev ("Can't resolve 'fs'").
  serverExternalPackages: ["pg-boss"],
  // Next 16 defaults to Turbopack, which ignores the webpack hook below and
  // errors out when it sees one. The alias is conditional on `nextRuntime`,
  // which Turbopack's static `resolveAlias` can't express — so `dev`/`build`
  // pass `--webpack` explicitly. Porting this to Turbopack means finding
  // another way to keep the worker out of the edge module graph.
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
