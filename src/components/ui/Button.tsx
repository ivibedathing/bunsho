import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-control " +
  "font-medium transition-[transform,background-color,border-color,color,opacity] duration-150 " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold font-semibold text-carbon-sunken hover:bg-gold-bright",
  secondary: "border border-line bg-carbon-raised text-ink hover:border-gold/40 hover:bg-gold-wash",
  ghost: "text-ink-muted hover:bg-gold-wash/60 hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger-wash",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-[0.8125rem]",
  md: "px-4 py-2 text-sm",
};

type ButtonProps = {
  variant?: Variant;
  size?: Size;
  href?: string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/** The button look, for the elements that can't be a `Button` — a `<summary>`, say. */
export function buttonClasses(
  opts: { variant?: Variant; size?: Size; className?: string } = {},
): string {
  const { variant = "secondary", size = "md", className } = opts;
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  href,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = buttonClasses({ variant, size, className });
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
