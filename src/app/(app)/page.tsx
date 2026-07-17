import { Archive, FilePlus2, FileText, PenLine, Search, Sparkles, Stamp } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { ProgressRing } from "@/components/motion/ProgressRing";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DocCode } from "@/components/ui/DocCode";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusSeal } from "@/components/ui/StatusSeal";
import type { Role } from "@/generated/prisma/client";
import { documentStats, recentDocuments } from "@/lib/dashboard";
import { requireUser } from "@/lib/rbac";
import { searchDocuments } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const canManage = user.role !== "viewer";

  return (
    <div className="grid gap-8">
      <PageHeader
        title={<>Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}</>}
        meta="Your controlled library, at a glance."
        actions={
          <>
            <Button href="/explorer" variant="secondary">
              <Search size={15} strokeWidth={1.75} aria-hidden />
              Search
            </Button>
            {canManage && (
              <Button href="/documents/new" variant="primary">
                <FilePlus2 size={15} strokeWidth={1.75} aria-hidden />
                New document
              </Button>
            )}
          </>
        }
      />

      {canManage ? (
        <ManagerDashboard orgId={user.orgId} />
      ) : (
        <ViewerDashboard orgId={user.orgId} role={user.role} />
      )}
    </div>
  );
}

async function ManagerDashboard({ orgId }: { orgId: string }) {
  const [stats, recent] = await Promise.all([documentStats(orgId), recentDocuments(orgId)]);
  const inForceMax = stats.published + stats.draftsInProgress;
  const pct = inForceMax > 0 ? Math.round((stats.published / inForceMax) * 100) : 0;

  return (
    <>
      <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StaggerItem>
          <Card padded={false} className="flex h-full items-center gap-4 p-4">
            <ProgressRing value={stats.published} max={inForceMax} size={88} strokeWidth={7}>
              <span className="font-display text-lg font-bold tabular-nums">{pct}%</span>
            </ProgressRing>
            <div className="grid gap-0.5">
              <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-muted">
                Library health
              </span>
              <span className="text-sm text-ink">
                {stats.published} of {inForceMax} in force
              </span>
              <span className="text-xs text-ink-muted">
                {stats.draftsInProgress === 0
                  ? "Nothing waiting to publish"
                  : `${stats.draftsInProgress} draft${stats.draftsInProgress === 1 ? "" : "s"} to finish`}
              </span>
            </div>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Documents" icon={FileText}>
            <AnimatedNumber value={stats.total} />
          </StatTile>
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Drafts in progress" icon={PenLine}>
            <AnimatedNumber value={stats.draftsInProgress} />
          </StatTile>
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Published" icon={Stamp}>
            <AnimatedNumber value={stats.published} />
          </StatTile>
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Retired" icon={Archive}>
            <AnimatedNumber value={stats.retired} />
          </StatTile>
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Pending suggestions" icon={Sparkles}>
            <AnimatedNumber value={stats.pendingSuggestions} />
          </StatTile>
        </StaggerItem>
      </Stagger>

      <section className="grid gap-3">
        <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Recently updated
        </h2>
        {recent.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="A fresh sheet of paper"
            hint="Nothing here yet — create your first controlled document and it will appear here."
            action={
              <Button href="/documents/new" variant="primary">
                New document
              </Button>
            }
          />
        ) : (
          <Card padded={false}>
            <Stagger>
              {recent.map((d) => (
                <StaggerItem key={d.id}>
                  <Link
                    href={`/documents/${d.id}`}
                    className="flex items-center gap-4 border-b border-line/60 px-4 py-3 no-underline transition-colors last:border-b-0 hover:bg-gold-wash/40"
                  >
                    <DocCode code={d.docCode} className="min-w-20" />
                    <span className="flex-1 truncate font-medium text-ink">{d.title}</span>
                    {d.retiredAt && <StatusSeal status="retired" />}
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          </Card>
        )}
      </section>
    </>
  );
}

async function ViewerDashboard({ orgId, role }: { orgId: string; role: Role }) {
  const published = (await searchDocuments(orgId, role, { query: "" })).slice(0, 10);
  return (
    <section className="grid gap-3">
      <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Published documents
      </h2>
      {published.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing published yet"
          hint="When documents are published, they’ll show up here — check back soon."
        />
      ) : (
        <Card padded={false}>
          <Stagger>
            {published.map((d) => (
              <StaggerItem key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  className="flex items-center gap-4 border-b border-line/60 px-4 py-3 no-underline transition-colors last:border-b-0 hover:bg-gold-wash/40"
                >
                  <DocCode code={d.docCode} className="min-w-20" />
                  <span className="flex-1 truncate font-medium text-ink">{d.title}</span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      )}
    </section>
  );
}
