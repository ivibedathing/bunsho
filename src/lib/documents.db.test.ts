import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createDocument,
  EMPTY_DOC,
  getDocumentWithDraft,
  listDocuments,
  nextDocCode,
  saveDraft,
} from "@/lib/documents";
import { getOrCreateDraft, publishDocument } from "@/lib/lifecycle";
import {
  auditActions,
  makeDocumentWithDraft,
  makeFolder,
  makeOrgWithAdmin,
  makeUser,
  pmDoc,
} from "@/test/db";

/** A bare document row with an exact docCode — `nextDocCode` only reads codes. */
async function makeDocWithCode(orgId: string, docCode: string) {
  return prisma.document.create({ data: { orgId, docCode, title: docCode } });
}

/** Force a document's `updatedAt`; Prisma's `@updatedAt` owns the field otherwise. */
async function setUpdatedAt(documentId: string, when: Date) {
  await prisma.$executeRaw`UPDATE documents SET "updatedAt" = ${when} WHERE id = ${documentId}`;
}

describe("nextDocCode", () => {
  it("starts at DOC-001 in an org with no documents", async () => {
    const { org } = await makeOrgWithAdmin();
    expect(await nextDocCode(org.id)).toBe("DOC-001");
  });

  it("continues past the highest code in use", async () => {
    const { org } = await makeOrgWithAdmin();
    await makeDocWithCode(org.id, "DOC-001");
    await makeDocWithCode(org.id, "DOC-002");

    expect(await nextDocCode(org.id)).toBe("DOC-003");
  });

  it("takes the maximum, not the count — gaps do not rewind it", async () => {
    const { org } = await makeOrgWithAdmin();
    await makeDocWithCode(org.id, "DOC-007");

    expect(await nextDocCode(org.id)).toBe("DOC-008");
  });

  it("pads to three digits and keeps counting past 999 without truncating", async () => {
    const { org } = await makeOrgWithAdmin();
    await makeDocWithCode(org.id, "DOC-999");

    expect(await nextDocCode(org.id)).toBe("DOC-1000");
  });

  it("ignores codes carried over from the legacy per-type prefixes", async () => {
    const { org } = await makeOrgWithAdmin();
    await makeDocWithCode(org.id, "POL-005");
    await makeDocWithCode(org.id, "SOP-010");
    await makeDocWithCode(org.id, "DOC-002");

    expect(await nextDocCode(org.id)).toBe("DOC-003");
  });

  it("ignores a DOC- code whose suffix is not a number", async () => {
    const { org } = await makeOrgWithAdmin();
    await makeDocWithCode(org.id, "DOC-abc");

    expect(await nextDocCode(org.id)).toBe("DOC-001");
  });

  it("is per-org — another tenant's codes do not advance the counter", async () => {
    const { org } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await makeDocWithCode(other.org.id, "DOC-042");

    expect(await nextDocCode(org.id)).toBe("DOC-001");
  });
});

describe("createDocument", () => {
  it("creates the document and its version-1 draft together", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    const doc = await createDocument(org.id, admin.id, { title: "Onboarding", docCode: "DOC-001" });

    expect(doc).toMatchObject({ orgId: org.id, docCode: "DOC-001", title: "Onboarding" });
    const versions = await prisma.documentVersion.findMany({ where: { documentId: doc.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!).toMatchObject({ version: 1, publishedAt: null, authorId: admin.id });
    expect(versions[0]!.prosemirrorJson).toEqual(EMPTY_DOC);
  });

  it("logs document_created with the code and title", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await createDocument(org.id, admin.id, { title: "Onboarding", docCode: "DOC-001" });

    expect(await auditActions(org.id)).toEqual(["document_created"]);
    const entry = await prisma.auditLogEntry.findFirstOrThrow({ where: { orgId: org.id } });
    expect(entry).toMatchObject({ actorType: "user", actorId: admin.id, targetId: doc.id });
    expect(entry.metadata).toMatchObject({ docCode: "DOC-001", title: "Onboarding" });
  });

  it("defaults the owner to the actor", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await createDocument(org.id, admin.id, { title: "Mine", docCode: "DOC-001" });

    expect(doc.ownerId).toBe(admin.id);
    expect(doc.folderId).toBeNull();
    expect(doc.tags).toEqual([]);
  });

  it("honours an explicit owner, folder, and tags", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const owner = await makeUser(org.id, { name: "Eve Editor" });
    const folder = await makeFolder(org.id, "Handbook");

    const doc = await createDocument(org.id, admin.id, {
      title: "Filed",
      docCode: "DOC-001",
      ownerId: owner.id,
      folderId: folder.id,
      tags: ["hr", "policy"],
    });

    expect(doc).toMatchObject({ ownerId: owner.id, folderId: folder.id });
    expect(doc.tags).toEqual(["hr", "policy"]);
  });

  it("rolls the whole transaction back when the document code clashes", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await createDocument(org.id, admin.id, { title: "First", docCode: "DOC-001" });

    await expect(
      createDocument(org.id, admin.id, { title: "Clash", docCode: "DOC-001" }),
    ).rejects.toMatchObject({ code: "P2002" });

    // No orphan document, no stray version, and the audit chain gained nothing.
    expect(await prisma.document.count({ where: { orgId: org.id } })).toBe(1);
    expect(await prisma.documentVersion.count({ where: { orgId: org.id } })).toBe(1);
    expect(await auditActions(org.id)).toEqual(["document_created"]);
  });

  it("allows the same document code in a different org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await createDocument(org.id, admin.id, { title: "Ours", docCode: "DOC-001" });

    const theirs = await createDocument(other.org.id, other.admin.id, {
      title: "Theirs",
      docCode: "DOC-001",
    });

    expect(theirs.orgId).toBe(other.org.id);
    expect(await prisma.document.count({ where: { docCode: "DOC-001" } })).toBe(2);
  });
});

describe("listDocuments", () => {
  it("returns only the caller's org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { title: "Ours" });
    await makeDocumentWithDraft(other.org.id, other.admin.id, { title: "Theirs" });

    const rows = await listDocuments(org.id);
    expect(rows.map((r) => r.id)).toEqual([doc.id]);
  });

  it("orders by most recently updated first", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-001", title: "A" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-002", title: "B" });
    const c = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-003", title: "C" });
    await setUpdatedAt(a.doc.id, new Date("2026-01-01T00:00:00Z"));
    await setUpdatedAt(b.doc.id, new Date("2026-03-01T00:00:00Z"));
    await setUpdatedAt(c.doc.id, new Date("2026-02-01T00:00:00Z"));

    const rows = await listDocuments(org.id);
    expect(rows.map((r) => r.title)).toEqual(["B", "C", "A"]);
  });

  it("returns filed and unfiled documents when no folder option is given", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-001", folderId: folder.id });
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-002" });

    expect(await listDocuments(org.id)).toHaveLength(2);
  });

  it("filters to a folder when given one", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    const filed = await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "DOC-001",
      folderId: folder.id,
    });
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-002" });

    const rows = await listDocuments(org.id, { folderId: folder.id });
    expect(rows.map((r) => r.id)).toEqual([filed.doc.id]);
    expect(rows[0]!.folder).toEqual({ name: "Policies" });
  });

  // An explicit null is a filter (unfiled only); omitting the key is "no filter".
  it("treats an explicit folderId of null as the unfiled bucket, not as absent", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-001", folderId: folder.id });
    const unfiled = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-002" });

    const rows = await listDocuments(org.id, { folderId: null });
    expect(rows.map((r) => r.id)).toEqual([unfiled.doc.id]);
  });

  it("carries the open-draft marker, which empties once the draft is published", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });

    const [withDraft] = await listDocuments(org.id);
    expect(withDraft!.versions).toHaveLength(1);
    expect(withDraft!.owner).toMatchObject({ name: "Ada Admin" });

    await publishDocument(org.id, admin.id, doc.id);

    const [afterPublish] = await listDocuments(org.id);
    expect(afterPublish!.versions).toHaveLength(0);
  });
});

describe("getDocumentWithDraft", () => {
  it("returns the document with its open draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });

    const got = await getDocumentWithDraft(org.id, doc.id);
    expect(got?.doc.id).toBe(doc.id);
    expect(got?.draft?.id).toBe(draft.id);
  });

  it("returns null for a document in another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    expect(await getDocumentWithDraft(other.org.id, doc.id)).toBeNull();
  });

  it("returns a null draft when every version is published", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);

    const got = await getDocumentWithDraft(org.id, doc.id);
    expect(got?.doc.id).toBe(doc.id);
    expect(got?.draft).toBeNull();
  });

  it("returns the newly forked draft once one is open again", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);
    const forked = await getOrCreateDraft(org.id, admin.id, doc.id);

    const got = await getDocumentWithDraft(org.id, doc.id);
    expect(got?.draft?.id).toBe(forked.id);
    expect(got?.draft?.version).toBe(2);
  });
});

describe("saveDraft", () => {
  it("overwrites the draft's ProseMirror JSON", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("old") });

    await saveDraft(org.id, doc.id, pmDoc("new body"));

    const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.prosemirrorJson).toEqual(pmDoc("new body"));
  });

  it("bumps the document's updatedAt so the list re-sorts", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const stale = new Date("2026-01-01T00:00:00Z");
    await setUpdatedAt(doc.id, stale);

    await saveDraft(org.id, doc.id, pmDoc("typing"));

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it("throws when the document has no open draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);

    await expect(saveDraft(org.id, doc.id, pmDoc("sneaky"))).rejects.toThrow(
      "No open draft to save",
    );
  });

  it("cannot save into another org's draft, and leaves it untouched", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("ours") });

    await expect(saveDraft(other.org.id, doc.id, pmDoc("tampered"))).rejects.toThrow(
      "No open draft to save",
    );

    const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.prosemirrorJson).toEqual(pmDoc("ours"));
  });
});
