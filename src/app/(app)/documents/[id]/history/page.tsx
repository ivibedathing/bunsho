import { ArrowLeft, FileDiff, RotateCcw } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { Table, Td, Th } from "@/components/ui/Table";
import { VersionStamp } from "@/components/ui/VersionStamp";
import { getDocumentDetail } from "@/lib/lifecycle";
import { requireUser } from "@/lib/rbac";
import { restoreAction } from "../../actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d)
    : "—";
}

/**
 * A frozen version's place in the record. Only ever called with published rows —
 * the open draft is the live page, not a version, and is filtered out below.
 */
function versionStatus(v: { retiredAt: Date | null; supersededAt: Date | null }): string {
  if (v.retiredAt) return "retired";
  if (v.supersededAt) return "superseded";
  return "current";
}

export default async function DocumentHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getDocumentDetail(user.orgId, id);
  if (!detail) notFound();

  const { doc, published, status } = detail;
  const current = doc.currentPublishedVersion;
  const canManage = user.role !== "viewer";
  // Viewers may only see current, published, non-retired documents (DECISIONS.md — roles).
  if (!canManage && status !== "published") notFound();

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={
          <>
            <DocCode code={doc.docCode} />
            {status === "retired" && <StatusSeal status="retired" variant="seal" />}
          </>
        }
        title={`History — ${doc.title}`}
        meta="Every version is immutable; restoring stages old content back into the page."
        actions={
          <Button href={`/documents/${doc.id}`} variant="secondary">
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
            Back to document
          </Button>
        }
      />

      {/* Change log (published versions) */}
      <section className="grid gap-3">
        <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Change log
        </h2>
        {published.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">Nothing saved yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Saved</Th>
                <Th>Change note</Th>
                <Th>Author</Th>
              </tr>
            </thead>
            <tbody>
              {published.map((v) => (
                <tr key={v.id}>
                  <Td>
                    <VersionStamp version={v.version} />
                  </Td>
                  <Td className="whitespace-nowrap">{fmt(v.publishedAt)}</Td>
                  <Td>{v.changeNote ?? "—"}</Td>
                  <Td>{v.author?.name ?? v.author?.email ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* Full version history with diff + restore (managers only) */}
      {canManage && (
        <section className="grid gap-3">
          <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Version history
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>State</Th>
                <Th>When</Th>
                <Th>Author</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {published.map((v) => {
                const vs = versionStatus(v);
                return (
                  <tr key={v.id}>
                    <Td>
                      <VersionStamp version={v.version} />
                    </Td>
                    <Td>
                      <StatusSeal status={vs} />
                    </Td>
                    <Td className="whitespace-nowrap">{fmt(v.publishedAt)}</Td>
                    <Td>{v.author?.name ?? v.author?.email ?? "—"}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        {current && v.id !== current.id && (
                          <Button
                            href={`/documents/${doc.id}/diff?from=${v.id}&to=${current.id}`}
                            variant="ghost"
                            size="sm"
                          >
                            <FileDiff size={14} strokeWidth={1.75} aria-hidden />
                            Diff vs current
                          </Button>
                        )}
                        <form action={restoreAction}>
                          <input type="hidden" name="documentId" value={doc.id} />
                          <input type="hidden" name="versionId" value={v.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
                            Restore
                          </Button>
                        </form>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}
    </div>
  );
}
