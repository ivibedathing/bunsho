import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { STARTER_TEMPLATES, seedStarterTemplates } from "@/lib/templates";
import { makeDocumentWithDraft, makeOrgWithAdmin } from "@/test/db";

describe("STARTER_TEMPLATES", () => {
  it("ships a non-empty pack where every entry has a title and a body", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThan(0);
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.title.trim()).not.toBe("");
      expect(tpl.body.trim()).not.toBe("");
    }
  });

  it("has unique titles, since the title is the seeder's identity key", () => {
    const titles = STARTER_TEMPLATES.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("seedStarterTemplates", () => {
  it("creates one draft document per template and returns the count", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    const created = await seedStarterTemplates(org.id, admin.id);

    expect(created).toBe(STARTER_TEMPLATES.length);
    const docs = await prisma.document.findMany({ where: { orgId: org.id } });
    expect(docs.map((d) => d.title).sort()).toEqual(STARTER_TEMPLATES.map((t) => t.title).sort());

    // Seeded as drafts for the org to adapt — nothing is published.
    for (const doc of docs) {
      expect(doc.currentPublishedVersionId).toBeNull();
      expect(doc.ownerId).toBe(admin.id);
    }
    const drafts = await prisma.documentVersion.findMany({
      where: { orgId: org.id, publishedAt: null },
    });
    expect(drafts).toHaveLength(STARTER_TEMPLATES.length);
  });

  it("parses the template markdown into the seeded draft's content", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await seedStarterTemplates(org.id, admin.id);

    const tpl = STARTER_TEMPLATES[0];
    const doc = await prisma.document.findFirstOrThrow({
      where: { orgId: org.id, title: tpl?.title },
    });
    const draft = await prisma.documentVersion.findFirstOrThrow({
      where: { documentId: doc.id, publishedAt: null },
    });

    // Not the EMPTY_DOC createDocument starts with: saveDraft overwrote it with
    // the parsed template, whose first node is the title as an H1.
    const json = draft.prosemirrorJson as { type: string; content: unknown[] };
    expect(json.type).toBe("doc");
    expect(json.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: tpl?.title }],
    });
    // The whole template body came through, not just its heading.
    expect(json.content.length).toBeGreaterThan(1);
  });

  it("allocates a distinct, sequential doc code per template from the shared DOC- sequence", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await seedStarterTemplates(org.id, admin.id);

    const docs = await prisma.document.findMany({
      where: { orgId: org.id },
      orderBy: { docCode: "asc" },
      select: { docCode: true },
    });
    const codes = docs.map((d) => d.docCode);

    // Codes are allocated one at a time inside the loop, so each seeded draft
    // advances the sequence for the next: DOC-001 … DOC-00N, all distinct.
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(STARTER_TEMPLATES.map((_, i) => `DOC-${String(i + 1).padStart(3, "0")}`));
  });

  it("is idempotent — a second run creates nothing and duplicates nothing", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const first = await seedStarterTemplates(org.id, admin.id);

    const second = await seedStarterTemplates(org.id, admin.id);

    expect(second).toBe(0);
    expect(await prisma.document.count({ where: { orgId: org.id } })).toBe(first);
  });

  it("keys on the title, not the doc code — a same-titled doc skips only that template", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const taken = STARTER_TEMPLATES[0];
    // A doc that shares a template's title but carries an unrelated code.
    await makeDocumentWithDraft(org.id, admin.id, {
      title: taken?.title,
      docCode: "POL-900",
    });

    const created = await seedStarterTemplates(org.id, admin.id);

    expect(created).toBe(STARTER_TEMPLATES.length - 1);
    expect(await prisma.document.count({ where: { orgId: org.id, title: taken?.title } })).toBe(1);
    // The rest still seeded.
    expect(await prisma.document.count({ where: { orgId: org.id } })).toBe(
      STARTER_TEMPLATES.length,
    );
  });

  it("continues the DOC- sequence past codes the org already uses", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, {
      title: "Pre-existing Document",
      docCode: "DOC-001",
    });

    const created = await seedStarterTemplates(org.id, admin.id);

    expect(created).toBe(STARTER_TEMPLATES.length);
    const seeded = await prisma.document.findMany({
      where: { orgId: org.id, title: { not: "Pre-existing Document" } },
      select: { docCode: true },
    });
    const codes = seeded.map((d) => d.docCode).sort();
    expect(codes).not.toContain("DOC-001");
    expect(codes).toEqual(STARTER_TEMPLATES.map((_, i) => `DOC-${String(i + 2).padStart(3, "0")}`));
  });
});
