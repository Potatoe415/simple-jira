# DEBUGGING

How errors, logs, and tests are built so any bug can be located fast.

## Current state (as found on 2026-11-05)

The code does not follow the contract below yet. Gaps are in `docs/BACKLOG.md`.
- Errors: plain `throw new Error(message)` with free-text English messages (e.g. `delivery.ts`, `cleanup.ts`, `config.ts`). No error codes, no `trace_id`. The events route returns `{ error: "unauthorized" | "not found" }` JSON.
- Supabase errors are rethrown with a prefix (e.g. `previews: <message>` in `followup.ts`).
- Per-ticket log: `createLogger(ticketId, ticketNumber)` in `apps/worker/src/logger.ts` redacts and truncates each message, batches `ticket_events` rows (~1.5 s; kinds `status`, `agent`, `tool`, `verify`, `error`, `info`, `plan`, `message`, `comment`, `question`, `owner_comment`, `pr`, `check`, `browser`, optional `meta` jsonb) and prints `[#<number>] <kind> <message>` to the console. The ticket number is the de facto correlation id.
- The agent keeps a `## Journal` in the worktree `TASK.md`, mirrored as `comment` events.
- Worker process output (stdout and stderr) is appended to `logs/worker.log` by `scripts/start-worker.cmd`. Plain text, not JSON.
- Ticket failures are stored in `tickets.error`; the dashboard ticket page shows events and the error.
- Web: no logger; errors surface through Next.js defaults.
- Tests: none.

## Error contract

Every error raised by application code carries:
- `code`: stable identifier `E_<SCOPE>_<NNN>`, where scope is `COMMON` or a module name.
- `message`: safe for users, no internals.
- `detail`: developer diagnostic, logged only.
- `trace_id`: id of the request or job.
- `cause`: original error, when wrapping.

UI error states display `code` and `trace_id` so the user can copy them into a bug report.

## Error catalog

Codes are never reused or renumbered. Module codes are added when modules are created. No existing codes in the repository collide with these.

| Code | HTTP (if applicable) | Meaning | User message |
|---|---|---|---|
| E_COMMON_001 | 400 | Input validation failed | Some fields are invalid. |
| E_COMMON_002 | 401 | Not authenticated | Please sign in. |
| E_COMMON_003 | 403 | Not authorized for this resource | You do not have access. |
| E_COMMON_004 | 404 | Resource not found | Not found. |
| E_COMMON_005 | 409 | Conflict with current state | This was changed elsewhere. Reload and retry. |
| E_COMMON_006 | 429 | Rate limit exceeded | Too many attempts. Try again later. |
| E_COMMON_007 | 500 | Unexpected internal error | Something went wrong. |

## Logging

- One JSON object per line: `ts`, `level`, `msg`, `trace_id`, `module`, and `code` when relevant.
- A `trace_id` is created at every entry point (request, job, webhook), propagated through all calls, and returned in a response header.
- Levels: `error` (needs action), `warn` (unexpected, handled), `info` (business events), `debug` (off in production).
- Use the shared logger only. No ad-hoc console output in committed code.
- Never log secrets, tokens, passwords, or personal data.

## Bug workflow

1. Reproduce. Capture the error code, `trace_id`, and relevant log lines. Today: the ticket number, its events on the dashboard, `tickets.error`, and `logs/worker.log`.
2. Locate the module and boundary where behaviour diverges.
3. Write a failing test that reproduces the bug.
4. Fix the root cause, not the symptom.
5. Run the module tests, then `check`.
6. Remove temporary diagnostics.

## Tests

- Tests live inside each module. Each module has a command that runs only its tests.
- Every bug fix adds a regression test.
- Security rules (authorization, row-level policies, validation) have explicit tests.
- `check` must pass before a task is declared done.
