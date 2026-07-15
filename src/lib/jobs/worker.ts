import { runDocumentChecks } from "@/lib/checks";
import { prisma } from "@/lib/db";
import { CHECK_QUEUE, getBoss } from "./boss";

/** Run staleness/reference checks for every org — the scheduled job body. */
export async function runScheduledChecks(): Promise<{ orgs: number; created: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let created = 0;
  for (const org of orgs) {
    const result = await runDocumentChecks(org.id, { origin: "scheduled" });
    created += result.created;
  }
  return { orgs: orgs.length, created };
}

/**
 * Register the check worker and, when `AI_SCAN_CRON` is set, the recurring
 * schedule (Admin-configurable cadence, DECISIONS.md). Called once at server start
 * from instrumentation.ts, guarded by `AI_SCHEDULED_CHECKS`.
 */
export async function startCheckWorker(): Promise<void> {
  const boss = await getBoss();
  await boss.work(CHECK_QUEUE, async () => {
    await runScheduledChecks();
  });

  const cron = process.env.AI_SCAN_CRON;
  if (cron) {
    await boss.schedule(CHECK_QUEUE, cron);
  }
}

/** Enqueue a one-off scheduled-style run (used by an Admin "run now" trigger). */
export async function enqueueCheckRun(): Promise<void> {
  const boss = await getBoss();
  await boss.send(CHECK_QUEUE, {});
}
