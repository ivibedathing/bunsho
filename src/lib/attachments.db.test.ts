import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAttachment,
  deleteAttachment,
  getAttachmentWithData,
  isInlineImageType,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/attachments";
import { verifyOrgChain } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { publishDocument, retireDocument } from "@/lib/lifecycle";
import { auditActions, makeDocumentWithDraft, makeOrgWithAdmin, makeUser, pmDoc } from "@/test/db";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** `createdAt` is `@default(now())`, so rows written in one tick can tie; pin it by raw SQL. */
async function setCreatedAt(attachmentId: string, when: Date): Promise<void> {
  await prisma.$executeRaw`UPDATE attachments SET "createdAt" = ${when} WHERE id = ${attachmentId}`;
}

describe("isInlineImageType", () => {
  it.each(["image/png", "image/jpeg", "image/gif", "image/webp"])(
    "renders %s inline",
    (mimeType) => {
      expect(isInlineImageType(mimeType)).toBe(true);
    },
  );

  it.each(["application/pdf", "text/plain", "image/svg+xml", "application/octet-stream", ""])(
    "does not render %s inline",
    (mimeType) => {
      expect(isInlineImageType(mimeType)).toBe(false);
    },
  );
});

describe("createAttachment", () => {
  it("stores the bytes with their size and sha256 fingerprint", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const data = Buffer.from("evidence spreadsheet bytes");

    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "evidence.csv",
      mimeType: "text/csv",
      data,
    });

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect(row.orgId).toBe(org.id);
    expect(row.documentId).toBe(doc.id);
    expect(row.filename).toBe("evidence.csv");
    expect(row.mimeType).toBe("text/csv");
    expect(row.size).toBe(data.byteLength);
    expect(row.sha256).toBe(sha256(data));
    expect(Buffer.from(row.data)).toEqual(data);
    expect(row.uploadedById).toBe(admin.id);
  });

  it("round-trips binary bytes unchanged", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]);

    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "pixel.png",
      mimeType: "image/png",
      data,
    });

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect(Buffer.from(row.data)).toEqual(data);
    expect(row.sha256).toBe(sha256(data));
  });

  it("logs attachment_added with the file's identifying metadata", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const data = Buffer.from("evidence spreadsheet bytes");

    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "evidence.csv",
      mimeType: "text/csv",
      data,
    });

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "attachment_added" },
    });
    expect(entry.targetType).toBe("attachment");
    expect(entry.targetId).toBe(id);
    expect(entry.actorId).toBe(admin.id);
    expect(entry.metadata).toMatchObject({
      documentId: doc.id,
      filename: "evidence.csv",
      mimeType: "text/csv",
      size: data.byteLength,
      sha256: sha256(data),
    });
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("rejects an empty buffer", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    await expect(
      createAttachment(org.id, admin.id, {
        documentId: doc.id,
        filename: "empty.bin",
        mimeType: "application/octet-stream",
        data: Buffer.alloc(0),
      }),
    ).rejects.toThrow("Attachment is empty.");

    expect(await prisma.attachment.count()).toBe(0);
    expect(await auditActions(org.id)).toEqual([]);
  });

  it("rejects a file over the 20 MB cap before touching the database", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    await expect(
      createAttachment(org.id, admin.id, {
        documentId: doc.id,
        filename: "huge.bin",
        mimeType: "application/octet-stream",
        data: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
      }),
    ).rejects.toThrow("Attachment exceeds the 20 MB limit.");

    expect(await prisma.attachment.count()).toBe(0);
    expect(await auditActions(org.id)).toEqual([]);
  });

  it("accepts a file exactly at the cap", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const data = Buffer.alloc(MAX_ATTACHMENT_BYTES, 7);

    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "atlimit.bin",
      mimeType: "application/octet-stream",
      data,
    });

    const row = await prisma.attachment.findUniqueOrThrow({
      where: { id },
      select: { size: true },
    });
    expect(row.size).toBe(MAX_ATTACHMENT_BYTES);
  });

  it("refuses a document in another org and writes nothing", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    await expect(
      createAttachment(other.org.id, other.admin.id, {
        documentId: doc.id,
        filename: "stolen.csv",
        mimeType: "text/csv",
        data: Buffer.from("bytes"),
      }),
    ).rejects.toThrow("Document not found");

    expect(await prisma.attachment.count()).toBe(0);
    expect(await auditActions(other.org.id)).toEqual([]);
    expect(await auditActions(org.id)).toEqual([]);
  });
});

describe("listAttachments", () => {
  it("returns the document's attachments newest first with the uploader identity", async () => {
    const { org } = await makeOrgWithAdmin();
    const uploader = await makeUser(org.id, { name: "Uma Uploader", email: "uma@example.test" });
    const { doc } = await makeDocumentWithDraft(org.id, uploader.id);

    const first = await createAttachment(org.id, uploader.id, {
      documentId: doc.id,
      filename: "older.csv",
      mimeType: "text/csv",
      data: Buffer.from("a"),
    });
    const second = await createAttachment(org.id, uploader.id, {
      documentId: doc.id,
      filename: "newer.csv",
      mimeType: "text/csv",
      data: Buffer.from("b"),
    });
    await setCreatedAt(first.id, new Date("2026-01-01T00:00:00Z"));
    await setCreatedAt(second.id, new Date("2026-02-01T00:00:00Z"));

    const rows = await listAttachments(org.id, doc.id);
    expect(rows.map((r) => r.filename)).toEqual(["newer.csv", "older.csv"]);
    expect(rows[0]).toMatchObject({
      size: 1,
      uploadedBy: { name: "Uma Uploader", email: "uma@example.test" },
    });
    // Bytes are deliberately not part of the list projection.
    expect(rows[0]).not.toHaveProperty("data");
  });

  it("scopes to one document, not the whole org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-A" });
    const otherDoc = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-B" });
    await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "mine.csv",
      mimeType: "text/csv",
      data: Buffer.from("a"),
    });
    await createAttachment(org.id, admin.id, {
      documentId: otherDoc.doc.id,
      filename: "theirs.csv",
      mimeType: "text/csv",
      data: Buffer.from("b"),
    });

    expect((await listAttachments(org.id, doc.id)).map((r) => r.filename)).toEqual(["mine.csv"]);
  });

  it("returns nothing when the document belongs to another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "mine.csv",
      mimeType: "text/csv",
      data: Buffer.from("a"),
    });

    expect(await listAttachments(other.org.id, doc.id)).toEqual([]);
  });
});

describe("getAttachmentWithData", () => {
  it("returns the bytes alongside the document state the serve route gates on", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);
    const data = Buffer.from("png bytes");
    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "pixel.png",
      mimeType: "image/png",
      data,
    });

    const got = await getAttachmentWithData(org.id, id);
    expect(got).not.toBeNull();
    expect(Buffer.from(got!.data)).toEqual(data);
    expect(got!.mimeType).toBe("image/png");
    expect(got!.document.id).toBe(doc.id);
    expect(got!.document.retiredAt).toBeNull();
    expect(got!.document.currentPublishedVersionId).not.toBeNull();
  });

  it("reports a retired parent document so the viewer rule can deny the read", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);
    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "pixel.png",
      mimeType: "image/png",
      data: Buffer.from("png bytes"),
    });
    await retireDocument(org.id, admin.id, doc.id);

    const got = await getAttachmentWithData(org.id, id);
    expect(got!.document.retiredAt).toBeInstanceOf(Date);
  });

  it("reports an unpublished parent document as having no current published version", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "pixel.png",
      mimeType: "image/png",
      data: Buffer.from("png bytes"),
    });

    const got = await getAttachmentWithData(org.id, id);
    expect(got!.document.currentPublishedVersionId).toBeNull();
    expect(got!.document.retiredAt).toBeNull();
  });

  it("returns null for an attachment in another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "pixel.png",
      mimeType: "image/png",
      data: Buffer.from("png bytes"),
    });

    expect(await getAttachmentWithData(other.org.id, id)).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    const { org } = await makeOrgWithAdmin();
    expect(await getAttachmentWithData(org.id, "does-not-exist")).toBeNull();
  });
});

describe("deleteAttachment", () => {
  it("removes the row and records attachment_deleted", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const data = Buffer.from("evidence bytes");
    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "evidence.csv",
      mimeType: "text/csv",
      data,
    });

    await deleteAttachment(org.id, admin.id, id);

    expect(await prisma.attachment.findUnique({ where: { id } })).toBeNull();

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "attachment_deleted" },
    });
    expect(entry.targetId).toBe(id);
    // The audit entry outlives the bytes: filename + sha256 remain as the record
    // of what was removed.
    expect(entry.metadata).toMatchObject({
      documentId: doc.id,
      filename: "evidence.csv",
      sha256: sha256(data),
    });
    expect(await auditActions(org.id)).toEqual(["attachment_added", "attachment_deleted"]);
  });

  it("throws for an unknown id", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await expect(deleteAttachment(org.id, admin.id, "does-not-exist")).rejects.toThrow(
      "Attachment not found",
    );
  });

  it("refuses to delete another org's attachment and leaves the row intact", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const { id } = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "evidence.csv",
      mimeType: "text/csv",
      data: Buffer.from("evidence bytes"),
    });

    await expect(deleteAttachment(other.org.id, other.admin.id, id)).rejects.toThrow(
      "Attachment not found",
    );

    expect(await prisma.attachment.findUnique({ where: { id } })).not.toBeNull();
    expect(await auditActions(other.org.id)).toEqual([]);
    expect(await auditActions(org.id)).toEqual(["attachment_added"]);
  });
});

describe("attachment audit trail", () => {
  it("keeps the org's hash chain intact across adds and deletes", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);

    const a = await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "one.csv",
      mimeType: "text/csv",
      data: Buffer.from("one"),
    });
    await createAttachment(org.id, admin.id, {
      documentId: doc.id,
      filename: "two.csv",
      mimeType: "text/csv",
      data: Buffer.from("two"),
    });
    await deleteAttachment(org.id, admin.id, a.id);

    expect(await auditActions(org.id)).toEqual([
      "document_published",
      "attachment_added",
      "attachment_added",
      "attachment_deleted",
    ]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });
});
