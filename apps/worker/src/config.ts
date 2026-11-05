import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";

const envFile = resolve(import.meta.dirname, "../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see apps/worker/.env.example)`);
  return value;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid number for ${name}: ${raw}`);
  return value;
}

const projectsRoot = process.env.PROJECTS_ROOT ?? resolve(import.meta.dirname, "../../../..");

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  workerId: process.env.WORKER_ID ?? hostname(),
  projectsRoot,
  githubOwner: process.env.GITHUB_OWNER || null,
  runnerScript: process.env.RUNNER_SCRIPT ?? join(projectsRoot, "autoclick", "run_headless.ps1"),
  runnerEngine: process.env.RUNNER_ENGINE ?? "claude",
  // "node": the worker drives Claude Code itself with stream-json (live journal). "script": run_headless.ps1.
  runnerMode: process.env.RUNNER_MODE === "script" ? "script" : "node",
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  runnerTimeoutMs: number("RUNNER_TIMEOUT_MIN", 180) * 60_000,
  commandTimeoutMs: number("COMMAND_TIMEOUT_MIN", 15) * 60_000,
  maxVerifyAttempts: number("MAX_VERIFY_ATTEMPTS", 2),
  pollIntervalMs: number("POLL_INTERVAL_SEC", 300) * 1000,
  dashboardUrl: (process.env.DASHBOARD_URL ?? "").replace(/\/+$/, ""),
  notifyUrl: process.env.NOTIFY_URL || null,
  browserCheck: process.env.BROWSER_CHECK !== "0",
  browserChannel: process.env.BROWSER_CHANNEL ?? "msedge",
  screensDir: process.env.SCREENS_DIR ?? join(projectsRoot, ".simple-jira", "screens"),
  runForMs: process.env.RUN_FOR_HOURS ? number("RUN_FOR_HOURS", 12) * 3_600_000 : null,
};

// Worker secrets never reach the agent or the project's own scripts.
const STRIPPED_ENV = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "GH_TOKEN", "GITHUB_TOKEN", "NOTIFY_URL"];

export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  return env;
}
