import { verifyOrgChain } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { publishDocument } from "@/lib/lifecycle";
import {
  type CreateSuggestionInput,
  type SuggestionPayload,
  acceptSuggestion,
  countPendingSuggestions,
  createSuggestion,
  listPendingSuggestions,
  rejectSuggestion,
} from "@/lib/suggestions";
import { auditActions, makeDocumentWithDraft, makeOrgWithAdmin, pmDoc } from "@/test/db";
import { describe, expect, it } from "vitest";

/** A scheduled AI suggestion; overrides tune only the payload a test cares about. */
function input(
  documentId: string,
  baseVersionId: string,
  payload: Partial<SuggestionPayload> = {},
): CreateSuggestionInput {
  return {
    documentId,
    baseVersionId,
    origin: "scheduled",
    actorType: "ai",
    payload: { kind: "review", title: "AI review", message: "Notes", ...payload },
  };
}

/** createSuggestion where the test needs it to actually create — never de-duplicate. */
async function create(orgId: string, i: CreateSuggestionInput): Promise<{ id: string }> {
  const created = await createSuggestion(orgId, i);
  if (!created) throw new Error("expected a suggestion to be created, got a de-duplicated null");
  return created;
}

describe("createSuggestion", () => {
  it("creates a pending suggestion and logs suggestion_created under the AI actor", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);

    const created = await create(
      org.id,
      input(doc.id, draft.id, { kind: "staleness", title: "Review overdue (200d)" }),
    );

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe("pending");
    expect(row.actingHumanId).toBeNull();
    expect(row.resolvedAt).toBeNull();
    expect(row.origin).toBe("scheduled");

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "suggestion_created" },
    });
    expect(entry.actorType).toBe("ai");
    // The AI is a system actor, never a login user — so no actorId.
    expect(entry.actorId).toBeNull();
    expect(entry.targetType).toBe("suggestion");
    expect(entry.targetId).toBe(created.id);
    expect(entry.metadata).toMatchObject({
      documentId: doc.id,
      kind: "staleness",
      origin: "scheduled",
    });
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("attributes a deterministic check to the system actor when told to", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);

    await create(org.id, { ...input(doc.id, draft.id), actorType: "system" });

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "suggestion_created" },
    });
    expect(entry.actorType).toBe("system");
  });

  it("de-duplicates an identical pending suggestion and does not audit the duplicate", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);

    await create(org.id, input(doc.id, draft.id, { kind: "staleness", title: "Review overdue" }));
    const dup = await createSuggestion(
      org.id,
      // Same document + kind + title; a different message does not make it new.
      input(doc.id, draft.id, {
        kind: "staleness",
        title: "Review overdue",
        message: "different wording",
      }),
    );

    expect(dup).toBeNull();
    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(1);
    expect(await auditActions(org.id)).toEqual(["suggestion_created"]);
  });

  it("treats the same kind with a different title as a distinct finding", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);

    await create(
      org.id,
      input(doc.id, draft.id, { kind: "broken_reference", title: "Broken reference to AAA-100" }),
    );
    await create(
      org.id,
      input(doc.id, draft.id, { kind: "broken_reference", title: "Broken reference to BBB-200" }),
    );

    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(2);
  });

  it("allows an identical suggestion to be re-raised once the original is resolved", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-100" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-200" });

    // Dedup considers pending suggestions only, so resolving one re-opens the slot.
    const accepted = await create(org.id, input(a.doc.id, a.draft.id));
    await acceptSuggestion(org.id, admin.id, accepted.id);
    await expect(createSuggestion(org.id, input(a.doc.id, a.draft.id))).resolves.not.toBeNull();

    const rejected = await create(org.id, input(b.doc.id, b.draft.id));
    await rejectSuggestion(org.id, admin.id, rejected.id);
    await expect(createSuggestion(org.id, input(b.doc.id, b.draft.id))).resolves.not.toBeNull();
  });

  it("de-duplicates per document — the same finding on another document still lands", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-100" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-200" });

    await create(org.id, input(a.doc.id, a.draft.id, { title: "Review overdue" }));
    await expect(
      createSuggestion(org.id, input(b.doc.id, b.draft.id, { title: "Review overdue" })),
    ).resolves.not.toBeNull();

    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(2);
  });
});

describe("listPendingSuggestions", () => {
  it("returns only the document's pending suggestions, oldest first", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-100" });
    const other = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-200" });

    const a = await create(org.id, input(doc.id, draft.id, { title: "A" }));
    const b = await create(org.id, input(doc.id, draft.id, { title: "B" }));
    const resolved = await create(org.id, input(doc.id, draft.id, { title: "C" }));
    await create(org.id, input(other.doc.id, other.draft.id, { title: "elsewhere" }));
    await rejectSuggestion(org.id, admin.id, resolved.id);

    // createdAt only has millisecond resolution, so pin the order rather than
    // trust that two inserts landed in different milliseconds.
    await prisma.suggestion.update({
      where: { id: a.id },
      data: { createdAt: new Date("2026-02-01T00:00:00.000Z") },
    });
    await prisma.suggestion.update({
      where: { id: b.id },
      data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    const pending = await listPendingSuggestions(org.id, doc.id);
    expect(pending.map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("does not leak another org's suggestions for the same document id", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    await create(org.id, input(doc.id, draft.id));

    expect(await listPendingSuggestions(other.org.id, doc.id)).toEqual([]);
  });
});

describe("countPendingSuggestions", () => {
  it("counts pending suggestions across the org and ignores resolved ones", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const a = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-100" });
    const b = await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-200" });

    await create(org.id, input(a.doc.id, a.draft.id, { title: "one" }));
    await create(org.id, input(b.doc.id, b.draft.id, { title: "two" }));
    const resolved = await create(org.id, input(b.doc.id, b.draft.id, { title: "three" }));
    await acceptSuggestion(org.id, admin.id, resolved.id);

    expect(await countPendingSuggestions(org.id)).toBe(2);
    expect(await countPendingSuggestions(other.org.id)).toBe(0);
  });
});

describe("acceptSuggestion", () => {
  it("applies proposedJson to the document's existing open draft, in place", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, {
      json: pmDoc("Original body"),
    });
    const s = await create(
      org.id,
      input(doc.id, draft.id, {
        kind: "rewrite",
        title: "Tighten the scope",
        proposedJson: pmDoc("Rewritten body"),
      }),
    );

    const { appliedToDraftVersion } = await acceptSuggestion(org.id, admin.id, s.id);

    expect(appliedToDraftVersion).toBe(1);
    const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.prosemirrorJson).toEqual(pmDoc("Rewritten body"));
    // Staged into the open draft, not forked into a second row.
    expect(await prisma.documentVersion.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it("forks the next version from max+1 when no draft is open", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("v1 body") });
    const v1 = await publishDocument(org.id, admin.id, doc.id);
    const s = await create(
      org.id,
      input(doc.id, v1.id, {
        kind: "rewrite",
        title: "Tighten the scope",
        proposedJson: pmDoc("v2 body"),
      }),
    );

    const { appliedToDraftVersion } = await acceptSuggestion(org.id, admin.id, s.id);

    expect(appliedToDraftVersion).toBe(2);
    const forked = await prisma.documentVersion.findFirstOrThrow({
      where: { documentId: doc.id, publishedAt: null },
    });
    expect(forked.version).toBe(2);
    expect(forked.prosemirrorJson).toEqual(pmDoc("v2 body"));
    // The accepting human authors the forked draft — the AI never writes as itself.
    expect(forked.authorId).toBe(admin.id);
    const v1After = await prisma.documentVersion.findUniqueOrThrow({ where: { id: v1.id } });
    expect(v1After.markdown).toBe("v1 body\n");
  });

  it("acknowledges an advisory suggestion without creating or touching a draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Body") });
    const s = await create(
      org.id,
      input(doc.id, draft.id, { kind: "staleness", title: "Review overdue (200d)" }),
    );

    const { appliedToDraftVersion } = await acceptSuggestion(org.id, admin.id, s.id);

    expect(appliedToDraftVersion).toBeNull();
    const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.prosemirrorJson).toEqual(pmDoc("Body"));
    expect(await prisma.documentVersion.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it("marks the suggestion accepted and records the approving human", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    const s = await create(org.id, input(doc.id, draft.id));

    await acceptSuggestion(org.id, admin.id, s.id);

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("accepted");
    expect(row.actingHumanId).toBe(admin.id);
    expect(row.resolvedAt).toBeInstanceOf(Date);
  });

  it("logs suggestion_accepted as AI-originated with the human as the actor", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Body") });
    const s = await create(
      org.id,
      input(doc.id, draft.id, {
        kind: "rewrite",
        title: "Tighten the scope",
        proposedJson: pmDoc("New body"),
      }),
    );

    await acceptSuggestion(org.id, admin.id, s.id);

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "suggestion_accepted" },
    });
    expect(entry.actorType).toBe("user");
    expect(entry.actorId).toBe(admin.id);
    expect(entry.targetId).toBe(s.id);
    expect(entry.metadata).toMatchObject({
      documentId: doc.id,
      kind: "rewrite",
      aiOriginated: true,
      appliedToDraftVersion: 1,
    });
    expect(await auditActions(org.id)).toEqual(["suggestion_created", "suggestion_accepted"]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("throws when the suggestion is already resolved", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    const s = await create(org.id, input(doc.id, draft.id));
    await acceptSuggestion(org.id, admin.id, s.id);

    await expect(acceptSuggestion(org.id, admin.id, s.id)).rejects.toThrow();
  });

  it("cannot accept another org's suggestion", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Body") });
    const s = await create(
      org.id,
      input(doc.id, draft.id, { kind: "rewrite", title: "x", proposedJson: pmDoc("Injected") }),
    );

    await expect(acceptSuggestion(other.org.id, other.admin.id, s.id)).rejects.toThrow();

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("pending");
    const untouched = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(untouched.prosemirrorJson).toEqual(pmDoc("Body"));
  });
});

describe("rejectSuggestion", () => {
  it("marks the suggestion rejected and records the human", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    const s = await create(org.id, input(doc.id, draft.id));

    await rejectSuggestion(org.id, admin.id, s.id);

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("rejected");
    expect(row.actingHumanId).toBe(admin.id);
    expect(row.resolvedAt).toBeInstanceOf(Date);
  });

  it("never applies the proposed content to the draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Body") });
    const s = await create(
      org.id,
      input(doc.id, draft.id, {
        kind: "rewrite",
        title: "Tighten the scope",
        proposedJson: pmDoc("Rejected body"),
      }),
    );

    await rejectSuggestion(org.id, admin.id, s.id);

    const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.prosemirrorJson).toEqual(pmDoc("Body"));
    expect(await prisma.documentVersion.count({ where: { documentId: doc.id } })).toBe(1);
  });

  it("logs suggestion_rejected as AI-originated with the human as the actor", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    const s = await create(org.id, input(doc.id, draft.id));

    await rejectSuggestion(org.id, admin.id, s.id);

    const entry = await prisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: org.id, action: "suggestion_rejected" },
    });
    expect(entry.actorType).toBe("user");
    expect(entry.actorId).toBe(admin.id);
    expect(entry.targetId).toBe(s.id);
    expect(entry.metadata).toMatchObject({ documentId: doc.id, aiOriginated: true });
    expect(await auditActions(org.id)).toEqual(["suggestion_created", "suggestion_rejected"]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("throws when the suggestion is already resolved", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    const s = await create(org.id, input(doc.id, draft.id));
    await rejectSuggestion(org.id, admin.id, s.id);

    await expect(rejectSuggestion(org.id, admin.id, s.id)).rejects.toThrow();
  });

  it("cannot reject another org's suggestion", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc, draft } = await makeDocumentWithDraft(org.id, admin.id);
    const s = await create(org.id, input(doc.id, draft.id));

    await expect(rejectSuggestion(other.org.id, other.admin.id, s.id)).rejects.toThrow();

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("pending");
  });
});
