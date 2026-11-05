import type { Effort } from "@simple-jira/core";
import { config } from "./config";
import { run, type RunResult } from "./exec";
import type { TicketLogger } from "./logger";
import { createStreamParser } from "./stream-json";
import { readTask, TASK_PROMPT, taskState } from "./task-file";

const RUNNER_LINE = /^\d{2}:\d{2}:\d{2} /;

// Same limits as autoclick/run_headless.ps1.
const MAX_RUNS = 20;
const MAX_STALLED = 2;
const MAX_FAILURES = 3;

export interface RunnerOptions {
  worktree: string;
  task: string;
  model?: string | null;
  effort?: Effort | null;
  verifyCommands: string[];
  log: TicketLogger;
  signal: AbortSignal;
  // Called before every Claude Code pass (owner comments are copied into TASK.md there).
  beforePass?: () => Promise<void>;
}

export type RunnerResult = RunResult & { costUsd: number };

function psQuote(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

// Legacy path: autoclick/run_headless.ps1 with text output (cursor engine, or RUNNER_MODE=script).
async function runScript(options: RunnerOptions): Promise<RunnerResult> {
  const { worktree, log, signal } = options;
  const extra = [
    options.model ? `-Model ${psQuote(options.model)}` : "",
    options.effort ? `-Effort ${psQuote(options.effort)}` : "",
  ].join(" ");
  const command = [
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    `& ${psQuote(config.runnerScript)} -Workspace ${psQuote(worktree)} -Engine ${psQuote(config.runnerEngine)} ${extra}`,
    "exit $LASTEXITCODE",
  ].join("; ");

  await options.beforePass?.();
  const result = await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
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
  return { ...result, costUsd: 0 };
}

// Node port of run_headless.ps1 for Claude Code, with stream-json so every message and tool call reaches the journal.
async function runClaude(options: RunnerOptions): Promise<RunnerResult> {
  const { worktree, task, log, signal } = options;
  const deadline = Date.now() + config.runnerTimeoutMs;
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (options.model) args.push("--model", options.model);
  if (options.effort) args.push("--effort", options.effort);

  let output = "";
  let costUsd = 0;
  let stalled = 0;
  let failures = 0;
  let last: RunResult = { code: 0, output: "", stdout: "", timedOut: false, aborted: false };

  for (let pass = 1; pass <= MAX_RUNS; pass++) {
    if (signal.aborted) return { ...last, aborted: true, output, costUsd };
    const before = taskState(readTask(task));
    if (before.status) {
      log.info(`Stop: STATUS: ${before.status}`);
      break;
    }
    if (before.open === 0) {
      log.info("Stop: no open step left");
      break;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ...last, timedOut: true, output, costUsd };

    await options.beforePass?.();
    const text = readTask(task);
    log.info(`Pass ${pass}/${MAX_RUNS}: ${before.open} open step(s)`);
    const parser = createStreamParser({ worktree, verifyCommands: options.verifyCommands, log });
    last = await run(config.claudeBin, [...args, TASK_PROMPT], {
      cwd: worktree,
      timeoutMs: remaining,
      signal,
      onStdoutLine: (line) => parser.line(line),
    });
    costUsd += parser.summary.costUsd;
    output = `${output}${last.output}`.slice(-200_000);
    if (last.timedOut || last.aborted) return { ...last, output, costUsd };

    if (last.code !== 0) {
      failures += 1;
      log.error(`Claude Code exited with code ${last.code} (${failures}/${MAX_FAILURES})`);
      if (failures >= MAX_FAILURES) break;
      await sleep(30_000, signal);
      continue;
    }
    failures = 0;

    if (readTask(task) === text) {
      stalled += 1;
      log.info(`TASK.md unchanged after the pass (${stalled}/${MAX_STALLED})`);
      if (stalled >= MAX_STALLED) break;
    } else {
      stalled = 0;
    }
  }
  return { ...last, output, costUsd };
}

// Runs Claude Code until TASK.md says DONE/BLOCKED, stalls, or fails.
export function runRunner(options: RunnerOptions): Promise<RunnerResult> {
  return config.runnerEngine === "claude" && config.runnerMode === "node" ? runClaude(options) : runScript(options);
}
