import { prisma } from "@/lib/db";
import { diffMarkdown } from "@/lib/diff";
import { versionMarkdown } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireRole("admin", "editor");
  const { id } = await params;
  const { from, to } = await searchParams;
  if (!from || !to) notFound();

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id, orgId: user.orgId, id: { in: [from, to] } },
  });
  const fromV = versions.find((v) => v.id === from);
  const toV = versions.find((v) => v.id === to);
  if (!fromV || !toV) notFound();

  const segments = diffMarkdown(versionMarkdown(fromV), versionMarkdown(toV));
  // Stable, non-index keys: the running character offset is unique per segment.
  let offset = 0;
  const keyed = segments.map((seg) => {
    const key = `${offset}:${seg.added ? "+" : seg.removed ? "-" : "="}`;
    offset += seg.value.length;
    return { seg, key };
  });

  return (
    <main
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1rem",
      }}
    >
      <Link href={`/documents/${id}`} style={{ color: "var(--muted)" }}>
        ← Back to document
      </Link>
      <h1 style={{ margin: 0, fontSize: "1.4rem" }}>
        Diff · v{fromV.version} → v{toV.version}
      </h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>
        <span style={{ background: "#fecaca", padding: "0 0.25rem" }}>removed</span>{" "}
        <span style={{ background: "#bbf7d0", padding: "0 0.25rem" }}>added</span>
      </p>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.85rem",
          lineHeight: 1.6,
          border: "1px solid var(--border)",
          borderRadius: "0.6rem",
          padding: "1rem",
          margin: 0,
        }}
      >
        {keyed.map(({ seg, key }) => (
          <span
            key={key}
            style={
              seg.added
                ? { background: "#bbf7d0", color: "#14532d" }
                : seg.removed
                  ? { background: "#fecaca", color: "#7f1d1d", textDecoration: "line-through" }
                  : undefined
            }
          >
            {seg.value}
          </span>
        ))}
      </pre>
    </main>
  );
}
