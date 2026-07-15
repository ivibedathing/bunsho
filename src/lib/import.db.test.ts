import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { verifyOrgChain } from "@/lib/audit/writer";
import { prisma } from "@/lib/db";
import { importMarkdownFiles, importZip } from "@/lib/import";
import { auditActions, makeDocumentWithDraft, makeOrgWithAdmin } from "@/test/db";

/** The single document an import produced, with its open draft. */
async function onlyDoc(orgId: string) {
  const doc = await prisma.document.findFirstOrThrow({ where: { orgId } });
  const draft = await prisma.documentVersion.findFirstOrThrow({
    where: { documentId: doc.id, publishedAt: null },
  });
  return { doc, draft };
}

function headingText(json: unknown): string | undefined {
  const first = (json as { content?: { content?: { text?: string }[] }[] }).content?.[0];
  return first?.content?.[0]?.text;
}

describe("importMarkdownFiles", () => {
  it("honours title and code from front matter over the body's own heading", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    const result = await importMarkdownFiles(org.id, admin.id, [
      {
        name: "whatever.md",
        content:
          "---\ntitle: Front Matter Title\ncode: POL-042\n---\n# Heading Loses\n\nBody text.",
      },
    ]);

    expect(result).toEqual({ created: 1, skipped: [] });
    const { doc } = await onlyDoc(org.id);
    expect(doc.title).toBe("Front Matter Title");
    expect(doc.docCode).toBe("POL-042");
  });

  it("unquotes front matter values and unescapes embedded quotes", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "q.md", content: '---\ntitle: "The \\"Quoted\\" Policy"\n---\n\nBody.' },
    ]);

    const { doc } = await onlyDoc(org.id);
    expect(doc.title).toBe('The "Quoted" Policy');
  });

  it("normalizes a lowercase front matter code to canonical form", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "n.md", content: "---\ntitle: T\ncode:  sop-013 \n---\n\nBody." },
    ]);

    const { doc } = await onlyDoc(org.id);
    expect(doc.docCode).toBe("SOP-013");
  });

  it("falls back to the first heading when front matter has no title", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "ignored-name.md", content: "# Heading Wins\n\nSome body." },
    ]);

    const { doc } = await onlyDoc(org.id);
    expect(doc.title).toBe("Heading Wins");
  });

  it("falls back to the file name, minus .md and any directory path", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "policies/nested/Onboarding Guide.md", content: "Body with no heading at all." },
    ]);

    const { doc } = await onlyDoc(org.id);
    expect(doc.title).toBe("Onboarding Guide");
  });

  it("falls back to the generated next code when front matter's code is invalid", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "bad-code.md", content: "---\ntitle: T\ncode: not a code\n---\n\nBody." },
    ]);

    const { doc } = await onlyDoc(org.id);
    expect(doc.docCode).toBe("DOC-001");
  });

  it("falls back to the generated next code when front matter's code is already taken", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, { title: "Incumbent", docCode: "POL-007" });

    const result = await importMarkdownFiles(org.id, admin.id, [
      { name: "clash.md", content: "---\ntitle: Latecomer\ncode: POL-007\n---\n\nBody." },
    ]);

    // The taken code is dropped rather than colliding on @@unique([orgId, docCode]).
    expect(result).toEqual({ created: 1, skipped: [] });
    const imported = await prisma.document.findFirstOrThrow({
      where: { orgId: org.id, title: "Latecomer" },
    });
    expect(imported.docCode).toBe("DOC-001");
  });

  it("gives each file in a batch its own code as the sequence advances", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    const result = await importMarkdownFiles(org.id, admin.id, [
      { name: "a.md", content: "# A" },
      { name: "b.md", content: "# B" },
      { name: "c.md", content: "# C" },
    ]);

    expect(result.created).toBe(3);
    const docs = await prisma.document.findMany({
      where: { orgId: org.id },
      orderBy: { docCode: "asc" },
    });
    expect(docs.map((d) => d.docCode)).toEqual(["DOC-001", "DOC-002", "DOC-003"]);
  });

  it("lands imports as drafts and never auto-publishes them", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [{ name: "p.md", content: "# Policy\n\nBody." }]);

    const { doc, draft } = await onlyDoc(org.id);
    expect(doc.currentPublishedVersionId).toBeNull();
    expect(doc.retiredAt).toBeNull();
    expect(draft.version).toBe(1);
    expect(draft.publishedAt).toBeNull();
    // Nothing is frozen until a human publishes it.
    expect(draft.markdown).toBeNull();
    expect(draft.contentSha).toBeNull();
  });

  it("parses the body into the draft rather than leaving it empty", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "p.md", content: "# Policy\n\nFirst paragraph." },
    ]);

    const { draft } = await onlyDoc(org.id);
    expect(draft.prosemirrorJson).toMatchObject({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ text: "Policy" }] },
        { type: "paragraph", content: [{ text: "First paragraph." }] },
      ],
    });
  });

  it("substitutes a '# <title>' body when the file has nothing but front matter", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "empty.md", content: "---\ntitle: Empty One\n---\n" },
    ]);

    const { doc, draft } = await onlyDoc(org.id);
    expect(doc.title).toBe("Empty One");
    expect(headingText(draft.prosemirrorJson)).toBe("Empty One");
  });

  it("treats front matter with no closing --- as body, not metadata", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "malformed.md", content: "---\ntitle: Ghost Title\n\n# Real Heading\n\nBody." },
    ]);

    const { doc } = await onlyDoc(org.id);
    // The unterminated block never parsed, so `title:` stayed prose and the
    // heading supplied the title.
    expect(doc.title).toBe("Real Heading");
    expect(doc.title).not.toBe("Ghost Title");
  });

  it("reports a failing file in skipped while the rest still import", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    // A NUL byte is not storable in a Postgres text column, so this title is
    // rejected at write time — standing in for any per-file write failure.
    const result = await importMarkdownFiles(org.id, admin.id, [
      { name: "good-1.md", content: "# Good One\n\nBody." },
      { name: "broken.md", content: "# Bad\u0000Title\n\nBody." },
      { name: "good-2.md", content: "# Good Two\n\nBody." },
    ]);

    expect(result.created).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.name).toBe("broken.md");
    expect(result.skipped[0]?.reason).toBeTruthy();

    const titles = await prisma.document.findMany({
      where: { orgId: org.id },
      orderBy: { docCode: "asc" },
      select: { title: true },
    });
    expect(titles.map((t) => t.title)).toEqual(["Good One", "Good Two"]);
  });

  it("imports nothing and reports nothing for an empty file list", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    expect(await importMarkdownFiles(org.id, admin.id, [])).toEqual({ created: 0, skipped: [] });
    expect(await prisma.document.count({ where: { orgId: org.id } })).toBe(0);
  });
});

describe("importZip", () => {
  it("imports only .md entries, skipping directories and other file types", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const zip = new JSZip();
    zip.folder("policies");
    zip.file("policies/access.md", "# Access Control\n\nBody.");
    zip.file("policies/logo.png", "not really a png");
    zip.file("README.txt", "ignore me");
    zip.file("top-level.md", "# Top Level\n\nBody.");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await importZip(org.id, admin.id, buffer);

    expect(result).toEqual({ created: 2, skipped: [] });
    const docs = await prisma.document.findMany({
      where: { orgId: org.id },
      select: { title: true },
    });
    expect(docs.map((d) => d.title).sort()).toEqual(["Access Control", "Top Level"]);
  });

  it("matches the .md extension case-insensitively", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const zip = new JSZip();
    zip.file("Shouty.MD", "# Shouty\n\nBody.");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    expect(await importZip(org.id, admin.id, buffer)).toEqual({ created: 1, skipped: [] });
  });

  it("takes the title from a nested entry's base name, not its path", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const zip = new JSZip();
    zip.file("a/b/c/Deep Policy.md", "Body with no heading.");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await importZip(org.id, admin.id, buffer);

    const { doc } = await onlyDoc(org.id);
    expect(doc.title).toBe("Deep Policy");
  });

  it("honours front matter inside zipped entries", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const zip = new JSZip();
    zip.file("x.md", "---\ntitle: Zipped Policy\ncode: SOP-021\n---\n\nBody.");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await importZip(org.id, admin.id, buffer);

    const { doc } = await onlyDoc(org.id);
    expect(doc).toMatchObject({ title: "Zipped Policy", docCode: "SOP-021" });
  });

  it("returns an empty result for a zip with no markdown in it", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const zip = new JSZip();
    zip.file("notes.txt", "nothing to import");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    expect(await importZip(org.id, admin.id, buffer)).toEqual({ created: 0, skipped: [] });
  });
});

describe("import audit trail", () => {
  it("writes one document_created per imported file and keeps the chain intact", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "a.md", content: "# A" },
      { name: "b.md", content: "# B" },
    ]);

    expect(await auditActions(org.id)).toEqual(["document_created", "document_created"]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });

  it("logs nothing for a file that failed to import", async () => {
    const { org, admin } = await makeOrgWithAdmin();

    await importMarkdownFiles(org.id, admin.id, [
      { name: "good.md", content: "# Good" },
      { name: "broken.md", content: "# Bad\u0000Title" },
    ]);

    // createDocument's transaction rolls back, taking its audit entry with it.
    expect(await auditActions(org.id)).toEqual(["document_created"]);
    await expect(verifyOrgChain(prisma, org.id)).resolves.toMatchObject({ ok: true });
  });
});
