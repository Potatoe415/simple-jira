# 0002 — Ideas as a ticket status

Date: 2026-11-05
Status: Accepted
Decision: An idea is a row in `public.tickets` with `status = 'idea'`; `startIdea` moves it to `queued`.
Context: The owner wants to note ideas from the phone without them being developed, and look at them later.
Rationale: The worker only claims `queued` tickets (`claim_next_ticket`), so a new status keeps ideas out of the pipeline with no worker change. Ideas reuse the ticket fields, list, delete and MCP tools, and starting one keeps its number and history.
Consequences: `tickets_status_check` includes `idea` (migration `20261105150000_ideas.sql`). Ideas count in neither ACTIVE_STATUSES nor FINAL_STATUSES. Ideas can be deleted like finished tickets.
Alternatives_Rejected: A separate `ideas` table (a second owner, a copy step on start, duplicated UI and MCP tools). Creating then cancelling a ticket (the worker may start it first, and ideas mix with real cancellations).
