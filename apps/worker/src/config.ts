import { existsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";

const envFile = resolve(import.meta.dirname, "../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see apps/worker/.env.example)`);
  return value;
}

function minutes(name: string, fallback: number): number {
  return number(name, fallback) * 60_000;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid number for ${name}: ${raw}`);
  return value;
}

function list(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const DEFAULT_ALLOWED_TOOLS = [
  "Read",
  "Edit",
  "MultiEdit",
  "Write",
  "Glob",
  "Grep",
  "LS",
  "TodoWrite",
  "WebSearch",
  "WebFetch",
  "Bash(npm *)",
  "Bash(npx *)",
  "Bash(pnpm *)",
  "Bash(node *)",
  "Bash(git status*)",
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(git show*)",
  "Bash(ls*)",
  "Bash(mkdir *)",
];

const DEFAULT_DISALLOWED_TOOLS = [
  "Bash(git commit*)",
  "Bash(git push*)",
  "Bash(git checkout*)",
  "Bash(git switch*)",
  "Bash(git reset*)",
  "Bash(gh *)",
  "Bash(vercel *)",
  "Bash(powershell*)",
  "Bash(pwsh*)",
  "Read(**/.env*)",
];

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  workerId: process.env.WORKER_ID ?? hostname(),
  projectsRoot: process.env.PROJECTS_ROOT ?? resolve(import.meta.dirname, "../../../.."),
  worktreesRoot: process.env.WORKTREES_ROOT ?? join(homedir(), ".simple-jira", "wt"),
  githubOwner: process.env.GITHUB_OWNER || null,
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  claudeModel: process.env.CLAUDE_MODEL || null,
  claudeSettingSources: process.env.CLAUDE_SETTING_SOURCES ?? "project,local",
  claudePermissionMode: process.env.CLAUDE_PERMISSION_MODE ?? "acceptEdits",
  claudeAllowedTools: list("CLAUDE_ALLOWED_TOOLS", DEFAULT_ALLOWED_TOOLS),
  claudeDisallowedTools: list("CLAUDE_DISALLOWED_TOOLS", DEFAULT_DISALLOWED_TOOLS),
  agentTimeoutMs: minutes("AGENT_TIMEOUT_MIN", 40),
  commandTimeoutMs: minutes("COMMAND_TIMEOUT_MIN", 15),
  maxVerifyAttempts: number("MAX_VERIFY_ATTEMPTS", 3),
  pollIntervalMs: number("POLL_INTERVAL_SEC", 5) * 1000,
};

// Never leak worker secrets or the work AI gateway settings into agent or project processes.
const STRIPPED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "GH_TOKEN",
  "GITHUB_TOKEN",
];

const CLAUDE_AUTH_ENV = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

export function childEnv(withClaudeAuth: boolean): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  if (!withClaudeAuth) for (const key of CLAUDE_AUTH_ENV) delete env[key];
  return env;
}
