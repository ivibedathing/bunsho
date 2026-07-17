import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createFolder, listFolders, renameFolder } from "@/lib/folders";
import { makeOrgWithAdmin } from "@/test/db";

describe("listFolders", () => {
  it("returns only the caller's org", async () => {
    const { org } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await createFolder(org.id, "Ours");
    await createFolder(other.org.id, "Theirs");

    const folders = await listFolders(org.id);
    expect(folders.map((f) => f.name)).toEqual(["Ours"]);
  });

  it("orders by name ascending, not by creation time", async () => {
    const { org } = await makeOrgWithAdmin();
    await createFolder(org.id, "Policies");
    await createFolder(org.id, "Assets");
    await createFolder(org.id, "Handbook");

    const folders = await listFolders(org.id);
    expect(folders.map((f) => f.name)).toEqual(["Assets", "Handbook", "Policies"]);
  });

  it("is empty for an org with no folders", async () => {
    const { org } = await makeOrgWithAdmin();
    expect(await listFolders(org.id)).toEqual([]);
  });

  it("returns nested folders alongside roots — the list is flat", async () => {
    const { org } = await makeOrgWithAdmin();
    const root = await createFolder(org.id, "Handbook");
    await createFolder(org.id, "Onboarding", root.id);

    const folders = await listFolders(org.id);
    expect(folders.map((f) => f.name)).toEqual(["Handbook", "Onboarding"]);
  });
});

describe("createFolder", () => {
  it("creates a root folder when no parent is given", async () => {
    const { org } = await makeOrgWithAdmin();

    const folder = await createFolder(org.id, "Policies");

    expect(folder).toMatchObject({ orgId: org.id, name: "Policies", parentId: null });
  });

  it("treats an explicitly null parent as a root folder", async () => {
    const { org } = await makeOrgWithAdmin();

    const folder = await createFolder(org.id, "Policies", null);

    expect(folder.parentId).toBeNull();
  });

  it("nests under a parent when one is given", async () => {
    const { org } = await makeOrgWithAdmin();
    const parent = await createFolder(org.id, "Handbook");

    const child = await createFolder(org.id, "Onboarding", parent.id);

    expect(child.parentId).toBe(parent.id);
    const reloaded = await prisma.folder.findUniqueOrThrow({
      where: { id: parent.id },
      include: { children: true },
    });
    expect(reloaded.children.map((c) => c.id)).toEqual([child.id]);
  });

  it("nests more than one level deep", async () => {
    const { org } = await makeOrgWithAdmin();
    const root = await createFolder(org.id, "Handbook");
    const mid = await createFolder(org.id, "HR", root.id);

    const leaf = await createFolder(org.id, "Onboarding", mid.id);

    expect(leaf.parentId).toBe(mid.id);
    expect(await listFolders(org.id)).toHaveLength(3);
  });
});

describe("renameFolder", () => {
  const nameOf = async (id: string) =>
    (await prisma.folder.findUniqueOrThrow({ where: { id }, select: { name: true } })).name;

  it("renames a folder in the caller's org", async () => {
    const { org } = await makeOrgWithAdmin();
    const folder = await createFolder(org.id, "Polices");

    expect(await renameFolder(org.id, folder.id, "Policies")).toBe(true);
    expect(await nameOf(folder.id)).toBe("Policies");
  });

  it("refuses a folder owned by another org and leaves it untouched", async () => {
    const { org } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const theirs = await createFolder(other.org.id, "Theirs");

    expect(await renameFolder(org.id, theirs.id, "Mine now")).toBe(false);
    expect(await nameOf(theirs.id)).toBe("Theirs");
  });

  it("reports a miss for an id that no longer exists", async () => {
    const { org } = await makeOrgWithAdmin();

    expect(await renameFolder(org.id, "cl00000000000000000000000", "Gone")).toBe(false);
  });

  it("leaves nesting alone", async () => {
    const { org } = await makeOrgWithAdmin();
    const parent = await createFolder(org.id, "Quality");
    const child = await createFolder(org.id, "SOPs", parent.id);

    await renameFolder(org.id, child.id, "Procedures");

    const row = await prisma.folder.findUniqueOrThrow({ where: { id: child.id } });
    expect(row).toMatchObject({ parentId: parent.id, name: "Procedures" });
  });
});
