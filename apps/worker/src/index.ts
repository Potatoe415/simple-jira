import { hostname } from "node:os";
import type { Ticket } from "@simple-jira/core";
import { addEvent } from "@simple-jira/core";
import { config } from "./config";
import { db } from "./db";
import { run } from "./exec";
import { processTicket } from "./pipeline";

let currentTicketId: string | null = null;
let stopping = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function heartbeat() {
  const { error } = await db.from("worker_status").upsert({
    id: config.workerId,
    hostname: hostname(),
    current_ticket_id: currentTicketId,
    last_seen_at: new Date().toISOString(),
  });
  if (error) console.error("heartbeat failed:", error.message);
}

async function preflight() {
  for (const [command, args] of [
    ["git", ["--version"]],
    ["gh", ["auth", "status"]],
    [config.claudeBin, ["--version"]],
  ] as const) {
    const result = await run(command, [...args], { cwd: process.cwd(), claudeAuth: true, timeoutMs: 30_000 }).catch(
      (error: Error) => ({ code: -1, output: error.message }),
    );
    if (result.code !== 0) {
      console.warn(`⚠ ${command} ${args.join(" ")} a échoué :\n${result.output.trim()}`);
    }
  }
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠ Ni CLAUDE_CODE_OAUTH_TOKEN ni ANTHROPIC_API_KEY : lance `claude setup-token`.");
  }
}

async function requeueInterrupted() {
  const { data, error } = await db
    .from("tickets")
    .update({ status: "queued" })
    .in("status", ["running", "verifying"])
    .select("id, number");
  if (error) throw new Error(`requeue: ${error.message}`);
  for (const ticket of data) {
    console.log(`[#${ticket.number}] remis en file après redémarrage`);
    await addEvent(db, ticket.id, "status", "Worker redémarré : ticket remis en file");
  }
}

async function claim(): Promise<Ticket | null> {
  const { data, error } = await db.rpc("claim_next_ticket");
  if (error) throw new Error(`claim: ${error.message}`);
  return ((data as Ticket[] | null) ?? [])[0] ?? null;
}

async function main() {
  console.log(`simple-jira worker "${config.workerId}" — bulles dans ${config.worktreesRoot}`);
  await preflight();
  await requeueInterrupted();
  await heartbeat();
  const beat = setInterval(() => void heartbeat(), 30_000);

  const shutdown = () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log("Arrêt demandé : fin après la tâche en cours (Ctrl+C encore pour forcer).");
    if (!currentTicketId) process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    let ticket: Ticket | null = null;
    try {
      ticket = await claim();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    if (!ticket) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    currentTicketId = ticket.id;
    await heartbeat();
    await addEvent(db, ticket.id, "status", `Pris en charge par ${config.workerId}`).catch(() => undefined);
    await processTicket(ticket);
    currentTicketId = null;
    await heartbeat();
  }

  clearInterval(beat);
  await heartbeat();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
