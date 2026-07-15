import { SearchX } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { Table, Td, Th } from "@/components/ui/Table";
import { listFolders } from "@/lib/folders";
import { requireUser } from "@/lib/rbac";
import { type SearchRow, searchDocuments } from "@/lib/search";

export const dynamic = "force-dynamic";

function statusOf(r: SearchRow): string {
  return r.retiredAt ? "retired" : r.currentPublishedVersionId ? "published" : "draft";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; folder?: string; status?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const query = sp.q ?? "";
  const isViewer = user.role === "viewer";

  const [folders, results] = await Promise.all([
    listFolders(user.orgId),
    searchDocuments(user.orgId, user.role, {
      query,
      folderId: sp.folder || undefined,
      status: sp.status || undefined,
    }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Search" meta="Find any document by title, code, or content." />

      <form method="get" action="/search" className="flex flex-wrap items-end gap-2.5">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search documents…"
          className="min-w-64 flex-1"
          autoFocus
        />
        <Select name="folder" defaultValue={sp.folder ?? ""} className="w-auto">
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        {!isViewer && (
          <Select name="status" defaultValue={sp.status ?? ""} className="w-auto">
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="retired">Retired</option>
          </Select>
        )}
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>

      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={query ? `No matches for “${query}”` : "No documents found"}
          hint="Try a shorter query, or loosen the folder and status filters."
        />
      ) : (
        <Reveal className="grid gap-2">
          <p className="m-0 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-muted">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
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
                  <Td>
                    <StatusSeal status={statusOf(r)} />
                  </Td>
                  <Td>{r.folderName ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Reveal>
      )}
    </div>
  );
}
