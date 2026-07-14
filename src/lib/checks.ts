import type { SuggestionOrigin } from "@/generated/prisma/client";
import { reviewMarkdown, summarizeMarkdown } from "@/lib/ai/anthropic";
import { prisma } from "@/lib/db";
import { versionMarkdown } from "@/lib/lifecycle";
import { createSuggestion } from "@/lib/suggestions";

/**
 * Document checks (PRD §7 F8d/e). Staleness and broken-reference checks are
 * deterministic (no LLM) and cheap, so they run against every published doc;
 * results become advisory suggestions in the queue. `maxPerRun` is the cost/rate
 * guard (§6 AI cost/reliability). The LLM-backed review lives here too but is
 * invoked on demand per document.
 */

const STALE_DAYS = Number(process.env.AI_STALENESS_DAYS ?? 180);
const MAX_PER_RUN = Number(process.env.AI_MAX_SUGGESTIONS_PER_RUN ?? 50);
const DOC_CODE_RE = /\b[A-Z]{2,6}-\d{3,}\b/g;

export interface CheckResult {
  scanned: number;
  created: number;
  cappedAt: number | null;
}

export async function runDocumentChecks(
  orgId: string,
  opts: { documentId?: string; origin: SuggestionOrigin; maxPerRun?: number },
): Promise<CheckResult> {
  const cap = opts.maxPerRun ?? MAX_PER_RUN;

  const docs = await prisma.document.findMany({
    where: {
      orgId,
      currentPublishedVersionId: { not: null },
      retiredAt: null,
      ...(opts.documentId ? { id: opts.documentId } : {}),
    },
    include: { currentPublishedVersion: true },
  });

  const publishedDocs = await prisma.document.findMany({
    where: { orgId, currentPublishedVersionId: { not: null }, retiredAt: null },
    select: { docCode: true },
  });
  const validCodes = new Set(publishedDocs.map((d) => d.docCode));

  let created = 0;
  let capped = false;
  const now = Date.now();

  for (const doc of docs) {
    const v = doc.currentPublishedVersion;
    if (!v) continue;
    if (created >= cap) {
      capped = true;
      break;
    }

    // Staleness
    if (v.publishedAt) {
      const ageDays = Math.floor((now - v.publishedAt.getTime()) / 86_400_000);
      if (ageDays >= STALE_DAYS) {
        const r = await createSuggestion(orgId, {
          documentId: doc.id,
          baseVersionId: v.id,
          origin: opts.origin,
          actorType: "ai",
          payload: {
            kind: "staleness",
            title: `Review overdue (${ageDays}d)`,
            message: `${doc.docCode} was last published ${ageDays} days ago (threshold ${STALE_DAYS}). Confirm it is still accurate or publish an update.`,
          },
        });
        if (r) created++;
      }
    }

    // Broken internal references (doc codes that aren't current published docs)
    const md = versionMarkdown(v);
    const refs = new Set((md.match(DOC_CODE_RE) ?? []).filter((c) => c !== doc.docCode));
    for (const ref of refs) {
      if (created >= cap) {
        capped = true;
        break;
      }
      if (!validCodes.has(ref)) {
        const r = await createSuggestion(orgId, {
          documentId: doc.id,
          baseVersionId: v.id,
          origin: opts.origin,
          actorType: "ai",
          payload: {
            kind: "broken_reference",
            title: `Broken reference to ${ref}`,
            message: `${doc.docCode} references ${ref}, which is not a current published document. Update or remove the reference.`,
          },
        });
        if (r) created++;
      }
    }
  }

  return { scanned: docs.length, created, cappedAt: capped ? cap : null };
}

/** Content to feed the LLM: the current published version, or the open draft. */
async function contentVersion(orgId: string, documentId: string) {
  const doc = await prisma.document.findFirstOrThrow({
    where: { id: documentId, orgId },
    include: {
      currentPublishedVersion: true,
      versions: { where: { publishedAt: null }, orderBy: { version: "desc" }, take: 1 },
    },
  });
  const version = doc.currentPublishedVersion ?? doc.versions[0];
  if (!version) throw new Error("Document has no content to analyze");
  return version;
}

/** On-demand AI summary (F8a) — returned inline, not queued. */
export async function runAiSummary(orgId: string, documentId: string): Promise<string> {
  const version = await contentVersion(orgId, documentId);
  return summarizeMarkdown(versionMarkdown(version));
}

/** On-demand AI review (F8c) — notes become an advisory suggestion in the queue. */
export async function runAiReview(
  orgId: string,
  documentId: string,
): Promise<{ id: string } | null> {
  const version = await contentVersion(orgId, documentId);
  const notes = await reviewMarkdown(versionMarkdown(version));
  return createSuggestion(orgId, {
    documentId,
    baseVersionId: version.id,
    origin: "on_demand",
    actorType: "ai",
    payload: { kind: "review", title: "AI review", message: notes },
  });
}
