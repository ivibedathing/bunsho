import { recentActivityByUser } from "@/lib/activity";
import { type AppendAuditInput, appendAudit } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { makeDocumentWithDraft, makeOrgWithAdmin, makeUser } from "@/test/db";
import { describe, expect, it } from "vitest";

/** appendAudit takes a per-org advisory lock, so it only runs inside a transaction. */
function append(input: AppendAuditInput) {
  return prisma.$transaction((tx) => appendAudit(tx, input));
}

/** The shape the feed is built from: a user acting on a document. */
function docEvent(
  orgId: string,
  actorId: string,
  documentId: string,
  overrides: Partial<AppendAuditInput> = {},
): AppendAuditInput {
  return {
    orgId,
    action: "document_published",
    actorType: "user",
    actorId,
    targetType: "document",
    targetId: documentId,
    ...overrides,
  };
}

describe("recentActivityByUser", () => {
  it("returns the user's entries newest first", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_created" }));
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_edited" }));
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_published" }));

    const feed = await recentActivityByUser(org.id, admin.id);
    expect(feed.map((i) => i.action)).toEqual([
      "document_published",
      "document_edited",
      "document_created",
    ]);
  });

  it("returns an empty feed for a user who has done nothing", async () => {
    const { org } = await makeOrgWithAdmin();
    const bystander = await makeUser(org.id);

    expect(await recentActivityByUser(org.id, bystander.id)).toEqual([]);
  });

  it("takes the newest `limit` entries, not the oldest", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    for (let i = 0; i < 5; i++) {
      await append(docEvent(org.id, admin.id, doc.id, { metadata: { step: i } }));
    }

    const feed = await recentActivityByUser(org.id, admin.id, 2);
    expect(feed).toHaveLength(2);
    expect(feed.map((i) => i.metadata)).toEqual([{ step: 4 }, { step: 3 }]);
  });

  it("defaults to at most 50 entries", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    for (let i = 0; i < 52; i++) {
      await append(docEvent(org.id, admin.id, doc.id, { metadata: { step: i } }));
    }

    const feed = await recentActivityByUser(org.id, admin.id);
    expect(feed).toHaveLength(50);
    expect(feed[0]!.metadata).toEqual({ step: 51 });
  });

  it("excludes entries by other actors in the same org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeUser(org.id, { name: "Bob Editor" });
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_created" }));
    await append(docEvent(org.id, other.id, doc.id, { action: "document_edited" }));

    const feed = await recentActivityByUser(org.id, admin.id);
    expect(feed.map((i) => i.action)).toEqual(["document_created"]);
  });

  it("excludes non-user entries, which have no actorId", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_created" }));
    await append({
      orgId: org.id,
      action: "settings_changed",
      actorType: "system",
      targetType: "settings",
    });

    const feed = await recentActivityByUser(org.id, admin.id);
    expect(feed.map((i) => i.action)).toEqual(["document_created"]);
  });

  it("is scoped by org: the same actor id under a different org returns nothing", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id));

    expect(await recentActivityByUser(other.org.id, admin.id)).toEqual([]);
  });

  it("returns seq as a string, since bigint is not JSX-serializable", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const appended = await append(docEvent(org.id, admin.id, doc.id));

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.seq).toBe(String(appended.seq));
    expect(typeof item.seq).toBe("string");
  });

  it("exposes createdAt as a Date", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id));

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.createdAt).toBeInstanceOf(Date);
  });

  it("resolves the document from targetType/targetId", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "POL-001",
      title: "Expenses Policy",
    });
    await append(docEvent(org.id, admin.id, doc.id));

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.document).toEqual({ id: doc.id, docCode: "POL-001", title: "Expenses Policy" });
  });

  it("resolves the document from metadata.documentId when the target is not the document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "POL-002",
      title: "Travel Policy",
    });
    await append({
      orgId: org.id,
      action: "suggestion_accepted",
      actorType: "user",
      actorId: admin.id,
      targetType: "suggestion",
      targetId: "sug-1",
      metadata: { documentId: doc.id },
    });

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.document).toEqual({ id: doc.id, docCode: "POL-002", title: "Travel Policy" });
  });

  it("resolves each entry in a mixed feed by its own reference", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "A-1", title: "Alpha" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "B-1", title: "Bravo" });
    await append(docEvent(org.id, admin.id, a.doc.id));
    await append({
      orgId: org.id,
      action: "attachment_added",
      actorType: "user",
      actorId: admin.id,
      targetType: "attachment",
      targetId: "att-1",
      metadata: { documentId: b.doc.id },
    });

    const feed = await recentActivityByUser(org.id, admin.id);
    expect(feed.map((i) => i.document?.docCode)).toEqual(["B-1", "A-1"]);
  });

  it("prefers targetId over metadata.documentId when the entry targets a document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "A-1", title: "Alpha" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "B-1", title: "Bravo" });
    await append(docEvent(org.id, admin.id, a.doc.id, { metadata: { documentId: b.doc.id } }));

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.document?.docCode).toBe("A-1");
  });

  it("resolves document null when the entry concerns no document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await append({
      orgId: org.id,
      action: "user_role_changed",
      actorType: "user",
      actorId: admin.id,
      targetType: "user",
      targetId: admin.id,
      metadata: { from: "editor", to: "admin" },
    });

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.document).toBeNull();
    expect(item.metadata).toEqual({ from: "editor", to: "admin" });
  });

  it("resolves document null for a deleted document, keeping the entry in the feed", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_published" }));
    await append(docEvent(org.id, admin.id, doc.id, { action: "document_deleted" }));

    // The audit entries outlive the document — the log is append-only.
    await prisma.document.delete({ where: { id: doc.id } });

    const feed = await recentActivityByUser(org.id, admin.id);
    expect(feed).toHaveLength(2);
    expect(feed.map((i) => i.document)).toEqual([null, null]);
    expect(feed.map((i) => i.action)).toEqual(["document_deleted", "document_published"]);
  });

  it("resolves document null for a document in another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const foreign = await makeDocumentWithDraft(other.org.id, other.admin.id);
    // A forged targetId pointing across the tenant boundary must not leak the title.
    await append(docEvent(org.id, admin.id, foreign.doc.id));

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.document).toBeNull();
  });

  it("returns metadata null when the entry has none", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await append(docEvent(org.id, admin.id, doc.id));

    const item = (await recentActivityByUser(org.id, admin.id))[0]!;
    expect(item.metadata).toBeNull();
  });
});
