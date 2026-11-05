import { existsSync, writeFileSync } from "node:fs";
import {
  askQuestion,
  getProject,
  getProjectMemory,
  getTicket,
  listQuestions,
  listUnreadOwnerComments,
  markCommentsRead,
  setProjectMemory,
  updateTicket,
  type Project,
  type Ticket,
} from "@simple-jira/core";
import { config } from "./config";
import { db } from "./db";
import { deliver } from "./delivery";
import { watchJournal } from "./journal";
import { createLogger, type TicketLogger } from "./logger";
import { createNewProject } from "./new-project";
import { notify } from "./notify";
import { runRunner } from "./runner";
import {
  applyAnswers,
  applyOwnerComments,
  learnings,
  notesSection,
  readTask,
  renderTask,
  reopen,
  reopenAfterFailedCheck,
  reopenForComments,
  taskState,
} from "./task-file";
import { createWorktree, runCommands, taskPath } from "./workspace";

const now = () => new Date().toISOString();

const NETWORK_ERROR = /API Error|ECONNREFUSED|Connection refused|ETIMEDOUT|ENOTFOUND|getaddrinfo|socket hang up/i;

class Stop extends Error {}

export async function processTicket(ticket: Ticket): Promise<void> {
  const log = createLogger(ticket.id, ticket.number);
  log.transition("running", "picked up by the worker");
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
      log.status("Stopped: ticket cancelled");
    } else if (!(error instanceof Stop)) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(message);
      await updateTicket(db, ticket.id, { status: "failed", error: message.slice(0, 4000), finished_at: now() });
      log.transition("failed");
      await notify("failed", ticket, await projectOf(ticket), message.split("\n")[0]);
    }
  } finally {
    clearInterval(watcher);
    await log.flush();
  }
}

async function projectOf(ticket: Ticket): Promise<Project | null> {
  return ticket.project_id ? getProject(db, ticket.project_id).catch(() => null) : null;
}

// Owner comments posted since the last pass go under Notes, so the next pass sees them.
async function forwardComments(ticket: Ticket, task: string, log: TicketLogger): Promise<number> {
  const current = await getTicket(db, ticket.id);
  const comments = await listUnreadOwnerComments(db, current);
  if (!comments.length) return 0;
  applyOwnerComments(task, comments);
  await markCommentsRead(db, ticket.id, comments[comments.length - 1]!.id);
  log.status(`${comments.length} owner comment(s) added to the Notes of TASK.md`);
  return comments.length;
}

async function saveLearnings(project: Project, taskText: string, log: TicketLogger) {
  const entries = learnings(taskText);
  if (!entries.length) return;
  const saved = await setProjectMemory(db, project.id, entries);
  if (saved) log.info(`Project memory: ${entries.length} learning(s) saved`);
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
    log.status(`${answered.length} answer(s) added to the Notes of TASK.md`);
  } else if (taskState(readTask(task)).status === "BLOCKED") {
    reopen(task);
    log.status("Retry without an answer: STATUS: BLOCKED removed");
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
      log.status("Verifying the untouched copy before starting the agent");
      const baseline = await runCommands(project.verify_commands, worktree, log, signal);
      if (!baseline.ok) {
        throw new Error(
          `${project.default_branch} is already broken: verification fails on the untouched copy, before any change. Fix ${project.default_branch} then click Retry.\n${baseline.output}`,
        );
      }
    }
    writeFileSync(task, renderTask(ticket, project, branch, undefined, await getProjectMemory(db, project.id)), "utf8");
    log.status("TASK.md written");
  } else {
    await forwardAnswers(ticket, task, log);
  }

  let attempts = ticket.verify_attempts;
  for (;;) {
    signal.throwIfAborted();
    const before = taskState(readTask(task));
    if (before.status !== "DONE") {
      await updateTicket(db, ticket.id, { status: "running" });
      const model = ticket.model || project.default_model || null;
      const effort = ticket.effort || project.default_effort || null;
      const settings = [model && `model ${model}`, effort && `effort ${effort}`].filter(Boolean).join(", ");
      log.status(`Starting the Claude Code runner (${before.open} open step(s)${settings ? `, ${settings}` : ""})`);
      const journal = watchJournal(task, log);
      const result = await runRunner({
        worktree,
        task,
        model,
        effort,
        verifyCommands: project.verify_commands,
        log,
        signal,
        beforePass: async () => {
          await forwardComments(ticket, task, log).catch((error: Error) => log.error(`Comments: ${error.message}`));
        },
      }).finally(() => journal.stop());
      if (result.costUsd > 0) {
        ticket = { ...ticket, cost_usd: Number(ticket.cost_usd ?? 0) + result.costUsd };
        await updateTicket(db, ticket.id, { cost_usd: ticket.cost_usd }).catch(() => undefined);
      }
      signal.throwIfAborted();
      if (result.timedOut) throw new Error(`Runner stopped after ${config.runnerTimeoutMs / 60_000} min`);
      const progressed = taskState(readTask(task));
      if (!progressed.status && progressed.done === before.done && NETWORK_ERROR.test(result.output)) {
        throw new Error(
          "Claude Code could not reach its API (network, VPN or gateway proxy). Nothing was changed: restore the connection then click Retry.",
        );
      }
    }

    const after = taskState(readTask(task));
    if (after.status === "BLOCKED") {
      await askQuestion(db, ticket.id, after.blockedReason ?? "Blocked without details");
      await updateTicket(db, ticket.id, { status: "blocked", summary: notesSection(readTask(task)) || null });
      log.event("question", after.blockedReason ?? "Blocked without details");
      log.transition("blocked", after.blockedReason ?? undefined);
      await notify("question", ticket, project, after.blockedReason ?? undefined);
      throw new Stop();
    }
    if (after.status !== "DONE") {
      throw new Error(
        `The runner stopped without STATUS (${after.done} step(s) done, ${after.open} open). See autoclick/logs.`,
      );
    }

    // A comment that arrived during the last pass reopens the task instead of being lost.
    if ((await forwardComments(ticket, task, log).catch(() => 0)) > 0) {
      reopenForComments(task);
      log.status("Comment received after STATUS: DONE: step added, restarting the runner");
      continue;
    }

    await updateTicket(db, ticket.id, { status: "verifying" });
    log.transition("verifying", `STATUS: DONE (${after.done} steps), verification by simple-jira`);
    const check = await runCommands(project.verify_commands, worktree, log, signal);

    const checkDetail = check.ok ? "" : `\n${check.output.slice(-1500)}`;
    log.event("check", `${check.ok ? "✓" : "✗"} simple-jira verification${checkDetail}`, { ok: check.ok });
    if (check.ok) {
      const taskText = readTask(task);
      await saveLearnings(project, taskText, log).catch((error: Error) => log.error(`Memory: ${error.message}`));
      const { prUrl, diffStat } = await deliver({ ticket, project, worktree, branch, taskText, log, signal });
      const notes = notesSection(taskText);
      await updateTicket(db, ticket.id, {
        status: "delivered",
        pr_url: prUrl,
        summary: [notes, diffStat && `\`\`\`\n${diffStat}\n\`\`\``].filter(Boolean).join("\n\n") || null,
        finished_at: now(),
        merge_requested_at: ticket.auto_merge || ticket.merge_requested_at ? now() : null,
      });
      log.event("pr", `Pull request: ${prUrl}`, { url: prUrl });
      log.transition("delivered", `worktree kept: ${worktree}`);
      await notify("pr_ready", ticket, project, prUrl);
      if (ticket.auto_merge || ticket.merge_requested_at) log.status("Merge to prod requested: it ships automatically");
      return;
    }

    attempts += 1;
    await updateTicket(db, ticket.id, { verify_attempts: attempts });
    if (attempts >= config.maxVerifyAttempts) {
      throw new Error(`Verification still fails after ${attempts} agent retry(ies)`);
    }
    reopenAfterFailedCheck(task, check.output);
    log.status("Verification failed: step added to TASK.md, restarting the runner");
  }
}
