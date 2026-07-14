"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const META: Record<SaveStatus, { label: string; dot: string; pulse?: boolean }> = {
  idle: { label: "Ready", dot: "bg-ink-muted/50" },
  dirty: { label: "Unsaved changes", dot: "bg-draft" },
  saving: { label: "Saving…", dot: "bg-gold", pulse: true },
  saved: { label: "Saved", dot: "bg-ok" },
  error: { label: "Couldn’t save — check your connection", dot: "bg-danger" },
};

export function AutosaveIndicator({ status }: { status: SaveStatus }) {
  const reduce = useReducedMotion();
  const meta = META[status];
  return (
    <span
      aria-live="polite"
      className="inline-flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-muted"
    >
      <span className="relative flex size-2">
        {meta.pulse && !reduce && (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full ${meta.dot} opacity-60`}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${meta.dot}`} />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          initial={reduce ? false : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -3 }}
          transition={{ duration: 0.18 }}
        >
          {meta.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
