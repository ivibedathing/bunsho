import type { Prisma } from "@/generated/prisma/client";
import { reviewMarkdown, summarizeMarkdown } from "@/lib/ai/anthropic";
import { runAiReview, runAiSummary, runDocumentChecks } from "@/lib/checks";
import { prisma } from "@/lib/db";
import { publishDocument, retireDocument } from "@/lib/lifecycle";
import { makeDocumentWithDraft, makeOrgWithAdmin, pmDoc } from "@/test/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The LLM is never called for real: these are the only two functions checks.ts
// uses from the SDK wrapper, and both are stubbed per test.
vi.mock("@/lib/ai/anthropic", () => ({
  summarizeMarkdown: vi.fn(),
  reviewMarkdown: vi.fn(),
}));

const summarizeMock = vi.mocked(summarizeMarkdown);
const reviewMock = vi.mocked(reviewMarkdown);

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Backdate a version's publishedAt. Publishing always stamps `now`, and the
 * freeze trigger fires BEFORE UPDATE on any published row, so the only way to
 * age a genuinely-published version is to run the update with user triggers off.
 * `SET LOCAL` scopes that to this transaction; Prisma's interactive transaction
 * guarantees both statements share one connection.
 */
async function backdatePublish(versionId: string, ageDays: number): Promise<void> {
  const at = new Date(Date.now() - ageDays * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    await tx.$executeRaw`UPDATE "document_versions" SET "publishedAt" = ${at} WHERE "id" = ${versionId}`;
  });
}

/** A published document, optionally published `ageDays` ago (default: just now). */
async function makePublishedDoc(
  orgId: string,
  authorId: string,
  opts: { docCode: string; json?: Prisma.InputJsonValue; ageDays?: number },
) {
  const { doc } = await makeDocumentWithDraft(orgId, authorId, {
    docCode: opts.docCode,
    json: opts.json ?? pmDoc(`${opts.docCode} body`),
  });
  const version = await publishDocument(orgId, authorId, doc.id);
  if (opts.ageDays) await backdatePublish(version.id, opts.ageDays);
  return { doc, version };
}

/** The org's suggestions as terse {kind,title} pairs — the assertion most tests want. */
async function findings(orgId: string) {
  const rows = await prisma.suggestion.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const p = r.payload as { kind: string; title: string };
    return { kind: p.kind, title: p.title };
  });
}

// STALE_DAYS is read from env at import time and cannot be changed from a test,
// so every staleness case is driven by publishedAt against the 180-day default.
const STALE_DAYS = 180;

describe("runDocumentChecks", () => {
  it("scans only published, non-retired documents", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-100" }); // never published
    const retired = await makePublishedDoc(org.id, admin.id, { docCode: "SOP-200" });
    await retireDocument(org.id, admin.id, retired.doc.id);
    await makePublishedDoc(org.id, admin.id, { docCode: "SOP-300" });

    const result = await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(result.scanned).toBe(1);
  });

  it("narrows the scan to one document when documentId is given", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const target = await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      ageDays: STALE_DAYS + 20,
    });
    await makePublishedDoc(org.id, admin.id, { docCode: "SOP-200", ageDays: STALE_DAYS + 20 });

    const result = await runDocumentChecks(org.id, {
      documentId: target.doc.id,
      origin: "on_demand",
    });

    expect(result.scanned).toBe(1);
    expect(result.created).toBe(1);
    const rows = await prisma.suggestion.findMany({ where: { orgId: org.id } });
    expect(rows.map((r) => r.documentId)).toEqual([target.doc.id]);
  });

  it("is scoped to the org — another org's published documents are invisible", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "SOP-100", ageDays: STALE_DAYS + 20 });

    const result = await runDocumentChecks(other.org.id, { origin: "scheduled" });

    expect(result).toMatchObject({ scanned: 0, created: 0 });
    expect(await prisma.suggestion.count()).toBe(0);
  });

  it("raises a staleness suggestion once the published version passes the threshold", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Body with no references"),
      ageDays: STALE_DAYS + 20,
    });

    const result = await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(result).toMatchObject({ scanned: 1, created: 1, cappedAt: null });
    const row = await prisma.suggestion.findFirstOrThrow({ where: { orgId: org.id } });
    expect(row.documentId).toBe(doc.id);
    expect(row.origin).toBe("scheduled");
    expect(row.status).toBe("pending");
    expect(row.payload).toMatchObject({
      kind: "staleness",
      title: `Review overdue (${STALE_DAYS + 20}d)`,
    });
  });

  it("raises nothing for a document published inside the threshold", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Body with no references"),
      ageDays: STALE_DAYS - 1,
    });

    const result = await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(result).toMatchObject({ scanned: 1, created: 0 });
  });

  it("flags doc codes that are not current published documents, and only those", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "QMS-200" });
    const { doc } = await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Follow QMS-200 as amended by XYZ-999."),
    });

    const result = await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(result.created).toBe(1);
    const row = await prisma.suggestion.findFirstOrThrow({ where: { orgId: org.id } });
    expect(row.documentId).toBe(doc.id);
    expect(row.payload).toMatchObject({
      kind: "broken_reference",
      title: "Broken reference to XYZ-999",
    });
  });

  it("flags a reference to a retired document, which is no longer current", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const gone = await makePublishedDoc(org.id, admin.id, { docCode: "QMS-200" });
    await retireDocument(org.id, admin.id, gone.doc.id);
    await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Superseded by QMS-200."),
    });

    await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(await findings(org.id)).toEqual([
      { kind: "broken_reference", title: "Broken reference to QMS-200" },
    ]);
  });

  it("never flags a document's reference to itself", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("This procedure, SOP-100, supersedes all prior revisions of SOP-100."),
    });

    const result = await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(result.created).toBe(0);
    expect(await findings(org.id)).toEqual([]);
  });

  it("stops at maxPerRun and reports the cap it hit", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    for (const code of ["SOP-100", "SOP-200", "SOP-300", "SOP-400"]) {
      await makePublishedDoc(org.id, admin.id, {
        docCode: code,
        json: pmDoc("Body with no references"),
        ageDays: STALE_DAYS + 20,
      });
    }

    const result = await runDocumentChecks(org.id, { origin: "scheduled", maxPerRun: 2 });

    expect(result.created).toBe(2);
    expect(result.cappedAt).toBe(2);
    // `scanned` reports the documents matched, not the subset processed before the cap.
    expect(result.scanned).toBe(4);
    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(2);
  });

  it("reports cappedAt null when the run finishes under the cap", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Body with no references"),
      ageDays: STALE_DAYS + 20,
    });

    const result = await runDocumentChecks(org.id, { origin: "scheduled", maxPerRun: 10 });

    expect(result).toMatchObject({ created: 1, cappedAt: null });
  });

  it("is idempotent — a second run re-finds the same issues and creates nothing", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("See XYZ-999."),
      ageDays: STALE_DAYS + 20,
    });

    const first = await runDocumentChecks(org.id, { origin: "scheduled" });
    const second = await runDocumentChecks(org.id, { origin: "scheduled" });

    expect(first.created).toBe(2); // staleness + broken reference
    // Dedup on (document, kind, title) keeps the queue from piling up.
    expect(second).toMatchObject({ scanned: 1, created: 0 });
    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(2);
  });
});

describe("runAiSummary", () => {
  it("returns the model's summary inline and queues nothing", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Calibration policy body"),
    });
    summarizeMock.mockResolvedValue("A one-paragraph summary.");

    const summary = await runAiSummary(org.id, doc.id);

    expect(summary).toBe("A one-paragraph summary.");
    // The frozen markdown of the published version, trailing newline and all.
    expect(summarizeMock).toHaveBeenCalledWith("Calibration policy body\n");
    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("falls back to the open draft when the document is not published", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, { json: pmDoc("Draft body") });
    summarizeMock.mockResolvedValue("Summary of the draft.");

    await runAiSummary(org.id, doc.id);

    expect(summarizeMock).toHaveBeenCalledWith("Draft body\n");
  });

  it("throws when the document has no content at all", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await prisma.document.create({
      data: { orgId: org.id, docCode: "SOP-100", title: "Empty", ownerId: admin.id },
    });

    await expect(runAiSummary(org.id, doc.id)).rejects.toThrow(
      "Document has no content to analyze",
    );
    expect(summarizeMock).not.toHaveBeenCalled();
  });

  it("cannot summarize another org's document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makePublishedDoc(org.id, admin.id, { docCode: "SOP-100" });
    summarizeMock.mockResolvedValue("leaked");

    await expect(runAiSummary(other.org.id, doc.id)).rejects.toThrow();
    expect(summarizeMock).not.toHaveBeenCalled();
  });
});

describe("runAiReview", () => {
  it("queues the model's notes as an advisory suggestion rather than editing", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc, version } = await makePublishedDoc(org.id, admin.id, {
      docCode: "SOP-100",
      json: pmDoc("Calibration policy body"),
    });
    reviewMock.mockResolvedValue("- Section 2 lacks an owner.");

    const created = await runAiReview(org.id, doc.id);

    expect(created).not.toBeNull();
    expect(reviewMock).toHaveBeenCalledWith("Calibration policy body\n");
    const row = await prisma.suggestion.findFirstOrThrow({ where: { orgId: org.id } });
    expect(row.id).toBe(created?.id);
    expect(row.origin).toBe("on_demand");
    expect(row.status).toBe("pending");
    expect(row.baseVersionId).toBe(version.id);
    expect(row.payload).toEqual({
      kind: "review",
      title: "AI review",
      message: "- Section 2 lacks an owner.",
    });
    // Advisory only: no proposedJson, so accepting it cannot rewrite the document.
    expect((row.payload as { proposedJson?: unknown }).proposedJson).toBeUndefined();
  });

  it("de-duplicates a repeat review of the same document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makePublishedDoc(org.id, admin.id, { docCode: "SOP-100" });
    reviewMock.mockResolvedValue("- First pass.");
    await runAiReview(org.id, doc.id);

    // Same kind + title ("AI review"), so the fresh notes are dropped while the
    // first review is still pending.
    reviewMock.mockResolvedValue("- Second pass, different notes.");
    expect(await runAiReview(org.id, doc.id)).toBeNull();

    expect(await prisma.suggestion.count({ where: { orgId: org.id } })).toBe(1);
  });

  it("throws when the document has no content at all", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await prisma.document.create({
      data: { orgId: org.id, docCode: "SOP-100", title: "Empty", ownerId: admin.id },
    });

    await expect(runAiReview(org.id, doc.id)).rejects.toThrow("Document has no content to analyze");
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it("cannot review another org's document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const { doc } = await makePublishedDoc(org.id, admin.id, { docCode: "SOP-100" });
    reviewMock.mockResolvedValue("leaked");

    await expect(runAiReview(other.org.id, doc.id)).rejects.toThrow();
    expect(await prisma.suggestion.count()).toBe(0);
  });
});
