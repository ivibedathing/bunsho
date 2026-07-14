import type { CSSProperties } from "react";

// Small shared style vocabulary for the auth screens (setup / sign-in). Kept
// inline and dependency-free until the design system lands with the editor (M2).

export const authCard: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "1.5rem",
  maxWidth: "22rem",
  margin: "0 auto",
  padding: "2rem 1.5rem",
};

export const authTitle: CSSProperties = {
  fontSize: "1.6rem",
  margin: 0,
  letterSpacing: "-0.02em",
};

export const formStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

export const fieldStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1px solid var(--muted)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
};

export const primaryButton: CSSProperties = {
  padding: "0.6rem 0.75rem",
  borderRadius: "0.5rem",
  border: "none",
  background: "var(--fg)",
  color: "var(--bg)",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  padding: "0.6rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid var(--muted)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};
