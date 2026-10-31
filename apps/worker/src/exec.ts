import { spawn, spawnSync } from "node:child_process";
import { childEnv } from "./config";

const MAX_CAPTURE = 200_000;

export interface RunOptions {
  cwd: string;
  shell?: boolean;
  claudeAuth?: boolean;
  input?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdoutLine?: (line: string) => void;
}

export interface RunResult {
  code: number | null;
  output: string;
  stdout: string;
  timedOut: boolean;
  aborted: boolean;
}

function keepTail(buffer: string, chunk: string): string {
  const next = buffer + chunk;
  return next.length > MAX_CAPTURE ? next.slice(-MAX_CAPTURE) : next;
}

function killTree(pid: number) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      process.kill(pid, "SIGKILL");
    }
  }
}

export function run(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: childEnv(options.claudeAuth ?? false),
      shell: options.shell ?? false,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let output = "";
    let pending = "";
    let timedOut = false;
    let aborted = false;

    const stop = () => {
      if (child.pid && child.exitCode === null) killTree(child.pid);
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stop();
        }, options.timeoutMs)
      : null;
    const onAbort = () => {
      aborted = true;
      stop();
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = keepTail(stdout, chunk);
      output = keepTail(output, chunk);
      if (!options.onStdoutLine) return;
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) options.onStdoutLine(line);
    });
    child.stderr.on("data", (chunk: string) => {
      output = keepTail(output, chunk);
    });

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(new Error(`Cannot start "${command}": ${error.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (pending.trim() && options.onStdoutLine) options.onStdoutLine(pending);
      resolvePromise({ code, output, stdout, timedOut, aborted });
    });

    child.stdin.on("error", () => {});
    child.stdin.end(options.input ?? "");
  });
}

export async function runChecked(command: string, args: string[], options: RunOptions): Promise<string> {
  const result = await run(command, args, options);
  if (result.aborted) throw new Error("Aborted");
  if (result.timedOut) throw new Error(`${command} ${args.join(" ")}: timeout`);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.code}): ${result.output.trim().slice(-2000)}`);
  }
  return result.stdout.trim();
}

export const git = (args: string[], cwd: string, signal?: AbortSignal) =>
  runChecked("git", args, { cwd, signal, timeoutMs: 10 * 60_000 });

export const gh = (args: string[], cwd: string, signal?: AbortSignal) =>
  runChecked("gh", args, { cwd, signal, timeoutMs: 5 * 60_000 });
