# Agent visibility: setup

Live journal, owner comments, project memory, model/effort per ticket, sub-tickets and dependencies,
browser check of the preview, notifications, dashboard side panel and filters.

Everything degrades gracefully: before the migration the dashboard and the worker keep working,
the new event kinds are stored under the old ones, new ticket fields are ignored (with a note on the ticket),
and comments/memory say the migration is missing.

## 1. Apply the migration

Paste `supabase/migrations/20261105090000_agent_visibility.sql` in the Supabase SQL editor and run it.
It is idempotent (safe to run twice) and additive:

- `ticket_events`: new `meta jsonb` column, new kinds (`plan`, `message`, `comment`, `question`,
  `owner_comment`, `pr`, `check`, `browser`), index on `(ticket_id, created_at)`.
- `project_memory` table (RLS on, no policy, service role only).
- `tickets`: `model`, `effort`, `parent_id`, `blocked_by`, `check_paths`, `comment_cursor`.
- `projects`: `default_model`, `default_effort`, `notify_url`, `browser_check` (default on).
- `claim_next_ticket()`: same priority then age order and `FOR UPDATE SKIP LOCKED`, and skips tickets whose
  `blocked_by` tickets are not `delivered` or `merged`.
- Private Storage bucket `ticket-screens` (if `storage.buckets` insert is refused, create it by hand:
  Storage > New bucket > `ticket-screens`, not public).

## 2. Worker

```
pnpm install            # adds playwright-core to apps/worker (no browser download)
```

New optional env vars in `apps/worker/.env` (see `.env.example`):

| Var | Default | Use |
| --- | --- | --- |
| `RUNNER_MODE` | `node` | `node`: the worker runs `claude -p --output-format stream-json --verbose` itself (live journal). `script`: old `run_headless.ps1` path. |
| `CLAUDE_BIN` | `claude` | Claude Code binary. |
| `DASHBOARD_URL` | empty | Links to the ticket in PRs and notifications. |
| `NOTIFY_URL` | empty | ntfy-style topic URL. PR ready, question, failure, merge. A project's `notify_url` overrides it. |
| `BROWSER_CHECK` | `1` | `0` disables the preview browser check everywhere (per project: checkbox on the Projects page). |
| `BROWSER_CHANNEL` | `msedge` | Installed browser used by Playwright (`msedge` or `chrome`). |
| `SCREENS_DIR` | `<projects root>/.simple-jira/screens` | Local copy of the screenshots, outside any repo. |

## 3. How the agent talks

- `TASK.md` now has `## Journal` (dated `understanding` / `plan` / `pitfall` / `done` lines, mirrored live
  as `comment` events) and `## Learnings` (saved to the project memory when the ticket is delivered).
- Owner comments (ticket page or MCP `comment_ticket`) are appended under Notes as `Owner comment` before the
  next Claude Code pass. A comment that arrives after `STATUS: DONE` reopens the task with one extra step.
- The PR description is generated from the request, the Journal, the Notes and the Learnings.
  The browser-check result and screenshot links are posted as a PR comment once the preview is deployed.

## 4. To check by hand after deploying

- Apply the migration, then create a ticket with a model, an effort and a dependency.
- Set `NOTIFY_URL` (and subscribe to the topic) to receive notifications.
- Check that the `ticket-screens` bucket exists and is private.
- Watch one ticket run: timeline updates every 2-3 s, tool lines collapse, comment box works.
