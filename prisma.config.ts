import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the datasource URL out of `schema.prisma` and stopped loading
 * `.env` automatically, hence the dotenv import.
 *
 * `url` reads `process.env` directly rather than Prisma's own `env()` helper:
 * `env()` throws eagerly when the module body runs, which would break the two
 * places that generate a client with no database in scope — the Docker builder
 * stage and the `postinstall` hook in CI. Migration commands still resolve the
 * URL from the environment they're given; `generate` no longer needs one.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
