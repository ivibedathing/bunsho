import type { ActorType, AuditAction, Prisma, PrismaClient } from "@/generated/prisma/client";
import { Prisma as PrismaNS } from "@/generated/prisma/client";
import {
  type CanonicalAuditRow,
  computeEntryHash,
  type StoredAuditEntry,
  type VerifyResult,
  verifyChain,
} from "./hashChain";

export interface AppendAuditInput {
  orgId: string;
  action: AuditAction;
  actorType: ActorType;
  actorId?: string | null;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
}

/**
 * Append one entry to an org's audit chain. MUST run inside a transaction: it
 * takes a per-org advisory lock so two concurrent appends cannot read the same
 * `prevHash` and fork the chain. The lock releases when the transaction ends.
 *
 * The hash is computed before insert (the row is UPDATE-blocked, so it can never
 * be backfilled), committing to `prevHash` + the canonical row content.
 */
export async function appendAudit(
  tx: Prisma.TransactionClient,
  input: AppendAuditInput,
): Promise<{ seq: bigint; hash: string }> {
  // Serialize appends for this org. hashtext() maps the org id to the int key
  // that pg_advisory_xact_lock expects.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orgId}))`;

  const last = await tx.auditLogEntry.findFirst({
    where: { orgId: input.orgId },
    orderBy: { seq: "desc" },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? null;

  const createdAt = new Date();
  const actorId = input.actorId ?? null;
  const targetId = input.targetId ?? null;
  const metadata = input.metadata ?? null;

  const row: CanonicalAuditRow = {
    orgId: input.orgId,
    action: input.action,
    actorType: input.actorType,
    actorId,
    targetType: input.targetType,
    targetId,
    metadata,
    createdAt: createdAt.toISOString(),
  };
  const hash = computeEntryHash(prevHash, row);

  const created = await tx.auditLogEntry.create({
    data: {
      orgId: input.orgId,
      action: input.action,
      actorType: input.actorType,
      actorId,
      targetType: input.targetType,
      targetId,
      // Store SQL NULL (not JSON null) when absent so reads round-trip to `null`.
      metadata: metadata === null ? PrismaNS.DbNull : (metadata as Prisma.InputJsonValue),
      prevHash,
      hash,
      createdAt,
    },
    select: { seq: true, hash: true },
  });

  return created;
}

/** Read an org's full chain in `seq` order and map it to the pure-verify shape. */
export async function loadChain(client: PrismaClient, orgId: string): Promise<StoredAuditEntry[]> {
  const rows = await client.auditLogEntry.findMany({
    where: { orgId },
    orderBy: { seq: "asc" },
  });
  return rows.map((r) => ({
    seq: r.seq,
    prevHash: r.prevHash,
    hash: r.hash,
    orgId: r.orgId,
    action: r.action,
    actorType: r.actorType,
    actorId: r.actorId,
    targetType: r.targetType,
    targetId: r.targetId,
    // DbNull reads back as JS null.
    metadata: r.metadata ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Verify an org's on-disk audit chain end to end. */
export async function verifyOrgChain(client: PrismaClient, orgId: string): Promise<VerifyResult> {
  return verifyChain(await loadChain(client, orgId));
}
