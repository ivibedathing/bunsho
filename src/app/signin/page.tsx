import { authCard, authTitle } from "@/app/auth-ui";
import { usersExist } from "@/lib/bootstrap";
import { getCurrentUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (!(await usersExist())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  const oidcEnabled =
    !!process.env.OIDC_ISSUER && !!process.env.OIDC_CLIENT_ID && !!process.env.OIDC_CLIENT_SECRET;

  return (
    <main style={authCard}>
      <h1 style={authTitle}>Sign in to Bunsho</h1>
      <SignInForm oidcEnabled={oidcEnabled} oidcName={process.env.OIDC_NAME ?? "SSO"} />
    </main>
  );
}
