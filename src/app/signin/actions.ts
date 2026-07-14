"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export interface SignInState {
  error?: string;
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (e) {
    // Auth.js signals success by throwing a redirect — only swallow real auth errors.
    if (e instanceof AuthError) return { error: "Invalid email or password." };
    throw e;
  }
  return {};
}

export async function signInOidcAction(): Promise<void> {
  await signIn("oidc", { redirectTo: "/" });
}
