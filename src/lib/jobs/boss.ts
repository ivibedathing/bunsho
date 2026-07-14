import { PgBoss } from "pg-boss";

/**
 * Background job queue on Postgres (PRD §8 — pg-boss, no Redis/separate queue).
 * Used for scheduled document checks. A single boss instance per process, started
 * lazily. pg-boss keeps its own `pgboss` schema, separate from the app tables.
 */

export const CHECK_QUEUE = "document-checks";

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (!starting) {
    starting = (async () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is required for pg-boss");
      const b = new PgBoss({ connectionString });
      await b.start();
      await b.createQueue(CHECK_QUEUE);
      boss = b;
      return b;
    })();
  }
  return starting;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: false });
    boss = null;
    starting = null;
  }
}
