import { prisma } from "@/lib/db";
import { getOrCreateDraft, publishDocument, retireDocument } from "@/lib/lifecycle";
import { type SearchRow, searchDocuments } from "@/lib/search";
import { makeDocumentWithDraft, makeFolder, makeOrgWithAdmin, makeUser, pmDoc } from "@/test/db";
import { describe, expect, it } from "vitest";

/**
 * `updatedAt` is `@updatedAt`, so Prisma rewrites it on every write — publishing a
 * document bumps it. Ordering assertions therefore pin the column by raw SQL,
 * after the lifecycle calls that would otherwise clobber it.
 */
async function setUpdatedAt(documentId: string, when: Date): Promise<void> {
  await prisma.$executeRaw`UPDATE documents SET "updatedAt" = ${when} WHERE id = ${documentId}`;
}

/** A document whose published body is the given paragraphs — the only text FTS indexes. */
async function makePublishedDoc(
  orgId: string,
  authorId: string,
  overrides: Partial<{ docCode: string; title: string; folderId: string | null }>,
  ...body: string[]
) {
  const { doc } = await makeDocumentWithDraft(orgId, authorId, {
    ...overrides,
    json: pmDoc(...body),
  });
  await publishDocument(orgId, authorId, doc.id);
  return doc;
}

const codes = (rows: { docCode: string }[]) => rows.map((r) => r.docCode);

/** Assert the search returned exactly one row and hand it back non-optional. */
function only(rows: SearchRow[]): SearchRow {
  expect(rows).toHaveLength(1);
  return rows[0] as SearchRow;
}

describe("searchDocuments — org scoping", () => {
  it("never returns a matching document belonging to another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "MINE-1" }, "shared calibration text");
    await makePublishedDoc(
      other.org.id,
      other.admin.id,
      { docCode: "THEIRS-1" },
      "shared calibration text",
    );

    const rows = await searchDocuments(org.id, "admin", { query: "calibration" });
    expect(codes(rows)).toEqual(["MINE-1"]);
  });

  it("scopes the empty-query listing to the org too", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "MINE-1" }, "body");
    await makePublishedDoc(other.org.id, other.admin.id, { docCode: "THEIRS-1" }, "body");

    const rows = await searchDocuments(org.id, "admin", { query: "" });
    expect(codes(rows)).toEqual(["MINE-1"]);
  });
});

describe("searchDocuments — viewer role", () => {
  it("hides a draft-only document from a viewer even when it matches by title", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "DRAFT-1",
      title: "Calibration Handbook",
      json: pmDoc("unpublished body"),
    });

    expect(await searchDocuments(org.id, "viewer", { query: "calibration" })).toEqual([]);
    // The same query as an editor proves the document really is a match.
    expect(codes(await searchDocuments(org.id, "editor", { query: "calibration" }))).toEqual([
      "DRAFT-1",
    ]);
  });

  it("hides a retired document from a viewer even when it matches", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "RET-1", title: "Calibration Handbook" },
      "calibration body",
    );
    await retireDocument(org.id, admin.id, doc.id);

    expect(await searchDocuments(org.id, "viewer", { query: "calibration" })).toEqual([]);
    expect(codes(await searchDocuments(org.id, "editor", { query: "calibration" }))).toEqual([
      "RET-1",
    ]);
  });

  it("shows a viewer only the current-published, non-retired documents", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "PUB-1" }, "body");
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DRAFT-1", json: pmDoc("body") });
    const retired = await makePublishedDoc(org.id, admin.id, { docCode: "RET-1" }, "body");
    await retireDocument(org.id, admin.id, retired.id);

    expect(codes(await searchDocuments(org.id, "viewer", { query: "" }))).toEqual(["PUB-1"]);
  });

  it("does not let a viewer widen their scope via status:draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "DRAFT-1",
      title: "Calibration Handbook",
      json: pmDoc("body"),
    });

    expect(await searchDocuments(org.id, "viewer", { query: "", status: "draft" })).toEqual([]);
    expect(
      await searchDocuments(org.id, "viewer", { query: "calibration", status: "draft" }),
    ).toEqual([]);
  });

  it("does not let a viewer widen their scope via status:retired", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "RET-1", title: "Calibration Handbook" },
      "calibration body",
    );
    await retireDocument(org.id, admin.id, doc.id);

    expect(await searchDocuments(org.id, "viewer", { query: "", status: "retired" })).toEqual([]);
    expect(
      await searchDocuments(org.id, "viewer", { query: "calibration", status: "retired" }),
    ).toEqual([]);
  });

  it("keeps a published document visible to a viewer after an editor forks a new draft", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await makePublishedDoc(org.id, admin.id, { docCode: "PUB-1" }, "published body");
    const draft = await getOrCreateDraft(org.id, admin.id, doc.id);
    await prisma.documentVersion.update({
      where: { id: draft.id },
      data: { prosemirrorJson: pmDoc("secret unreleased body") },
    });

    // The viewer still sees the doc, but matched against the frozen v1 markdown only.
    expect(codes(await searchDocuments(org.id, "viewer", { query: "published" }))).toEqual([
      "PUB-1",
    ]);
    expect(await searchDocuments(org.id, "viewer", { query: "unreleased" })).toEqual([]);
  });
});

describe("searchDocuments — status filters for editors and admins", () => {
  async function seedAllStatuses() {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "PUB-1" }, "body");
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DRAFT-1", json: pmDoc("body") });
    const retired = await makePublishedDoc(org.id, admin.id, { docCode: "RET-1" }, "body");
    await retireDocument(org.id, admin.id, retired.id);
    return { org, admin };
  }

  it("status:published returns published, non-retired documents", async () => {
    const { org } = await seedAllStatuses();
    expect(
      codes(await searchDocuments(org.id, "editor", { query: "", status: "published" })),
    ).toEqual(["PUB-1"]);
  });

  it("status:draft returns documents with no current published version", async () => {
    const { org } = await seedAllStatuses();
    expect(codes(await searchDocuments(org.id, "editor", { query: "", status: "draft" }))).toEqual([
      "DRAFT-1",
    ]);
  });

  it("status:retired returns retired documents", async () => {
    const { org } = await seedAllStatuses();
    expect(
      codes(await searchDocuments(org.id, "editor", { query: "", status: "retired" })),
    ).toEqual(["RET-1"]);
  });

  it("no status returns every document regardless of state", async () => {
    const { org } = await seedAllStatuses();
    const rows = await searchDocuments(org.id, "admin", { query: "" });
    expect(codes(rows).sort()).toEqual(["DRAFT-1", "PUB-1", "RET-1"]);
  });

  it("an unrecognised status is ignored rather than treated as a filter", async () => {
    const { org } = await seedAllStatuses();
    const rows = await searchDocuments(org.id, "admin", { query: "", status: "nonsense" });
    expect(codes(rows).sort()).toEqual(["DRAFT-1", "PUB-1", "RET-1"]);
  });

  it("a retired document is excluded from status:draft even with no published version", async () => {
    // Retirement wins: `status:draft` requires retiredAt IS NULL.
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await makePublishedDoc(org.id, admin.id, { docCode: "RET-1" }, "body");
    await retireDocument(org.id, admin.id, doc.id);
    await prisma.document.update({
      where: { id: doc.id },
      data: { currentPublishedVersionId: null },
    });

    expect(await searchDocuments(org.id, "admin", { query: "", status: "draft" })).toEqual([]);
    expect(codes(await searchDocuments(org.id, "admin", { query: "", status: "retired" }))).toEqual(
      ["RET-1"],
    );
  });
});

describe("searchDocuments — folder filter", () => {
  it("restricts results to one folder and combines with the text query", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const policies = await makeFolder(org.id, "Policies");
    const forms = await makeFolder(org.id, "Forms");
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "POL-1", folderId: policies.id },
      "calibration body",
    );
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "FRM-1", folderId: forms.id },
      "calibration body",
    );
    await makePublishedDoc(org.id, admin.id, { docCode: "LOOSE-1" }, "calibration body");

    expect(
      codes(await searchDocuments(org.id, "admin", { query: "", folderId: policies.id })),
    ).toEqual(["POL-1"]);
    expect(
      codes(await searchDocuments(org.id, "admin", { query: "calibration", folderId: forms.id })),
    ).toEqual(["FRM-1"]);
  });
});

describe("searchDocuments — matching", () => {
  it("matches the published body text", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "SOP-1", title: "Untitled" },
      "The autoclave must reach 121 degrees.",
    );

    expect(codes(await searchDocuments(org.id, "admin", { query: "autoclave" }))).toEqual([
      "SOP-1",
    ]);
  });

  it("does not match draft body text, which is never frozen to markdown", async () => {
    // Documented behaviour: FTS reads the current published version's markdown,
    // so an unpublished body is unsearchable until it is published.
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "SOP-1",
      title: "Untitled",
      json: pmDoc("The autoclave must reach 121 degrees."),
    });

    expect(await searchDocuments(org.id, "admin", { query: "autoclave" })).toEqual([]);

    await publishDocument(org.id, admin.id, doc.id);
    expect(codes(await searchDocuments(org.id, "admin", { query: "autoclave" }))).toEqual([
      "SOP-1",
    ]);
  });

  it("matches the title, for drafts as well as published documents", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "DRAFT-1",
      title: "Autoclave Handbook",
      json: pmDoc("unrelated body"),
    });

    expect(codes(await searchDocuments(org.id, "editor", { query: "handbook" }))).toEqual([
      "DRAFT-1",
    ]);
  });

  it("matches the doc code", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "ZULU-777",
      title: "Untitled",
      json: pmDoc("unrelated body"),
    });

    expect(codes(await searchDocuments(org.id, "editor", { query: "ZULU-777" }))).toEqual([
      "ZULU-777",
    ]);
  });

  it("applies English stemming, so 'policy' finds 'policies'", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "SOP-1", title: "Untitled" },
      "All retention policies are reviewed annually.",
    );

    expect(codes(await searchDocuments(org.id, "admin", { query: "policy" }))).toEqual(["SOP-1"]);
  });

  it("honours websearch quoted-phrase syntax", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "PHRASE-1", title: "Untitled" },
      "the quality manual governs everything",
    );
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "PHRASE-2", title: "Untitled" },
      "quality is high and the manual is long",
    );

    expect(codes(await searchDocuments(org.id, "admin", { query: '"quality manual"' }))).toEqual([
      "PHRASE-1",
    ]);
  });

  it("honours websearch exclusion syntax", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "KEEP-1", title: "Untitled" },
      "calibration of the balance",
    );
    await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "DROP-1", title: "Untitled" },
      "calibration of the autoclave",
    );

    expect(
      codes(await searchDocuments(org.id, "admin", { query: "calibration -autoclave" })),
    ).toEqual(["KEEP-1"]);
  });

  it("returns an empty list when nothing matches", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "SOP-1", title: "Untitled" }, "body text");

    expect(await searchDocuments(org.id, "admin", { query: "zzzzunmatchable" })).toEqual([]);
  });

  it("treats a whitespace-only query as no text filter at all", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makePublishedDoc(org.id, admin.id, { docCode: "SOP-1", title: "Untitled" }, "body text");
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "SOP-2", json: pmDoc("body") });

    expect(codes(await searchDocuments(org.id, "admin", { query: "   " })).sort()).toEqual([
      "SOP-1",
      "SOP-2",
    ]);
  });
});

describe("searchDocuments — ordering", () => {
  it("lists everything by updatedAt desc when there is no query", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const oldest = await makePublishedDoc(org.id, admin.id, { docCode: "OLD-1" }, "body");
    const middle = await makePublishedDoc(org.id, admin.id, { docCode: "MID-1" }, "body");
    const newest = await makePublishedDoc(org.id, admin.id, { docCode: "NEW-1" }, "body");

    await setUpdatedAt(oldest.id, new Date("2026-01-01T00:00:00Z"));
    await setUpdatedAt(middle.id, new Date("2026-02-01T00:00:00Z"));
    await setUpdatedAt(newest.id, new Date("2026-03-01T00:00:00Z"));

    expect(codes(await searchDocuments(org.id, "admin", { query: "" }))).toEqual([
      "NEW-1",
      "MID-1",
      "OLD-1",
    ]);
  });

  it("orders matches by relevance, outranking the updatedAt tiebreak", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const relevant = await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "HIT-1", title: "Isolation Policy" },
      "Isolation is required. Isolation must be verified. Isolation is audited.",
    );
    const passing = await makePublishedDoc(
      org.id,
      admin.id,
      { docCode: "HIT-2", title: "Facilities Handbook" },
      "The site has parking, a canteen, a loading bay, a server room and an isolation cupboard.",
    );

    // The weakly-matching doc is the more recently updated one, so if ts_rank were
    // not driving the sort, HIT-2 would come first.
    await setUpdatedAt(relevant.id, new Date("2026-01-01T00:00:00Z"));
    await setUpdatedAt(passing.id, new Date("2026-03-01T00:00:00Z"));

    expect(codes(await searchDocuments(org.id, "admin", { query: "isolation" }))).toEqual([
      "HIT-1",
      "HIT-2",
    ]);
  });

  it("caps the result set at 100 rows", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await prisma.document.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        orgId: org.id,
        docCode: `BULK-${String(i).padStart(3, "0")}`,
        title: "Bulk Document",
        ownerId: admin.id,
      })),
    });

    expect(await prisma.document.count({ where: { orgId: org.id } })).toBe(101);
    expect(await searchDocuments(org.id, "admin", { query: "" })).toHaveLength(100);
    expect(await searchDocuments(org.id, "admin", { query: "bulk" })).toHaveLength(100);
  });
});

describe("searchDocuments — row shape", () => {
  it("populates the owner and folder joins", async () => {
    const { org } = await makeOrgWithAdmin();
    const owner = await makeUser(org.id, { name: "Olive Owner", email: "olive@example.test" });
    const folder = await makeFolder(org.id, "Policies");
    const doc = await makePublishedDoc(
      org.id,
      owner.id,
      { docCode: "SOP-1", title: "Autoclave Handbook", folderId: folder.id },
      "calibration body",
    );

    const row = only(await searchDocuments(org.id, "admin", { query: "calibration" }));
    expect(row).toMatchObject({
      id: doc.id,
      docCode: "SOP-1",
      title: "Autoclave Handbook",
      ownerName: "Olive Owner",
      ownerEmail: "olive@example.test",
      folderName: "Policies",
      retiredAt: null,
    });
    expect(row.currentPublishedVersionId).not.toBeNull();
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("returns null owner and folder fields when the document has neither", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await makePublishedDoc(org.id, admin.id, { docCode: "SOP-1" }, "calibration body");
    await prisma.document.update({ where: { id: doc.id }, data: { ownerId: null } });

    const row = only(await searchDocuments(org.id, "admin", { query: "calibration" }));
    expect(row.ownerName).toBeNull();
    expect(row.ownerEmail).toBeNull();
    expect(row.folderName).toBeNull();
  });

  it("reports retiredAt and the published projection so callers can label status", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const doc = await makePublishedDoc(org.id, admin.id, { docCode: "RET-1" }, "calibration body");
    await retireDocument(org.id, admin.id, doc.id);

    const row = only(await searchDocuments(org.id, "admin", { query: "calibration" }));
    expect(row.retiredAt).toBeInstanceOf(Date);
    expect(row.currentPublishedVersionId).not.toBeNull();
  });
});
