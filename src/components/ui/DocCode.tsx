export function DocCode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={["font-mono text-[0.8125rem] text-ink-muted tabular-nums", className]
        .filter(Boolean)
        .join(" ")}
    >
      {code}
    </span>
  );
}
