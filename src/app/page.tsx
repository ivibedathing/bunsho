import { primaryButton, secondaryButton } from "@/app/auth-ui";
import { signOut } from "@/auth";
import type { Role } from "@/generated/prisma/client";
import { documentStats, recentDocuments } from "@/lib/dashboard";
import { DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { requireUser } from "@/lib/rbac";
import { searchDocuments } from "@/lib/search";
import Link from "next/link";
import type { CSSProperties } from "react";
import { StatusBadge } from "./documents/StatusBadge";

export const dynamic = "force-dynamic";

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.7rem",
  padding: "1rem 1.1rem",
  display: "grid",
  gap: "0.15rem",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={card}>
      <span style={{ fontSize: "1.8rem", fontWeight: 700, lineHeight: 1 }}>{value}</span>
      <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{label}</span>
    </div>
  );
}

function statusOf(d: { retiredAt: Date | null; currentPublishedVersionId: string | null }): string {
  return d.retiredAt ? "retired" : d.currentPublishedVersionId ? "published" : "draft";
}

export default async function Home() {
  const user = await requireUser();
  const canManage = user.role !== "viewer";

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <main
      style={{
        maxWidth: "60rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1.5rem",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.7rem", letterSpacing: "-0.02em" }}>
            Bunsho <span lang="ja">文書</span>
          </h1>
          <p style={{ margin: "0.15rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            {user.name ?? user.email} · {user.role}
          </p>
        </div>
        <form action={doSignOut}>
          <button type="submit" style={secondaryButton}>
            Sign out
          </button>
        </form>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link href="/search" style={{ ...primaryButton, textDecoration: "none" }}>
          Search documents
        </Link>
        {canManage && (
          <>
            <Link href="/documents" style={{ ...secondaryButton, textDecoration: "none" }}>
              All documents
            </Link>
            <Link href="/documents/new" style={{ ...secondaryButton, textDecoration: "none" }}>
              + New document
            </Link>
          </>
        )}
      </div>

      {canManage ? (
        <ManagerDashboard orgId={user.orgId} />
      ) : (
        <ViewerDashboard orgId={user.orgId} role={user.role} />
      )}
    </main>
  );
}

async function ManagerDashboard({ orgId }: { orgId: string }) {
  const [stats, recent] = await Promise.all([documentStats(orgId), recentDocuments(orgId)]);
  return (
    <>
      <section
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
        }}
      >
        <Stat label="Documents" value={stats.total} />
        <Stat label="Drafts in progress" value={stats.draftsInProgress} />
        <Stat label="Published" value={stats.published} />
        <Stat label="Retired" value={stats.retired} />
        <Stat label="Pending AI suggestions" value={stats.pendingSuggestions} />
      </section>

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Recently updated</h2>
        {recent.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No documents yet. <Link href="/documents/new">Create your first one.</Link>
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
            {recent.map((d) => (
              <li key={d.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span
                  style={{
                    color: "var(--muted)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: "5rem",
                    fontSize: "0.85rem",
                  }}
                >
                  {d.docCode}
                </span>
                <Link href={`/documents/${d.id}`} style={{ fontWeight: 600, flex: 1 }}>
                  {d.title}
                </Link>
                <StatusBadge status={statusOf(d)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function ViewerDashboard({ orgId, role }: { orgId: string; role: Role }) {
  const published = (await searchDocuments(orgId, role, { query: "" })).slice(0, 10);
  return (
    <section style={{ display: "grid", gap: "0.5rem" }}>
      <h2 style={{ fontSize: "1rem", margin: 0 }}>Published documents</h2>
      {published.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No published documents yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
          {published.map((d) => (
            <li key={d.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span
                style={{
                  color: "var(--muted)",
                  fontVariantNumeric: "tabular-nums",
                  minWidth: "5rem",
                  fontSize: "0.85rem",
                }}
              >
                {d.docCode}
              </span>
              <Link href={`/documents/${d.id}`} style={{ fontWeight: 600, flex: 1 }}>
                {d.title}
              </Link>
              <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                {DOCUMENT_TYPE_LABELS[d.type as keyof typeof DOCUMENT_TYPE_LABELS] ?? d.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
