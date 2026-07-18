import type { JSONContent } from "@tiptap/react";
import { Stamp } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { PageHeader } from "@/components/ui/PageHeader";
import { VersionStamp } from "@/components/ui/VersionStamp";
import { getDocumentWithDraft } from "@/lib/documents";
import { listFolders } from "@/lib/folders";
import { getOrCreateDraft } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import { DocumentEditor } from "./DocumentEditor";
import { FolderPicker } from "./FolderPicker";

export const dynamic = "force-dynamic";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("admin", "editor");
  const { id } = await params;
  const data = await getDocumentWithDraft(user.orgId, id);
  if (!data) notFound();
  // Editing a published document forks a new draft (F2).
  const draft = data.draft ?? (await getOrCreateDraft(user.orgId, user.id, id));
  const { doc } = data;
  // A nested page derives its folder from its parent (documents_child_has_no_folder),
  // so only top-level documents can be filed — load the folder list just for those.
  const isNested = doc.parentId !== null;
  const folders = isNested ? [] : await listFolders(user.orgId);

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
        meta={
          isNested ? (
            "Nested page — filed with its parent"
          ) : (
            <FolderPicker
              documentId={doc.id}
              folders={folders.map((f) => ({ id: f.id, name: f.name }))}
              currentFolderId={doc.folderId}
            />
          )
        }
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
