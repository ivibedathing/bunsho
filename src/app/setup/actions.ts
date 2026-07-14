"use server";

import { signIn } from "@/auth";
import { createFirstAdmin, usersExist } from "@/lib/bootstrap";

export interface SetupState {
  error?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function createFirstAdminAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (await usersExist()) return { error: "Setup has already been completed." };

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (name.length < 1) return { error: "Name is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    await createFirstAdmin({ email, name, password });
  } catch {
    return { error: "Could not complete setup." };
  }

  // Throws a redirect on success (propagate it); credentials are guaranteed valid.
  await signIn("credentials", { email, password, redirectTo: "/" });
  return {};
}
