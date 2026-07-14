import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-control border border-line bg-carbon-sunken/60 px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted/60 transition-colors duration-150 hover:border-ink-muted/40 " +
  "focus:border-gold/60";

/** Uppercase mono eyebrow label wrapping a control. */
export function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is always passed as children
    <label className="grid gap-1.5">
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-muted">
        {text}
      </span>
      {children}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[CONTROL, className].filter(Boolean).join(" ")} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={[CONTROL, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </select>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="m-0 text-sm text-danger">{children}</p>;
}
