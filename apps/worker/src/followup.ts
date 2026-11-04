import { addEvent, getProject, updateTicket, type Project, type Ticket } from "@simple-jira/core";
import { db } from "./db";
import { gh } from "./exec";

type Delivered = Pick<Ticket, "id" | "number" | "branch" | "pr_url" | "project_id">;

interface VercelCommentProject {
  name: string;
  rootDirectory: string | null;
  previewUrl?: string;
  nextCommitStatus?: string;
}

// The Vercel bot comment on the PR embeds base64 JSON with each Vercel project's preview URL.
async function findPreviewUrl(project: Project, prUrl: string): Promise<string | null> {
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) return null;
  const body = await gh(
    [
      "api",
      `repos/${project.repo}/issues/${prNumber}/comments`,
      "--jq",
      '[.[] | select(.user.login | test("vercel"))][0].body // ""',
    ],
    process.cwd(),
  );
  const encoded = body.match(/\[vc\]: #[^:]+:([A-Za-z0-9+/=]+)/)?.[1];
  if (!encoded) return null;
  const { projects = [] } = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    projects?: VercelCommentProject[];
  };
  const deployed = projects.filter((p) => p.previewUrl && p.nextCommitStatus === "DEPLOYED");
  const match =
    deployed.find((p) => p.name === project.slug) ?? deployed.find((p) => !p.rootDirectory) ?? deployed[0];
  return match?.previewUrl ? `https://${match.previewUrl.replace(/^https?:\/\//, "")}` : null;
}

async function fillPreviews() {
  const { data, error } = await db
    .from("tickets")
    .select("id, number, branch, pr_url, project_id")
    .eq("status", "delivered")
    .is("preview_url", null)
    .not("pr_url", "is", null)
    .limit(10);
  if (error) throw new Error(`previews: ${error.message}`);
  for (const ticket of data as Delivered[]) {
    if (!ticket.project_id || !ticket.pr_url) continue;
    const url = await findPreviewUrl(await getProject(db, ticket.project_id), ticket.pr_url);
    if (!url) continue;
    await updateTicket(db, ticket.id, { preview_url: url });
    await addEvent(db, ticket.id, "status", `Preview prête : ${url}`);
  }
}

async function runMerges() {
  const { data, error } = await db
    .from("tickets")
    .select("id, number, branch, pr_url, project_id")
    .eq("status", "delivered")
    .not("merge_requested_at", "is", null)
    .is("merged_at", null);
  if (error) throw new Error(`merges: ${error.message}`);
  for (const ticket of data as Delivered[]) {
    if (!ticket.pr_url) continue;
    try {
      await gh(["pr", "merge", ticket.pr_url, "--rebase"], process.cwd());
      await updateTicket(db, ticket.id, { status: "merged", merged_at: new Date().toISOString() });
      await addEvent(db, ticket.id, "status", "Mergé dans main : Vercel déploie en prod");
      console.log(`[#${ticket.number}] mergé`);
    } catch (mergeError) {
      await updateTicket(db, ticket.id, { merge_requested_at: null });
      await addEvent(db, ticket.id, "error", `Merge refusé : ${(mergeError as Error).message}`);
    }
  }
}

let running = false;

export async function followUp() {
  if (running) return;
  running = true;
  try {
    await runMerges();
    await fillPreviews();
  } catch (error) {
    console.error("follow-up:", (error as Error).message);
  } finally {
    running = false;
  }
}
