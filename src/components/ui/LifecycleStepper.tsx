const STEPS = ["draft", "published", "retired"] as const;
const LABELS: Record<(typeof STEPS)[number], string> = {
  draft: "Draft",
  published: "Published",
  retired: "Retired",
};

function stepIndex(status: string): number {
  if (status === "retired") return 2;
  if (status === "published" || status === "superseded") return 1;
  return 0;
}

/** Where the document sits in its lifecycle: Draft → Published → Retired. */
export function LifecycleStepper({ status }: { status: string }) {
  const current = stepIndex(status);
  return (
    <ol className="m-0 flex list-none items-center gap-0 p-0" aria-label="Document lifecycle">
      {STEPS.map((step, i) => {
        const isCurrent = i === current;
        const isPast = i < current;
        return (
          <li key={step} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`mx-2 h-px w-8 ${isPast || isCurrent ? "bg-gold/50" : "bg-line"}`}
              />
            )}
            <span
              className={`flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] ${
                isCurrent ? "text-gold" : isPast ? "text-ink-muted" : "text-ink-muted/50"
              }`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                aria-hidden
                className={`size-2 rounded-full ${
                  isCurrent
                    ? "bg-gold shadow-[0_0_8px_rgba(217,190,130,0.5)]"
                    : isPast
                      ? "border border-gold/50"
                      : "border border-line"
                }`}
              />
              {LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
