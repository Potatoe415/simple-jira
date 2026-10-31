import "server-only";
import { redirect } from "next/navigation";
import { authClient } from "./supabase/server";

export function isOwnerEmail(email: unknown): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && typeof email === "string" && email.toLowerCase() === owner;
}

export async function requireOwner(): Promise<string> {
  const supabase = await authClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (!isOwnerEmail(email)) redirect("/login");
  return email as string;
}
