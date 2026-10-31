import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Project, Ticket } from "@simple-jira/core";
import { config } from "./config";
import { git, run } from "./exec";
import type { TicketLogger } from "./logger";

export function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "task";
}

export function branchName(ticket: Ticket): string {
  return `agent/${ticket.number}-${slugify(ticket.title)}`;
}

export async function prepareWorktree(
  ticket: Ticket,
  project: Project,
  log: TicketLogger,
  signal: AbortSignal,
): Promise<{ path: string; branch: string }> {
  const repo = project.local_path;
  if (!existsSync(join(repo, ".git"))) throw new Error(`Dépôt introuvable : ${repo}`);

  const branch = branchName(ticket);
  const path = join(config.worktreesRoot, project.slug, `t${ticket.number}`);

  log.status(`Préparation de la bulle ${path} (branche ${branch})`);
  await git(["fetch", "origin", project.default_branch], repo, signal);

  if (existsSync(path)) {
    await git(["worktree", "remove", "--force", "--force", path], repo).catch(() => undefined);
    rmSync(path, { recursive: true, force: true });
  }
  await git(["worktree", "prune"], repo);
  mkdirSync(dirname(path), { recursive: true });
  await git(["worktree", "add", "-B", branch, path, `origin/${project.default_branch}`], repo, signal);

  for (const file of project.env_files) {
    const source = join(repo, file);
    if (!existsSync(source)) continue;
    const ignored = await run("git", ["check-ignore", "-q", file], { cwd: path });
    if (ignored.code !== 0) {
      log.error(`${file} n'est pas ignoré par git : copie refusée pour ne pas le commiter`);
      continue;
    }
    mkdirSync(dirname(join(path, file)), { recursive: true });
    copyFileSync(source, join(path, file));
  }

  const setup = await runCommands(project.setup_commands, path, log, signal);
  if (!setup.ok) throw new Error(`Installation en échec :\n${setup.output.slice(-3000)}`);

  return { path, branch };
}

export async function removeWorktree(project: Project, path: string) {
  await git(["worktree", "remove", "--force", "--force", path], project.local_path).catch(() => undefined);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  await git(["worktree", "prune"], project.local_path).catch(() => undefined);
}

export async function runCommands(
  commands: string[],
  cwd: string,
  log: TicketLogger,
  signal: AbortSignal,
): Promise<{ ok: boolean; output: string }> {
  for (const command of commands) {
    const started = Date.now();
    log.verify(`$ ${command}`);
    const result = await run(command, [], {
      cwd,
      shell: true,
      signal,
      timeoutMs: config.commandTimeoutMs,
    });
    if (result.aborted) throw new Error("Aborted");
    const seconds = Math.round((Date.now() - started) / 1000);
    if (result.code !== 0 || result.timedOut) {
      const reason = result.timedOut ? "timeout" : `code ${result.code}`;
      const output = `$ ${command} (${reason})\n${result.output.trim()}`;
      log.verify(`✗ ${command} (${reason}, ${seconds}s)\n${result.output.trim().slice(-4000)}`);
      return { ok: false, output };
    }
    log.verify(`✓ ${command} (${seconds}s)`);
  }
  return { ok: true, output: "" };
}
