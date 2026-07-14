/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single self-contained server bundle for the one Docker image (PRD §8).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
