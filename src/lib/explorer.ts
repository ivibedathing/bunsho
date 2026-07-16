import { prisma } from "@/lib/db";

/**
 * The Explorer tree: the org's folders and pages in one hierarchy.
 *
 * Two nestings meet here. Folders nest in folders (`folders.parentId`), and pages
 * nest under pages (`documents.parentId`). A page with no parent is filed in a
 * folder — or nowhere, in which case it surfaces under "Unfiled". A page *with* a
 * parent carries no folder of its own: it derives its location from the parent,
 * so it appears only beneath it (see `documents_child_has_no_folder`).
 */

export type DocStatus = "draft" | "published" | "retired";

export interface ExplorerPage {
  id: string;
  docCode: string;
  title: string;
  status: DocStatus;
  updatedAt: Date;
  children: ExplorerPage[];
}

export interface ExplorerFolder {
  id: string;
  name: string;
  folders: ExplorerFolder[];
  pages: ExplorerPage[];
}

export interface ExplorerTree {
  folders: ExplorerFolder[];
  /** Root pages belonging to no folder. */
  unfiled: ExplorerPage[];
}

export type DocRow = {
  id: string;
  docCode: string;
  title: string;
  folderId: string | null;
  parentId: string | null;
  retiredAt: Date | null;
  currentPublishedVersionId: string | null;
  updatedAt: Date;
};

export type FolderRow = { id: string; name: string; parentId: string | null };

function statusOf(d: DocRow): DocStatus {
  if (d.retiredAt) return "retired";
  return d.currentPublishedVersionId ? "published" : "draft";
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function sortPages(pages: ExplorerPage[]): void {
  pages.sort(byTitle);
  for (const p of pages) sortPages(p.children);
}

function sortFolders(folders: ExplorerFolder[]): void {
  folders.sort(byName);
  for (const f of folders) {
    sortPages(f.pages);
    sortFolders(f.folders);
  }
}

/** Shape flat rows into the hierarchy. Pure — the queries live in `getExplorerTree`. */
export function assembleExplorerTree(folderRows: FolderRow[], docRows: DocRow[]): ExplorerTree {
  const pages = new Map<string, ExplorerPage>(
    docRows.map((d) => [
      d.id,
      {
        id: d.id,
        docCode: d.docCode,
        title: d.title,
        status: statusOf(d),
        updatedAt: d.updatedAt,
        children: [],
      },
    ]),
  );
  const folders = new Map<string, ExplorerFolder>(
    folderRows.map((f) => [f.id, { id: f.id, name: f.name, folders: [], pages: [] }]),
  );

  const tree: ExplorerTree = { folders: [], unfiled: [] };

  // Nest folders. A parentId pointing outside this org's rows can't happen —
  // folders are org-scoped — so an unresolved parent means the row is a root.
  for (const row of folderRows) {
    const node = folders.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? folders.get(row.parentId) : undefined;
    if (parent) parent.folders.push(node);
    else tree.folders.push(node);
  }

  // Nest pages under their parent page, else file them by folder.
  for (const row of docRows) {
    const node = pages.get(row.id);
    if (!node) continue;
    const parentPage = row.parentId ? pages.get(row.parentId) : undefined;
    if (parentPage) {
      parentPage.children.push(node);
      continue;
    }
    const folder = row.folderId ? folders.get(row.folderId) : undefined;
    if (folder) folder.pages.push(node);
    else tree.unfiled.push(node);
  }

  sortFolders(tree.folders);
  sortPages(tree.unfiled);
  return tree;
}

/** Assemble the whole hierarchy for an org in two queries. */
export async function getExplorerTree(orgId: string): Promise<ExplorerTree> {
  const [folderRows, docRows] = await Promise.all([
    prisma.folder.findMany({
      where: { orgId },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.document.findMany({
      where: { orgId },
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

/** Count of pages in a subtree, including the page itself. */
export function countPages(page: ExplorerPage): number {
  return 1 + page.children.reduce((n, c) => n + countPages(c), 0);
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
