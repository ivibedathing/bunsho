import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

/**
 * Auth.js (NextAuth v5) configuration — Credentials + optional generic OIDC,
 * with JWT sessions (PRD §6, §8).
 *
 * Why JWT and not database sessions: the Credentials provider is incompatible
 * with Auth.js database sessions, so no `Account`/`Session` adapter tables are
 * needed. The token only identifies the user; the authoritative role + active
 * status are resolved fresh from the DB in `requireUser` (src/lib/rbac.ts), so
 * an Admin deactivating a user or changing a role takes effect on the next
 * request despite the stateless token.
 */

const providers: Provider[] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email;
      const password = credentials?.password;
      if (typeof email !== "string" || typeof password !== "string") return null;

      // Single org in v1, so email identifies the account.
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user?.active || !user.passwordHash) return null;
      if (!(await verifyPassword(password, user.passwordHash))) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        orgId: user.orgId,
        role: user.role,
      };
    },
  }),
];

// Generic OIDC provider, enabled only when configured — be a client to the org's
// existing IdP, never host one (PRD §6). Users are provisioned on first sign-in.
const oidcEnabled =
  !!process.env.OIDC_ISSUER && !!process.env.OIDC_CLIENT_ID && !!process.env.OIDC_CLIENT_SECRET;

if (oidcEnabled) {
  providers.push({
    id: "oidc",
    name: process.env.OIDC_NAME ?? "SSO",
    type: "oidc",
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    authorization: { params: { scope: "openid email profile" } },
  });
}

/** Find-or-create an OIDC user in the single org. Returns null to deny sign-in. */
async function resolveOidcUser(email: string, name: string | null) {
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) return null; // no org yet — first-run admin must be created via /setup

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) return existing.active ? existing : null; // deny deactivated accounts

  // New SSO users land as viewers; an Admin promotes them (PRD §3 roles).
  return prisma.user.create({
    data: { orgId: org.id, email, name, role: "viewer", active: true },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted behind the org's own proxy — trust the deployment host (PRD §6).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "oidc") {
        if (!user.email) return false;
        return (await resolveOidcUser(user.email, user.name ?? null)) !== null;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "oidc" && user.email) {
          const dbUser = await resolveOidcUser(user.email, user.name ?? null);
          if (dbUser) {
            token.userId = dbUser.id;
            token.orgId = dbUser.orgId;
          }
        } else {
          token.userId = user.id ?? undefined;
          token.orgId = user.orgId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // JWT carries these as free-form claims; read them back with a cast.
      const userId = token.userId as string | undefined;
      const orgId = token.orgId as string | undefined;
      if (userId) session.user.id = userId;
      if (orgId) session.user.orgId = orgId;
      return session;
    },
  },
});
