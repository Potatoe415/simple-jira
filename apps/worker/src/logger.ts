import { addEvents, STATUS_LABELS, type EventKind, type NewEvent, type TicketStatus } from "@simple-jira/core";
import { db } from "./db";
import { redact, truncate } from "./redact";

export interface TicketLogger {
  status(message: string): void;
  agent(message: string): void;
  tool(message: string): void;
  verify(message: string): void;
  error(message: string): void;
  info(message: string): void;
  // Live journal line (agent text, tool call, check result...): redacted and capped at ~2000 chars.
  event(kind: EventKind, message: string, meta?: Record<string, unknown>): void;
  // Status transition, recorded as a `status` event the timeline and notifications can rely on.
  transition(status: TicketStatus, detail?: string): void;
  flush(): Promise<void>;
}

const BATCH_MS = 1500;

export function createLogger(ticketId: string, ticketNumber: number): TicketLogger {
  let chain = Promise.resolve();
  let buffer: NewEvent[] = [];
  let timer: NodeJS.Timeout | null = null;

  const send = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const batch = buffer;
    buffer = [];
    if (!batch.length) return;
    chain = chain
      .then(() => addEvents(db, batch))
      .catch((error: unknown) => console.error(`[#${ticketNumber}] event log failed`, (error as Error).message));
  };

  const push = (kind: EventKind, raw: string, meta?: Record<string, unknown>, max = 20000) => {
    const message = truncate(redact(raw), max);
    const preview = message.length > 300 ? `${message.slice(0, 300)}…` : message;
    console.log(`[#${ticketNumber}] ${kind.padEnd(6)} ${preview}`);
    buffer.push({ ticket_id: ticketId, kind, message, meta: meta ?? null });
    if (!timer) timer = setTimeout(send, BATCH_MS);
  };

  return {
    status: (message) => push("status", message),
    agent: (message) => push("agent", message),
    tool: (message) => push("tool", message),
    verify: (message) => push("verify", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
    event: (kind, message, meta) => push(kind, message, meta, 2000),
    transition: (status, detail) =>
      push("status", `→ ${STATUS_LABELS[status]}${detail ? ` : ${detail}` : ""}`, { status }),
    flush: () => {
      send();
      return chain;
    },
  };
}
