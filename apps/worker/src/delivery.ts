import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project, Ticket } from "@simple-jira/core";
import { browserSummary, signedScreenUrls, type BrowserResult } from "./browser-check";
import { config } from "./config";
import { gh, git } from "./exec";
import type { TicketLogger } from "./logger";
import { redact } from "./redact";
import { journalLines, notesSection, section } from "./task-file";

const FENCE = "```";

function quoteBlock(text: string) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function list(items: string[], empty: string) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `_${empty}_`;
}

// Journal lines look like "2026-11-05 10:12 done: ...": the text, grouped by kind.
function journalByKind(taskText: string) {
  const byKind = new Map<string, string[]>();
  for (const line of journalLines(taskText)) {
    const match = line.match(/^(?:\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s+)?(\w+)\s*:\s*(.+)$/);
    const kind = match?.[1]?.toLowerCase() ?? "note";
    byKind.set(kind, [...(byKind.get(kind) ?? []), match?.[2] ?? line]);
  }
  return byKind;
}

// Notes written by the agent, without what simple-jira itself appended (answers, comments, check output).
function agentNotes(taskText: string) {
  return notesSection(taskText)
    .split(/\n(?=\S)/)
    .map((block) => block.trim().replace(/^[-*]\s+/, ""))
    .filter((block) => block && !/^(Owner (answer|comment)|Check failed after|simple-jira:)/.test(block));
}

export function renderPrBody(params: {
  ticket: Ticket;
  project: Project;
  taskText: string;
  diffStat: string;
  commits: string;
}): string {
  const { ticket, project, taskText } = params;
  const journal = journalByKind(taskText);
  const notes = agentNotes(taskText);
  const manual = notes.filter((note) => /by hand|à la main|manual|human|humain|browser|navigateur/i.test(note));
  const assumptions = notes.filter((note) => !manual.includes(note));
  const learned = section(taskText, "Learnings")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
  const verify = project.verify_commands.length
    ? project.verify_commands.map((command) => `\`${command}\``).join(" puis ")
    : "la vérification du projet";
  const paths = (ticket.check_paths?.length ? ticket.check_paths : ["/"]).map((path) => `\`${path}\``).join(", ");
  const dashboard = config.dashboardUrl ? ` · [ticket](${config.dashboardUrl}/tickets/${ticket.number})` : "";
  const journalAll = [...journal.entries()].flatMap(([kind, lines]) => lines.map((line) => `**${kind}** : ${line}`));

  const parts = [
    "## Pourquoi",
    quoteBlock(ticket.description),
    "",
    `**Objectif :** ${ticket.goal?.trim() || ticket.title}`,
    "",
    "## Ce qui change",
    list(journal.get("done") ?? [], "voir les commits ci-dessous"),
    "",
    "<details><summary>Commits et fichiers</summary>",
    "",
    FENCE,
    params.commits,
    FENCE,
    "",
    FENCE,
    params.diffStat,
    FENCE,
    "</details>",
    "",
    "## Comment tester",
    `- Vérification automatique : ${verify} passe sur la branche (relancée par simple-jira après l'agent).`,
    `- Preview : ouvrir ${paths} sur le lien Vercel de cette PR.`,
    "- Test navigateur : résultat et captures en commentaire dès que la preview est prête.",
    ...(manual.length ? ["", "**À vérifier à la main :**", list(manual, "")] : []),
    "",
    "## Risques",
    list(journal.get("pitfall") ?? [], "aucun point délicat signalé par l'agent"),
    "",
    "## Hypothèses retenues",
    list(assumptions, "aucune"),
    "",
    "## Journal de l'agent",
    list(journalAll, "pas de journal"),
    ...(learned.length ? ["", "## Appris pour la suite", list(learned, "")] : []),
    "",
    "---",
    `_Généré par simple-jira (ticket #${ticket.number}${dashboard})._`,
    "",
  ];
  return redact(parts.join("\n"));
}

async function withTempFile<T>(name: string, content: string, use: (file: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "simple-jira-"));
  try {
    const file = join(dir, name);
    writeFileSync(file, content, "utf8");
    return await use(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Posts the browser-check result on the PR: signed links (7 days) when Storage is set up, local paths otherwise.
export async function commentBrowserResult(project: Project, prUrl: string, result: BrowserResult) {
  const urls = await signedScreenUrls(result.screens, 7 * 24 * 3600).catch(() => new Map<string, string>());
  const shots = result.screens.map((screen) => {
    const url = screen.storage ? urls.get(screen.storage) : undefined;
    return url
      ? `- [\`${screen.path}\`](${url}) (HTTP ${screen.status ?? "?"})`
      : `- \`${screen.path}\` : capture locale \`${screen.local}\``;
  });
  const body = redact(
    [
      "### Test navigateur sur la preview",
      "",
      browserSummary(result),
      ...(shots.length ? ["", "**Captures** (liens valables 7 jours) :", ...shots] : []),
      "",
      `_simple-jira, ${result.previewUrl}_`,
    ].join("\n"),
  );
  await withTempFile("comment.md", body, (file) =>
    gh(["pr", "comment", prUrl, "--repo", project.repo, "--body-file", file], process.cwd()),
  );
}

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
  const commits = await git(["log", "--no-merges", "--format=%h %s", `${base}..HEAD`], worktree, signal);
  log.status(`Branche ${branch} poussée (${ahead} commit(s))`);

  const body = renderPrBody({ ticket, project, taskText: params.taskText, diffStat, commits });
  const existing = await gh(
    ["pr", "list", "--repo", project.repo, "--head", branch, "--state", "open", "--json", "url", "--jq", ".[0].url"],
    worktree,
    signal,
  );
  if (existing) {
    // New pass on the same branch (failed check, owner comment, conflict): keep the description current.
    await withTempFile("body.md", body, (file) =>
      gh(["pr", "edit", existing, "--repo", project.repo, "--body-file", file], worktree, signal),
    ).catch((error: Error) => log.error(`Description de PR non mise à jour : ${error.message}`));
    return { prUrl: existing, diffStat };
  }

  const output = await withTempFile("body.md", body, (file) =>
    gh(
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
        file,
      ],
      worktree,
      signal,
    ),
  );
  const prUrl = output.split(/\s+/).find((token) => token.startsWith("https://"));
  if (!prUrl) throw new Error(`URL de PR introuvable dans : ${output}`);
  return { prUrl, diffStat };
}
