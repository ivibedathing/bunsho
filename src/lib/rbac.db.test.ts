import { prisma } from "@/lib/db";
import { can, getCurrentUser, requireRole, requireUser } from "@/lib/rbac";
import { makeOrg, makeOrgWithAdmin, makeUser } from "@/test/db";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `@/auth` is the real next-auth config (providers, adapter, env); importing it
 * under vitest is neither possible nor the point — the session is the input to
 * these functions, so it is mocked and driven directly.
 */
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

/**
 * `redirect()` throws a framework-internal NEXT_REDIRECT signal. Replacing it
 * with a tagged throw of our own keeps the control flow honest (the callers
 * genuinely stop at the redirect) while making the target assertable.
 */
const redirectMock = vi.hoisted(() =>
  vi.fn((target: string): never => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

/** Pretend the given user id is signed in. `null` means no session at all. */
function signIn(id: string | null | undefined): void {
  authMock.mockResolvedValue(
    id === null ? null : ({ user: id === undefined ? {} : { id } } as Session),
  );
}

/** Run `fn` and report the redirect target it was stopped by, if any. */
async function redirectTarget(fn: () => Promise<unknown>): Promise<string | null> {
  redirectMock.mockClear();
  try {
    await fn();
    return null;
  } catch {
    const call = redirectMock.mock.calls.at(-1);
    return call ? (call[0] as string) : null;
  }
}

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockClear();
});

describe("can", () => {
  it("is true when the role is in the allowed list", () => {
    expect(can("admin", "admin")).toBe(true);
    expect(can("editor", "admin", "editor")).toBe(true);
  });

  it("is false when the role is absent from the allowed list", () => {
    expect(can("viewer", "admin", "editor")).toBe(false);
    expect(can("editor", "admin")).toBe(false);
  });

  it("is false for an empty allowed list — permitting nothing, not everything", () => {
    expect(can("admin")).toBe(false);
    expect(can("viewer")).toBe(false);
  });
});

describe("getCurrentUser", () => {
  it("returns the user's identity, role and org for a valid session", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    signIn(admin.id);

    expect(await getCurrentUser()).toEqual({
      id: admin.id,
      email: admin.email,
      name: "Ada Admin",
      role: "admin",
      orgId: org.id,
    });
  });

  it("returns null when there is no session", async () => {
    signIn(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when the session carries no user id", async () => {
    signIn(undefined);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when the session's user no longer exists in the database", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    signIn(admin.id);
    await prisma.user.delete({ where: { id: admin.id } });

    expect(await getCurrentUser()).toBeNull();
    // Sanity: the org is still there, so this is the user lookup failing, not the fixture.
    expect(await prisma.organization.findUnique({ where: { id: org.id } })).not.toBeNull();
  });

  it("returns null for a deactivated user even though the session is still valid", async () => {
    // Deactivation must take effect immediately — an issued JWT cannot outlive it.
    const org = await makeOrg();
    const user = await makeUser(org.id, { role: "editor", active: true });
    signIn(user.id);
    expect(await getCurrentUser()).not.toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    expect(await getCurrentUser()).toBeNull();
  });

  it("reads the role fresh from the database, ignoring the role the session was issued with", async () => {
    // The JWT carries only the id, so a role change lands on the next request.
    const org = await makeOrg();
    const user = await makeUser(org.id, { role: "viewer" });
    signIn(user.id);
    expect((await getCurrentUser())?.role).toBe("viewer");

    await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
    expect((await getCurrentUser())?.role).toBe("admin");

    // ...and a demotion is picked up just as fast.
    await prisma.user.update({ where: { id: user.id }, data: { role: "viewer" } });
    expect((await getCurrentUser())?.role).toBe("viewer");
  });

  it("does not trust a role smuggled into the session payload", async () => {
    const org = await makeOrg();
    const user = await makeUser(org.id, { role: "viewer" });
    authMock.mockResolvedValue({ user: { id: user.id, role: "admin" } } as unknown as Session);

    expect((await getCurrentUser())?.role).toBe("viewer");
  });

  it("returns the org the user actually belongs to", async () => {
    const a = await makeOrgWithAdmin();
    const b = await makeOrgWithAdmin();
    signIn(b.admin.id);

    const current = await getCurrentUser();
    expect(current?.orgId).toBe(b.org.id);
    expect(current?.orgId).not.toBe(a.org.id);
  });
});

describe("requireUser", () => {
  it("returns the user when authenticated and active", async () => {
    const { org, admin } = await makeOrgWithAdmin();
    signIn(admin.id);

    const user = await requireUser();
    expect(user).toMatchObject({ id: admin.id, role: "admin", orgId: org.id });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /signin when unauthenticated", async () => {
    signIn(null);
    expect(await redirectTarget(() => requireUser())).toBe("/signin");
  });

  it("redirects to /signin for a deactivated user", async () => {
    const org = await makeOrg();
    const user = await makeUser(org.id, { active: false });
    signIn(user.id);

    expect(await redirectTarget(() => requireUser())).toBe("/signin");
  });
});

describe("requireRole", () => {
  it("returns the user when the role is allowed", async () => {
    const { admin } = await makeOrgWithAdmin();
    signIn(admin.id);

    expect(await requireRole("admin")).toMatchObject({ id: admin.id, role: "admin" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("accepts any one of several allowed roles", async () => {
    const org = await makeOrg();
    const editor = await makeUser(org.id, { role: "editor" });
    signIn(editor.id);

    expect(await requireRole("admin", "editor")).toMatchObject({ role: "editor" });
  });

  it("redirects to /forbidden when the role is insufficient", async () => {
    const org = await makeOrg();
    const viewer = await makeUser(org.id, { role: "viewer" });
    signIn(viewer.id);

    expect(await redirectTarget(() => requireRole("admin"))).toBe("/forbidden");
  });

  it("redirects to /signin — not /forbidden — when unauthenticated", async () => {
    signIn(null);
    expect(await redirectTarget(() => requireRole("admin"))).toBe("/signin");
  });

  it("redirects a user demoted after the session was issued", async () => {
    // The allowed check runs against the DB role, so a demotion locks the page.
    const org = await makeOrg();
    const user = await makeUser(org.id, { role: "admin" });
    signIn(user.id);
    await expect(requireRole("admin")).resolves.toMatchObject({ role: "admin" });

    await prisma.user.update({ where: { id: user.id }, data: { role: "viewer" } });

    expect(await redirectTarget(() => requireRole("admin"))).toBe("/forbidden");
  });

  it("sends a deactivated admin to /signin rather than granting the role", async () => {
    const org = await makeOrg();
    const user = await makeUser(org.id, { role: "admin" });
    signIn(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    expect(await redirectTarget(() => requireRole("admin"))).toBe("/signin");
  });
});
