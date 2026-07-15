/**
 * Connection details for the integration test database.
 *
 * Integration tests run against a real Postgres — the triggers in
 * `prisma/migrations/*_audit_triggers` (append-only audit log, frozen published
 * versions, one-draft-per-document) are the product's core guarantees and a
 * mocked client cannot exercise them.
 *
 * The target is a scratch database, never the dev/prod one: these tests TRUNCATE
 * every table between cases. `TEST_DATABASE_URL` overrides the default, which is
 * what CI sets.
 */

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://bunsho:bunsho@localhost:5432/bunsho_test?schema=public";

/** The maintenance URL used to CREATE DATABASE — same server, `postgres` db. */
export function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  u.search = "";
  return u.toString();
}

/** The scratch database's name, parsed out of the URL. */
export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/**
 * Guard against pointing the suite at a real database. The tests truncate
 * everything, so a misconfigured URL would wipe dev data (the dev DB is shared
 * with the local prod container).
 */
export function assertScratchDatabase(url: string): void {
  const name = databaseName(url);
  if (!/(^|_)test($|_)|_test\d*$|^test/.test(name)) {
    throw new Error(
      `Refusing to run integration tests against database "${name}": the name must identify it as a scratch database (e.g. bunsho_test). These tests TRUNCATE every table.`,
    );
  }
}
