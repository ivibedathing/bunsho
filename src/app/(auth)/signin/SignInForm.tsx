"use client";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useActionState } from "react";
import { type SignInState, signInAction, signInOidcAction } from "./actions";

const initial: SignInState = {};

export function SignInForm({ oidcEnabled, oidcName }: { oidcEnabled: boolean; oidcName: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <div className="grid gap-4">
      {oidcEnabled && (
        <>
          <form action={signInOidcAction}>
            <Button type="submit" variant="secondary" className="w-full">
              Continue with {oidcName}
            </Button>
          </form>
          <div className="flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form action={action} className="grid gap-4">
        <Label text="Email">
          <Input name="email" type="email" required autoComplete="username" />
        </Label>
        <Label text="Password">
          <Input name="password" type="password" required autoComplete="current-password" />
        </Label>
        {state.error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
