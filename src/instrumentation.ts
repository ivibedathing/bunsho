/**
 * Next.js instrumentation hook — runs once at server startup. Starts the pg-boss
 * check worker + schedule only when explicitly enabled, so builds, tests, and
 * default deployments don't spin up a background worker (or the `pgboss` schema).
 * Enable scheduled AI checks with AI_SCHEDULED_CHECKS=true (and AI_SCAN_CRON).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AI_SCHEDULED_CHECKS !== "true") return;

  const { startCheckWorker } = await import("@/lib/jobs/worker");
  await startCheckWorker();
}
