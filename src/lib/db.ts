import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Reuse a single PrismaClient across hot reloads in development to avoid
// exhausting the Postgres connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 dropped the Rust query engine; a driver adapter is now required.
// `connectionString` is passed through unchecked on purpose — `pnpm build`
// evaluates this module with no DATABASE_URL, so an eager throw here would
// fail the build rather than the connection.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
