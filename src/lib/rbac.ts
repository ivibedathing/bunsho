import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  orgId: string;
}

/**
 * Resolve the signed-in user authoritatively from the database. The JWT only
 * carries the user id; role and `active` are read fresh here so role changes and
 * deactivations take effect immediately (PRD §5 permission matrix). Returns null
 * when unauthenticated or when the account is gone/deactivated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, active: true, orgId: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.orgId };
}

/** Require any authenticated, active user; redirect to sign-in otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

/** Require one of the given roles; redirect to /forbidden if the role is insufficient. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
}

/** Pure predicate for conditional UI (does not redirect). */
export function can(role: Role, ...allowed: Role[]): boolean {
  return allowed.includes(role);
}
