export function VersionStamp({ version }: { version: number | string }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-carbon-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-muted tabular-nums">
      v{version}
    </span>
  );
}
