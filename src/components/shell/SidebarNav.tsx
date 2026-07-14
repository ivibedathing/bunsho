"use client";

import { FileUp, Files, House, type LucideIcon, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, LucideIcon> = {
  home: House,
  documents: Files,
  search: Search,
  import: FileUp,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

function activeHref(pathname: string, items: NavItem[]): string | undefined {
  let best: string | undefined;
  for (const item of items) {
    const match =
      pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
    if (match && (best === undefined || item.href.length > best.length)) best = item.href;
  }
  return best;
}

export function SidebarNav({
  items,
  horizontal = false,
}: { items: NavItem[]; horizontal?: boolean }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const active = activeHref(pathname, items);

  return (
    <nav className={horizontal ? "flex items-center gap-1" : "grid gap-1 px-3"}>
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? House;
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-control px-3 py-2 text-sm no-underline transition-colors duration-150 ${
              isActive ? "text-gold" : "text-ink-muted hover:bg-gold-wash/50 hover:text-ink"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={horizontal ? "nav-active-h" : "nav-active"}
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }
                }
                className="absolute inset-0 rounded-control bg-gold-wash"
                aria-hidden
              />
            )}
            <Icon size={17} strokeWidth={1.75} className="relative" aria-hidden />
            <span className={`relative ${horizontal ? "max-sm:sr-only" : ""}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
