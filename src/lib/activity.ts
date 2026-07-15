import type { AuditAction } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export interface ActivityItem {
  /** Audit seq as a string (bigint is not JSX-serializable). */
  seq: string;
  action: AuditAction;
  createdAt: Date;
  /** Resolved target document, when the entry concerns one that still exists. */
  document: { id: string; docCode: string; title: string } | null;
  metadata: Record<string, unknown> | null;
}

function documentIdOf(entry: {
  targetType: string;
  targetId: string | null;
  metadata: unknown;
}): string | null {
  if (entry.targetType === "document" && entry.targetId) return entry.targetId;
  const meta = entry.metadata as Record<string, unknown> | null;
  return typeof meta?.documentId === "string" ? meta.documentId : null;
}

/**
 * A user's recent actions, read straight from the audit log (the same
 * hash-chained entries `bunsho audit verify` checks — no separate feed table).
 * Document targets are resolved in one batch; deleted documents resolve null.
 */
export async function recentActivityByUser(
  orgId: string,
  userId: string,
  limit = 50,
): Promise<ActivityItem[]> {
  const entries = await prisma.auditLogEntry.findMany({
    where: { orgId, actorId: userId },
    orderBy: { seq: "desc" },
    take: limit,
  });

  const docIds = new Set<string>();
  for (const e of entries) {
    const id = documentIdOf(e);
    if (id) docIds.add(id);
  }
  const docs = await prisma.document.findMany({
    where: { orgId, id: { in: [...docIds] } },
    select: { id: true, docCode: true, title: true },
  });
  const byId = new Map(docs.map((d) => [d.id, d]));

  return entries.map((e) => {
    const docId = documentIdOf(e);
    return {
      seq: String(e.seq),
      action: e.action,
      createdAt: e.createdAt,
      document: docId ? (byId.get(docId) ?? null) : null,
      metadata: (e.metadata ?? null) as Record<string, unknown> | null,
    };
  });
}
