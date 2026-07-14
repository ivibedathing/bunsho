import { Card } from "@/components/ui/Card";
import { usersExist } from "@/lib/bootstrap";
import { redirect } from "next/navigation";
import { SetupForm } from "./SetupForm";

// Reads the DB on every request — first-run state must never be cached.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await usersExist()) redirect("/signin");
  return (
    <Card className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="m-0 font-display text-xl font-bold tracking-tight">Welcome to Bunsho</h1>
        <p className="m-0 text-sm text-ink-muted">Create the first administrator to get started.</p>
      </div>
      <SetupForm />
    </Card>
  );
}
