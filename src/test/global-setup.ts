import { execFileSync } from "node:child_process";
import { adminUrl, assertScratchDatabase, databaseName, TEST_DATABASE_URL } from "./env";

/**
 * Provision the scratch database once per `vitest` run: create it if absent, then
 * apply the migrations so the schema *and its triggers* match production.
 */
export default function setup() {
  assertScratchDatabase(TEST_DATABASE_URL);
  const name = databaseName(TEST_DATABASE_URL);

  try {
    // CREATE DATABASE cannot run inside a transaction block, so it goes through
    // the maintenance database on its own.
    // Prisma 7 removed `db execute --url`; the URL now comes from
    // prisma.config.ts, which reads DATABASE_URL — so override it for this
    // call alone to reach the maintenance database.
    execFileSync("pnpm", ["exec", "prisma", "db", "execute", "--stdin"], {
      input: `CREATE DATABASE "${name}";`,
      env: { ...process.env, DATABASE_URL: adminUrl(TEST_DATABASE_URL) },
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (e) {
    // Already exists is the normal steady state; anything else is real.
    const err = e as { stdout?: string; stderr?: string };
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (!/already exists/i.test(out))
      throw new Error(`Could not create ${name}: ${out || String(e)}`);
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}
