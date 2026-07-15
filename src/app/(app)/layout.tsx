import { signOut } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
import type { NavItem } from "@/components/shell/SidebarNav";
import { requireUser } from "@/lib/rbac";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const canManage = user.role !== "viewer";

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  const items: NavItem[] = canManage
    ? [
        { href: "/", label: "Home", icon: "home" },
        { href: "/explorer", label: "Explorer", icon: "explorer" },
        { href: "/documents", label: "Documents", icon: "documents" },
        { href: "/search", label: "Search", icon: "search" },
        { href: "/documents/import", label: "Import", icon: "import" },
      ]
    : [
        { href: "/", label: "Home", icon: "home" },
        { href: "/search", label: "Search", icon: "search" },
      ];

  return (
    <AppShell
      items={items}
      user={{ name: user.name, email: user.email, role: user.role }}
      signOutAction={doSignOut}
    >
      {children}
    </AppShell>
  );
}
