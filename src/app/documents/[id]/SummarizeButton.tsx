"use client";

import { secondaryButton } from "@/app/auth-ui";
import { useState, useTransition } from "react";
import { summarizeAction } from "../actions";

export function SummarizeButton({ documentId }: { documentId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <button
        type="button"
        disabled={pending}
        style={secondaryButton}
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
        {pending ? "Summarizing…" : "AI summarize"}
      </button>
      {summary && (
        <blockquote
          style={{
            margin: 0,
            padding: "0.6rem 0.8rem",
            borderLeft: "3px solid var(--border)",
            color: "var(--muted)",
            fontSize: "0.9rem",
            background: "var(--accent-soft)",
            borderRadius: "0 0.4rem 0.4rem 0",
          }}
        >
          {summary}
        </blockquote>
      )}
      {error && <p style={{ color: "#dc2626", margin: 0, fontSize: "0.85rem" }}>{error}</p>}
    </div>
  );
}
