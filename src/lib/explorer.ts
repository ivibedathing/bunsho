import { prisma } from "@/lib/db";
import {
  assembleExplorerTree,
  type ExplorerFolder,
  type ExplorerPage,
  type ExplorerTree,
} from "@/lib/explorer-tree";

/**
 * The Explorer tree's data access: the queries that read an org's folders and
 * pages. The pure shapes and assembly live in `@/lib/explorer-tree` so the client
 * tree component can share them without importing Prisma; this module re-exports
 * them so existing `@/lib/explorer` importers are unaffected.
 */

export * from "@/lib/explorer-tree";

export interface ExplorerTreeOptions {
  /**
   * Restrict the tree to current, published, non-retired pages — what a Viewer
   * may see (DECISIONS.md — roles + permission matrix).
   *
   * A visibility flag rather than a `role` param, because `listParentOptions`
   * wants the whole tree and has no role to hand over. The route reads
   * `user.role` and decides; the rule stays next to `rbac`, not in here.
   *
   * A published page nested under a draft parent loses its parent from the row
   * set and surfaces as a root page — the same path an orphan already takes.
   */
  publishedOnly?: boolean;
}

/** Assemble the whole hierarchy for an org in two queries. */
export async function getExplorerTree(
  orgId: string,
  opts: ExplorerTreeOptions = {},
): Promise<ExplorerTree> {
  const [folderRows, docRows] = await Promise.all([
    prisma.folder.findMany({
      where: { orgId },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.document.findMany({
      where: opts.publishedOnly
        ? { orgId, currentPublishedVersionId: { not: null }, retiredAt: null }
        : { orgId },
      select: {
        id: true,
        docCode: true,
        title: true,
        folderId: true,
        parentId: true,
        retiredAt: true,
        currentPublishedVersionId: true,
        updatedAt: true,
      },
    }),
  ]);
  return assembleExplorerTree(folderRows, docRows);
}

/**
 * Pages eligible to be a parent, as flat "Parent › Child" paths for a picker.
 * `excludeId` and its descendants are omitted so a page can't be reparented into
 * its own subtree.
 */
export async function listParentOptions(
  orgId: string,
  excludeId?: string,
): Promise<{ id: string; path: string }[]> {
  const tree = await getExplorerTree(orgId);
  const out: { id: string; path: string }[] = [];

  const walk = (pages: ExplorerPage[], prefix: string) => {
    for (const p of pages) {
      if (p.id === excludeId) continue; // skips its descendants with it
      const path = prefix ? `${prefix} › ${p.title}` : p.title;
      out.push({ id: p.id, path });
      walk(p.children, path);
    }
  };

  const walkFolders = (fs: ExplorerFolder[], prefix: string) => {
    for (const f of fs) {
      const path = prefix ? `${prefix} / ${f.name}` : f.name;
      walk(f.pages, path);
      walkFolders(f.folders, path);
    }
  };

  walkFolders(tree.folders, "");
  walk(tree.unfiled, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
