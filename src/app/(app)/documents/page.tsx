import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { Table, Td, Th } from "@/components/ui/Table";
import { listDocuments } from "@/lib/documents";
import { listFolders } from "@/lib/folders";
import { requireRole } from "@/lib/rbac";
import { FilePlus2, FileUp, FolderDown, LayoutTemplate, RefreshCw } from "lucide-react";
import Link from "next/link";
import { createFolderAction, exportGitAction, loadTemplatesAction } from "./actions";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

const CHIP =
  "inline-flex items-center rounded-full border px-3 py-1 text-[0.8125rem] no-underline transition-colors";
const CHIP_IDLE = `${CHIP} border-line text-ink-muted hover:border-gold/40 hover:text-ink`;
const CHIP_ACTIVE = `${CHIP} border-gold/60 bg-gold-wash text-gold`;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const user = await requireRole("admin", "editor");
  const isAdmin = user.role === "admin";
  const { folder } = await searchParams;
  const [folders, docs] = await Promise.all([
    listFolders(user.orgId),
    listDocuments(user.orgId, folder ? { folderId: folder } : {}),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Documents"
        meta="Every controlled document, drafts included."
        actions={
          <>
            <Button href="/api/export/zip" variant="ghost" size="sm">
              <FolderDown size={15} strokeWidth={1.75} aria-hidden />
              Download .zip
            </Button>
            <Button href="/documents/import" variant="ghost" size="sm">
              <FileUp size={15} strokeWidth={1.75} aria-hidden />
              Import
            </Button>
            {isAdmin && (
              <>
                <form action={exportGitAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    <RefreshCw size={15} strokeWidth={1.75} aria-hidden />
                    Rebuild export
                  </Button>
                </form>
                <form action={loadTemplatesAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LayoutTemplate size={15} strokeWidth={1.75} aria-hidden />
                    Starter templates
                  </Button>
                </form>
              </>
            )}
            <Button href="/documents/new" variant="primary">
              <FilePlus2 size={15} strokeWidth={1.75} aria-hidden />
              New document
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/documents" className={folder ? CHIP_IDLE : CHIP_ACTIVE}>
          All
        </Link>
        {folders.map((f) => (
          <Link
            key={f.id}
            href={`/documents?folder=${f.id}`}
            className={folder === f.id ? CHIP_ACTIVE : CHIP_IDLE}
          >
            {f.name}
          </Link>
        ))}
        <form action={createFolderAction} className="ml-auto flex items-center gap-2">
          <Input name="name" placeholder="New folder" className="w-40 py-1.5" />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="No documents yet"
          hint="Start from a blank page or bring your existing Markdown along."
          action={
            <>
              <Button href="/documents/new" variant="primary">
                New document
              </Button>
              <Button href="/documents/import" variant="secondary">
                Import
              </Button>
            </>
          }
        />
      ) : (
        <Reveal>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Owner</Th>
                <Th>Folder</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const status = d.retiredAt
                  ? "retired"
                  : d.currentPublishedVersionId
                    ? "published"
                    : "draft";
                return (
                  <tr key={d.id} className="transition-colors hover:bg-gold-wash/30">
                    <Td className="whitespace-nowrap">
                      <DocCode code={d.docCode} />
                    </Td>
                    <Td>
                      <Link
                        href={`/documents/${d.id}`}
                        className="font-medium text-ink no-underline hover:text-gold"
                      >
                        {d.title}
                      </Link>
                      {status === "published" && d.versions.length > 0 && (
                        <span className="ml-1.5 text-xs text-ink-muted">· draft open</span>
                      )}
                    </Td>
                    <Td>
                      <StatusSeal status={status} />
                    </Td>
                    <Td>{d.owner?.name ?? d.owner?.email ?? "—"}</Td>
                    <Td>{d.folder?.name ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-muted">{fmtDate(d.updatedAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Reveal>
      )}
    </div>
  );
}
