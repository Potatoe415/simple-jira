# DATA MODEL

Index of persisted data. Field details live in each module's `DATA.md`; schema files are the executable source of truth.
No module `DATA.md` exists yet: read the migrations for fields.

Schema location: `supabase/migrations/` (apply in filename order)

## Entities

| Entity | Owner module | Storage | Personal data |
|---|---|---|---|
| Project | `packages/core` (inferred — confirm) | `public.projects` | No (contains local paths) |
| Ticket | `packages/core` (inferred — confirm) | `public.tickets` | Possibly, in free-text `title` / `description` |
| Question | `packages/core` (inferred — confirm) | `public.questions` | Possibly, in free-text answers |
| TicketEvent | `packages/core` (inferred — confirm) | `public.ticket_events` | Possibly, in agent output |
| ProjectMemory | `packages/core` (inferred — confirm) | `public.project_memory` | No |
| Screenshot | `apps/worker` (inferred — confirm) | Storage bucket `ticket-screens` (private) | Possibly, in captured pages |
| WorkerStatus | `packages/core` (inferred — confirm) | `public.worker_status` | No (hostname) |

Auth users live in Supabase Auth (`auth.users`); the app only compares the session email with `OWNER_EMAIL`.

## Cross-module references

- `tickets.project_id` references `projects.id` (`on delete restrict`). Required unless `type = 'new_project'`, which uses `tickets.new_project` (jsonb) instead.
- `questions.ticket_id` and `ticket_events.ticket_id` reference `tickets.id` (`on delete cascade`).
- `tickets.parent_id` references `tickets.id` (`on delete set null`); `tickets.blocked_by` is a `uuid[]` of ticket ids (no foreign key).
- `project_memory.project_id` references `projects.id` (`on delete cascade`); unique on `(project_id, key)`.
- `worker_status.current_ticket_id` references `tickets.id` (`on delete set null`).
- Today the worker also writes `tickets`, `questions`, and `worker_status` directly (see `docs/ARCHITECTURE.md`, boundary problems).

## Functions

- `claim_next_ticket()`: atomically moves the next `queued` ticket (by `priority`, then `created_at`) to `running`, skipping tickets whose `blocked_by` tickets are not `delivered` or `merged`.
- `answer_question(p_question_id, p_answer)`: records an answer, logs an event, requeues the ticket when no question is left open.

## Access model

Roles: `service_role` only (server code with the secret key). `anon` and `authenticated` have no grants; RLS on, no policies.
Default: deny.
