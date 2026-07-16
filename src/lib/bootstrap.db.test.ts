import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyOrgChain } from "@/lib/audit/writer";
import { createFirstAdmin, usersExist } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { makeOrg, makeUser } from "@/test/db";

// bootstrap.ts reads ORG_NAME inside createFirstAdmin, at call time, so each
// test can stub it. stubEnv (not assignment) because Node coerces env values to
// strings — `process.env.X = undefined` would yield the string "undefined".
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("usersExist", () => {
  it("is false on an empty database — the only time setup is offered", async () => {
    expect(await usersExist()).toBe(false);
  });

  it("is true once any user exists", async () => {
    const org = await makeOrg();
    await makeUser(org.id);

    expect(await usersExist()).toBe(true);
  });

  it("counts users globally, not per org — a user in any org closes setup", async () => {
    const first = await makeOrg("First Org");
    await makeUser(first.id);
    await makeOrg("Second Org");

    // usersExist takes no orgId: the second, user-less org cannot reopen setup.
    expect(await usersExist()).toBe(true);
  });
});

describe("createFirstAdmin", () => {
  it("creates the org from ORG_NAME and an active admin whose hash verifies", async () => {
    vi.stubEnv("ORG_NAME", "Contoso Compliance");

    await createFirstAdmin({
      email: "ada@example.test",
      name: "Ada Admin",
      password: "correct horse battery staple",
    });

    const org = await prisma.organization.findFirstOrThrow();
    expect(org.name).toBe("Contoso Compliance");

    const admin = await prisma.user.findFirstOrThrow();
    expect(admin).toMatchObject({
      orgId: org.id,
      email: "ada@example.test",
      name: "Ada Admin",
      role: "admin",
      active: true,
    });

    // The stored hash must verify against the input password, and only it.
    expect(admin.passwordHash).not.toBeNull();
    expect(await verifyPassword("correct horse battery staple", admin.passwordHash ?? "")).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", admin.passwordHash ?? "")).toBe(false);
  }, 20_000);

  it("defaults the org name to Bunsho when ORG_NAME is unset", async () => {
    vi.stubEnv("ORG_NAME", undefined);

    await createFirstAdmin({ email: "a@example.test", name: "A", password: "pw-secret-1" });

    const org = await prisma.organization.findFirstOrThrow();
    expect(org.name).toBe("Bunsho");
  }, 20_000);

  it("writes the genesis audit entry — the first link, with a null prevHash", async () => {
    await createFirstAdmin({
      email: "ada@example.test",
      name: "Ada Admin",
      password: "pw-secret-2",
    });

    const admin = await prisma.user.findFirstOrThrow();
    const entries = await prisma.auditLogEntry.findMany({ orderBy: { seq: "asc" } });

    expect(entries).toHaveLength(1);
    const genesis = entries[0];
    expect(genesis).toMatchObject({
      action: "user_created",
      actorType: "system",
      actorId: null,
      targetType: "user",
      targetId: admin.id,
      orgId: admin.orgId,
    });
    expect(genesis?.metadata).toEqual({
      role: "admin",
      bootstrap: true,
      email: "ada@example.test",
    });

    // Genesis specifically: nothing precedes it, so the chain starts here.
    expect(genesis?.prevHash).toBeNull();
    expect(genesis?.hash).toEqual(expect.any(String));
    await expect(verifyOrgChain(prisma, admin.orgId)).resolves.toMatchObject({ ok: true });
  }, 20_000);

  it("reuses an existing organization rather than creating a second one", async () => {
    const existing = await makeOrg("Already Here");
    vi.stubEnv("ORG_NAME", "Ignored Because An Org Exists");

    await createFirstAdmin({
      email: "ada@example.test",
      name: "Ada Admin",
      password: "pw-secret-3",
    });

    expect(await prisma.organization.count()).toBe(1);
    const admin = await prisma.user.findFirstOrThrow();
    expect(admin.orgId).toBe(existing.id);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: existing.id } });
    expect(org.name).toBe("Already Here");
  }, 20_000);

  it("throws when a user already exists and writes nothing — the transaction rolls back", async () => {
    const org = await makeOrg();
    const incumbent = await makeUser(org.id, { email: "incumbent@example.test" });

    await expect(
      createFirstAdmin({ email: "usurper@example.test", name: "Usurper", password: "pw-secret-4" }),
    ).rejects.toThrow("Setup already completed");

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe(incumbent.id);
    expect(await prisma.auditLogEntry.count()).toBe(0);
  }, 20_000);
});
