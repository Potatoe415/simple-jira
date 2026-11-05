import { existsSync } from "node:fs";
import type { TicketLogger } from "./logger";
import { journalLines, readTask } from "./task-file";

// Mirrors new `## Journal` lines of TASK.md into the ticket timeline as `comment` events.
export function watchJournal(task: string, log: TicketLogger, intervalMs = 2000) {
  const seen = new Set<string>(existsSync(task) ? journalLines(readTask(task)) : []);

  const scan = () => {
    if (!existsSync(task)) return;
    let lines: string[];
    try {
      lines = journalLines(readTask(task));
    } catch {
      return;
    }
    for (const line of lines) {
      if (seen.has(line)) continue;
      seen.add(line);
      const kind = line.match(/^(?:\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s+)?(\w+)\s*:/)?.[1]?.toLowerCase();
      log.event("comment", line, kind ? { journal: kind } : undefined);
    }
  };

  const timer = setInterval(scan, intervalMs);
  return {
    stop() {
      clearInterval(timer);
      scan();
    },
  };
}
