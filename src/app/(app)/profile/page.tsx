import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Card } from "@/components/ui/Card";
import { DocCode } from "@/components/ui/DocCode";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AuditAction } from "@/generated/prisma/client";
import { type ActivityItem, recentActivityByUser } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import {
  Archive,
  FilePlus2,
  History,
  type LucideIcon,
  Paperclip,
  PenLine,
  RotateCcw,
  Settings2,
  Sparkles,
  Stamp,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ACTIONS: Record<AuditAction, { label: string; icon: LucideIcon }> = {
  document_created: { label: "Created", icon: FilePlus2 },
  document_edited: { label: "Edited", icon: PenLine },
  document_published: { label: "Published", icon: Stamp },
  document_restored: { label: "Restored a version of", icon: RotateCcw },
  document_retired: { label: "Retired", icon: Archive },
  document_deleted: { label: "Deleted", icon: Trash2 },
  version_created: { label: "Started a new draft of", icon: PenLine },
  suggestion_created: { label: "Raised a suggestion on", icon: Sparkles },
  suggestion_accepted: { label: "Accepted a suggestion on", icon: Sparkles },
  suggestion_rejected: { label: "Dismissed a suggestion on", icon: Sparkles },
  user_created: { label: "Created a user account", icon: UserRound },
  user_deactivated: { label: "Deactivated a user account", icon: UserRound },
  user_role_changed: { label: "Changed a user's role", icon: UserRound },
  settings_changed: { label: "Changed settings", icon: Settings2 },
  attachment_added: { label: "Attached a file to", icon: Paperclip },
  attachment_deleted: { label: "Removed an attachment from", icon: Paperclip },
};

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function sentence(item: ActivityItem): string {
  const base = ACTIONS[item.action].label;
  if (item.action === "document_published" && typeof item.metadata?.version === "number") {
    return `Published v${item.metadata.version} of`;
  }
  return base;
}

/** Fallback title for entries whose document is gone (metadata keeps the name). */
function ghostTitle(item: ActivityItem): string | null {
  return typeof item.metadata?.title === "string" ? item.metadata.title : null;
}

export default async function ProfilePage() {
  const user = await requireUser();
  const [account, activity] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } }),
    recentActivityByUser(user.orgId, user.id),
  ]);

  const display = user.name ?? user.email;
  const initials = display
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Profile"
        meta="Your account, and everything you've done — straight from the audit log."
      />

      <Card className="flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gold-wash font-mono text-lg font-semibold text-gold">
          {initials}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-display text-lg font-bold text-ink">{display}</span>
          <span className="truncate text-sm text-ink-muted">{user.email}</span>
        </div>
        <div className="ml-auto grid gap-0.5 text-right">
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-gold">
            {user.role}
          </span>
          <span className="text-xs text-ink-muted">Member since {fmt(account.createdAt)}</span>
        </div>
      </Card>

      <section className="grid gap-3">
        <h2 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Activity
        </h2>
        {activity.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            hint="Actions you take — creating, publishing, retiring documents — land here, backed by the audit log."
          />
        ) : (
          <Card padded={false}>
            <Stagger>
              {activity.map((item) => {
                const Icon = ACTIONS[item.action].icon;
                const ghost = ghostTitle(item);
                return (
                  <StaggerItem key={item.seq}>
                    <div className="flex items-center gap-3.5 border-b border-line/60 px-4 py-3 last:border-b-0">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-wash/70 text-gold">
                        <Icon size={15} strokeWidth={1.75} aria-hidden />
                      </span>
                      <p className="m-0 min-w-0 flex-1 truncate text-sm text-ink">
                        {sentence(item)}{" "}
                        {item.document ? (
                          <Link
                            href={`/documents/${item.document.id}`}
                            className="font-medium text-ink no-underline hover:text-gold"
                          >
                            <DocCode code={item.document.docCode} /> {item.document.title}
                          </Link>
                        ) : (
                          ghost && <span className="text-ink-muted">{ghost}</span>
                        )}
                      </p>
                      <span className="shrink-0 whitespace-nowrap text-xs text-ink-muted">
                        {fmt(item.createdAt)}
                      </span>
                    </div>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </Card>
        )}
      </section>
    </div>
  );
}
