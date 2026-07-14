import { authCard, authTitle } from "@/app/auth-ui";
import { usersExist } from "@/lib/bootstrap";
import { redirect } from "next/navigation";
import { SetupForm } from "./SetupForm";

// Reads the DB on every request — first-run state must never be cached.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await usersExist()) redirect("/signin");
  return (
    <main style={authCard}>
      <div>
        <h1 style={authTitle}>Welcome to Bunsho</h1>
        <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
          Create the first administrator to get started.
        </p>
      </div>
      <SetupForm />
    </main>
  );
}
