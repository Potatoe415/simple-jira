import { existsSync, writeFileSync } from "node:fs";
import { addEvent, getProject, getTicket, updateTicket, type Project, type Ticket } from "@simple-jira/core";
import { browserCheck, wantsBrowserCheck } from "./browser-check";
import { db } from "./db";
import { commentBrowserResult } from "./delivery";
import { gh, git, resolveGithubToken, run } from "./exec";
import { createLogger, type TicketLogger } from "./logger";
import { notify } from "./notify";
import { conflictStep, renderTask, reopenForConflict } from "./task-file";
import { reattachWorktree, taskPath } from "./workspace";

async function githubEnv(): Promise<Record<string, string> | undefined> {
  const token = await resolveGithubToken();
  return token ? { GH_TOKEN: token } : undefined;
}

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
    await addEvent(db, ticket.id, "status", `Preview ready: ${url}`);
    void checkPreview(ticket.id, url);
  }
}

const checking = new Set<string>();

// Runs once per preview, in the background: a failure only adds a warning to the ticket.
async function checkPreview(ticketId: string, previewUrl: string) {
  if (checking.has(ticketId)) return;
  checking.add(ticketId);
  const ticket = await getTicket(db, ticketId);
  const log = createLogger(ticket.id, ticket.number);
  try {
    const project = await getProject(db, ticket.project_id!);
    if (!wantsBrowserCheck(project)) return;
    const result = await browserCheck(ticket, previewUrl, log);
    if (ticket.pr_url) await commentBrowserResult(project, ticket.pr_url, result);
    if (!result.ok) log.status("⚠ Browser test: check by hand (see the log)");
  } catch (error) {
    log.event("browser", `Browser test error: ${(error as Error).message}`);
  } finally {
    checking.delete(ticketId);
    await log.flush();
  }
}

async function squashSubject(prUrl: string): Promise<string> {
  return gh(
    [
      "pr",
      "view",
      prUrl,
      "--json",
      "commits,title",
      "--jq",
      '([.commits[].messageHeadline | select(startswith("Merge ") | not)][0]) // .title',
    ],
    process.cwd(),
  );
}

// main moved on: bring it into the branch; hand real conflicts to the agent on the same branch.
async function handleConflict(ticket: Ticket, log: TicketLogger): Promise<"retry" | "requeued"> {
  const project = await getProject(db, ticket.project_id!);
  const signal = new AbortController().signal;
  const worktree =
    ticket.worktree_path && existsSync(ticket.worktree_path)
      ? ticket.worktree_path
      : await reattachWorktree(project, ticket.branch!, log, signal);

  await git(["fetch", "origin", project.default_branch], worktree);
  const merge = await run("git", ["merge", "--no-edit", `origin/${project.default_branch}`], { cwd: worktree });
  if (merge.code === 0) {
    await git(["push", "origin", `HEAD:refs/heads/${ticket.branch}`], worktree);
    log.status(`main merged into ${ticket.branch} without conflict: retrying the merge`);
    await updateTicket(db, ticket.id, { worktree_path: worktree });
    return "retry";
  }

  const files = (await git(["diff", "--name-only", "--diff-filter=U"], worktree)).split(/\r?\n/).filter(Boolean);
  const step = conflictStep(files, project.default_branch);
  const task = taskPath(worktree);
  if (existsSync(task)) {
    reopenForConflict(task, step);
  } else {
    const goal = `The branch merges cleanly with origin/${project.default_branch}, keeps the ticket's changes, and the check passes.`;
    writeFileSync(task, renderTask(ticket, project, ticket.branch!, { goal, steps: [step] }), "utf8");
  }
  await updateTicket(db, ticket.id, { status: "queued", worktree_path: worktree, verify_attempts: 0 });
  log.transition("queued", "merge conflict to resolve");
  log.status(`Conflict with main in ${files.join(", ")}: the agent will resolve it, then the merge will restart`);
  return "requeued";
}

async function runMerges() {
  const { data, error } = await db
    .from("tickets")
    .select("*")
    .eq("status", "delivered")
    .not("merge_requested_at", "is", null)
    .is("merged_at", null);
  if (error) throw new Error(`merges: ${error.message}`);
  for (const ticket of data as Ticket[]) {
    if (!ticket.pr_url) continue;
    const log = createLogger(ticket.id, ticket.number);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await run(
          "gh",
          ["pr", "merge", ticket.pr_url, "--squash", "--subject", await squashSubject(ticket.pr_url)],
          { cwd: process.cwd(), extraEnv: await githubEnv() },
        );
        if (result.code === 0) {
          await updateTicket(db, ticket.id, { status: "merged", merged_at: new Date().toISOString() });
          log.transition("merged", "merged into main, Vercel deploys to prod");
          await notify("merged", ticket, await getProject(db, ticket.project_id!).catch(() => null));
          break;
        }
        if (!/conflict|not mergeable/i.test(result.output) || attempt > 0) {
          throw new Error(result.output.trim().slice(-1500));
        }
        if ((await handleConflict(ticket, log)) === "requeued") break;
      }
    } catch (mergeError) {
      await updateTicket(db, ticket.id, { merge_requested_at: null });
      log.error(`Merge refused: ${(mergeError as Error).message}`);
    } finally {
      await log.flush();
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
