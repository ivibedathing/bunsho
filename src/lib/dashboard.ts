import { prisma } from "@/lib/db";

export interface DocumentStats {
  total: number;
  draftsInProgress: number;
  published: number;
  retired: number;
  pendingSuggestions: number;
}

/** Counts for the home dashboard (the home dashboard). */
export async function documentStats(orgId: string): Promise<DocumentStats> {
  const [total, draftsInProgress, published, retired, pendingSuggestions] = await Promise.all([
    prisma.document.count({ where: { orgId } }),
    // Documents with an open (unpublished) draft version — work in progress.
    prisma.document.count({ where: { orgId, versions: { some: { publishedAt: null } } } }),
    prisma.document.count({
      where: { orgId, currentPublishedVersionId: { not: null }, retiredAt: null },
    }),
    prisma.document.count({ where: { orgId, retiredAt: { not: null } } }),
    prisma.suggestion.count({ where: { orgId, status: "pending" } }),
  ]);
  return { total, draftsInProgress, published, retired, pendingSuggestions };
}

/** Most recently touched documents for the dashboard. */
export async function recentDocuments(orgId: string, limit = 8) {
  return prisma.document.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      folder: { select: { name: true } },
      versions: { where: { publishedAt: null }, select: { id: true }, take: 1 },
    },
  });
}
