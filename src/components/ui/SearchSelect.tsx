"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export interface SearchOption {
  id: string;
  label: string;
}

const DEBOUNCE_MS = 200;

/**
 * A single-select combobox whose options come from a search endpoint, for lists
 * too long to read as a `<select>`. The picked id travels in a hidden input, so
 * it submits inside a plain form action like any other field.
 *
 * `endpoint` is called as `${endpoint}?q=<query>` and must answer with
 * `{ id, label }[]` — already limited and org-scoped, since this component
 * renders whatever it is handed.
 */
export function SearchSelect({
  name,
  endpoint,
  initialOptions,
  defaultValue = "",
  disabled = false,
  noneLabel,
  placeholder = "Search…",
}: {
  name: string;
  endpoint: string;
  initialOptions: SearchOption[];
  defaultValue?: string;
  disabled?: boolean;
  noneLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(initialOptions);
  const [selected, setSelected] = useState<SearchOption | null>(
    () => initialOptions.find((o) => o.id === defaultValue) ?? null,
  );
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // The "none" choice is a row like any other, so one code path handles both
  // clearing and picking.
  const rows: SearchOption[] = noneLabel ? [{ id: "", label: noneLabel }, ...options] : options;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const choose = (row: SearchOption) => {
    setSelected(row.id === "" ? null : row);
    close();
    inputRef.current?.blur();
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${endpoint}?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`Search failed: ${res.status}`);
          return res.json();
        })
        .then((data: SearchOption[]) => {
          setOptions(data);
          // A fresh result set invalidates the highlight — row 2 of the old
          // list is not row 2 of the new one.
          setActive(0);
          setFailed(false);
        })
        .catch(() => {
          // An abort is this effect being superseded, not a failure.
          if (!controller.signal.aborted) setFailed(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, endpoint]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  useEffect(() => {
    // By id rather than by child index: a status line ("No matches", a failure)
    // is also a child, and would shift the offsets.
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.min(rows.length - 1, Math.max(0, i + delta)));
    } else if (e.key === "Enter" && open) {
      // Without this the Enter that picks an option would also submit the form.
      e.preventDefault();
      const row = rows[active];
      if (row) choose(row);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} disabled={disabled} />
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={
            "w-full rounded-control border border-line bg-carbon-sunken/60 px-3 py-2 pr-9 text-sm " +
            "text-ink placeholder:text-ink-muted/60 transition-colors duration-150 " +
            "hover:border-ink-muted/40 focus:border-gold/60 disabled:opacity-50"
          }
        />
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        />
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          className={
            "absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-control border " +
            "border-line bg-carbon-raised p-1 shadow-lg"
          }
        >
          {failed && <p className="m-0 px-3 py-2 text-sm text-danger">Search is unavailable.</p>}
          {!failed && rows.length === 0 && (
            <p className="m-0 px-3 py-2 text-sm text-ink-muted">No matches.</p>
          )}
          {rows.map((row, i) => (
            // Focus stays on the input and the highlight travels via
            // aria-activedescendant, so these are pointer targets only — the
            // keyboard reaches them through the input's handler.
            // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the input
            <div
              key={row.id || "__none__"}
              id={`${listId}-${i}`}
              role="option"
              tabIndex={-1}
              aria-selected={row.id === (selected?.id ?? "")}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(row)}
              className={[
                "flex cursor-pointer items-center justify-between gap-2 rounded-control",
                "px-3 py-1.5 text-sm transition-colors duration-100",
                i === active ? "bg-gold-wash text-ink" : "text-ink-muted",
                row.id === "" ? "italic" : "",
              ].join(" ")}
            >
              <span className="truncate">{row.label}</span>
              {row.id === (selected?.id ?? "") && (
                <Check aria-hidden className="size-3.5 shrink-0 text-gold" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
