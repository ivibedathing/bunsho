import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-gold-wash text-gold">
        <Icon size={22} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="m-0 font-display text-lg font-semibold">{title}</p>
      {hint && <p className="m-0 max-w-[38ch] text-sm text-ink-muted">{hint}</p>}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
