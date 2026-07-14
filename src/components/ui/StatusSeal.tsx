type SealStyle = { label: string; chip: string; seal: string };

const SEALS: Record<string, SealStyle> = {
  draft: {
    label: "Draft",
    chip: "border-draft/50 bg-draft-wash text-draft",
    seal: "border-draft/60 text-draft",
  },
  published: {
    label: "Published",
    chip: "border-ok/50 bg-ok-wash text-ok",
    seal: "border-gold/70 text-gold",
  },
  retired: {
    label: "Retired",
    chip: "border-retired/50 bg-retired-wash text-retired",
    seal: "border-retired/60 text-retired",
  },
  superseded: {
    label: "Superseded",
    chip: "border-info/50 bg-info-wash text-info",
    seal: "border-info/60 text-info",
  },
};

const FALLBACK: SealStyle = {
  label: "",
  chip: "border-line bg-carbon-sunken text-ink-muted",
  seal: "border-line text-ink-muted",
};

/** Document status rendered in the hanko-stamp language. `chip` for tables and
 *  lists; `seal` is the stamped-document look for the detail header. */
export function StatusSeal({
  status,
  variant = "chip",
}: { status: string; variant?: "chip" | "seal" }) {
  const s = SEALS[status] ?? FALLBACK;
  const label = s.label || status;
  if (variant === "seal") {
    return (
      <span
        className={`inline-flex -rotate-2 items-center rounded-md border-2 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.16em] ${s.seal}`}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] ${s.chip}`}
    >
      {label}
    </span>
  );
}
