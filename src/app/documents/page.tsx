import { fieldStyle, primaryButton, secondaryButton } from "@/app/auth-ui";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { listDocuments } from "@/lib/documents";
import { listFolders } from "@/lib/folders";
import { requireRole } from "@/lib/rbac";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { createFolderAction, exportGitAction, loadTemplatesAction } from "./actions";

export const dynamic = "force-dynamic";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
};
const td: React.CSSProperties = {
  padding: "0.55rem 0.6rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.9rem",
};

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const user = await requireRole("admin", "editor");
  const isAdmin = user.role === "admin";
  const { folder } = await searchParams;
  const [folders, docs] = await Promise.all([
    listFolders(user.orgId),
    listDocuments(user.orgId, folder ? { folderId: folder } : {}),
  ]);

  return (
    <main
      style={{
        maxWidth: "60rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1.25rem",
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
        <h1 style={{ fontSize: "1.6rem", margin: 0, letterSpacing: "-0.02em" }}>Documents</h1>
        <Link href="/documents/new" style={{ ...primaryButton, textDecoration: "none" }}>
          + New document
        </Link>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
        <a
          href="/api/export/zip"
          style={{ ...secondaryButton, textDecoration: "none", fontSize: "0.85rem" }}
        >
          Download .zip
        </a>
        <Link
          href="/documents/import"
          style={{ ...secondaryButton, textDecoration: "none", fontSize: "0.85rem" }}
        >
          Import
        </Link>
        {isAdmin && (
          <>
            <form action={exportGitAction}>
              <button type="submit" style={{ ...secondaryButton, fontSize: "0.85rem" }}>
                Rebuild git export
              </button>
            </form>
            <form action={loadTemplatesAction}>
              <button type="submit" style={{ ...secondaryButton, fontSize: "0.85rem" }}>
                Load starter templates
              </button>
            </form>
          </>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
        <Link
          href="/documents"
          style={{
            ...(folder ? secondaryButton : primaryButton),
            textDecoration: "none",
            fontSize: "0.85rem",
          }}
        >
          All
        </Link>
        {folders.map((f) => (
          <Link
            key={f.id}
            href={`/documents?folder=${f.id}`}
            style={{
              ...(folder === f.id ? primaryButton : secondaryButton),
              textDecoration: "none",
              fontSize: "0.85rem",
            }}
          >
            {f.name}
          </Link>
        ))}
        <form
          action={createFolderAction}
          style={{ display: "flex", gap: "0.35rem", marginLeft: "auto" }}
        >
          <input
            name="name"
            placeholder="New folder"
            style={{ ...fieldStyle, padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
          />
          <button type="submit" style={{ ...secondaryButton, fontSize: "0.85rem" }}>
            Add
          </button>
        </form>
      </div>

      {docs.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No documents yet. Create your first one.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>Title</th>
                <th style={th}>Status</th>
                <th style={th}>Type</th>
                <th style={th}>Owner</th>
                <th style={th}>Folder</th>
                <th style={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const status = d.retiredAt
                  ? "retired"
                  : d.currentPublishedVersionId
                    ? "published"
                    : "draft";
                return (
                  <tr key={d.id}>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {d.docCode}
                    </td>
                    <td style={td}>
                      <Link
                        href={`/documents/${d.id}`}
                        style={{ color: "inherit", fontWeight: 600 }}
                      >
                        {d.title}
                      </Link>
                      {status === "published" && d.versions.length > 0 && (
                        <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                          {" "}
                          · draft open
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      <StatusBadge status={status} />
                    </td>
                    <td style={td}>{DOCUMENT_TYPE_LABELS[d.type]}</td>
                    <td style={td}>{d.owner?.name ?? d.owner?.email ?? "—"}</td>
                    <td style={td}>{d.folder?.name ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "var(--muted)" }}>
                      {fmtDate(d.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
