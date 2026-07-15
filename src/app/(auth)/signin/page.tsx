import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { usersExist } from "@/lib/bootstrap";
import { getCurrentUser } from "@/lib/rbac";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (!(await usersExist())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  const oidcEnabled =
    !!process.env.OIDC_ISSUER && !!process.env.OIDC_CLIENT_ID && !!process.env.OIDC_CLIENT_SECRET;

  return (
    <Card className="grid gap-5">
      <h1 className="m-0 font-display text-xl font-bold tracking-tight">Sign in</h1>
      <SignInForm oidcEnabled={oidcEnabled} oidcName={process.env.OIDC_NAME ?? "SSO"} />
    </Card>
  );
}
