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
  runnerTimeoutMs: number("RUNNER_TIMEOUT_MIN", 180) * 60_000,
  commandTimeoutMs: number("COMMAND_TIMEOUT_MIN", 15) * 60_000,
  maxVerifyAttempts: number("MAX_VERIFY_ATTEMPTS", 2),
  pollIntervalMs: number("POLL_INTERVAL_SEC", 300) * 1000,
};

// Worker secrets never reach the agent or the project's own scripts.
const STRIPPED_ENV = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "GH_TOKEN", "GITHUB_TOKEN"];

export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  return env;
}
