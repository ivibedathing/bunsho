import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/lib/rbac";
import { FileUp } from "lucide-react";
import { importAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("admin", "editor");
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <PageHeader
        title="Import documents"
        meta="Everything you import lands in Draft for review — never auto-published."
      />
      <Card className="grid gap-5">
        <p className="m-0 text-sm text-ink-muted">
          Upload Markdown (<code className="font-mono text-ink">.md</code>) files or a{" "}
          <code className="font-mono text-ink">.zip</code> of them. Front-matter{" "}
          <code className="font-mono text-ink">code</code>,{" "}
          <code className="font-mono text-ink">title</code>, and{" "}
          <code className="font-mono text-ink">type</code> are honored when present.
        </p>
        <form action={importAction} className="grid gap-4">
          <label className="grid cursor-pointer justify-items-center gap-2 rounded-card border border-dashed border-line px-6 py-8 text-center transition-colors hover:border-gold/40 hover:bg-gold-wash/30">
            <FileUp size={22} strokeWidth={1.75} className="text-gold" aria-hidden />
            <span className="text-sm text-ink">Choose files to import</span>
            <span className="text-xs text-ink-muted">.md, .markdown, or .zip</span>
            <input
              type="file"
              name="files"
              multiple
              accept=".md,.markdown,.zip"
              className="mt-1 text-xs text-ink-muted file:mr-3 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-carbon-raised file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </label>
          <Button type="submit" variant="primary">
            Import
          </Button>
        </form>
      </Card>
    </div>
  );
}
