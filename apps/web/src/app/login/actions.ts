"use server";

import { redirect } from "next/navigation";
import { isOwnerEmail } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";

export async function signInAction(_: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Identifiants invalides" };
  if (!isOwnerEmail(email)) {
    await supabase.auth.signOut();
    return { error: "Compte non autorisé" };
  }
  redirect("/");
}
