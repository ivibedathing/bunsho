import type { CSSProperties } from "react";

const STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: "#fef9c3", fg: "#854d0e", label: "Draft" },
  published: { bg: "#dcfce7", fg: "#166534", label: "Published" },
  retired: { bg: "#e5e7eb", fg: "#374151", label: "Retired" },
  superseded: { bg: "#e0e7ff", fg: "#3730a3", label: "Superseded" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { bg: "var(--border)", fg: "var(--fg)", label: status };
  const style: CSSProperties = {
    display: "inline-block",
    padding: "0.1rem 0.5rem",
    borderRadius: "999px",
    fontSize: "0.72rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    background: s.bg,
    color: s.fg,
  };
  return <span style={style}>{s.label}</span>;
}
