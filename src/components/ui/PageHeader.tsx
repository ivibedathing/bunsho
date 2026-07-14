import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, meta, actions }: PageHeaderProps) {
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          {eyebrow && <div className="flex flex-wrap items-center gap-2.5">{eyebrow}</div>}
          <h1 className="m-0 font-display text-[1.75rem] font-bold leading-tight tracking-tight">
            {title}
          </h1>
          {meta && <div className="text-sm text-ink-muted">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="h-px bg-gradient-to-r from-gold/50 via-gold/15 to-transparent" />
    </header>
  );
}
