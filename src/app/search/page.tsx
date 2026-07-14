import { fieldStyle, primaryButton } from "@/app/auth-ui";
import { StatusBadge } from "@/app/documents/StatusBadge";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { listFolders } from "@/lib/folders";
import { requireUser } from "@/lib/rbac";
import { type SearchRow, searchDocuments } from "@/lib/search";
import Link from "next/link";

export const dynamic = "force-dynamic";

const td: React.CSSProperties = {
  padding: "0.55rem 0.6rem",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.9rem",
};
const th: React.CSSProperties = {
  ...td,
  color: "var(--muted)",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

function statusOf(r: SearchRow): string {
  return r.retiredAt ? "retired" : r.currentPublishedVersionId ? "published" : "draft";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; folder?: string; type?: string; status?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const query = sp.q ?? "";
  const isViewer = user.role === "viewer";

  const [folders, results] = await Promise.all([
    listFolders(user.orgId),
    searchDocuments(user.orgId, user.role, {
      query,
      folderId: sp.folder || undefined,
      type: sp.type || undefined,
      status: sp.status || undefined,
    }),
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
        <h1 style={{ fontSize: "1.6rem", margin: 0, letterSpacing: "-0.02em" }}>Search</h1>
        <Link href="/" style={{ color: "var(--muted)" }}>
          ← Home
        </Link>
      </div>

      <form
        method="get"
        action="/search"
        style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "end" }}
      >
        <input
          name="q"
          defaultValue={query}
          placeholder="Search documents…"
          style={{ ...fieldStyle, flex: "1 1 16rem" }}
          // biome-ignore lint/a11y/noAutofocus: search is the page's primary action
          autoFocus
        />
        <select name="folder" defaultValue={sp.folder ?? ""} style={fieldStyle}>
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} style={fieldStyle}>
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {!isViewer && (
          <select name="status" defaultValue={sp.status ?? ""} style={fieldStyle}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="retired">Retired</option>
          </select>
        )}
        <button type="submit" style={primaryButton}>
          Search
        </button>
      </form>

      {results.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          {query ? `No documents match “${query}”.` : "No documents found."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>Title</th>
                <th style={th}>Status</th>
                <th style={th}>Type</th>
                <th style={th}>Folder</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {r.docCode}
                  </td>
                  <td style={td}>
                    <Link href={`/documents/${r.id}`} style={{ color: "inherit", fontWeight: 600 }}>
                      {r.title}
                    </Link>
                  </td>
                  <td style={td}>
                    <StatusBadge status={statusOf(r)} />
                  </td>
                  <td style={td}>
                    {DOCUMENT_TYPE_LABELS[r.type as keyof typeof DOCUMENT_TYPE_LABELS] ?? r.type}
                  </td>
                  <td style={td}>{r.folderName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
