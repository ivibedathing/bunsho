import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { appendAudit } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { EMPTY_DOC } from "@/lib/documents";
import { type PMNode, serializeToMarkdown } from "@/lib/markdown/serialize";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export type DocStatus = "draft" | "published" | "retired";

export function documentStatus(doc: {
  retiredAt: Date | null;
  currentPublishedVersionId: string | null;
}): DocStatus {
  if (doc.retiredAt) return "retired";
  if (doc.currentPublishedVersionId) return "published";
  return "draft";
}

/** Markdown for any version — frozen if published, serialized on the fly if a draft. */
export function versionMarkdown(v: { markdown: string | null; prosemirrorJson: unknown }): string {
  return v.markdown ?? serializeToMarkdown(v.prosemirrorJson as PMNode);
}

/**
 * Publish the open draft (F2/F3): freeze its Markdown + SHA, stamp `publishedAt`,
 * supersede the prior current version, and advance the document's
 * current-published projection — all in one transaction, audit-logged. The draft
 * update is permitted by the freeze trigger because the row is not yet published
 * at the moment of the update.
 */
export async function publishDocument(
  orgId: string,
  actorId: string,
  documentId: string,
  changeNote?: string,
) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.documentVersion.findFirst({
      where: { documentId, orgId, publishedAt: null },
    });
    if (!draft) throw new Error("No open draft to publish");
    const doc = await tx.document.findFirstOrThrow({ where: { id: documentId, orgId } });

    const markdown = serializeToMarkdown(draft.prosemirrorJson as unknown as PMNode);
    const contentSha = sha256(markdown);
    const now = new Date();

    if (doc.currentPublishedVersionId) {
      await tx.documentVersion.update({
        where: { id: doc.currentPublishedVersionId },
        data: { supersededAt: now },
      });
    }

    const published = await tx.documentVersion.update({
      where: { id: draft.id },
      data: {
        publishedAt: now,
        markdown,
        contentSha,
        changeNote: changeNote?.trim() ? changeNote.trim() : draft.changeNote,
      },
    });

    await tx.document.update({
      where: { id: documentId },
      data: { currentPublishedVersionId: published.id, retiredAt: null },
    });

    await appendAudit(tx, {
      orgId,
      action: "document_published",
      actorType: "user",
      actorId,
      targetType: "document_version",
      targetId: published.id,
      metadata: { documentId, version: published.version, contentSha },
    });

    return published;
  });
}

/**
 * Ensure the document has an open draft to edit (F2 "editing a Published document
 * forks a new Draft"). Returns the existing draft, or forks a new one (next
 * version number) from the current published content. Forking a draft is
 * edit-in-progress and is not audit-logged — publish is the logged event.
 */
export async function getOrCreateDraft(orgId: string, actorId: string, documentId: string) {
  const existing = await prisma.documentVersion.findFirst({
    where: { documentId, orgId, publishedAt: null },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.findFirstOrThrow({
      where: { id: documentId, orgId },
      include: { currentPublishedVersion: true },
    });
    const max = await tx.documentVersion.aggregate({
      where: { documentId },
      _max: { version: true },
    });
    const base = doc.currentPublishedVersion?.prosemirrorJson ?? EMPTY_DOC;
    return tx.documentVersion.create({
      data: {
        orgId,
        documentId,
        version: (max._max.version ?? 0) + 1,
        prosemirrorJson: base as Prisma.InputJsonValue,
        authorId: actorId,
      },
    });
  });
}

/** Retire a published document (F2; Admin-only per the permission matrix). */
export async function retireDocument(orgId: string, actorId: string, documentId: string) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.findFirstOrThrow({ where: { id: documentId, orgId } });
    if (!doc.currentPublishedVersionId) {
      throw new Error("Only a published document can be retired");
    }
    const now = new Date();
    await tx.documentVersion.update({
      where: { id: doc.currentPublishedVersionId },
      data: { retiredAt: now },
    });
    await tx.document.update({ where: { id: documentId }, data: { retiredAt: now } });

    await appendAudit(tx, {
      orgId,
      action: "document_retired",
      actorType: "user",
      actorId,
      targetType: "document",
      targetId: documentId,
      metadata: { version: doc.currentPublishedVersionId },
    });
  });
}

/**
 * Restore a prior version (F4): stage its content into the open draft (creating
 * one if needed). History is never deleted — restore produces a new draft that
 * becomes a new version when published.
 */
export async function restoreVersion(
  orgId: string,
  actorId: string,
  documentId: string,
  versionId: string,
) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.documentVersion.findFirstOrThrow({
      where: { id: versionId, documentId, orgId },
    });
    const existingDraft = await tx.documentVersion.findFirst({
      where: { documentId, orgId, publishedAt: null },
    });

    let draft: { id: string; version: number };
    if (existingDraft) {
      draft = await tx.documentVersion.update({
        where: { id: existingDraft.id },
        data: { prosemirrorJson: source.prosemirrorJson as Prisma.InputJsonValue },
        select: { id: true, version: true },
      });
    } else {
      const max = await tx.documentVersion.aggregate({
        where: { documentId },
        _max: { version: true },
      });
      draft = await tx.documentVersion.create({
        data: {
          orgId,
          documentId,
          version: (max._max.version ?? 0) + 1,
          prosemirrorJson: source.prosemirrorJson as Prisma.InputJsonValue,
          authorId: actorId,
        },
        select: { id: true, version: true },
      });
    }

    await appendAudit(tx, {
      orgId,
      action: "document_restored",
      actorType: "user",
      actorId,
      targetType: "document",
      targetId: documentId,
      metadata: { restoredFromVersion: source.version, intoDraftVersion: draft.version },
    });

    return draft;
  });
}

/** Full document view: metadata, current published, open draft, and version history. */
export async function getDocumentDetail(orgId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, orgId },
    include: {
      folder: { select: { name: true } },
      owner: { select: { name: true, email: true } },
      currentPublishedVersion: true,
      versions: {
        orderBy: { version: "desc" },
        include: { author: { select: { name: true, email: true } } },
      },
    },
  });
  if (!doc) return null;

  const draft = doc.versions.find((v) => v.publishedAt === null) ?? null;
  const published = doc.versions
    .filter((v) => v.publishedAt !== null)
    .sort((a, b) => b.version - a.version);

  return { doc, draft, published, status: documentStatus(doc) };
}
