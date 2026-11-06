# STATE

Replace on every update. Max 40 lines. History lives in git and `docs/decisions/`.

Status: Aligned with bootstrap v10.1 on 2026-11-05.
Focus: Project > task > sub-task (decision 0003): a task with sub-tasks is a container, never run by the worker; its status rolls up from its sub-tasks; the dashboard nests sub-tasks under their task with a done/total counter. Changes are committed and pushed to `main` automatically (test env).
Level: L2

Context:
- Working_On: `supabase/migrations/20261106100000_task_hierarchy.sql`, `packages/core/src/ops.ts` (`checkParent`, `listSubtasks`, `subtaskProgress`, cascades), dashboard page / row / ticket page, MCP route, `docs/claude-app-context.md`
- Relevant_Decisions: 0002, 0003

Next:
- Owner applies `supabase/migrations/20261106100000_task_hierarchy.sql` in the Supabase SQL editor (after `20261105150000_ideas.sql` if not done). Until then a parent is still claimed and run like before.
- Then check on the app: create a task + 2 sub-tasks, see only the sub-tasks picked up, the task status follow them, and the 0/2 → 2/2 counter.
- Re-upload `docs/claude-app-context.md` to the Claude app so the capture assistant knows the split rules.
- Restart the worker so the post-merge cleanup runs; watch the next merged ticket's log for "Cleaned up".
- User confirms or corrects every `(inferred — confirm)` marker.
- Extend `pnpm check` with lint, tests, and dependency audit (BACKLOG).
- Decide the target structure: keep `apps/*` + `packages/core`, or move to `src/modules/` (BACKLOG).

Open_Questions:
- Is the web app deployed to Vercel from `main` automatically?
- Rollback procedure for the web app and the database?
- Target users beyond the single owner? (Today: one owner account.)

Blockers:
- `.claude/settings.json` (deny reads of `.env*`, keys, secrets) not created: blocked by the agent autonomy hook. The user creates it by hand from bootstrap v10.1 section 4.1.
