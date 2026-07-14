import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { PageHeader } from "@/components/ui/PageHeader";
import { VersionStamp } from "@/components/ui/VersionStamp";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { getDocumentWithDraft } from "@/lib/documents";
import { getOrCreateDraft } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import type { JSONContent } from "@tiptap/react";
import { Stamp } from "lucide-react";
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
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          <>
            <DocCode code={doc.docCode} />
            <VersionStamp version={`${draft.version} · draft`} />
          </>
        }
        title={doc.title}
        meta={`${DOCUMENT_TYPE_LABELS[doc.type]}${doc.folder ? ` · ${doc.folder.name}` : ""}`}
        actions={
          <Button href={`/documents/${doc.id}`} variant="primary">
            <Stamp size={15} strokeWidth={1.75} aria-hidden />
            Review & publish
          </Button>
        }
      />
      <DocumentEditor documentId={doc.id} initialContent={draft.prosemirrorJson as JSONContent} />
    </div>
  );
}
