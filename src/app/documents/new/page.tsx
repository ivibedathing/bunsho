import { authTitle } from "@/app/auth-ui";
import { listFolders } from "@/lib/folders";
import { requireRole } from "@/lib/rbac";
import Link from "next/link";
import { NewDocumentForm } from "./NewDocumentForm";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const user = await requireRole("admin", "editor");
  const folders = await listFolders(user.orgId);
  return (
    <main
      style={{
        maxWidth: "32rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1.25rem",
      }}
    >
      <Link href="/documents" style={{ color: "var(--muted)" }}>
        ← Documents
      </Link>
      <h1 style={authTitle}>New document</h1>
      <NewDocumentForm folders={folders.map((f) => ({ id: f.id, name: f.name }))} />
    </main>
  );
}
