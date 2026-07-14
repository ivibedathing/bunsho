import { authTitle, primaryButton } from "@/app/auth-ui";
import { requireRole } from "@/lib/rbac";
import Link from "next/link";
import { importAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("admin", "editor");
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
      <h1 style={authTitle}>Import documents</h1>
      <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.9rem" }}>
        Upload Markdown (<code>.md</code>) files or a <code>.zip</code> of them. Front-matter{" "}
        <code>code</code>, <code>title</code>, and <code>type</code> are honored when present.
        Imported content lands in <strong>Draft</strong> for review — never auto-published.
      </p>
      <form action={importAction} style={{ display: "grid", gap: "1rem" }}>
        <input
          type="file"
          name="files"
          multiple
          accept=".md,.markdown,.zip"
          style={{ font: "inherit" }}
        />
        <button type="submit" style={primaryButton}>
          Import
        </button>
      </form>
    </main>
  );
}
