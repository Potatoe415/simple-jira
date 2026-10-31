import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectBySlug, saveProject, type Project, type Ticket } from "@simple-jira/core";
import { config } from "./config";
import { db } from "./db";
import { gh, git } from "./exec";
import type { TicketLogger } from "./logger";

export async function createNewProject(ticket: Ticket, log: TicketLogger, signal: AbortSignal): Promise<Project> {
  const spec = ticket.new_project;
  if (!spec) throw new Error("Ticket new_project sans spécification");

  const existing = await getProjectBySlug(db, spec.slug);
  if (existing) return existing;

  const dir = join(config.projectsRoot, spec.slug);
  if (!existsSync(join(dir, ".git"))) {
    if (existsSync(dir) && readdirSync(dir).length > 0) {
      throw new Error(`Le dossier ${dir} existe déjà et n'est pas un dépôt git`);
    }
    log.status(`Création du dépôt local ${dir}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "README.md"), `# ${spec.name}\n\n${spec.description}\n`, "utf8");
    await git(["init", "-b", "main"], dir, signal);
    await git(["add", "-A"], dir, signal);
    await git(["commit", "-m", "chore: initial commit"], dir, signal);
  }

  const remotes = await git(["remote"], dir, signal);
  if (!remotes.split(/\s+/).includes("origin")) {
    const name = config.githubOwner ? `${config.githubOwner}/${spec.slug}` : spec.slug;
    log.status(`Création du repo GitHub privé ${name}`);
    const args = ["repo", "create", name, "--private", "--source", dir, "--remote", "origin", "--push"];
    if (spec.description) args.push("--description", spec.description.slice(0, 300));
    await gh(args, dir, signal);
  }

  const repo = await gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], dir, signal);
  const project = await saveProject(db, {
    slug: spec.slug,
    name: spec.name,
    description: spec.description,
    local_path: dir,
    repo,
    default_branch: "main",
  });
  log.status(`Projet ${project.name} enregistré (${repo})`);
  return project;
}
