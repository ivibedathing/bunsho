"use client";

import { fieldStyle, formStyle, primaryButton } from "@/app/auth-ui";
import { useActionState } from "react";
import { type SetupState, createFirstAdminAction } from "./actions";

const initial: SetupState = {};

export function SetupForm() {
  const [state, action, pending] = useActionState(createFirstAdminAction, initial);
  return (
    <form action={action} style={formStyle}>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        Name
        <input name="name" type="text" required autoComplete="name" style={fieldStyle} />
      </label>
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
          minLength={8}
          autoComplete="new-password"
          style={fieldStyle}
        />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "#dc2626", margin: 0, fontSize: "0.9rem" }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} style={primaryButton}>
        {pending ? "Creating…" : "Create admin account"}
      </button>
    </form>
  );
}
