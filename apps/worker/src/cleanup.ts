// Removes a ticket's worktree on request: junction first, then the worktree. The branch is kept.
// Usage: pnpm --filter @simple-jira/worker cleanup <ticket-number>
import { getProject, getTicketByNumber, updateTicket } from "@simple-jira/core";
import { db } from "./db";
import { git } from "./exec";
import { removeWorktree } from "./workspace";

const number = Number(process.argv[2]);
if (!Number.isInteger(number) || number <= 0) {
  console.error("Usage: cleanup <ticket-number>");
  process.exit(1);
}

const ticket = await getTicketByNumber(db, number);
if (!ticket) throw new Error(`Ticket #${number} introuvable`);
if (!ticket.worktree_path || !ticket.project_id) {
  console.log(`Ticket #${number} n'a pas de worktree.`);
  process.exit(0);
}
if (["queued", "running", "verifying"].includes(ticket.status)) {
  throw new Error(`Ticket #${number} est ${ticket.status} : annule-le d'abord`);
}

const project = await getProject(db, ticket.project_id);
await removeWorktree(project, ticket.worktree_path);

// A ticket that never delivered can start over: drop its empty local branch so a retry gets a fresh one.
if (ticket.branch && !ticket.pr_url) {
  await git(["branch", "-D", ticket.branch], project.local_path).catch(() => undefined);
  await updateTicket(db, ticket.id, { worktree_path: null, branch: null, verify_attempts: 0 });
  console.log(`Worktree ${ticket.worktree_path} et branche ${ticket.branch} supprimés : prêt pour une relance.`);
} else {
  await updateTicket(db, ticket.id, { worktree_path: null });
  console.log(`Worktree ${ticket.worktree_path} supprimé (branche ${ticket.branch} conservée).`);
}
