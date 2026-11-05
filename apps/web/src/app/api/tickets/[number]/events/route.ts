import { getTicketByNumber, listEvents } from "@simple-jira/core";
import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { authClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Live timeline polling. Owner only: the proxy already guards it, this checks again because it reads with the secret key.
export async function GET(request: Request, context: { params: Promise<{ number: string }> }) {
  const supabase = await authClient();
  const { data } = await supabase.auth.getClaims();
  if (!isOwnerEmail(data?.claims?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const number = Number((await context.params).number);
  if (!Number.isInteger(number) || number <= 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0");

  const db = adminDb();
  const ticket = await getTicketByNumber(db, number);
  if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });
  const events = await listEvents(db, ticket.id, { afterId: Number.isFinite(after) ? after : 0, limit: 200 });
  return NextResponse.json(
    { status: ticket.status, events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
