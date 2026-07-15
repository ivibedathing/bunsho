import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { countPages, getExplorerTree } from "@/lib/explorer";
import { requireRole } from "@/lib/rbac";
import { FilePlus2, FolderTree } from "lucide-react";
import { ExplorerTree } from "./ExplorerTree";

export const dynamic = "force-dynamic";

export default async function ExplorerPage() {
  const user = await requireRole("admin", "editor");
  const { folders, unfiled } = await getExplorerTree(user.orgId);

  const countIn = (fs: typeof folders): number =>
    fs.reduce((n, f) => n + f.pages.reduce((m, p) => m + countPages(p), 0) + countIn(f.folders), 0);
  const total = countIn(folders) + unfiled.reduce((n, p) => n + countPages(p), 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Explorer"
        meta={
          total === 0
            ? "Every folder and page, in one hierarchy."
            : `${total} ${total === 1 ? "page" : "pages"} across the hierarchy.`
        }
        actions={
          <Button href="/documents/new" variant="primary">
            <FilePlus2 size={15} strokeWidth={1.75} aria-hidden />
            New document
          </Button>
        }
      />

      {total === 0 && folders.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Nothing to explore yet"
          hint="Folders and pages will appear here as you create them. Pages can nest under other pages."
          action={
            <Button href="/documents/new" variant="primary">
              New document
            </Button>
          }
        />
      ) : (
        <Reveal>
          <Card padded={false}>
            <div className="p-2">
              <ExplorerTree folders={folders} unfiled={unfiled} canCreate />
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  );
}
