# RUNBOOK

Detailed procedures. Everyday commands live in `AGENTS.md`.

## Setup
1. Node.js >= 22 and pnpm 10 (`packageManager: pnpm@10.33.0`).
2. `pnpm install`.
3. Copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/worker/.env.example` to `apps/worker/.env`; fill the values.
4. Create the owner account in Supabase > Authentication > Users, with the email set in `OWNER_EMAIL`.
5. Worker prerequisites: `git`, GitHub CLI `gh` authenticated, Claude Code on `PATH` (or `CLAUDE_BIN`), Edge or Chrome for the browser check. With `RUNNER_MODE=script`: the runner script at `RUNNER_SCRIPT`. (inferred — confirm)
6. Setup of the journal, memory, browser check, and notifications: `docs/agent-visibility.md`.

## Environment variables
See `.env.example`, `apps/web/.env.example`, and `apps/worker/.env.example`.
Generate `MCP_TOKEN` with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Migrations and seed
SQL files in `supabase/migrations/`, applied in filename order by pasting each into the Supabase SQL editor (per `docs/agent-visibility.md`). Recent migrations are idempotent. If the `ticket-screens` bucket insert is refused, create it by hand (Storage > New bucket, not public). No seed.

## Build
- `pnpm build` builds the web app.
- The worker runs from source with `tsx`; no build.

## Deploy
- Web: Vercel project `simple-jira` (`.vercel/`). Trigger (git push to `main` or CLI): Not defined yet. (inferred — confirm)
- Worker: register the Windows scheduled task once with `powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1`; start now with `Start-ScheduledTask -TaskName simple-jira-worker`. It runs `scripts/start-worker.cmd` at logon, which appends output to `logs/worker.log`.
- Remove the task: `powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1 -Remove`.

## Rollback
Not defined yet.

## Troubleshooting
- Worker logs: `logs/worker.log`; per-ticket events on the dashboard ticket page.
- Reset a ticket's worktree for a retry: `pnpm --filter @simple-jira/worker cleanup <ticket-number>` (the ticket must not be active; cancel it first).
