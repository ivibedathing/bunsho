import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getExplorerTree } from "@/lib/explorer";
import { publishDocument, retireDocument } from "@/lib/lifecycle";
import { makeDocumentWithDraft, makeFolder, makeOrgWithAdmin } from "@/test/db";

/**
 * The `publishedOnly` filter is what a Viewer sees, so it is worth a real query —
 * `assembleExplorerTree` is pure and can't tell you which rows Postgres handed back.
 */

async function makePublished(orgId: string, authorId: string, title: string, folderId?: string) {
  const { doc } = await makeDocumentWithDraft(orgId, authorId, { title, folderId });
  await publishDocument(orgId, authorId, doc.id);
  return doc;
}

const titles = (pages: { title: string }[]) => pages.map((p) => p.title).sort();

/** `makeDocumentWithDraft` takes no parentId, and a nested page may carry no folder. */
async function setParent(documentId: string, parentId: string): Promise<void> {
  await prisma.document.update({ where: { id: documentId }, data: { parentId, folderId: null } });
}

describe("getExplorerTree — publishedOnly", () => {
  it("keeps published pages and drops drafts and retired ones", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    await makeDocumentWithDraft(org.id, admin.id, { title: "Draft" });
    await makePublished(org.id, admin.id, "Published");
    const retired = await makePublished(org.id, admin.id, "Retired");
    await retireDocument(org.id, admin.id, retired.id);

    const viewer = await getExplorerTree(org.id, { publishedOnly: true });
    expect(titles(viewer.unfiled)).toEqual(["Published"]);

    const editor = await getExplorerTree(org.id);
    expect(titles(editor.unfiled)).toEqual(["Draft", "Published", "Retired"]);
  });

  it("still files a published page under its folder", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const folder = await makeFolder(org.id, "Policies");
    await makePublished(org.id, admin.id, "Published", folder.id);

    const tree = await getExplorerTree(org.id, { publishedOnly: true });
    expect(titles(tree.folders[0]!.pages)).toEqual(["Published"]);
    expect(tree.unfiled).toEqual([]);
  });

  it("surfaces a published subpage at the root when its parent is filtered away", async () => {
    // The parent draft isn't in the row set, so the child has no parent to nest
    // under — it takes the same path as an orphan rather than disappearing.
    const { org, admin } = await makeOrgWithAdmin();
    const { doc: parent } = await makeDocumentWithDraft(org.id, admin.id, { title: "Draft" });
    const { doc: child } = await makeDocumentWithDraft(org.id, admin.id, { title: "Child" });
    await setParent(child.id, parent.id);
    await publishDocument(org.id, admin.id, child.id);

    const tree = await getExplorerTree(org.id, { publishedOnly: true });
    expect(titles(tree.unfiled)).toEqual(["Child"]);
  });

  it("never reaches into another org", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await makePublished(org.id, admin.id, "Mine");
    await makePublished(other.org.id, other.admin.id, "Theirs");

    const tree = await getExplorerTree(org.id, { publishedOnly: true });
    expect(titles(tree.unfiled)).toEqual(["Mine"]);
  });
});
