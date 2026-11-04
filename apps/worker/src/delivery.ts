import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project, Ticket } from "@simple-jira/core";
import { gh, git } from "./exec";
import type { TicketLogger } from "./logger";

// The agent normally ships itself (project ship step). This makes sure the branch is pushed and a PR exists.
export async function deliver(params: {
  ticket: Ticket;
  project: Project;
  worktree: string;
  branch: string;
  taskText: string;
  log: TicketLogger;
  signal: AbortSignal;
}): Promise<{ prUrl: string; diffStat: string }> {
  const { ticket, project, worktree, branch, log, signal } = params;
  const base = `origin/${project.default_branch}`;

  const pending = await git(["status", "--porcelain"], worktree, signal);
  if (pending) {
    log.status("Changements non commités laissés par l'agent : commit par simple-jira");
    await git(["add", "-A"], worktree, signal);
    for (const file of project.env_files) await git(["reset", "-q", "--", file], worktree).catch(() => undefined);
    const prefix = ticket.type === "fix" ? "fix" : "feat";
    await git(["commit", "-m", `${prefix}: ${ticket.title}`.slice(0, 120), "-m", `Ticket: #${ticket.number}`], worktree, signal);
  }

  const ahead = Number(await git(["rev-list", "--count", `${base}..HEAD`], worktree, signal));
  if (ahead === 0) throw new Error("Aucun commit sur la branche : rien à livrer");

  await git(["push", "-u", "origin", `HEAD:refs/heads/${branch}`], worktree, signal);
  const diffStat = await git(["diff", "--stat", `${base}...HEAD`], worktree, signal);
  log.status(`Branche ${branch} poussée (${ahead} commit(s))`);

  const existing = await gh(
    ["pr", "list", "--repo", project.repo, "--head", branch, "--state", "open", "--json", "url", "--jq", ".[0].url"],
    worktree,
    signal,
  );
  if (existing) return { prUrl: existing, diffStat };

  const dir = mkdtempSync(join(tmpdir(), "simple-jira-"));
  const bodyFile = join(dir, "body.md");
  try {
    writeFileSync(
      bodyFile,
      `${params.taskText.trim()}\n\n---\n\n\`\`\`\n${diffStat}\n\`\`\`\n\n_Généré par simple-jira (ticket #${ticket.number})._\n`,
      "utf8",
    );
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
    const prUrl = output.split(/\s+/).find((token) => token.startsWith("https://"));
    if (!prUrl) throw new Error(`URL de PR introuvable dans : ${output}`);
    return { prUrl, diffStat };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
