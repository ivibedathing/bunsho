"use client";

import { Button } from "@/components/ui/Button";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { summarizeAction } from "../actions";

export function SummarizeButton({ documentId }: { documentId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              setSummary(await summarizeAction(documentId));
            } catch {
              setError("Couldn’t generate a summary.");
            }
          })
        }
      >
        {pending ? (
          <LoaderCircle size={15} strokeWidth={1.75} className="animate-spin" aria-hidden />
        ) : (
          <Sparkles size={15} strokeWidth={1.75} aria-hidden />
        )}
        {pending ? "Summarizing…" : "AI summarize"}
      </Button>
      {summary && (
        <blockquote className="m-0 rounded-r-card border-l-2 border-info bg-info-wash px-3.5 py-2.5 text-sm text-ink-muted">
          {summary}
        </blockquote>
      )}
      {error && <p className="m-0 text-sm text-danger">{error}</p>}
    </div>
  );
}
