"use client";

import { Check, FolderClosed } from "lucide-react";
import { useState, useTransition } from "react";
import { moveDocumentAction } from "@/app/(app)/documents/actions";
import { Select } from "@/components/ui/Field";

/**
 * Re-file the document from the editor. Saves the moment a folder is chosen (no
 * button), mirroring the editor's own save-on-idle register — a page is filed,
 * not "submitted". Only rendered for top-level documents; a nested page derives
 * its folder from its parent and the DB CHECK forbids it carrying one.
 */
export function FolderPicker({
  documentId,
  folders,
  currentFolderId,
}: {
  documentId: string;
  folders: { id: string; name: string }[];
  currentFolderId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Select renders the wrapped <select>
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <FolderClosed size={14} strokeWidth={1.75} className="shrink-0 text-gold" aria-hidden />
      <span className="sr-only">Folder</span>
      <Select
        aria-label="Folder"
        defaultValue={currentFolderId ?? ""}
        disabled={pending}
        className="w-48 py-1"
        onChange={(e) => {
          const value = e.target.value === "" ? null : e.target.value;
          setSaved(false);
          startTransition(async () => {
            await moveDocumentAction(documentId, value);
            setSaved(true);
          });
        }}
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
      {pending ? (
        <span className="text-xs">Filing…</span>
      ) : (
        saved && (
          <span className="flex items-center gap-1 text-xs text-ok">
            <Check size={13} strokeWidth={2} aria-hidden />
            Filed
          </span>
        )
      )}
    </label>
  );
}
