import { existsSync } from "node:fs";
import { hostname } from "node:os";
import type { Ticket } from "@simple-jira/core";
import { addEvent } from "@simple-jira/core";
import { config } from "./config";
import { db } from "./db";
import { gh, run } from "./exec";
import { followUp } from "./followup";
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
  try {
    console.log(`GitHub: signed in as ${await gh(["api", "user", "--jq", ".login"], process.cwd())}`);
  } catch (error) {
    console.warn(`⚠ GitHub unreachable (git credential manager or gh auth login): ${(error as Error).message}`);
  }
  if (!existsSync(config.runnerScript)) console.warn(`⚠ Runner not found: ${config.runnerScript}`);
  for (const [command, args] of [
    ["git", ["--version"]],
    [config.runnerEngine, ["--version"]],
  ] as const) {
    const result = await run(command, [...args], { cwd: process.cwd(), timeoutMs: 30_000 }).catch(
      (error: Error) => ({ code: -1, output: error.message }),
    );
    if (result.code !== 0) {
      console.warn(`⚠ ${command} ${args.join(" ")} failed:\n${result.output.trim()}`);
    }
  }
}

async function requeueInterrupted() {
  const { data, error } = await db
    .from("tickets")
    .update({ status: "queued" })
    .in("status", ["running", "verifying"])
    .select("id, number, status");
  if (error) throw new Error(`requeue: ${error.message}`);
  // A task with sub-tasks keeps its rolled-up status (database trigger): nothing was re-queued.
  for (const ticket of data.filter((row) => row.status === "queued")) {
    console.log(`[#${ticket.number}] re-queued after restart`);
    await addEvent(db, ticket.id, "status", "Worker restarted: ticket re-queued");
  }
}

async function claim(): Promise<Ticket | null> {
  const { data, error } = await db.rpc("claim_next_ticket");
  if (error) throw new Error(`claim: ${error.message}`);
  return ((data as Ticket[] | null) ?? [])[0] ?? null;
}

async function main() {
  console.log(
    `simple-jira worker "${config.workerId}": queue checked every ${config.pollIntervalMs / 1000}s, runner ${config.runnerScript}`,
  );
  await preflight();
  await requeueInterrupted();
  await heartbeat();
  const beat = setInterval(() => void heartbeat(), 30_000);
  void followUp();
  const follow = setInterval(() => void followUp(), 20_000);

  const shutdown = () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log("Stop requested: finishing after the current task (Ctrl+C again to force).");
    if (!currentTicketId) process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const deadline = config.runForMs ? Date.now() + config.runForMs : null;
  if (deadline) console.log(`Automatic stop scheduled at ${new Date(deadline).toLocaleString("en-GB")}`);

  while (!stopping) {
    if (deadline && Date.now() >= deadline) {
      console.log("Time is up: stopping the worker.");
      break;
    }
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
    await addEvent(db, ticket.id, "status", `Picked up by ${config.workerId}`).catch(() => undefined);
    await processTicket(ticket);
    currentTicketId = null;
    await heartbeat();
  }

  clearInterval(beat);
  clearInterval(follow);
  await heartbeat();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
