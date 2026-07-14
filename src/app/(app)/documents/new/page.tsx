import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { listFolders } from "@/lib/folders";
import { requireRole } from "@/lib/rbac";
import { NewDocumentForm } from "./NewDocumentForm";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const user = await requireRole("admin", "editor");
  const folders = await listFolders(user.orgId);
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <PageHeader title="New document" meta="It starts as a draft — publish when it’s ready." />
      <Card>
        <NewDocumentForm folders={folders.map((f) => ({ id: f.id, name: f.name }))} />
      </Card>
    </div>
  );
}
