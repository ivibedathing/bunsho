import type { ReactNode } from "react";

type CardProps = {
  variant?: "raised" | "paper";
  padded?: boolean;
  className?: string;
  children: ReactNode;
};

/** Surface primitive. `raised` is the carbon panel; `paper` is the document
 *  surface — a slightly lifted sheet on the dark desk. */
export function Card({ variant = "raised", padded = true, className, children }: CardProps) {
  const surface =
    variant === "paper"
      ? "rounded-card bg-paper text-paper-ink shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(240,228,194,0.12)]"
      : "rounded-card border border-line bg-carbon-raised";
  const cls = [surface, padded ? "p-5" : "", className].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}
