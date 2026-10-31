import { existsSync } from "node:fs";
import {
  askQuestion,
  getProject,
  getTicket,
  listQuestions,
  saveProject,
  updateTicket,
  type Project,
  type Ticket,
} from "@simple-jira/core";
import { runClaude } from "./claude";
import { config } from "./config";
import { db } from "./db";
import { deliver } from "./delivery";
import { createLogger, type TicketLogger } from "./logger";
import { createNewProject } from "./new-project";
import { answersPrompt, initialPrompt, RESUME_PROMPT, SYSTEM_PROMPT, verifyFailedPrompt } from "./prompts";
import { prepareWorktree, removeWorktree, runCommands } from "./workspace";

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

async function nextPrompt(ticket: Ticket): Promise<string> {
  const pending = (await listQuestions(db, ticket.id)).filter((q) => q.answer !== null && !q.forwarded_at);
  if (!pending.length) return RESUME_PROMPT;
  const { error } = await db
    .from("questions")
    .update({ forwarded_at: now() })
    .in(
      "id",
      pending.map((q) => q.id),
    );
  if (error) throw new Error(`forward answers: ${error.message}`);
  return answersPrompt(pending);
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

  let sessionId: string | null = null;
  let worktree: string;
  let branch: string;
  let prompt: string;

  if (ticket.session_id && ticket.worktree_path && ticket.branch && existsSync(ticket.worktree_path)) {
    sessionId = ticket.session_id;
    worktree = ticket.worktree_path;
    branch = ticket.branch;
    prompt = await nextPrompt(ticket);
    log.status("Reprise de la session de l'agent");
  } else {
    ({ path: worktree, branch } = await prepareWorktree(ticket, project, log, signal));
    await updateTicket(db, ticket.id, { worktree_path: worktree, branch, session_id: null });
    prompt = initialPrompt(ticket, project);
  }

  let attempts = ticket.verify_attempts;
  let cost = Number(ticket.cost_usd);

  for (;;) {
    signal.throwIfAborted();
    log.status("Agent au travail");
    const outcome = await runClaude({
      cwd: worktree,
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      resumeSessionId: sessionId,
      signal,
      log,
    });
    signal.throwIfAborted();

    sessionId = outcome.sessionId;
    cost += outcome.costUsd;
    await updateTicket(db, ticket.id, { session_id: sessionId, cost_usd: Number(cost.toFixed(4)) });
    if (outcome.error || !outcome.result) throw new Error(outcome.error ?? "Résultat de l'agent manquant");

    const result = outcome.result;

    if (result.status === "needs_input") {
      const question = result.question?.trim() || result.summary;
      await askQuestion(db, ticket.id, question, result.options ?? []);
      await updateTicket(db, ticket.id, { status: "blocked" });
      log.status(`Question posée : ${question}`);
      throw new Stop();
    }

    if (result.status === "cannot_do") {
      await updateTicket(db, ticket.id, {
        status: "failed",
        error: result.summary.slice(0, 4000),
        summary: result.summary,
        finished_at: now(),
      });
      log.status("L'agent a déclaré la tâche impossible");
      throw new Stop();
    }

    if (ticket.type === "new_project" && (result.verify_commands?.length || result.setup_commands?.length)) {
      project = await saveProject(
        db,
        {
          ...project,
          setup_commands: project.setup_commands.length ? project.setup_commands : (result.setup_commands ?? []),
          verify_commands: project.verify_commands.length
            ? project.verify_commands
            : (result.verify_commands ?? []),
        },
        project.id,
      );
    }

    await updateTicket(db, ticket.id, { status: "verifying" });
    log.status("Vérification");
    const verification = await runCommands(project.verify_commands, worktree, log, signal);

    if (verification.ok) {
      const prUrl = await deliver({
        ticket,
        project,
        worktree,
        branch,
        summary: result.summary,
        commitMessage: result.commit_message,
        log,
        signal,
      });
      await updateTicket(db, ticket.id, {
        status: "delivered",
        pr_url: prUrl,
        summary: result.summary,
        finished_at: now(),
        worktree_path: null,
      });
      log.status(`Livré : ${prUrl}`);
      await removeWorktree(project, worktree);
      return;
    }

    attempts += 1;
    await updateTicket(db, ticket.id, { verify_attempts: attempts });
    if (attempts >= config.maxVerifyAttempts) {
      throw new Error(`Vérification en échec après ${attempts} tentatives`);
    }
    await updateTicket(db, ticket.id, { status: "running" });
    prompt = verifyFailedPrompt(verification.output, attempts, config.maxVerifyAttempts);
  }
}
