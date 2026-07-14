"use client";

import { fieldStyle, formStyle, primaryButton } from "@/app/auth-ui";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/documentTypes";
import { useActionState } from "react";
import { type NewDocState, createDocumentAction } from "../actions";

const initial: NewDocState = {};

export function NewDocumentForm({ folders }: { folders: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createDocumentAction, initial);
  return (
    <form action={action} style={formStyle}>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        Title
        <input name="title" type="text" required style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        Type
        <select name="type" defaultValue="policy" style={fieldStyle}>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        Doc code{" "}
        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
          (optional — auto-assigned)
        </span>
        <input name="docCode" type="text" placeholder="e.g. POL-007" style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        Folder
        <select name="folderId" defaultValue="" style={fieldStyle}>
          <option value="">— None —</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {state.error && (
        <p role="alert" style={{ color: "#dc2626", margin: 0, fontSize: "0.9rem" }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} style={primaryButton}>
        {pending ? "Creating…" : "Create & edit"}
      </button>
    </form>
  );
}
