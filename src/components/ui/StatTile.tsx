import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type StatTileProps = {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
};

export function StatTile({ label, icon: Icon, children }: StatTileProps) {
  return (
    <div className="grid gap-2 rounded-card border border-line bg-carbon-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-muted">
          {label}
        </span>
        {Icon && <Icon size={16} strokeWidth={1.75} className="text-gold/70" aria-hidden />}
      </div>
      <span className="font-display text-[2rem] font-bold leading-none tabular-nums">
        {children}
      </span>
    </div>
  );
}
