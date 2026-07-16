import { describe, expect, it } from "vitest";
import { documentStats, recentDocuments } from "@/lib/dashboard";
import { prisma } from "@/lib/db";
import { getOrCreateDraft, publishDocument, retireDocument } from "@/lib/lifecycle";
import { createSuggestion } from "@/lib/suggestions";
import { makeDocumentWithDraft, makeFolder, makeOrgWithAdmin, pmDoc } from "@/test/db";

/** Force a document's `updatedAt`; Prisma's `@updatedAt` owns the field otherwise. */
async function setUpdatedAt(documentId: string, when: Date) {
  await prisma.$executeRaw`UPDATE documents SET "updatedAt" = ${when} WHERE id = ${documentId}`;
}

/**
 * One org holding every state the dashboard counts:
 *   pureDraft      — never published
 *   published      — published, no open draft
 *   publishedDraft — published *and* re-opened for editing
 *   retired        — published then retired
 * plus one pending and one resolved suggestion.
 */
async function makeMixedOrg() {
  const { org, admin } = await makeOrgWithAdmin();

  const pureDraft = await makeDocumentWithDraft(org.id, admin.id, {
    docCode: "DOC-001",
    title: "Pure draft",
    json: pmDoc("wip"),
  });

  const published = await makeDocumentWithDraft(org.id, admin.id, {
    docCode: "DOC-002",
    title: "Published",
    json: pmDoc("live"),
  });
  await publishDocument(org.id, admin.id, published.doc.id);

  const publishedDraft = await makeDocumentWithDraft(org.id, admin.id, {
    docCode: "DOC-003",
    title: "Published with open draft",
    json: pmDoc("v1"),
  });
  await publishDocument(org.id, admin.id, publishedDraft.doc.id);
  await getOrCreateDraft(org.id, admin.id, publishedDraft.doc.id);

  const retired = await makeDocumentWithDraft(org.id, admin.id, {
    docCode: "DOC-004",
    title: "Retired",
    json: pmDoc("old"),
  });
  const retiredV1 = await publishDocument(org.id, admin.id, retired.doc.id);
  await retireDocument(org.id, admin.id, retired.doc.id);

  await createSuggestion(org.id, {
    documentId: pureDraft.doc.id,
    baseVersionId: pureDraft.draft.id,
    origin: "scheduled",
    actorType: "ai",
    payload: { kind: "staleness", title: "Looks stale", message: "Not touched in a year" },
  });
  // Already actioned — must not count towards the pending badge.
  await prisma.suggestion.create({
    data: {
      orgId: org.id,
      documentId: retired.doc.id,
      baseVersionId: retiredV1.id,
      origin: "on_demand",
      status: "accepted",
      payload: { kind: "rewrite", title: "Tighten the intro", message: "Done" },
      actingHumanId: admin.id,
      resolvedAt: new Date(),
    },
  });

  return { org, admin, pureDraft, published, publishedDraft, retired };
}

describe("documentStats", () => {
  it("counts each lifecycle bucket across a mixed org", async () => {
    const { org } = await makeMixedOrg();

    expect(await documentStats(org.id)).toEqual({
      total: 4,
      draftsInProgress: 2,
      published: 2,
      retired: 1,
      pendingSuggestions: 1,
    });
  });

  it("counts a published document with an open draft in both published and draftsInProgress", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1") });
    await publishDocument(org.id, admin.id, doc.id);

    expect(await documentStats(org.id)).toMatchObject({ published: 1, draftsInProgress: 0 });

    await getOrCreateDraft(org.id, admin.id, doc.id);

    // The buckets overlap by design: it is live *and* being worked on.
    expect(await documentStats(org.id)).toMatchObject({
      total: 1,
      published: 1,
      draftsInProgress: 1,
    });
  });

  it("moves a document out of published once it is retired", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1") });
    await publishDocument(org.id, admin.id, doc.id);
    await retireDocument(org.id, admin.id, doc.id);

    expect(await documentStats(org.id)).toMatchObject({ total: 1, published: 0, retired: 1 });
  });

  it("is all zeroes for an empty org", async () => {
    const { org } = await makeOrgWithAdmin();

    expect(await documentStats(org.id)).toEqual({
      total: 0,
      draftsInProgress: 0,
      published: 0,
      retired: 0,
      pendingSuggestions: 0,
    });
  });

  it("is org-scoped — another tenant's documents and suggestions do not leak in", async () => {
    const { org } = await makeMixedOrg();
    const noisy = await makeMixedOrg();

    expect(await documentStats(org.id)).toEqual({
      total: 4,
      draftsInProgress: 2,
      published: 2,
      retired: 1,
      pendingSuggestions: 1,
    });
    expect(await documentStats(noisy.org.id)).toEqual({
      total: 4,
      draftsInProgress: 2,
      published: 2,
      retired: 1,
      pendingSuggestions: 1,
    });
  });
});

describe("recentDocuments", () => {
  it("returns the most recently updated first", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-001", title: "A" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-002", title: "B" });
    const c = await makeDocumentWithDraft(org.id, admin.id, { docCode: "DOC-003", title: "C" });
    await setUpdatedAt(a.doc.id, new Date("2026-01-01T00:00:00Z"));
    await setUpdatedAt(b.doc.id, new Date("2026-03-01T00:00:00Z"));
    await setUpdatedAt(c.doc.id, new Date("2026-02-01T00:00:00Z"));

    const rows = await recentDocuments(org.id);
    expect(rows.map((r) => r.title)).toEqual(["B", "C", "A"]);
  });

  it("takes the newest `limit` documents and drops the rest", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    for (let i = 1; i <= 5; i++) {
      const { doc } = await makeDocumentWithDraft(org.id, admin.id, {
        docCode: `DOC-00${i}`,
        title: `Doc ${i}`,
      });
      await setUpdatedAt(doc.id, new Date(`2026-0${i}-01T00:00:00Z`));
    }

    const rows = await recentDocuments(org.id, 2);
    expect(rows.map((r) => r.title)).toEqual(["Doc 5", "Doc 4"]);
  });

  it("defaults to at most 8 documents", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    for (let i = 1; i <= 10; i++) {
      await makeDocumentWithDraft(org.id, admin.id, {
        docCode: `DOC-${String(i).padStart(3, "0")}`,
        title: `Doc ${i}`,
      });
    }

    expect(await recentDocuments(org.id)).toHaveLength(8);
  });

  it("is org-scoped", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { title: "Ours" });
    await makeDocumentWithDraft(other.org.id, other.admin.id, { title: "Theirs" });

    const rows = await recentDocuments(org.id);
    expect(rows.map((r) => r.id)).toEqual([doc.id]);
  });

  it("includes the folder name and the open-draft marker for the status badge", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, {
      folderId: folder.id,
      json: pmDoc("body"),
    });

    const [withDraft] = await recentDocuments(org.id);
    expect(withDraft!.folder).toEqual({ name: "Policies" });
    expect(withDraft!.versions).toHaveLength(1);

    await publishDocument(org.id, admin.id, doc.id);

    const [afterPublish] = await recentDocuments(org.id);
    expect(afterPublish!.versions).toHaveLength(0);
  });
});
