import { createHash } from "node:crypto";
import { appendAudit } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";

/**
 * Document attachments (F-side of the editor: images, evidence files, source
 * spreadsheets). Bytes are stored in Postgres so the deployment stays exactly
 * two services (PRD §8); this is fine at compliance-doc scale but is why the
 * per-file cap below exists. Files are served only through
 * `/api/attachments/[id]`, which re-checks auth + org scope on every read.
 */

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/** Raster types the serve route renders inline; everything else downloads. */
export const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isInlineImageType(mimeType: string): boolean {
  return INLINE_IMAGE_TYPES.has(mimeType);
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  uploadedBy: { name: string | null; email: string } | null;
}

export async function listAttachments(
  orgId: string,
  documentId: string,
): Promise<AttachmentMeta[]> {
  return prisma.attachment.findMany({
    where: { orgId, documentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploadedBy: { select: { name: true, email: true } },
    },
  });
}

/** Fetch one attachment with its bytes, plus the document state the serve
 *  route needs to enforce the viewer rule (viewers see published docs only). */
export async function getAttachmentWithData(orgId: string, attachmentId: string) {
  return prisma.attachment.findFirst({
    where: { id: attachmentId, orgId },
    include: {
      document: {
        select: { id: true, retiredAt: true, currentPublishedVersionId: true },
      },
    },
  });
}

export interface CreateAttachmentInput {
  documentId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

/** Store one attachment and its `attachment_added` audit entry atomically. */
export async function createAttachment(
  orgId: string,
  actorId: string,
  input: CreateAttachmentInput,
): Promise<{ id: string }> {
  if (input.data.byteLength === 0) throw new Error("Attachment is empty.");
  if (input.data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment exceeds the ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB limit.`,
    );
  }

  // Org-scope the parent document before writing anything.
  const doc = await prisma.document.findFirst({
    where: { id: input.documentId, orgId },
    select: { id: true },
  });
  if (!doc) throw new Error("Document not found");

  const sha256 = createHash("sha256").update(input.data).digest("hex");

  return prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        orgId,
        documentId: input.documentId,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.data.byteLength,
        sha256,
        // Copy into a plain Uint8Array — Prisma's Bytes type rejects Buffer's
        // ArrayBufferLike-backed view under strict TS.
        data: new Uint8Array(input.data),
        uploadedById: actorId,
      },
      select: { id: true },
    });

    await appendAudit(tx, {
      orgId,
      action: "attachment_added",
      actorType: "user",
      actorId,
      targetType: "attachment",
      targetId: attachment.id,
      metadata: {
        documentId: input.documentId,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.data.byteLength,
        sha256,
      },
    });

    return attachment;
  });
}

/** Delete one attachment and record `attachment_deleted` atomically. */
export async function deleteAttachment(
  orgId: string,
  actorId: string,
  attachmentId: string,
): Promise<void> {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, orgId },
    select: { id: true, documentId: true, filename: true, sha256: true },
  });
  if (!attachment) throw new Error("Attachment not found");

  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: attachment.id } });
    await appendAudit(tx, {
      orgId,
      action: "attachment_deleted",
      actorType: "user",
      actorId,
      targetType: "attachment",
      targetId: attachment.id,
      metadata: {
        documentId: attachment.documentId,
        filename: attachment.filename,
        sha256: attachment.sha256,
      },
    });
  });
}
