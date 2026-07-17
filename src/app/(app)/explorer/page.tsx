import { FilePlus2, FolderPlus, FolderTree, SearchX } from "lucide-react";
import Link from "next/link";
import { createFolderAction } from "@/app/(app)/documents/actions";
import { Reveal } from "@/components/motion/Reveal";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DocCode } from "@/components/ui/DocCode";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { Table, Td, Th } from "@/components/ui/Table";
import { countPages, type ExplorerFolder, getExplorerTree } from "@/lib/explorer";
import { listFolders } from "@/lib/folders";
import { requireUser } from "@/lib/rbac";
import { searchDocuments } from "@/lib/search";
import { ExplorerTree } from "./ExplorerTree";

/**
 * Explorer — browse the hierarchy, or search across it. One page, two views:
 * with no query and no filters you get the folder/page tree; the moment any
 * filter is set it becomes a flat, ranked result list. Search used to be its own
 * route; `/search` now redirects here (next.config.mjs).
 *
 * Open to every role (Viewers included — it is their only way to find a
 * document). Visibility is enforced in the queries, not by the route gate:
 * Viewers see published, non-retired pages and nothing else.
 */

export const dynamic = "force-dynamic";

function totalPages(folders: ExplorerFolder[]): number {
  return folders.reduce(
    (n, f) => n + f.pages.reduce((m, p) => m + countPages(p), 0) + totalPages(f.folders),
    0,
  );
}

/** "New folder" as a disclosure, so the form costs no round trip and no client JS. */
function NewFolderMenu() {
  return (
    <details className="relative">
      <summary
        className={buttonClasses({
          className: "list-none [&::-webkit-details-marker]:hidden",
        })}
      >
        <FolderPlus size={15} strokeWidth={1.75} aria-hidden />
        New folder
      </summary>
      <form
        action={createFolderAction}
        className="absolute right-0 z-10 mt-2 flex w-72 items-center gap-2 rounded-control border border-line bg-carbon-raised p-2 shadow-lg"
      >
        <Input
          name="name"
          placeholder="Folder name"
          aria-label="Folder name"
          required
          className="flex-1 py-1"
        />
        <Button type="submit" variant="primary" size="sm">
          Create
        </Button>
      </form>
    </details>
  );
}

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; folder?: string; status?: string; rename?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const query = sp.q ?? "";
  const isViewer = user.role === "viewer";
  const canManage = !isViewer;

  // Any active filter switches the tree out for ranked results.
  const searching = query.trim() !== "" || Boolean(sp.folder) || Boolean(sp.status);

  const [folders, tree, results] = await Promise.all([
    listFolders(user.orgId),
    searching ? null : getExplorerTree(user.orgId, { publishedOnly: isViewer }),
    searching
      ? searchDocuments(user.orgId, user.role, {
          query,
          folderId: sp.folder || undefined,
          status: sp.status || undefined,
        })
      : null,
  ]);

  const total = tree
    ? totalPages(tree.folders) + tree.unfiled.reduce((n, p) => n + countPages(p), 0)
    : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Explorer"
        meta={
          results
            ? `${results.length} result${results.length === 1 ? "" : "s"}.`
            : total === 0
              ? "Every folder and page, in one hierarchy — or search across them all."
              : `${total} ${total === 1 ? "page" : "pages"} across the hierarchy.`
        }
        actions={
          canManage && (
            <>
              <NewFolderMenu />
              <Button href="/documents/new" variant="primary">
                <FilePlus2 size={15} strokeWidth={1.75} aria-hidden />
                New document
              </Button>
            </>
          )
        }
      />

      <form method="get" action="/explorer" className="flex flex-wrap items-end gap-2.5">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search documents…"
          aria-label="Search documents"
          className="min-w-64 flex-1"
        />
        <Select name="folder" defaultValue={sp.folder ?? ""} aria-label="Folder" className="w-auto">
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        {canManage && (
          <Select
            name="status"
            defaultValue={sp.status ?? ""}
            aria-label="Status"
            className="w-auto"
          >
            <option value="">Any status</option>
            <option value="retired">Retired</option>
          </Select>
        )}
        <Button type="submit" variant="primary">
          Search
        </Button>
        {searching && (
          <Button href="/explorer" variant="ghost">
            Clear
          </Button>
        )}
      </form>

      {results ? (
        results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={query ? `No matches for “${query}”` : "No documents found"}
            hint="Try a shorter query, or loosen the folder and status filters."
          />
        ) : (
          <Reveal>
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Folder</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-gold-wash/30">
                    <Td className="whitespace-nowrap">
                      <DocCode code={r.docCode} />
                    </Td>
                    <Td>
                      <Link
                        href={`/documents/${r.id}`}
                        className="font-medium text-ink no-underline hover:text-gold"
                      >
                        {r.title}
                      </Link>
                    </Td>
                    <Td>{r.retiredAt && <StatusSeal status="retired" />}</Td>
                    <Td>{r.folderName ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Reveal>
        )
      ) : tree && total === 0 && tree.folders.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title={isViewer ? "Nothing published yet" : "Nothing to explore yet"}
          hint={
            isViewer
              ? "Published documents will appear here as they are released."
              : "Folders and pages will appear here as you create them. Pages can nest under other pages."
          }
          action={
            canManage ? (
              <Button href="/documents/new" variant="primary">
                New document
              </Button>
            ) : undefined
          }
        />
      ) : (
        tree && (
          <Reveal>
            <Card padded={false}>
              <div className="p-2">
                <ExplorerTree
                  folders={tree.folders}
                  unfiled={tree.unfiled}
                  canManage={canManage}
                  renameId={sp.rename}
                />
              </div>
            </Card>
          </Reveal>
        )
      )}
    </div>
  );
}
