import { config } from "./config";
import { run, type RunResult } from "./exec";
import type { TicketLogger } from "./logger";

const RUNNER_LINE = /^\d{2}:\d{2}:\d{2} /;

function psQuote(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

// Runs autoclick/run_headless.ps1 until TASK.md says DONE/BLOCKED, stalls, or fails.
export function runRunner(worktree: string, log: TicketLogger, signal: AbortSignal): Promise<RunResult> {
  const command = [
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    `& ${psQuote(config.runnerScript)} -Workspace ${psQuote(worktree)} -Engine ${psQuote(config.runnerEngine)}`,
    "exit $LASTEXITCODE",
  ].join("; ");

  return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: worktree,
    timeoutMs: config.runnerTimeoutMs,
    signal,
    onStdoutLine: (line) => {
      const text = line.trimEnd();
      if (!text) return;
      if (RUNNER_LINE.test(text)) log.info(text.slice(0, 4000));
      else log.agent(text.slice(0, 4000));
    },
  });
}
