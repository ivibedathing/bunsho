"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { createFirstAdminAction, type SetupState } from "./actions";

const initial: SetupState = {};

export function SetupForm() {
  const [state, action, pending] = useActionState(createFirstAdminAction, initial);
  return (
    <form action={action} className="grid gap-4">
      <Label text="Name">
        <Input name="name" type="text" required autoComplete="name" />
      </Label>
      <Label text="Email">
        <Input name="email" type="email" required autoComplete="username" />
      </Label>
      <Label text="Password">
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Label>
      {state.error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating…" : "Create admin account"}
      </Button>
    </form>
  );
}
