"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Field";
import { createDocumentAction, type NewDocState } from "../actions";

const initial: NewDocState = {};

export function NewDocumentForm({ folders }: { folders: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createDocumentAction, initial);
  return (
    <form action={action} className="grid gap-4">
      <Label text="Title">
        <Input name="title" type="text" required />
      </Label>
      <Label text="Doc code (optional — auto-assigned)">
        <Input name="docCode" type="text" placeholder="e.g. DOC-007" className="font-mono" />
      </Label>
      <Label text="Folder">
        <Select name="folderId" defaultValue="">
          <option value="">— None —</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Label>
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
