import type { Prisma } from "@/generated/prisma/client";
import { appendAudit } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";

/** An empty ProseMirror document — the starting content for a new draft. */
export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

const CODE_PREFIX = "DOC";

/** Suggest the next unused doc code, e.g. DOC-001 → DOC-002. Codes carried over
 *  from the old per-type prefixes (POL-, SOP-, …) are left alone. */
export async function nextDocCode(orgId: string): Promise<string> {
  const existing = await prisma.document.findMany({
    where: { orgId, docCode: { startsWith: `${CODE_PREFIX}-` } },
    select: { docCode: true },
  });
  let max = 0;
  for (const { docCode } of existing) {
    const n = Number.parseInt(docCode.slice(CODE_PREFIX.length + 1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${CODE_PREFIX}-${String(max + 1).padStart(3, "0")}`;
}

export interface CreateDocumentInput {
  title: string;
  docCode: string;
  folderId?: string | null;
  parentId?: string | null;
  ownerId?: string | null;
  tags?: string[];
}

/**
 * Resolve a requested parent page to one this org actually owns. The id arrives
 * from a form, so an id belonging to another tenant would otherwise nest a page
 * under a document its org can't see.
 */
async function resolveParent(orgId: string, parentId?: string | null): Promise<string | null> {
  if (!parentId) return null;
  const parent = await prisma.document.findFirst({
    where: { id: parentId, orgId },
    select: { id: true },
  });
  if (!parent) throw new Error("Parent page not found");
  return parent.id;
}

/** Resolve a requested folder to one this org owns, for the same tenancy reason
 *  as `resolveParent`: the id arrives from a form or a drag payload. */
async function resolveFolder(orgId: string, folderId?: string | null): Promise<string | null> {
  if (!folderId) return null;
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, orgId },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder not found");
  return folder.id;
}

/**
 * Re-file a document into a folder (or to no folder, `null`). Filing, not
 * controlled content — so, like folder create/rename, it is deliberately not
 * audit-logged (DECISIONS.md — folders are filing).
 *
 * Moving into a folder clears `parentId`: `documents_child_has_no_folder` makes
 * folder and parent mutually exclusive, so a nested page dragged into a folder
 * detaches from its parent and becomes a root page there — the same gesture a
 * file manager gives. Moving to no folder (drop on "Unfiled") also detaches, so
 * the page lands at the top level. Children of the moved page are untouched;
 * they still derive their location from it.
 */
export async function moveDocument(
  orgId: string,
  documentId: string,
  folderId: string | null,
): Promise<void> {
  const resolvedFolder = await resolveFolder(orgId, folderId);
  const { count } = await prisma.document.updateMany({
    where: { id: documentId, orgId },
    data: { folderId: resolvedFolder, parentId: null, updatedAt: new Date() },
  });
  if (count === 0) throw new Error("Document not found");
}

/**
 * Create a document and its initial (version 1) draft in one transaction, and
 * record the `document_created` audit entry. The draft is mutable (publishedAt
 * null); publishing it is M3.
 *
 * A page nested under a parent derives its location from that parent, so any
 * `folderId` passed alongside a `parentId` is dropped — the DB CHECK
 * (`documents_child_has_no_folder`) refuses the row otherwise.
 */
export async function createDocument(orgId: string, actorId: string, input: CreateDocumentInput) {
  const parentId = await resolveParent(orgId, input.parentId);

  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        orgId,
        docCode: input.docCode,
        title: input.title,
        folderId: parentId ? null : (input.folderId ?? null),
        parentId,
        ownerId: input.ownerId ?? actorId,
        tags: input.tags ?? [],
      },
    });

    await tx.documentVersion.create({
      data: {
        orgId,
        documentId: doc.id,
        version: 1,
        prosemirrorJson: EMPTY_DOC as unknown as Prisma.InputJsonValue,
        authorId: actorId,
      },
    });

    await appendAudit(tx, {
      orgId,
      action: "document_created",
      actorType: "user",
      actorId,
      targetType: "document",
      targetId: doc.id,
      metadata: { docCode: doc.docCode, title: doc.title },
    });

    return doc;
  });
}

export async function listDocuments(orgId: string, opts: { folderId?: string | null } = {}) {
  return prisma.document.findMany({
    where: {
      orgId,
      ...(opts.folderId !== undefined ? { folderId: opts.folderId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { name: true, email: true } },
      folder: { select: { name: true } },
      // For the status badge: is there an open (unpublished) draft?
      versions: { where: { publishedAt: null }, select: { id: true }, take: 1 },
    },
  });
}

/** Fetch a document with its open draft version for the editor. */
export async function getDocumentWithDraft(orgId: string, documentId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, orgId },
    include: {
      folder: { select: { name: true } },
      versions: { where: { publishedAt: null }, orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!doc) return null;
  return { doc, draft: doc.versions[0] ?? null };
}

/**
 * Autosave: overwrite the open draft's ProseMirror JSON and bump the document's
 * last-updated time. Scoped by orgId so a request can't touch another tenant.
 */
export async function saveDraft(
  orgId: string,
  documentId: string,
  prosemirrorJson: unknown,
): Promise<void> {
  const draft = await prisma.documentVersion.findFirst({
    where: { documentId, orgId, publishedAt: null },
    select: { id: true },
  });
  if (!draft) throw new Error("No open draft to save");

  await prisma.$transaction([
    prisma.documentVersion.update({
      where: { id: draft.id },
      data: { prosemirrorJson: prosemirrorJson as Prisma.InputJsonValue },
    }),
    prisma.document.update({
      where: { id: documentId },
      data: { updatedAt: new Date() },
    }),
  ]);
}
