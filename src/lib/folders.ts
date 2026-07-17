import { prisma } from "@/lib/db";

/** A folder as a picker sees it: flattened to a "Parent / Child" path. */
export interface FolderOption {
  id: string;
  path: string;
}

const SEARCH_LIMIT = 20;

export async function listFolders(orgId: string) {
  return prisma.folder.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

export async function createFolder(orgId: string, name: string, parentId?: string | null) {
  return prisma.folder.create({ data: { orgId, name, parentId: parentId ?? null } });
}

/**
 * Folders as flat paths for a picker, narrowed by `query` matched against the
 * whole path — so "policies" finds "HR / Policies", and so does "hr".
 *
 * The tree is assembled in memory rather than matched in SQL: `path` is derived,
 * so it can't be indexed or reached by a `contains`, and an org holds folders on
 * the order of dozens. Same flattening as `listParentOptions` (explorer.ts),
 * which joins folders with " / ".
 */
export async function searchFolderOptions(
  orgId: string,
  query = "",
  limit = SEARCH_LIMIT,
): Promise<FolderOption[]> {
  const rows = await prisma.folder.findMany({
    where: { orgId },
    select: { id: true, name: true, parentId: true },
  });
  const byId = new Map(rows.map((f) => [f.id, f]));

  const cache = new Map<string, string>();
  const pathOf = (id: string): string => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const f = byId.get(id);
    if (!f) return ""; // parent outside this org's rows — render the child as a root
    // Seed the cache before recursing so a cycled parent chain terminates
    // rather than overflowing the stack.
    cache.set(id, f.name);
    const parentPath = f.parentId ? pathOf(f.parentId) : "";
    const path = parentPath ? `${parentPath} / ${f.name}` : f.name;
    cache.set(id, path);
    return path;
  };

  const q = query.trim().toLowerCase();
  return rows
    .map((f) => ({ id: f.id, path: pathOf(f.id) }))
    .filter((o) => q === "" || o.path.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, limit);
}
