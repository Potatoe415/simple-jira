import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Path from the web app to the capture assistant prompt; next.config.ts traces it into the deployment.
const CONTEXT_FILE = path.join(process.cwd(), "..", "..", "docs", "claude-app-context.md");

// Downloads the Claude capture assistant context, so it can be pasted into the Claude app on a phone. Owner only.
export async function GET() {
  const supabase = await authClient();
  const { data } = await supabase.auth.getClaims();
  if (!isOwnerEmail(data?.claims?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await readFile(CONTEXT_FILE, "utf8").catch(() => null);
  if (body === null) return NextResponse.json({ error: "context file not found" }, { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="claude-app-context.md"',
      "Cache-Control": "no-store",
    },
  });
}
