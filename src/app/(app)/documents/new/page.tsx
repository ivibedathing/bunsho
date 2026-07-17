import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { listParentOptions } from "@/lib/explorer";
import { searchFolderOptions } from "@/lib/folders";
import { requireRole } from "@/lib/rbac";
import { NewDocumentForm } from "./NewDocumentForm";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string }>;
}) {
  const user = await requireRole("admin", "editor");
  const { parent } = await searchParams;
  // The first page of folders, so the picker opens populated before its first
  // search round-trip; typing in it re-queries /api/folders.
  const [folders, parents] = await Promise.all([
    searchFolderOptions(user.orgId),
    listParentOptions(user.orgId),
  ]);

  // Ignore a ?parent= that names a page this org doesn't have; the picker would
  // show it selected but the server would reject it on submit.
  const defaultParentId = parents.some((p) => p.id === parent) ? parent : "";

  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <PageHeader
        title={defaultParentId ? "New subpage" : "New document"}
        meta="It starts as a draft — publish when it’s ready."
      />
      <Card>
        <NewDocumentForm
          folders={folders.map((f) => ({ id: f.id, label: f.path }))}
          parents={parents}
          defaultParentId={defaultParentId}
        />
      </Card>
    </div>
  );
}
