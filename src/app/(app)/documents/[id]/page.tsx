import { Reveal } from "@/components/motion/Reveal";
import { SealStamp } from "@/components/motion/SealStamp";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DocCode } from "@/components/ui/DocCode";
import { LifecycleStepper } from "@/components/ui/LifecycleStepper";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { Table, Td, Th } from "@/components/ui/Table";
import { VersionStamp } from "@/components/ui/VersionStamp";
import { isAiEnabled } from "@/lib/ai/anthropic";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { getDocumentDetail } from "@/lib/lifecycle";
import { requireUser } from "@/lib/rbac";
import { type SuggestionPayload, listPendingSuggestions } from "@/lib/suggestions";
import type { JSONContent } from "@tiptap/react";
import {
  Archive,
  FileDiff,
  Inbox,
  ListChecks,
  PenLine,
  RotateCcw,
  Sparkles,
  Stamp,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptSuggestionAction,
  editAction,
  publishAction,
  rejectSuggestionAction,
  restoreAction,
  retireAction,
  reviewAction,
  runChecksAction,
} from "../actions";
import { ReadOnlyDocument } from "./ReadOnlyDocument";
import { SummarizeButton } from "./SummarizeButton";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d)
    : "—";
}

function versionStatus(v: {
  publishedAt: Date | null;
  retiredAt: Date | null;
  supersededAt: Date | null;
}): string {
  if (v.publishedAt === null) return "draft";
  if (v.retiredAt) return "retired";
  if (v.supersededAt) return "superseded";
  return "published";
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { published: justPublished } = await searchParams;
  const detail = await getDocumentDetail(user.orgId, id);
  if (!detail) notFound();

  const { doc, draft, published, status } = detail;
  const current = doc.currentPublishedVersion;
  const isAdmin = user.role === "admin";
  const canManage = user.role !== "viewer";
  // Viewers may only see current, published, non-retired documents (PRD §3).
  if (!canManage && status !== "published") notFound();

  const aiEnabled = isAiEnabled();
  const suggestions = canManage ? await listPendingSuggestions(user.orgId, doc.id) : [];

  return (
    <div className="grid gap-8">
      {justPublished && <SealStamp version={justPublished} />}

      <PageHeader
        eyebrow={
          <>
            <DocCode code={doc.docCode} />
            <StatusSeal status={status} variant="seal" />
          </>
        }
        title={doc.title}
        meta={
          <div className="grid gap-2.5">
            <span>
              {DOCUMENT_TYPE_LABELS[doc.type]}
              {doc.folder ? ` · ${doc.folder.name}` : ""}
              {` · Owner ${doc.owner?.name ?? doc.owner?.email ?? "—"}`}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <LifecycleStepper status={status} />
              {current && <VersionStamp version={current.version} />}
            </div>
          </div>
        }
        actions={
          canManage && (
            <>
              <form action={editAction}>
                <input type="hidden" name="documentId" value={doc.id} />
                <Button type="submit" variant="secondary">
                  <PenLine size={15} strokeWidth={1.75} aria-hidden />
                  {draft ? "Continue editing draft" : "Edit"}
                </Button>
              </form>
              {isAdmin && status === "published" && (
                <form action={retireAction}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <Button type="submit" variant="danger">
                    <Archive size={15} strokeWidth={1.75} aria-hidden />
                    Retire
                  </Button>
                </form>
              )}
            </>
          )
        }
      />

      {/* Publish the open draft (managers only) */}
      {canManage && draft && (
        <Reveal>
          <Card className="grid gap-3 border-gold/30">
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-gold">
              Draft v{draft.version} — ready when you are
            </span>
            <form action={publishAction} className="flex flex-wrap items-center gap-2.5">
              <input type="hidden" name="documentId" value={doc.id} />
              <input
                name="changeNote"
                type="text"
                placeholder="What changed in this version? (optional)"
                className="min-w-64 flex-1 rounded-control border border-line bg-carbon-sunken/60 px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-gold/60"
              />
              <Button type="submit" variant="primary">
                <Stamp size={15} strokeWidth={1.75} aria-hidden />
                Publish v{draft.version}
              </Button>
            </form>
          </Card>
        </Reveal>
      )}

      {/* Review tools + suggestions inbox (managers only) */}
      {canManage && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Suggestions inbox
              {suggestions.length > 0 && (
                <span className="rounded-full bg-gold-wash px-2 py-0.5 text-gold">
                  {suggestions.length}
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <form action={runChecksAction}>
                <input type="hidden" name="documentId" value={doc.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <ListChecks size={15} strokeWidth={1.75} aria-hidden />
                  Run checks
                </Button>
              </form>
              {aiEnabled && (
                <>
                  <SummarizeButton documentId={doc.id} />
                  <form action={reviewAction}>
                    <input type="hidden" name="documentId" value={doc.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <Sparkles size={15} strokeWidth={1.75} aria-hidden />
                      AI review
                    </Button>
                  </form>
                </>
              )}
            </div>
          </div>

          {suggestions.length === 0 ? (
            <div className="flex items-center gap-3 rounded-card border border-dashed border-line px-4 py-3.5 text-sm text-ink-muted">
              <Inbox size={16} strokeWidth={1.75} className="text-gold/70" aria-hidden />
              Inbox clear — nothing needs your review.
            </div>
          ) : (
            <div className="grid gap-2.5">
              {suggestions.map((s) => {
                const p = s.payload as unknown as SuggestionPayload;
                return (
                  <Card key={s.id} className="grid gap-2.5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-ink">{p.title}</strong>
                      <span className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-info">
                        {s.origin !== "on_demand" && (
                          <Sparkles size={12} strokeWidth={1.75} aria-hidden />
                        )}
                        {p.kind} · {s.origin.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="m-0 whitespace-pre-wrap text-sm text-ink-muted">{p.message}</p>
                    <div className="flex gap-2">
                      <form action={acceptSuggestionAction}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="suggestionId" value={s.id} />
                        <Button type="submit" variant="primary" size="sm">
                          {p.proposedJson ? "Accept → draft" : "Acknowledge"}
                        </Button>
                      </form>
                      <form action={rejectSuggestionAction}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="suggestionId" value={s.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Dismiss
                        </Button>
                      </form>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Current published content — the document on the desk */}
      <section className="grid gap-3">
        <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {current ? `Published — v${current.version}` : "No published version yet"}
        </h2>
        {current ? (
          <Reveal>
            <Card variant="paper" padded={false}>
              <ReadOnlyDocument content={current.prosemirrorJson as JSONContent} />
            </Card>
          </Reveal>
        ) : (
          <p className="m-0 text-sm text-ink-muted">
            This document is still a draft.{" "}
            <Link href={`/documents/${doc.id}/edit`} className="text-gold">
              Open the editor
            </Link>{" "}
            to write and publish it.
          </p>
        )}
      </section>

      {/* Change log (published versions) */}
      {published.length > 0 && (
        <section className="grid gap-3">
          <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Change log
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Published</Th>
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
        </section>
      )}

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
              {doc.versions.map((v) => {
                const vs = versionStatus(v);
                return (
                  <tr key={v.id}>
                    <Td>
                      <VersionStamp version={v.version} />
                    </Td>
                    <Td>
                      <StatusSeal status={vs} />
                    </Td>
                    <Td className="whitespace-nowrap">{fmt(v.publishedAt ?? v.updatedAt)}</Td>
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
                        {v.publishedAt !== null && (
                          <form action={restoreAction}>
                            <input type="hidden" name="documentId" value={doc.id} />
                            <input type="hidden" name="versionId" value={v.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
                              Restore
                            </Button>
                          </form>
                        )}
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
