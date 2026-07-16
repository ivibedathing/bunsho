import { appendAudit } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

/** True once any user exists — first-run setup is only offered before that. */
export async function usersExist(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

export interface FirstAdminInput {
  email: string;
  name: string;
  password: string;
}

/**
 * First-run bootstrap: create the single organization (if absent) and the first
 * Admin, all in one transaction. The admin creation is the *genesis* audit entry
 * — the first link in the tamper-evident chain (DECISIONS.md). Re-checks the empty
 * precondition inside the transaction so a double-submit can't create two admins.
 */
export async function createFirstAdmin(input: FirstAdminInput): Promise<void> {
  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) {
      throw new Error("Setup already completed");
    }

    const org =
      (await tx.organization.findFirst()) ??
      (await tx.organization.create({ data: { name: process.env.ORG_NAME ?? "Bunsho" } }));

    const admin = await tx.user.create({
      data: {
        orgId: org.id,
        email: input.email,
        name: input.name,
        role: "admin",
        active: true,
        passwordHash,
      },
    });

    await appendAudit(tx, {
      orgId: org.id,
      action: "user_created",
      actorType: "system",
      actorId: null,
      targetType: "user",
      targetId: admin.id,
      metadata: { role: "admin", email: input.email, bootstrap: true },
    });
  });
}
