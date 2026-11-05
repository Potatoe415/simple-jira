# ARCHITECTURE

Agents propose changes; the user confirms before any edit.
Every stack choice also gets a decision in `docs/decisions/`.

## Stack

Recorded from the repository as found on 2026-11-05. No decision files exist for these choices yet.

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Backend | Next.js server actions and route handlers (`apps/web`); MCP server via `mcp-handler` + `@modelcontextprotocol/server` at `/api/mcp/<token>`; Node worker (`apps/worker`) run with `tsx` |
| Database | Supabase Postgres; schema in `supabase/migrations/` |
| Runtime | Node.js >= 22, TypeScript 5.9 (strict) |
| Package manager | pnpm 10 workspace (`apps/*`, `packages/*`) |
| Hosting | Web: Vercel (inferred from `.vercel/` — confirm). Worker: owner's Windows PC as a scheduled task (`scripts/install-worker-task.ps1`) |
| Authentication | Supabase Auth (`@supabase/ssr`), restricted to `OWNER_EMAIL`. MCP: secret path token `MCP_TOKEN`, compared in constant time |
| Validation library | zod 4 |
| Logger | None shared. Worker: `createLogger` in `apps/worker/src/logger.ts` (console + batched, redacted `ticket_events` rows) |
| Testing | None |

External tools used by the worker: `git`, GitHub CLI `gh` (PRs, merges, preview comments), Claude Code (`RUNNER_MODE=node` runs `CLAUDE_BIN` with stream-json; `script` uses `RUNNER_SCRIPT`), an installed Edge or Chrome driven by `playwright-core` for the browser check, and an ntfy-style `NOTIFY_URL`. Screenshots go to the private Supabase Storage bucket `ticket-screens`. Details: `docs/agent-visibility.md`.

## Style: modular monolith

One deployable, split into modules (bounded contexts) under `src/modules/<name>/`.
Goal: any module can be understood and changed by reading only its `AGENTS.md`, its `DATA.md`, its code, and the public entries of the modules it depends on.

Current state: the code predates this rule. It is a pnpm workspace with two apps and one shared package, described below as-is. Migration steps are in `docs/BACKLOG.md`.

## Module map

| Module | Purpose | Owns data | May depend on |
|---|---|---|---|
| `packages/core` (`@simple-jira/core`) | Types, zod schemas, labels, and data operations on Supabase. Public entry `src/index.ts` | Intended owner of all tables (inferred — confirm) | `@supabase/supabase-js`, `zod` |
| `apps/web` (`@simple-jira/web`) | Owner dashboard under `src/app/(dashboard)/` (tickets, projects, questions, side panel), live events route `api/tickets/[number]/events`, and MCP endpoint | None directly; goes through `core` | `core` |
| `apps/worker` (`@simple-jira/worker`) | Polls the queue, runs the agent in a worktree, verifies, ships, opens PRs, browser-checks previews, notifies, handles merges | None directly (intended) | `core` |

Rules:
- Dependencies flow only in the directions listed above. No cycles.
- `src/shared/` is domain-free: utilities, logger, error type, validation helpers, config loader.
- A new module needs a row here, plus `AGENTS.md` and `DATA.md` from `docs/_templates/`.

Boundary problems observed while sampling (not a full scan):
- `apps/worker` writes and reads tables directly instead of through `core`: `tickets` in `index.ts` and `followup.ts`, `questions` in `pipeline.ts`, `worker_status` upsert and `claim_next_ticket` RPC in `index.ts`.
- `apps/web/src/proxy.ts` duplicates the owner-email check of `apps/web/src/lib/auth.ts`; the events route repeats the session check inline.
- Web reads `process.env` in several files (`lib/supabase/*`, `lib/auth.ts`, `proxy.ts`, MCP route) instead of one validated config object. The worker already centralises it in `apps/worker/src/config.ts`, except `exec.ts`.
- Over the ~300-line guideline: `apps/web/src/app/api/mcp/[token]/route.ts` (450), `packages/core/src/ops.ts` (514), `apps/web/src/app/(dashboard)/tickets/[number]/page.tsx` (301).

## Conventions

- Naming: kebab-case file names; camelCase functions; snake_case database columns. (inferred — confirm)
- Formatting and linting: Not defined yet (no linter or formatter configured).
- Tests: colocated inside each module.
- Configuration: read from the environment once at startup, validated, exposed as one typed object. No direct environment access elsewhere.
- Env files: `apps/web/.env.local` and `apps/worker/.env`, documented by their `.env.example`.
