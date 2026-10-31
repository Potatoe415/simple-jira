import { addEvent, type EventKind } from "@simple-jira/core";
import { db } from "./db";

export interface TicketLogger {
  status(message: string): void;
  agent(message: string): void;
  tool(message: string): void;
  verify(message: string): void;
  error(message: string): void;
  info(message: string): void;
  flush(): Promise<void>;
}

export function createLogger(ticketId: string, ticketNumber: number): TicketLogger {
  let chain = Promise.resolve();

  const push = (kind: EventKind, message: string) => {
    const preview = message.length > 300 ? `${message.slice(0, 300)}…` : message;
    console.log(`[#${ticketNumber}] ${kind.padEnd(6)} ${preview}`);
    chain = chain
      .then(() => addEvent(db, ticketId, kind, message))
      .catch((error: unknown) => console.error(`[#${ticketNumber}] event log failed`, error));
  };

  return {
    status: (message) => push("status", message),
    agent: (message) => push("agent", message),
    tool: (message) => push("tool", message),
    verify: (message) => push("verify", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
    flush: () => chain,
  };
}
