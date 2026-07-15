import { Button } from "@/components/ui/Button";
import { FilePlus2 } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { type NavItem, SidebarNav } from "./SidebarNav";
import { UserCard } from "./UserCard";

type AppShellProps = {
  items: NavItem[];
  user: { name: string | null; email: string; role: string };
  canCreate?: boolean;
  signOutAction: () => Promise<void>;
  children: ReactNode;
};

export function AppShell({
  items,
  user,
  canCreate = false,
  signOutAction,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-carbon-raised/70 backdrop-blur md:flex">
        <div className="px-4 py-5">
          <Logo />
        </div>
        {canCreate && (
          <div className="px-3 pb-3">
            <Button href="/documents/new" variant="primary" className="w-full">
              <FilePlus2 size={16} strokeWidth={1.75} aria-hidden />
              New document
            </Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto py-1">
          <SidebarNav items={items} />
        </div>
        <UserCard {...user} signOutAction={signOutAction} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-carbon-raised/80 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <SidebarNav items={items} horizontal />
      </header>

      <div className="md:pl-60">
        <main className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
