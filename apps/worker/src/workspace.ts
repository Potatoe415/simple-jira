import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { slugify, type Project, type Ticket } from "@simple-jira/core";
import { config } from "./config";
import { git, run } from "./exec";
import type { TicketLogger } from "./logger";

export const TASK_FILE = "TASK.md";

export const taskPath = (worktree: string) => join(worktree, TASK_FILE);

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

async function planWorktree(ticket: Ticket, project: Project) {
  const repo = project.local_path;
  const prefix = ticket.type === "fix" ? "fix" : "feat";
  const base = ticket.slug ?? slugify(ticket.title);
  for (const slug of [base, `${base}-${ticket.number}`]) {
    const branch = `${prefix}/${slug}`;
    const path = join(dirname(repo), `${basename(repo)}-${slug}`);
    const branchExists = (await run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo }))
      .code === 0;
    if (!branchExists && !existsSync(path)) return { path, branch };
  }
  throw new Error(`Branch or folder already taken for "${base}" and "${base}-${ticket.number}"`);
}

async function excludeTaskFile(repo: string) {
  const common = await git(["rev-parse", "--git-common-dir"], repo);
  const exclude = join(isAbsolute(common) ? common : resolve(repo, common), "info", "exclude");
  mkdirSync(dirname(exclude), { recursive: true });
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!current.split(/\r?\n/).includes(TASK_FILE)) {
    appendFileSync(exclude, `${current && !current.endsWith("\n") ? "\n" : ""}${TASK_FILE}\n`);
  }
}

// Isolated worktree next to the project, on a new branch from the freshly fetched default branch,
// so merged PRs are included even when the main checkout lags behind.
export async function createWorktree(
  ticket: Ticket,
  project: Project,
  log: TicketLogger,
  signal: AbortSignal,
): Promise<{ path: string; branch: string }> {
  const repo = project.local_path;
  if (!existsSync(join(repo, ".git"))) throw new Error(`Repository not found: ${repo}`);

  const { path, branch } = await planWorktree(ticket, project);
  log.status(`Worktree ${path} on ${branch} from origin/${project.default_branch}`);
  await git(["fetch", "origin", project.default_branch], repo, signal);
  await git(["worktree", "add", "-b", branch, path, `origin/${project.default_branch}`], repo, signal);
  await finishSetup(project, path, log, signal);
  return { path, branch };
}

// Worktree for a branch that already exists (a delivered ticket whose worktree was cleaned up).
export async function reattachWorktree(
  project: Project,
  branch: string,
  log: TicketLogger,
  signal: AbortSignal,
): Promise<string> {
  const repo = project.local_path;
  const path = join(dirname(repo), `${basename(repo)}-${branch.split("/").pop()}`);
  if (existsSync(path)) throw new Error(`Folder ${path} already exists`);
  await git(["fetch", "origin", branch], repo, signal);
  const local = (await run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo })).code === 0;
  await git(local ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, `origin/${branch}`], repo, signal);
  if (local) await git(["reset", "--hard", `origin/${branch}`], path, signal);
  log.status(`Worktree ${path} recreated on ${branch}`);
  await finishSetup(project, path, log, signal);
  return path;
}

async function finishSetup(project: Project, path: string, log: TicketLogger, signal: AbortSignal) {
  const repo = project.local_path;
  await excludeTaskFile(repo);

  const modules = join(repo, "node_modules");
  if (existsSync(modules)) {
    symlinkSync(modules, join(path, "node_modules"), "junction");
    log.status("node_modules linked by junction");
  } else if (project.setup_commands.length) {
    const setup = await runCommands(project.setup_commands, path, log, signal);
    if (!setup.ok) throw new Error(`Setup failed:\n${setup.output.slice(-3000)}`);
  }

  for (const file of project.env_files) {
    const source = join(repo, file);
    if (!existsSync(source)) continue;
    const ignored = await run("git", ["check-ignore", "-q", file], { cwd: path });
    if (ignored.code !== 0) {
      log.error(`${file} is not ignored by git: copy refused so it does not get committed`);
      continue;
    }
    mkdirSync(dirname(join(path, file)), { recursive: true });
    copyFileSync(source, join(path, file));
  }
}

const NOISE = /^(npm (warn|notice)|>\s|\s*$|.*potentially fixable with the `--fix` option)/;

// Keeps the lines that explain a failure: drops npm warnings and script banners, errors first.
export function failureSummary(output: string, max = 3000): string {
  const lines = output.split(/\r?\n/).filter((line) => !NOISE.test(line));
  const important = lines.filter((line) => /error|✖|✗|\[warn\]|failed|not found|cannot/i.test(line));
  const text = [...important, ...(important.length ? ["---"] : []), ...lines.slice(-40)].join("\n");
  return text.length > max ? text.slice(-max) : text;
}

// The junction must go first: removing the worktree through it deletes the real node_modules.
export async function removeWorktree(project: Project, path: string) {
  const repo = project.local_path;
  const mainModules = join(repo, "node_modules");
  const hadModules = existsSync(mainModules);
  const link = join(path, "node_modules");

  if (isLink(link)) {
    await run("cmd", ["/c", "rmdir", link], { cwd: repo });
    if (isLink(link)) throw new Error(`Cannot remove the junction ${link}`);
  } else if (existsSync(link)) {
    throw new Error(`${link} is not a junction: removal refused, check by hand`);
  }
  if (hadModules && !existsSync(mainModules)) throw new Error(`${mainModules} disappeared: stopping immediately`);

  await git(["worktree", "remove", "--force", path], repo);
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
    const result = await run(command, [], { cwd, shell: true, signal, timeoutMs: config.commandTimeoutMs });
    if (result.aborted) throw new Error("Aborted");
    const seconds = Math.round((Date.now() - started) / 1000);
    if (result.code !== 0 || result.timedOut) {
      const reason = result.timedOut ? "timeout" : `code ${result.code}`;
      const summary = failureSummary(result.output);
      log.verify(`✗ ${command} (${reason}, ${seconds}s)\n${summary}`);
      return { ok: false, output: `$ ${command} (${reason})\n${summary}` };
    }
    log.verify(`✓ ${command} (${seconds}s)`);
  }
  return { ok: true, output: "" };
}
