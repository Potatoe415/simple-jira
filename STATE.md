# STATE

Replace on every update. Max 40 lines. History lives in git and `docs/decisions/`.

Status: Aligned with bootstrap v10.1 on 2026-11-05 (branch `chore/align-bootstrap-v10-1`).
Focus: Delete button on ticket rows (uncommitted on `main`). Jira-like look shipped in 005c6d3.
Level: L1

Context:
- Working_On: `packages/core/src/ops.ts` (`deleteTicket`), `apps/web/src/app/actions.ts` (`deleteTicketAction`), `apps/web/src/components/delete-ticket-button.tsx`, `components/ticket-row.tsx`
- Rules: only finished tickets (FINAL_STATUSES) can be deleted; refused while an active ticket depends on it; events and questions cascade; worktree and branch are not touched
- Relevant_Decisions: 0001

Next:
- Visual check in the browser (`pnpm dev`), then commit the delete button.
- User confirms or corrects every `(inferred — confirm)` marker.
- Extend `pnpm check` with lint, tests, and dependency audit (BACKLOG).
- Decide the target structure: keep `apps/*` + `packages/core`, or move to `src/modules/` (BACKLOG).

Open_Questions:
- Is the web app deployed to Vercel from `main` automatically?
- Rollback procedure for the web app and the database?
- Target users beyond the single owner? (Today: one owner account.)

Blockers:
- `.claude/settings.json` (deny reads of `.env*`, keys, secrets) not created: blocked by the agent autonomy hook. The user creates it by hand from bootstrap v10.1 section 4.1.
