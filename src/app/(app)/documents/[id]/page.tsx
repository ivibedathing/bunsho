import type { JSONContent } from "@tiptap/react";
import { Archive, History, Inbox, ListChecks, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DocCode } from "@/components/ui/DocCode";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { VersionStamp } from "@/components/ui/VersionStamp";
import { isAiEnabled } from "@/lib/ai/anthropic";
import { listAttachments } from "@/lib/attachments";
import { getDocumentDetail } from "@/lib/lifecycle";
import { requireUser } from "@/lib/rbac";
import { listPendingSuggestions, type SuggestionPayload } from "@/lib/suggestions";
import {
  acceptSuggestionAction,
  editAction,
  rejectSuggestionAction,
  retireAction,
  reviewAction,
  runChecksAction,
} from "../actions";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { ReadOnlyDocument } from "./ReadOnlyDocument";
import { SummarizeButton } from "./SummarizeButton";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d)
    : "—";
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getDocumentDetail(user.orgId, id);
  if (!detail) notFound();

  const { doc, status } = detail;
  const current = doc.currentPublishedVersion;
  const isAdmin = user.role === "admin";
  const canManage = user.role !== "viewer";
  // Viewers may only see a document that has content and is not retired
  // (DECISIONS.md — roles). Saving is what gives a page its first version, so a
  // page reaches Viewers as soon as an editor's first idle commit lands.
  if (!canManage && status !== "published") notFound();

  const aiEnabled = isAiEnabled();
  const suggestions = canManage ? await listPendingSuggestions(user.orgId, doc.id) : [];
  const attachments = await listAttachments(user.orgId, doc.id);

  // The most recent version event. Managers see draft edits too; viewers only
  // ever see the published record. `versions` is ordered by version desc, so
  // the open draft (always the highest number) sorts first when one exists.
  const lastChange = canManage
    ? (doc.versions[0] ?? null)
    : (doc.versions.find((v) => v.publishedAt !== null) ?? null);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={
          <>
            <DocCode code={doc.docCode} />
            {status === "retired" && <StatusSeal status="retired" variant="seal" />}
          </>
        }
        title={doc.title}
        meta={
          <div className="grid gap-2.5">
            <span>
              {doc.folder ? `${doc.folder.name} · ` : ""}
              {`Owner ${doc.owner?.name ?? doc.owner?.email ?? "—"}`}
            </span>
            {current && (
              <div className="flex flex-wrap items-center gap-3">
                <VersionStamp version={current.version} />
              </div>
            )}
          </div>
        }
        actions={
          canManage && (
            <>
              <form action={editAction}>
                <input type="hidden" name="documentId" value={doc.id} />
                <Button type="submit" variant="secondary">
                  <PenLine size={15} strokeWidth={1.75} aria-hidden />
                  Edit
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="grid min-w-0 gap-8">
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
                        <p className="m-0 whitespace-pre-wrap text-sm text-ink-muted">
                          {p.message}
                        </p>
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

          {/* The document on the desk */}
          <section className="grid gap-3">
            <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              {current ? `v${current.version}` : "Nothing written yet"}
            </h2>
            {current ? (
              <Reveal>
                <Card variant="paper" padded={false}>
                  <ReadOnlyDocument content={current.prosemirrorJson as JSONContent} />
                </Card>
              </Reveal>
            ) : (
              <p className="m-0 text-sm text-ink-muted">
                This page is empty.{" "}
                <Link href={`/documents/${doc.id}/edit`} className="text-gold">
                  Open the editor
                </Link>{" "}
                to start writing.
              </p>
            )}
          </section>
        </div>

        {/* Right rail: the latest change, at a glance — the full record lives on /history */}
        <aside className="grid gap-3 lg:sticky lg:top-8">
          <Card className="grid gap-3">
            <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Last change
            </h2>
            {lastChange ? (
              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <VersionStamp version={lastChange.version} />
                </div>
                <p className="m-0 text-sm font-medium text-ink">
                  {lastChange.author?.name ?? lastChange.author?.email ?? "—"}
                </p>
                <p className="m-0 text-xs text-ink-muted">
                  {fmt(lastChange.publishedAt ?? lastChange.updatedAt)}
                </p>
                {lastChange.changeNote && (
                  <p className="m-0 text-xs italic text-ink-muted">“{lastChange.changeNote}”</p>
                )}
              </div>
            ) : (
              <p className="m-0 text-sm text-ink-muted">No changes yet.</p>
            )}
            <div className="border-t border-line/60 pt-2">
              <Button
                href={`/documents/${doc.id}/history`}
                variant="ghost"
                size="sm"
                className="-ml-1 justify-start"
              >
                <History size={14} strokeWidth={1.75} aria-hidden />
                View history & diffs
              </Button>
            </div>
          </Card>

          <AttachmentsPanel documentId={doc.id} attachments={attachments} canManage={canManage} />
        </aside>
      </div>
    </div>
  );
}
