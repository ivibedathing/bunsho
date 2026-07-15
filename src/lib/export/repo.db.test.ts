import nodefs from "node:fs";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildZip, collectExport, type ExportFile, rebuildGitRepo } from "@/lib/export/repo";
import { getOrCreateDraft, publishDocument, retireDocument } from "@/lib/lifecycle";
import {
  makeDocumentWithDraft,
  makeFolder,
  makeOrg,
  makeOrgWithAdmin,
  makeUser,
  pmDoc,
} from "@/test/db";

/**
 * The export writes a real git repo through isomorphic-git, so every test gets
 * its own throwaway directory outside the source tree.
 */
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = nodefs.mkdtempSync(path.join(os.tmpdir(), "bunsho-export-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    nodefs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Publish a fresh document in one step — the export's only input is published state. */
async function publishDoc(
  orgId: string,
  authorId: string,
  opts: { docCode: string; title?: string; body?: string; folderId?: string | null; note?: string },
) {
  const { doc } = await makeDocumentWithDraft(orgId, authorId, {
    docCode: opts.docCode,
    title: opts.title ?? `Title of ${opts.docCode}`,
    folderId: opts.folderId ?? null,
    json: pmDoc(opts.body ?? `Body of ${opts.docCode}`),
  });
  const version = await publishDocument(orgId, authorId, doc.id, opts.note);
  return { doc, version };
}

/** Publish a follow-up version of an existing document. */
async function publishNext(
  orgId: string,
  authorId: string,
  documentId: string,
  body: string,
  note?: string,
) {
  const draft = await getOrCreateDraft(orgId, authorId, documentId);
  await prisma.documentVersion.update({
    where: { id: draft.id },
    data: { prosemirrorJson: pmDoc(body) },
  });
  return publishDocument(orgId, authorId, documentId, note);
}

/** The org's single exported file — fails loudly rather than yielding `undefined`. */
async function onlyExportedFile(orgId: string): Promise<ExportFile> {
  const files = await collectExport(orgId);
  expect(files).toHaveLength(1);
  return files[0] as ExportFile;
}

/** Index into a list, failing the test rather than yielding `undefined`. */
function at<T>(list: T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`expected an element at index ${index}`);
  return value;
}

/** Change-log table rows, split into cells: `["", "v1", date, note, author, ""]`. */
function changeLogRows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((l) => /^\| v\d+ \|/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()));
}

describe("collectExport", () => {
  it("exports only the current published version of each non-retired document", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await publishDoc(org.id, admin.id, { docCode: "SOP-001" });

    // A never-published draft is not part of the export.
    await makeDocumentWithDraft(org.id, admin.id, {
      docCode: "SOP-002",
      json: pmDoc("unpublished"),
    });

    // A retired document drops out even though it has a published version.
    const retired = await publishDoc(org.id, admin.id, { docCode: "SOP-003" });
    await retireDocument(org.id, admin.id, retired.doc.id);

    const files = await collectExport(org.id);
    expect(files.map((f) => f.path)).toEqual(["SOP-001.md"]);
  });

  it("includes a document that was retired and then published again", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-010" });
    await retireDocument(org.id, admin.id, doc.id);
    expect(await collectExport(org.id)).toEqual([]);

    await publishNext(org.id, admin.id, doc.id, "revived body");

    expect((await collectExport(org.id)).map((f) => f.path)).toEqual(["SOP-010.md"]);
  });

  it("is scoped to one org and never leaks another org's documents", async () => {
    const a = await makeOrgWithAdmin();
    const b = await makeOrgWithAdmin();
    await publishDoc(a.org.id, a.admin.id, { docCode: "AAA-1", body: "org a secret" });
    await publishDoc(b.org.id, b.admin.id, { docCode: "BBB-1", body: "org b secret" });

    const file = await onlyExportedFile(a.org.id);
    expect(file.path).toBe("AAA-1.md");
    expect(file.markdown).toContain("org a secret");
    expect(file.markdown).not.toContain("org b secret");
  });

  it("files documents under their folder and leaves unfiled documents at the root", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    await publishDoc(org.id, admin.id, { docCode: "POL-1", folderId: folder.id });
    await publishDoc(org.id, admin.id, { docCode: "ZZZ-1" });

    expect((await collectExport(org.id)).map((f) => f.path)).toEqual([
      "Policies/POL-1.md",
      "ZZZ-1.md",
    ]);
  });

  it("orders files by docCode ascending", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    // Created out of order on purpose.
    await publishDoc(org.id, admin.id, { docCode: "SOP-300" });
    await publishDoc(org.id, admin.id, { docCode: "SOP-100" });
    await publishDoc(org.id, admin.id, { docCode: "SOP-200" });

    expect((await collectExport(org.id)).map((f) => f.path)).toEqual([
      "SOP-100.md",
      "SOP-200.md",
      "SOP-300.md",
    ]);
  });

  it("sanitizes unsafe characters in the folder name into a flat slug", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Quality & Safety / 2026 (draft)");
    await publishDoc(org.id, admin.id, { docCode: "QS-1", folderId: folder.id });

    // The slash must not survive as a path separator, and the name must not
    // start or end with the separator character.
    expect((await onlyExportedFile(org.id)).path).toBe("Quality-Safety-2026-draft/QS-1.md");
  });

  it("falls back to `untitled` when a folder name has no safe characters left", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "///");
    await publishDoc(org.id, admin.id, { docCode: "UN-1", folderId: folder.id });

    expect((await onlyExportedFile(org.id)).path).toBe("untitled/UN-1.md");
  });

  it("embeds the document metadata as front matter", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { version } = await publishDoc(org.id, admin.id, {
      docCode: "SOP-042",
      title: 'Handling "Hazardous" Waste',
      body: "Wear gloves.",
      note: "first release",
    });

    const file = await onlyExportedFile(org.id);
    expect(file.markdown).toContain('code: "SOP-042"');
    // The title is a quoted YAML scalar, so embedded quotes are escaped.
    expect(file.markdown).toContain('title: "Handling \\"Hazardous\\" Waste"');
    expect(file.markdown).toContain("version: 1");
    expect(file.markdown).toContain(`published: ${version.publishedAt?.toISOString()}`);
    expect(file.markdown).toContain('author: "Ada Admin"');
    expect(file.markdown).toContain('change_note: "first release"');
    // The frozen body is reproduced verbatim.
    expect(file.markdown).toContain("Wear gloves.");
  });

  it("lists every published version in the change log, oldest first", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-050", note: "initial" });
    await publishNext(org.id, admin.id, doc.id, "second body", "clarified scope");
    await publishNext(org.id, admin.id, doc.id, "third body", "annual review");

    const file = await onlyExportedFile(org.id);
    const rows = changeLogRows(file.markdown);

    expect(rows.map((r) => r[1])).toEqual(["v1", "v2", "v3"]);
    expect(rows.map((r) => r[3])).toEqual(["initial", "clarified scope", "annual review"]);
    expect(rows.map((r) => r[4])).toEqual(["Ada Admin", "Ada Admin", "Ada Admin"]);
    // The exported body is the current version's, not the first.
    expect(file.markdown).toContain("third body");
    expect(file.markdown).not.toContain("second body");
  });

  it("excludes an open draft from the change log", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-060" });
    await getOrCreateDraft(org.id, admin.id, doc.id); // v2, unpublished

    const file = await onlyExportedFile(org.id);
    expect(changeLogRows(file.markdown)).toHaveLength(1);
    expect(file.markdown).toContain("version: 1");
  });

  it("falls back to the author's email when the account has no name", async () => {
    const org = await makeOrg();
    const nameless = await prisma.user.create({
      data: { orgId: org.id, email: "nameless@example.test", name: null, role: "admin" },
    });
    await publishDoc(org.id, nameless.id, { docCode: "SOP-070", note: "by a nameless author" });

    const file = await onlyExportedFile(org.id);
    expect(file.markdown).toContain('author: "nameless@example.test"');
    expect(file.markdown).toContain("| nameless@example.test |");
  });

  it("attributes each change-log row to the author who published that version", async () => {
    const org = await makeOrg();
    const alice = await makeUser(org.id, { name: "Alice", role: "admin" });
    const bob = await makeUser(org.id, { name: "Bob", role: "admin" });
    const { doc } = await publishDoc(org.id, alice.id, { docCode: "SOP-080", note: "by alice" });
    await publishNext(org.id, bob.id, doc.id, "bob's body", "by bob");

    const file = await onlyExportedFile(org.id);
    expect(changeLogRows(file.markdown).map((r) => r[4])).toEqual(["Alice", "Bob"]);
  });

  it("exports nothing for an org with no published documents", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, { docCode: "DRAFT-1" });

    await expect(collectExport(org.id)).resolves.toEqual([]);
  });
});

describe("buildZip", () => {
  it("contains one entry per exported file, with matching content", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    await publishDoc(org.id, admin.id, {
      docCode: "POL-1",
      folderId: folder.id,
      body: "policy body",
    });
    await publishDoc(org.id, admin.id, { docCode: "SOP-1", body: "sop body" });

    const zip = await JSZip.loadAsync(await buildZip(org.id));
    const entries = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    expect(entries.sort()).toEqual(["Policies/POL-1.md", "SOP-1.md"]);

    const files = await collectExport(org.id);
    for (const f of files) {
      expect(await zip.file(f.path)?.async("string")).toBe(f.markdown);
    }
  });

  it("is byte-identical across rebuilds — fixed entry dates, no timestamp drift", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await publishDoc(org.id, admin.id, { docCode: "SOP-1" });

    const first = await buildZip(org.id);
    const second = await buildZip(org.id);
    expect(first.equals(second)).toBe(true);
  });

  it("produces a valid empty zip for an org with nothing published", async () => {
    const org = await makeOrg();
    const zip = await JSZip.loadAsync(await buildZip(org.id));
    expect(Object.keys(zip.files)).toEqual([]);
  });
});

describe("rebuildGitRepo", () => {
  it("writes one commit per published version, in publish order", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-1", note: "initial" });
    await publishNext(org.id, admin.id, doc.id, "v2 body", "revised");
    await publishDoc(org.id, admin.id, { docCode: "SOP-2", note: "another doc" });

    const dir = tempDir();
    const result = await rebuildGitRepo(org.id, dir);

    expect(result.commits).toBe(3);
    expect(result.head).toMatch(/^[0-9a-f]{40}$/);

    const log = await git.log({ fs: nodefs, dir, ref: "HEAD" });
    // isomorphic-git logs newest first.
    expect(log.map((c) => c.commit.message.trim())).toEqual([
      "SOP-2 v1: another doc",
      "SOP-1 v2: revised",
      "SOP-1 v1: initial",
    ]);
  });

  it("stamps each commit with the publish time as the author timestamp", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-1" });
    const v2 = await publishNext(org.id, admin.id, doc.id, "v2 body");

    const dir = tempDir();
    await rebuildGitRepo(org.id, dir);
    const log = await git.log({ fs: nodefs, dir, ref: "HEAD" });

    const versions = await prisma.documentVersion.findMany({
      where: { orgId: org.id, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
    });
    expect(log.map((c) => c.commit.author.timestamp)).toEqual(
      versions.map((v) => Math.floor((v.publishedAt as Date).getTime() / 1000)),
    );
    // Not "now": the history is a replay of when things were actually published.
    const head = at(log, 0).commit;
    expect(head.author.timestamp).toBe(Math.floor((v2.publishedAt as Date).getTime() / 1000));
    expect(head.author.timezoneOffset).toBe(0);
    expect(head.committer.timestamp).toBe(head.author.timestamp);
  });

  it("uses a fixed export identity as the commit author", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await publishDoc(org.id, admin.id, { docCode: "SOP-1" });

    const dir = tempDir();
    await rebuildGitRepo(org.id, dir);
    const head = at(await git.log({ fs: nodefs, dir, ref: "HEAD" }), 0);

    expect(head.commit.author).toMatchObject({
      name: "Bunsho Export",
      email: "export@bunsho.local",
    });
  });

  it("is deterministic — two rebuilds of the same DB state yield identical commit oids", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Quality & Safety");
    const { doc } = await publishDoc(org.id, admin.id, {
      docCode: "SOP-1",
      folderId: folder.id,
      note: "initial",
    });
    await publishNext(org.id, admin.id, doc.id, "v2 body", "revised");
    await publishDoc(org.id, admin.id, { docCode: "SOP-2" });

    const a = await rebuildGitRepo(org.id, tempDir());
    const b = await rebuildGitRepo(org.id, tempDir());

    expect(a.commits).toBe(b.commits);
    expect(a.head).toBe(b.head);
  });

  it("rebuilds identically over an existing repo, wiping the previous history", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await publishDoc(org.id, admin.id, { docCode: "SOP-1" });

    const dir = tempDir();
    const first = await rebuildGitRepo(org.id, dir);
    // Same directory, second time: the repo is re-created from scratch.
    const second = await rebuildGitRepo(org.id, dir);

    expect(second.head).toBe(first.head);
    expect(second.commits).toBe(first.commits);
  });

  it("lays files out under sanitized folder paths on disk", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Quality & Safety");
    await publishDoc(org.id, admin.id, { docCode: "QS-1", folderId: folder.id });
    await publishDoc(org.id, admin.id, { docCode: "TOP-1" });

    const dir = tempDir();
    await rebuildGitRepo(org.id, dir);

    const tracked = await git.listFiles({ fs: nodefs, dir, ref: "HEAD" });
    expect(tracked.sort()).toEqual(["Quality-Safety/QS-1.md", "TOP-1.md"]);
    expect(nodefs.existsSync(path.join(dir, "Quality-Safety", "QS-1.md"))).toBe(true);
  });

  it("grows each document's change log commit by commit", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-1", note: "initial" });
    await publishNext(org.id, admin.id, doc.id, "v2 body", "revised");

    const dir = tempDir();
    await rebuildGitRepo(org.id, dir);
    const log = await git.log({ fs: nodefs, dir, ref: "HEAD" });

    // The v1 commit knows nothing of v2 — history is a faithful replay.
    const atV1 = await git.readBlob({
      fs: nodefs,
      dir,
      oid: at(log, 1).oid,
      filepath: "SOP-1.md",
    });
    const v1Text = Buffer.from(atV1.blob).toString("utf8");
    expect(v1Text).toContain("| v1 |");
    expect(v1Text).not.toContain("| v2 |");

    const atV2 = await git.readBlob({ fs: nodefs, dir, oid: at(log, 0).oid, filepath: "SOP-1.md" });
    const v2Text = Buffer.from(atV2.blob).toString("utf8");
    expect(v2Text).toContain("| v1 |");
    expect(v2Text).toContain("| v2 |");
  });

  it("replays a retired document's history — git keeps what the zip drops", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const { doc } = await publishDoc(org.id, admin.id, { docCode: "SOP-1" });
    await retireDocument(org.id, admin.id, doc.id);

    const dir = tempDir();
    const result = await rebuildGitRepo(org.id, dir);

    expect(result.commits).toBe(1);
    expect(await collectExport(org.id)).toEqual([]);
  });

  it("only replays the given org's versions", async () => {
    const a = await makeOrgWithAdmin();
    const b = await makeOrgWithAdmin();
    await publishDoc(a.org.id, a.admin.id, { docCode: "AAA-1" });
    await publishDoc(b.org.id, b.admin.id, { docCode: "BBB-1" });

    const dir = tempDir();
    const result = await rebuildGitRepo(a.org.id, dir);

    expect(result.commits).toBe(1);
    expect(await git.listFiles({ fs: nodefs, dir, ref: "HEAD" })).toEqual(["AAA-1.md"]);
  });

  it("initializes an empty repo with no commits for an org with nothing published", async () => {
    const org = await makeOrg();
    const dir = tempDir();

    const result = await rebuildGitRepo(org.id, dir);

    expect(result).toEqual({ commits: 0, head: null });
    expect(nodefs.existsSync(path.join(dir, ".git"))).toBe(true);
  });
});
