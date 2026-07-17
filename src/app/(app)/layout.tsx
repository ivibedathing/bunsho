import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
import type { NavItem } from "@/components/shell/SidebarNav";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const canManage = user.role !== "viewer";

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  // Explorer absorbed Search — it is also the Viewer's only route to a document.
  const items: NavItem[] = canManage
    ? [
        { href: "/", label: "Home", icon: "home" },
        { href: "/explorer", label: "Explorer", icon: "explorer" },
        { href: "/documents", label: "Documents", icon: "documents" },
        { href: "/documents/import", label: "Import", icon: "import" },
      ]
    : [
        { href: "/", label: "Home", icon: "home" },
        { href: "/explorer", label: "Explorer", icon: "explorer" },
      ];

  return (
    <AppShell
      items={items}
      user={{ name: user.name, email: user.email, role: user.role }}
      canCreate={canManage}
      signOutAction={doSignOut}
    >
      {children}
    </AppShell>
  );
}
