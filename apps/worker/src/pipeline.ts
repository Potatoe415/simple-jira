import { existsSync, writeFileSync } from "node:fs";
import {
  askQuestion,
  getProject,
  getTicket,
  listQuestions,
  updateTicket,
  type Project,
  type Ticket,
} from "@simple-jira/core";
import { config } from "./config";
import { db } from "./db";
import { deliver } from "./delivery";
import { createLogger, type TicketLogger } from "./logger";
import { createNewProject } from "./new-project";
import { runRunner } from "./runner";
import {
  applyAnswers,
  notesSection,
  readTask,
  renderTask,
  reopen,
  reopenAfterFailedCheck,
  taskState,
} from "./task-file";
import { createWorktree, runCommands, taskPath } from "./workspace";

const now = () => new Date().toISOString();

class Stop extends Error {}

export async function processTicket(ticket: Ticket): Promise<void> {
  const log = createLogger(ticket.id, ticket.number);
  const abort = new AbortController();
  const watcher = setInterval(() => {
    getTicket(db, ticket.id)
      .then((current) => {
        if (current.status === "cancelled") abort.abort();
      })
      .catch(() => undefined);
  }, 10_000);

  try {
    await execute(ticket, log, abort.signal);
  } catch (error) {
    if (abort.signal.aborted) {
      log.status("Arrêt : ticket annulé");
    } else if (!(error instanceof Stop)) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      await updateTicket(db, ticket.id, { status: "failed", error: message.slice(0, 4000), finished_at: now() });
    }
  } finally {
    clearInterval(watcher);
    await log.flush();
  }
}

async function forwardAnswers(ticket: Ticket, task: string, log: TicketLogger) {
  const answered = (await listQuestions(db, ticket.id)).filter((q) => q.answer !== null && !q.forwarded_at);
  if (answered.length) {
    applyAnswers(task, answered);
    const { error } = await db
      .from("questions")
      .update({ forwarded_at: now() })
      .in(
        "id",
        answered.map((q) => q.id),
      );
    if (error) throw new Error(`forward answers: ${error.message}`);
    log.status(`${answered.length} réponse(s) ajoutée(s) aux Notes de TASK.md`);
  } else if (taskState(readTask(task)).status === "BLOCKED") {
    reopen(task);
    log.status("Relance sans réponse : STATUS: BLOCKED retiré");
  }
}

async function execute(initial: Ticket, log: TicketLogger, signal: AbortSignal) {
  let ticket = initial;
  let project: Project;

  if (ticket.project_id) {
    project = await getProject(db, ticket.project_id);
  } else {
    project = await createNewProject(ticket, log, signal);
    await updateTicket(db, ticket.id, { project_id: project.id });
    ticket = { ...ticket, project_id: project.id };
  }

  let worktree = ticket.worktree_path && existsSync(ticket.worktree_path) ? ticket.worktree_path : null;
  let branch = ticket.branch;
  if (!worktree || !branch) {
    ({ path: worktree, branch } = await createWorktree(ticket, project, log, signal));
    await updateTicket(db, ticket.id, { worktree_path: worktree, branch });
  }

  const task = taskPath(worktree);
  if (!existsSync(task)) {
    if (project.verify_commands.length) {
      log.status("Vérification de la copie intacte avant de lancer l'agent");
      const baseline = await runCommands(project.verify_commands, worktree, log, signal);
      if (!baseline.ok) {
        throw new Error(
          `La vérification échoue déjà sur la copie intacte : l'agent perdrait ses runs sur des erreurs qui ne sont pas les siennes.\n${baseline.output.slice(-3000)}`,
        );
      }
    }
    writeFileSync(task, renderTask(ticket, project, branch), "utf8");
    log.status("TASK.md écrit");
  } else {
    await forwardAnswers(ticket, task, log);
  }

  let attempts = ticket.verify_attempts;
  for (;;) {
    signal.throwIfAborted();
    const before = taskState(readTask(task));
    if (before.status !== "DONE") {
      await updateTicket(db, ticket.id, { status: "running" });
      log.status(`Lancement du runner Claude Code (${before.open} étape(s) ouverte(s))`);
      const result = await runRunner(worktree, log, signal);
      signal.throwIfAborted();
      if (result.timedOut) throw new Error(`Runner arrêté après ${config.runnerTimeoutMs / 60_000} min`);
    }

    const after = taskState(readTask(task));
    if (after.status === "BLOCKED") {
      await askQuestion(db, ticket.id, after.blockedReason ?? "Blocage sans détail");
      await updateTicket(db, ticket.id, { status: "blocked", summary: notesSection(readTask(task)) || null });
      log.status(`Bloqué : ${after.blockedReason}`);
      throw new Stop();
    }
    if (after.status !== "DONE") {
      throw new Error(
        `Le runner s'est arrêté sans STATUS (${after.done} étape(s) faites, ${after.open} ouverte(s)). Voir autoclick/logs.`,
      );
    }

    await updateTicket(db, ticket.id, { status: "verifying" });
    log.status(`STATUS: DONE (${after.done} étapes). Vérification par simple-jira`);
    const check = await runCommands(project.verify_commands, worktree, log, signal);

    if (check.ok) {
      const taskText = readTask(task);
      const { prUrl, diffStat } = await deliver({ ticket, project, worktree, branch, taskText, log, signal });
      const notes = notesSection(taskText);
      await updateTicket(db, ticket.id, {
        status: "delivered",
        pr_url: prUrl,
        summary: [notes, diffStat && `\`\`\`\n${diffStat}\n\`\`\``].filter(Boolean).join("\n\n") || null,
        finished_at: now(),
        merge_requested_at: ticket.auto_merge ? now() : null,
      });
      log.status(`Livré : ${prUrl} (worktree conservé : ${worktree})`);
      if (ticket.auto_merge) log.status("Direct en prod demandé : merge automatique");
      return;
    }

    attempts += 1;
    await updateTicket(db, ticket.id, { verify_attempts: attempts });
    if (attempts >= config.maxVerifyAttempts) {
      throw new Error(`La vérification échoue encore après ${attempts} relance(s) de l'agent`);
    }
    reopenAfterFailedCheck(task, check.output);
    log.status("Vérification en échec : étape ajoutée à TASK.md, relance du runner");
  }
}
