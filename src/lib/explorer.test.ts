import { describe, expect, it } from "vitest";
import { assembleExplorerTree, countPages, type DocRow, type FolderRow } from "./explorer";

const AT = new Date("2026-07-15T00:00:00Z");

function doc(id: string, over: Partial<DocRow> = {}): DocRow {
  return {
    id,
    docCode: `DOC-${id}`,
    title: id,
    folderId: null,
    parentId: null,
    retiredAt: null,
    currentPublishedVersionId: null,
    updatedAt: AT,
    ...over,
  };
}

const folder = (id: string, name: string, parentId: string | null = null): FolderRow => ({
  id,
  name,
  parentId,
});

describe("assembleExplorerTree", () => {
  it("files a root page under its folder", () => {
    const tree = assembleExplorerTree([folder("f1", "Policies")], [doc("a", { folderId: "f1" })]);

    expect(tree.folders).toHaveLength(1);
    expect(tree.folders[0]!.pages.map((p) => p.id)).toEqual(["a"]);
    expect(tree.unfiled).toEqual([]);
  });

  it("surfaces folderless root pages as unfiled", () => {
    const tree = assembleExplorerTree([], [doc("a")]);

    expect(tree.unfiled.map((p) => p.id)).toEqual(["a"]);
  });

  it("nests a page under its parent page rather than at the root", () => {
    const tree = assembleExplorerTree(
      [folder("f1", "Policies")],
      [doc("parent", { folderId: "f1" }), doc("child", { parentId: "parent" })],
    );

    expect(tree.folders[0]!.pages.map((p) => p.id)).toEqual(["parent"]);
    expect(tree.folders[0]!.pages[0]!.children.map((p) => p.id)).toEqual(["child"]);
    expect(tree.unfiled).toEqual([]);
  });

  it("nests pages to arbitrary depth", () => {
    const tree = assembleExplorerTree(
      [],
      [doc("a"), doc("b", { parentId: "a" }), doc("c", { parentId: "b" })],
    );

    const a = tree.unfiled[0]!;
    expect(a.children[0]!.id).toBe("b");
    expect(a.children[0]!.children[0]!.id).toBe("c");
    expect(countPages(a)).toBe(3);
  });

  it("nests folders inside folders", () => {
    const tree = assembleExplorerTree(
      [folder("root", "Quality"), folder("kid", "SOPs", "root")],
      [doc("a", { folderId: "kid" })],
    );

    expect(tree.folders.map((f) => f.id)).toEqual(["root"]);
    expect(tree.folders[0]!.folders[0]!.pages.map((p) => p.id)).toEqual(["a"]);
  });

  it("derives status from retirement and published pointer", () => {
    const tree = assembleExplorerTree(
      [],
      [
        doc("d"),
        doc("p", { currentPublishedVersionId: "v1" }),
        doc("r", { retiredAt: AT, currentPublishedVersionId: "v1" }),
      ],
    );

    const status = Object.fromEntries(tree.unfiled.map((p) => [p.id, p.status]));
    expect(status).toEqual({ d: "draft", p: "published", r: "retired" });
  });

  it("sorts folders by name and pages by title at every level", () => {
    const tree = assembleExplorerTree(
      [folder("f2", "Beta"), folder("f1", "Alpha")],
      [
        doc("z", { title: "Zulu", folderId: "f1" }),
        doc("m", { title: "Mike", folderId: "f1" }),
        doc("kb", { title: "Bravo", parentId: "m" }),
        doc("ka", { title: "Alpha", parentId: "m" }),
      ],
    );

    expect(tree.folders.map((f) => f.name)).toEqual(["Alpha", "Beta"]);
    expect(tree.folders[0]!.pages.map((p) => p.title)).toEqual(["Mike", "Zulu"]);
    expect(tree.folders[0]!.pages[0]!.children.map((p) => p.title)).toEqual(["Alpha", "Bravo"]);
  });

  it("treats a page whose parent is missing as a root page", () => {
    const tree = assembleExplorerTree([], [doc("orphan", { parentId: "gone" })]);

    expect(tree.unfiled.map((p) => p.id)).toEqual(["orphan"]);
  });
});
