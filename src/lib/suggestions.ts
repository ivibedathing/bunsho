import type { ActorType, Prisma, SuggestionOrigin } from "@/generated/prisma/client";
import { appendAudit } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";

/**
 * The AI suggestions queue (PRD §7 F8f/g). AI output — deterministic checks or
 * LLM review — lands here as `pending`; nothing touches a document until a human
 * accepts. Accepting a *content* suggestion applies it to the draft (creating one
 * if needed) and is audit-logged as AI-originated with the approving human named.
 */

export type SuggestionKind = "review" | "rewrite" | "staleness" | "broken_reference";

export interface SuggestionPayload {
  kind: SuggestionKind;
  title: string;
  message: string;
  /** Present for content suggestions: the proposed ProseMirror JSON to stage. */
  proposedJson?: unknown;
}

export interface CreateSuggestionInput {
  documentId: string;
  baseVersionId: string;
  origin: SuggestionOrigin;
  actorType: ActorType; // "ai" for the agent, "system" for deterministic checks
  payload: SuggestionPayload;
}

/**
 * Create a pending suggestion, de-duplicated: if an identical pending suggestion
 * (same document + kind + title) already exists, returns null instead of piling
 * on. Logs `suggestion_created`.
 */
export async function createSuggestion(
  orgId: string,
  input: CreateSuggestionInput,
): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.suggestion.findMany({
      where: { orgId, documentId: input.documentId, status: "pending" },
      select: { payload: true },
    });
    const dup = pending.some((s) => {
      const p = s.payload as { kind?: string; title?: string } | null;
      return p?.kind === input.payload.kind && p?.title === input.payload.title;
    });
    if (dup) return null;

    const created = await tx.suggestion.create({
      data: {
        orgId,
        documentId: input.documentId,
        baseVersionId: input.baseVersionId,
        origin: input.origin,
        status: "pending",
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await appendAudit(tx, {
      orgId,
      action: "suggestion_created",
      actorType: input.actorType,
      actorId: null,
      targetType: "suggestion",
      targetId: created.id,
      metadata: { documentId: input.documentId, kind: input.payload.kind, origin: input.origin },
    });

    return created;
  });
}

export async function listPendingSuggestions(orgId: string, documentId: string) {
  return prisma.suggestion.findMany({
    where: { orgId, documentId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function countPendingSuggestions(orgId: string): Promise<number> {
  return prisma.suggestion.count({ where: { orgId, status: "pending" } });
}

/**
 * Accept a suggestion. Content suggestions (payload.proposedJson present) are
 * applied to the document's open draft — forking one from the current published
 * version if none exists — so accepting *creates a new version* (F8g). Advisory
 * suggestions (staleness, review notes) are simply acknowledged. Either way the
 * resolution is logged as AI-originated with the approving human recorded.
 */
export async function acceptSuggestion(
  orgId: string,
  actorId: string,
  suggestionId: string,
): Promise<{ appliedToDraftVersion: number | null }> {
  return prisma.$transaction(async (tx) => {
    const suggestion = await tx.suggestion.findFirstOrThrow({
      where: { id: suggestionId, orgId, status: "pending" },
    });
    const payload = suggestion.payload as unknown as SuggestionPayload;

    let appliedToDraftVersion: number | null = null;

    if (payload.proposedJson !== undefined && payload.proposedJson !== null) {
      const draft = await tx.documentVersion.findFirst({
        where: { documentId: suggestion.documentId, orgId, publishedAt: null },
      });
      if (draft) {
        const updated = await tx.documentVersion.update({
          where: { id: draft.id },
          data: { prosemirrorJson: payload.proposedJson as Prisma.InputJsonValue },
          select: { version: true },
        });
        appliedToDraftVersion = updated.version;
      } else {
        const max = await tx.documentVersion.aggregate({
          where: { documentId: suggestion.documentId },
          _max: { version: true },
        });
        const created = await tx.documentVersion.create({
          data: {
            orgId,
            documentId: suggestion.documentId,
            version: (max._max.version ?? 0) + 1,
            prosemirrorJson: payload.proposedJson as Prisma.InputJsonValue,
            authorId: actorId,
          },
          select: { version: true },
        });
        appliedToDraftVersion = created.version;
      }
      await tx.document.update({
        where: { id: suggestion.documentId },
        data: { updatedAt: new Date() },
      });
    }

    await tx.suggestion.update({
      where: { id: suggestion.id },
      data: { status: "accepted", actingHumanId: actorId, resolvedAt: new Date() },
    });

    await appendAudit(tx, {
      orgId,
      action: "suggestion_accepted",
      actorType: "user",
      actorId,
      targetType: "suggestion",
      targetId: suggestion.id,
      metadata: {
        documentId: suggestion.documentId,
        kind: payload.kind,
        aiOriginated: true,
        appliedToDraftVersion,
      },
    });

    return { appliedToDraftVersion };
  });
}

export async function rejectSuggestion(
  orgId: string,
  actorId: string,
  suggestionId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const suggestion = await tx.suggestion.findFirstOrThrow({
      where: { id: suggestionId, orgId, status: "pending" },
    });
    await tx.suggestion.update({
      where: { id: suggestion.id },
      data: { status: "rejected", actingHumanId: actorId, resolvedAt: new Date() },
    });
    await appendAudit(tx, {
      orgId,
      action: "suggestion_rejected",
      actorType: "user",
      actorId,
      targetType: "suggestion",
      targetId: suggestion.id,
      metadata: { documentId: suggestion.documentId, aiOriginated: true },
    });
  });
}
