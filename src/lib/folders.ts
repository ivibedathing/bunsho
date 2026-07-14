import { prisma } from "@/lib/db";

export async function listFolders(orgId: string) {
  return prisma.folder.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

export async function createFolder(orgId: string, name: string, parentId?: string | null) {
  return prisma.folder.create({ data: { orgId, name, parentId: parentId ?? null } });
}
