import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project, Ticket } from "@simple-jira/core";
import { gh, git } from "./exec";
import type { TicketLogger } from "./logger";
import { pullRequestBody } from "./prompts";

export async function deliver(params: {
  ticket: Ticket;
  project: Project;
  worktree: string;
  branch: string;
  summary: string;
  commitMessage: string | undefined;
  log: TicketLogger;
  signal: AbortSignal;
}): Promise<string> {
  const { ticket, project, worktree, branch, log, signal } = params;

  await git(["add", "-A"], worktree, signal);
  for (const file of project.env_files) {
    await git(["reset", "-q", "--", file], worktree).catch(() => undefined);
  }

  const pending = await git(["status", "--porcelain"], worktree, signal);
  if (pending) {
    const subject = (params.commitMessage?.split("\n")[0] || `${ticket.type}: ${ticket.title}`).slice(0, 120);
    await git(["commit", "-m", subject, "-m", `Ticket: #${ticket.number}`], worktree, signal);
  }

  const ahead = await git(["rev-list", "--count", `origin/${project.default_branch}..HEAD`], worktree, signal);
  if (Number(ahead) === 0) throw new Error("L'agent n'a produit aucune modification");

  log.status(`Push de la branche ${branch}`);
  await git(["push", "--force-with-lease", "-u", "origin", `HEAD:refs/heads/${branch}`], worktree, signal);

  const existing = await gh(
    ["pr", "list", "--repo", project.repo, "--head", branch, "--state", "open", "--json", "url", "--jq", ".[0].url"],
    worktree,
    signal,
  );
  if (existing) return existing;

  const dir = mkdtempSync(join(tmpdir(), "simple-jira-"));
  const bodyFile = join(dir, "body.md");
  try {
    writeFileSync(bodyFile, pullRequestBody(ticket, params.summary), "utf8");
    const output = await gh(
      [
        "pr",
        "create",
        "--repo",
        project.repo,
        "--base",
        project.default_branch,
        "--head",
        branch,
        "--title",
        `[#${ticket.number}] ${ticket.title}`,
        "--body-file",
        bodyFile,
      ],
      worktree,
      signal,
    );
    const url = output.split(/\s+/).find((token) => token.startsWith("https://"));
    if (!url) throw new Error(`URL de PR introuvable dans : ${output}`);
    return url;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
