import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createFolder, listFolders, searchFolderOptions } from "@/lib/folders";
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

describe("searchFolderOptions", () => {
  const paths = (options: { path: string }[]) => options.map((o) => o.path);

  it("flattens nesting into a ' / ' path", async () => {
    const { org } = await makeOrgWithAdmin();
    const hr = await createFolder(org.id, "HR");
    const policies = await createFolder(org.id, "Policies", hr.id);
    await createFolder(org.id, "Onboarding", policies.id);

    expect(paths(await searchFolderOptions(org.id))).toEqual([
      "HR",
      "HR / Policies",
      "HR / Policies / Onboarding",
    ]);
  });

  it("matches any segment of the path, case-insensitively", async () => {
    const { org } = await makeOrgWithAdmin();
    const hr = await createFolder(org.id, "HR");
    await createFolder(org.id, "Policies", hr.id);
    await createFolder(org.id, "Engineering");

    // A parent-only match still returns the child — the child's path contains it.
    expect(paths(await searchFolderOptions(org.id, "hr"))).toEqual(["HR", "HR / Policies"]);
    expect(paths(await searchFolderOptions(org.id, "POLIC"))).toEqual(["HR / Policies"]);
    expect(await searchFolderOptions(org.id, "nothing here")).toEqual([]);
  });

  it("ignores surrounding whitespace in the query", async () => {
    const { org } = await makeOrgWithAdmin();
    await createFolder(org.id, "Policies");

    expect(paths(await searchFolderOptions(org.id, "  policies  "))).toEqual(["Policies"]);
  });

  it("returns everything when the query is empty", async () => {
    const { org } = await makeOrgWithAdmin();
    await createFolder(org.id, "Policies");
    await createFolder(org.id, "Assets");

    expect(paths(await searchFolderOptions(org.id, "   "))).toEqual(["Assets", "Policies"]);
  });

  it("never returns another org's folders", async () => {
    const { org } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    await createFolder(org.id, "Ours");
    await createFolder(other.org.id, "Theirs");

    expect(await searchFolderOptions(org.id, "Theirs")).toEqual([]);
    expect(paths(await searchFolderOptions(org.id))).toEqual(["Ours"]);
  });

  it("caps the result set at the limit", async () => {
    const { org } = await makeOrgWithAdmin();
    for (let i = 0; i < 25; i++) {
      await createFolder(org.id, `Folder ${String(i).padStart(2, "0")}`);
    }

    expect(await searchFolderOptions(org.id)).toHaveLength(20);
    expect(paths(await searchFolderOptions(org.id, "", 3))).toEqual([
      "Folder 00",
      "Folder 01",
      "Folder 02",
    ]);
  });

  it("treats a folder parented outside the org as a root", async () => {
    // Unreachable through the UI, but the path walk must not leak the foreign
    // name or emit a dangling " / " prefix if the data ever says otherwise.
    const { org } = await makeOrgWithAdmin();
    const other = await makeOrgWithAdmin();
    const foreign = await createFolder(other.org.id, "Theirs");
    await createFolder(org.id, "Ours", foreign.id);

    expect(paths(await searchFolderOptions(org.id))).toEqual(["Ours"]);
  });
});
