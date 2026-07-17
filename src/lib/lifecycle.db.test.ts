import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyOrgChain } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import {
  documentStatus,
  getDocumentDetail,
  getOrCreateDraft,
  publishDocument,
  restoreVersion,
  retireDocument,
  versionMarkdown,
} from "@/lib/lifecycle";
import { auditActions, makeDocumentWithDraft, makeOrgWithAdmin, pmDoc } from "@/test/db";

describe("documentStatus", () => {
  it("is retired when retiredAt is set, regardless of a published version", () => {
    expect(documentStatus({ retiredAt: new Date(), currentPublishedVersionId: "v1" })).toBe(
      "retired",
    );
  });

  it("is published when a current published version exists", () => {
    expect(documentStatus({ retiredAt: null, currentPublishedVersionId: "v1" })).toBe("published");
  });

  it("is draft before the first publish", () => {
    expect(documentStatus({ retiredAt: null, currentPublishedVersionId: null })).toBe("draft");
  });
});

describe("versionMarkdown", () => {
  it("returns the frozen markdown of a published version verbatim", () => {
    expect(versionMarkdown({ markdown: "# Frozen", prosemirrorJson: pmDoc("ignored") })).toBe(
      "# Frozen",
    );
  });

  it("serializes on the fly for a draft, which has no frozen markdown", () => {
    expect(versionMarkdown({ markdown: null, prosemirrorJson: pmDoc("Hello draft") })).toBe(
      "Hello draft\n",
    );
  });
});

describe("publishDocument", () => {
  it("freezes markdown + sha, stamps publishedAt, and advances the projection", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Policy body") });

    const published = await publishDocument(org.id, admin.id, doc.id, "  first release  ");

    expect(published.publishedAt).toBeInstanceOf(Date);
    // The serializer terminates the document with a newline; the SHA covers it.
    expect(published.markdown).toBe("Policy body\n");
    expect(published.contentSha).toBe(createHash("sha256").update("Policy body\n").digest("hex"));
    // The change note is trimmed before it is frozen.
    expect(published.changeNote).toBe("first release");

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.currentPublishedVersionId).toBe(published.id);
  });

  it("keeps the draft's existing change note when none is supplied", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Body") });
    await prisma.documentVersion.update({
      where: { id: draft.id },
      data: { changeNote: "note from the draft" },
    });

    const published = await publishDocument(org.id, admin.id, doc.id);
    expect(published.changeNote).toBe("note from the draft");
  });

  it("treats a whitespace-only change note as absent", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Body") });
    await prisma.documentVersion.update({
      where: { id: draft.id },
      data: { changeNote: "kept" },
    });

    const published = await publishDocument(org.id, admin.id, doc.id, "   ");
    expect(published.changeNote).toBe("kept");
  });

  it("supersedes the prior published version on the second publish", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1 body") });
    const v1 = await publishDocument(org.id, admin.id, doc.id);

    const draft2 = await getOrCreateDraft(org.id, admin.id, doc.id);
    await prisma.documentVersion.update({
      where: { id: draft2.id },
      data: { prosemirrorJson: pmDoc("v2 body") },
    });
    const v2 = await publishDocument(org.id, admin.id, doc.id);

    expect(v2.version).toBe(2);
    const refetchedV1 = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v1.id } });
    expect(refetchedV1.supersededAt).toBeInstanceOf(Date);

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.currentPublishedVersionId).toBe(v2.id);
  });

  it("un-retires a document when a new version is published", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);
    await retireDocument(org.id, admin.id, doc.id);

    await getOrCreateDraft(org.id, admin.id, doc.id);
    await publishDocument(org.id, admin.id, doc.id);

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.retiredAt).toBeNull();
    expect(documentStatus(after)).toBe("published");
  });

  it("throws when there is no open draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await publishDocument(org.id, admin.id, doc.id);

    await expect(publishDocument(org.id, admin.id, doc.id)).rejects.toThrow("No open draft");
  });

  it("is a no-op returning null when ifDraftOpen and nothing is open", async () => {
    // The editor's idle commit fires on a timer and may find the draft already
    // frozen by a prior commit or another tab — that is a normal outcome, not an
    // error (DECISIONS.md — 2026-07-17, save-only pages).
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const v1 = await publishDocument(org.id, admin.id, doc.id);

    const again = await publishDocument(org.id, admin.id, doc.id, undefined, { ifDraftOpen: true });
    expect(again).toBeNull();

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.currentPublishedVersionId).toBe(v1.id);
  });

  it("cannot publish another org's document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    await expect(publishDocument(other.org.id, other.admin.id, doc.id)).rejects.toThrow();
    const untouched = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(untouched.currentPublishedVersionId).toBeNull();
  });

  it("writes a document_published entry that keeps the audit chain intact", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("body") });
    await publishDocument(org.id, admin.id, doc.id);

    expect(await auditActions(org.id)).toEqual(["document_published"]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });
});

describe("published versions are immutable (DB trigger)", () => {
  it("rejects an attempt to rewrite published content", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("original") });
    const published = await publishDocument(org.id, admin.id, doc.id);

    await expect(
      prisma.documentVersion.update({
        where: { id: published.id },
        data: { markdown: "tampered" },
      }),
    ).rejects.toThrow(/published and immutable/);
  });

  it("still allows the lifecycle timestamps to move", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("original") });
    const published = await publishDocument(org.id, admin.id, doc.id);

    await expect(
      prisma.documentVersion.update({
        where: { id: published.id },
        data: { supersededAt: new Date(), retiredAt: new Date() },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("getOrCreateDraft", () => {
  it("returns the existing open draft rather than forking a second one", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);

    const got = await getOrCreateDraft(org.id, admin.id, doc.id);
    expect(got.id).toBe(draft.id);
    expect(await prisma.documentVersion.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it("forks the next version from the published content", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, {
      json: pmDoc("published body"),
    });
    await publishDocument(org.id, admin.id, doc.id);

    const forked = await getOrCreateDraft(org.id, admin.id, doc.id);
    expect(forked.version).toBe(2);
    expect(forked.publishedAt).toBeNull();
    expect(forked.prosemirrorJson).toEqual(pmDoc("published body"));
  });

  it("does not audit-log forking a draft — publish is the logged event", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await publishDocument(org.id, admin.id, doc.id);
    await getOrCreateDraft(org.id, admin.id, doc.id);

    expect(await auditActions(org.id)).toEqual(["document_published"]);
  });

  it("cannot fork a draft on another org's document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await publishDocument(org.id, admin.id, doc.id);

    await expect(getOrCreateDraft(other.org.id, other.admin.id, doc.id)).rejects.toThrow();
  });
});

describe("one open draft per document (DB trigger)", () => {
  it("rejects a second concurrent draft inserted behind the app's back", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    // The trigger raises with ERRCODE unique_violation, which Prisma surfaces as
    // P2002 — its own message replaces the trigger's, so match on the code.
    await expect(
      prisma.documentVersion.create({
        data: {
          orgId: org.id,
          documentId: doc.id,
          version: 99,
          prosemirrorJson: pmDoc("sneaky second draft"),
          authorId: admin.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await prisma.documentVersion.count({ where: { documentId: doc.id } })).toBe(1);
  });
});

describe("retireDocument", () => {
  it("stamps the document and its current version, and logs the retirement", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const published = await publishDocument(org.id, admin.id, doc.id);

    await retireDocument(org.id, admin.id, doc.id);

    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(after.retiredAt).toBeInstanceOf(Date);
    expect(documentStatus(after)).toBe("retired");

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: published.id } });
    expect(version.retiredAt).toBeInstanceOf(Date);

    expect(await auditActions(org.id)).toEqual(["document_published", "document_retired"]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("refuses to retire a document that was never published", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    await expect(retireDocument(org.id, admin.id, doc.id)).rejects.toThrow(
      "Only a published document can be retired",
    );
  });

  it("cannot retire another org's document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    await publishDocument(org.id, admin.id, doc.id);

    await expect(retireDocument(other.org.id, other.admin.id, doc.id)).rejects.toThrow();
  });
});

describe("restoreVersion", () => {
  it("stages the old content into the existing draft without deleting history", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1 body") });
    const v1 = await publishDocument(org.id, admin.id, doc.id);

    const draft2 = await getOrCreateDraft(org.id, admin.id, doc.id);
    await prisma.documentVersion.update({
      where: { id: draft2.id },
      data: { prosemirrorJson: pmDoc("work in progress") },
    });

    const restored = await restoreVersion(org.id, admin.id, doc.id, v1.id);

    // Restored into the open draft, not as a new row.
    expect(restored.id).toBe(draft2.id);
    const draftAfter = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft2.id } });
    expect(draftAfter.prosemirrorJson).toEqual(pmDoc("v1 body"));
    // v1 is untouched.
    const v1After = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v1.id } });
    expect(v1After.markdown).toBe("v1 body\n");
  });

  it("creates a new draft when none is open", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1 body") });
    const v1 = await publishDocument(org.id, admin.id, doc.id);

    const restored = await restoreVersion(org.id, admin.id, doc.id, v1.id);

    expect(restored.version).toBe(2);
    const draft = await prisma.documentVersion.findUniqueOrThrow({ where: { id: restored.id } });
    expect(draft.publishedAt).toBeNull();
    expect(draft.prosemirrorJson).toEqual(pmDoc("v1 body"));
  });

  it("logs which version was restored into which draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1 body") });
    const v1 = await publishDocument(org.id, admin.id, doc.id);
    await restoreVersion(org.id, admin.id, doc.id, v1.id);

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "document_restored" },
    });
    expect(entry.metadata).toMatchObject({ restoredFromVersion: 1, intoDraftVersion: 2 });
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("cannot restore a version belonging to another org's document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);
    const v1 = await publishDocument(org.id, admin.id, doc.id);

    await expect(restoreVersion(other.org.id, other.admin.id, doc.id, v1.id)).rejects.toThrow();
  });
});

describe("getDocumentDetail", () => {
  it("returns null for a document in another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id);

    expect(await getDocumentDetail(other.org.id, doc.id)).toBeNull();
  });

  it("separates the open draft from published history, newest first", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1") });
    await publishDocument(org.id, admin.id, doc.id);
    const d2 = await getOrCreateDraft(org.id, admin.id, doc.id);
    await prisma.documentVersion.update({
      where: { id: d2.id },
      data: { prosemirrorJson: pmDoc("v2") },
    });
    await publishDocument(org.id, admin.id, doc.id);
    await getOrCreateDraft(org.id, admin.id, doc.id);

    const detail = await getDocumentDetail(org.id, doc.id);
    expect(detail).not.toBeNull();
    expect(detail?.draft?.version).toBe(3);
    expect(detail?.published.map((v) => v.version)).toEqual([2, 1]);
    expect(detail?.status).toBe("published");
  });
});
