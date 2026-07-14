import type { Role } from "@/generated/prisma/client";
import type { DefaultSession } from "next-auth";

// Carry our identity claims on the session/token. Authoritative role + active
// status are resolved fresh from the DB in `requireUser` (src/lib/rbac.ts), so
// the token only needs to identify the user.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    orgId?: string;
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    orgId?: string;
  }
}
