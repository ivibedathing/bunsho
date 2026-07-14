import { Reveal } from "@/components/motion/Reveal";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { VersionStamp } from "@/components/ui/VersionStamp";
import { prisma } from "@/lib/db";
import { diffMarkdown } from "@/lib/diff";
import { versionMarkdown } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import { MoveRight } from "lucide-react";
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
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <VersionStamp version={fromV.version} />
            <MoveRight size={14} strokeWidth={1.75} className="text-ink-muted" aria-hidden />
            <VersionStamp version={toV.version} />
          </span>
        }
        title="Compare versions"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-danger-wash px-1.5 py-0.5 font-mono text-xs text-danger line-through">
              removed
            </span>
            <span className="rounded bg-ok-wash px-1.5 py-0.5 font-mono text-xs text-ok">
              added
            </span>
          </span>
        }
      />

      <Reveal>
        <Card padded={false}>
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words p-5 font-mono text-[0.8125rem] leading-relaxed">
            {keyed.map(({ seg, key }) => (
              <span
                key={key}
                className={
                  seg.added
                    ? "bg-ok-wash text-ok"
                    : seg.removed
                      ? "bg-danger-wash text-danger line-through"
                      : undefined
                }
              >
                {seg.value}
              </span>
            ))}
          </pre>
        </Card>
      </Reveal>
    </div>
  );
}
