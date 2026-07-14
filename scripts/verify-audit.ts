/**
 * `verify-audit` — walk every organization's audit hash chain and confirm it is
 * intact (PRD §7 F7). Exits non-zero if any chain is broken, so it can gate CI,
 * backups, or a scheduled integrity check.
 *
 *   pnpm verify-audit
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { verifyOrgChain } from "../src/lib/audit/writer";

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    if (orgs.length === 0) {
      console.log("No organizations found — nothing to verify.");
      return 0;
    }

    let failures = 0;
    for (const org of orgs) {
      const result = await verifyOrgChain(prisma, org.id);
      if (result.ok) {
        console.log(`✔ ${org.name} (${org.id}): ${result.count} entries, chain intact`);
      } else {
        failures++;
        console.error(
          `✘ ${org.name} (${org.id}): BROKEN at seq ${result.brokenAtSeq} — ${result.reason}`,
        );
      }
    }

    if (failures > 0) {
      console.error(`\n${failures} organization(s) failed audit verification.`);
      return 1;
    }
    console.log(`\nAll ${orgs.length} chain(s) verified.`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
