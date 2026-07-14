"use client";

import { fieldStyle, formStyle, primaryButton, secondaryButton } from "@/app/auth-ui";
import { useActionState } from "react";
import { type SignInState, signInAction, signInOidcAction } from "./actions";

const initial: SignInState = {};

export function SignInForm({ oidcEnabled, oidcName }: { oidcEnabled: boolean; oidcName: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <div style={formStyle}>
      {oidcEnabled && (
        <>
          <form action={signInOidcAction}>
            <button type="submit" style={{ ...secondaryButton, width: "100%" }}>
              Continue with {oidcName}
            </button>
          </form>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.8rem" }}>or</div>
        </>
      )}
      <form action={action} style={formStyle}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Email
          <input name="email" type="email" required autoComplete="username" style={fieldStyle} />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={fieldStyle}
          />
        </label>
        {state.error && (
          <p role="alert" style={{ color: "#dc2626", margin: 0, fontSize: "0.9rem" }}>
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} style={primaryButton}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
