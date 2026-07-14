import { primaryButton } from "@/app/auth-ui";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { getDocumentWithDraft } from "@/lib/documents";
import { getOrCreateDraft } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import type { JSONContent } from "@tiptap/react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentEditor } from "./DocumentEditor";

export const dynamic = "force-dynamic";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "editor");
  const { id } = await params;
  const data = await getDocumentWithDraft(user.orgId, id);
  if (!data) notFound();
  // Editing a published document forks a new draft (F2).
  const draft = data.draft ?? (await getOrCreateDraft(user.orgId, user.id, id));
  const { doc } = data;

  return (
    <main
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Link href={`/documents/${doc.id}`} style={{ color: "var(--muted)" }}>
          ← Overview
        </Link>
        <Link
          href={`/documents/${doc.id}`}
          style={{ ...primaryButton, textDecoration: "none", fontSize: "0.85rem" }}
        >
          Review &amp; publish →
        </Link>
      </div>
      <header style={{ display: "grid", gap: "0.25rem" }}>
        <span
          style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: "0.85rem" }}
        >
          {doc.docCode}
        </span>
        <h1 style={{ margin: 0, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>{doc.title}</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>
          {DOCUMENT_TYPE_LABELS[doc.type]} · Draft v{draft.version}
          {doc.folder ? ` · ${doc.folder.name}` : ""}
        </p>
      </header>
      <DocumentEditor documentId={doc.id} initialContent={draft.prosemirrorJson as JSONContent} />
    </main>
  );
}
