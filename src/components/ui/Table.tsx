import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-carbon-raised">
      <table className={["w-full border-collapse text-sm", className].filter(Boolean).join(" ")}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={[
        "border-b border-line bg-carbon-sunken/50 px-3.5 py-2.5 text-left font-mono",
        "text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-ink-muted",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={["border-b border-line/60 px-3.5 py-2.5 align-middle", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </td>
  );
}
