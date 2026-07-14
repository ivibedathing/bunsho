import { primaryButton, secondaryButton } from "@/app/auth-ui";
import { isAiEnabled } from "@/lib/ai/anthropic";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { getDocumentDetail } from "@/lib/lifecycle";
import { requireUser } from "@/lib/rbac";
import { type SuggestionPayload, listPendingSuggestions } from "@/lib/suggestions";
import type { JSONContent } from "@tiptap/react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "../StatusBadge";
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

const td: React.CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.85rem",
};
const th: React.CSSProperties = {
  ...td,
  color: "var(--muted)",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

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

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
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
    <main
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1.25rem",
      }}
    >
      <Link href="/documents" style={{ color: "var(--muted)" }}>
        ← Documents
      </Link>

      <header style={{ display: "grid", gap: "0.35rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span
            style={{
              color: "var(--muted)",
              fontVariantNumeric: "tabular-nums",
              fontSize: "0.85rem",
            }}
          >
            {doc.docCode}
          </span>
          <StatusBadge status={status} />
        </div>
        <h1 style={{ margin: 0, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>{doc.title}</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>
          {DOCUMENT_TYPE_LABELS[doc.type]}
          {doc.folder ? ` · ${doc.folder.name}` : ""}
          {current ? ` · Current v${current.version}` : ""}
          {` · Owner ${doc.owner?.name ?? doc.owner?.email ?? "—"}`}
        </p>
      </header>

      {/* Actions (managers only) */}
      {canManage && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
          <form action={editAction}>
            <input type="hidden" name="documentId" value={doc.id} />
            <button type="submit" style={{ ...secondaryButton }}>
              {draft ? "Continue editing draft" : "Edit"}
            </button>
          </form>

          {draft && (
            <form
              action={publishAction}
              style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end" }}
            >
              <input type="hidden" name="documentId" value={doc.id} />
              <label
                style={{
                  display: "grid",
                  gap: "0.2rem",
                  fontSize: "0.8rem",
                  color: "var(--muted)",
                }}
              >
                Change note (optional)
                <input
                  name="changeNote"
                  type="text"
                  placeholder="What changed in this version?"
                  style={{
                    padding: "0.4rem 0.55rem",
                    borderRadius: "0.45rem",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "inherit",
                    font: "inherit",
                    minWidth: "16rem",
                  }}
                />
              </label>
              <button type="submit" style={primaryButton}>
                Publish v{draft.version}
              </button>
            </form>
          )}

          {isAdmin && status === "published" && (
            <form action={retireAction}>
              <input type="hidden" name="documentId" value={doc.id} />
              <button type="submit" style={{ ...secondaryButton, color: "#b91c1c" }}>
                Retire
              </button>
            </form>
          )}
        </div>
      )}

      {/* AI assistance + suggestions queue (managers only) */}
      {canManage && (
        <section style={{ display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <form action={runChecksAction}>
              <input type="hidden" name="documentId" value={doc.id} />
              <button type="submit" style={secondaryButton}>
                Run checks
              </button>
            </form>
            {aiEnabled ? (
              <>
                <SummarizeButton documentId={doc.id} />
                <form action={reviewAction}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <button type="submit" style={secondaryButton}>
                    AI review
                  </button>
                </form>
              </>
            ) : (
              <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                AI features disabled
              </span>
            )}
          </div>

          {suggestions.length > 0 && (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <h2 style={{ fontSize: "1rem", margin: 0 }}>Suggestions ({suggestions.length})</h2>
              {suggestions.map((s) => {
                const p = s.payload as unknown as SuggestionPayload;
                return (
                  <div
                    key={s.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "0.6rem",
                      padding: "0.75rem",
                      display: "grid",
                      gap: "0.4rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ fontSize: "0.9rem" }}>{p.title}</strong>
                      <span
                        style={{
                          color: "var(--muted)",
                          fontSize: "0.72rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {p.kind} · {s.origin}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
                      {p.message}
                    </p>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <form action={acceptSuggestionAction}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="suggestionId" value={s.id} />
                        <button type="submit" style={{ ...primaryButton, fontSize: "0.8rem" }}>
                          {p.proposedJson ? "Accept → draft" : "Acknowledge"}
                        </button>
                      </form>
                      <form action={rejectSuggestionAction}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="suggestionId" value={s.id} />
                        <button type="submit" style={{ ...secondaryButton, fontSize: "0.8rem" }}>
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Current published content */}
      <section style={{ display: "grid", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>
          {current ? `Published — v${current.version}` : "No published version yet"}
        </h2>
        {current ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: "0.6rem" }}>
            <ReadOnlyDocument content={current.prosemirrorJson as JSONContent} />
          </div>
        ) : (
          <p style={{ color: "var(--muted)", margin: 0 }}>
            This document is still a draft.{" "}
            <Link href={`/documents/${doc.id}/edit`}>Open the editor</Link> to write and publish it.
          </p>
        )}
      </section>

      {/* Change log (published versions) */}
      {published.length > 0 && (
        <section style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Change log</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Version</th>
                  <th style={th}>Published</th>
                  <th style={th}>Change note</th>
                  <th style={th}>Author</th>
                </tr>
              </thead>
              <tbody>
                {published.map((v) => (
                  <tr key={v.id}>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>v{v.version}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(v.publishedAt)}</td>
                    <td style={td}>{v.changeNote ?? "—"}</td>
                    <td style={td}>{v.author?.name ?? v.author?.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Full version history with diff + restore (managers only) */}
      {canManage && (
        <section style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Version history</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Version</th>
                  <th style={th}>State</th>
                  <th style={th}>When</th>
                  <th style={th}>Author</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {doc.versions.map((v) => {
                  const vs = versionStatus(v);
                  return (
                    <tr key={v.id}>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>v{v.version}</td>
                      <td style={td}>
                        <StatusBadge status={vs} />
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {fmt(v.publishedAt ?? v.updatedAt)}
                      </td>
                      <td style={td}>{v.author?.name ?? v.author?.email ?? "—"}</td>
                      <td style={{ ...td, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {current && v.id !== current.id && (
                          <Link href={`/documents/${doc.id}/diff?from=${v.id}&to=${current.id}`}>
                            Diff vs current
                          </Link>
                        )}
                        {v.publishedAt !== null && (
                          <form action={restoreAction}>
                            <input type="hidden" name="documentId" value={doc.id} />
                            <input type="hidden" name="versionId" value={v.id} />
                            <button
                              type="submit"
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                color: "#2563eb",
                                cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              Restore
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
