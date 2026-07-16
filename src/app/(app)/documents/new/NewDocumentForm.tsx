"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { createDocumentAction, type NewDocState } from "../actions";

const initial: NewDocState = {};

export function NewDocumentForm({
  folders,
  parents,
  defaultParentId = "",
}: {
  folders: { id: string; name: string }[];
  parents: { id: string; path: string }[];
  defaultParentId?: string;
}) {
  const [state, action, pending] = useActionState(createDocumentAction, initial);
  const [parentId, setParentId] = useState(defaultParentId);
  // A nested page derives its location from its parent, so filing it in a folder
  // of its own would be a contradiction — the server drops it either way.
  const nested = parentId !== "";

  return (
    <form action={action} className="grid gap-4">
      <Label text="Title">
        <Input name="title" type="text" required />
      </Label>
      <Label text="Doc code (optional — auto-assigned)">
        <Input name="docCode" type="text" placeholder="e.g. DOC-007" className="font-mono" />
      </Label>
      <Label text="Parent page (optional)">
        <Select name="parentId" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— None —</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.path}
            </option>
          ))}
        </Select>
      </Label>
      <Label text="Folder">
        <Select name="folderId" defaultValue="" disabled={nested}>
          <option value="">— None —</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Label>
      {nested && (
        <p className="-mt-2 m-0 text-xs text-ink-muted">
          A nested page lives wherever its parent lives, so it takes no folder of its own.
        </p>
      )}
      {state.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating…" : "Create & edit"}
      </Button>
    </form>
  );
}
