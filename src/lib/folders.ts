import { prisma } from "@/lib/db";

export async function listFolders(orgId: string) {
  return prisma.folder.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

export async function createFolder(orgId: string, name: string, parentId?: string | null) {
  return prisma.folder.create({ data: { orgId, name, parentId: parentId ?? null } });
}

/**
 * Rename a folder. Returns false when nothing matched — a stale id, or one owned
 * by another org.
 *
 * `updateMany` rather than `update`: `update` can only match on the unique `id`,
 * so a guessed id would rename another tenant's folder. Tenancy is convention
 * here (no RLS), which means the `orgId` has to sit in the `where` itself.
 */
export async function renameFolder(
  orgId: string,
  folderId: string,
  name: string,
): Promise<boolean> {
  const { count } = await prisma.folder.updateMany({
    where: { id: folderId, orgId },
    data: { name },
  });
  return count > 0;
}
