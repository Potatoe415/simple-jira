# STATE

Replace on every update. Max 40 lines. History lives in git and `docs/decisions/`.

Status: Aligned with bootstrap v10.1 on 2026-11-05 (branch `chore/align-bootstrap-v10-1`).
Focus: Straight to prod by default (MCP `auto_merge` default true, web checkbox checked) and post-merge cleanup of the worktree and local branch by the worker. Changes are committed and pushed to `main` automatically (test env).
Level: L1

Context:
- Working_On: `apps/worker/src/followup.ts` (`cleanupMerged`), `apps/web/src/app/api/mcp/[token]/route.ts`, `docs/claude-app-context.md`, `apps/web/src/components/ticket-form.tsx`
- Core `createTicketSchema` still defaults `auto_merge` to false; both entry points pass it explicitly
- Recent: Context download link (9fbbcea), ticket deletion (7c6d134, 9ed22ac)
- Relevant_Decisions: 0001

Next:
- Restart the worker so the post-merge cleanup runs; watch the next merged ticket's log for "Cleaned up".
- Check on the deployed app that the Context link downloads the file (Vercel file tracing), and the delete button in the browser.
- User confirms or corrects every `(inferred — confirm)` marker.
- Extend `pnpm check` with lint, tests, and dependency audit (BACKLOG).
- Decide the target structure: keep `apps/*` + `packages/core`, or move to `src/modules/` (BACKLOG).

Open_Questions:
- Is the web app deployed to Vercel from `main` automatically?
- Rollback procedure for the web app and the database?
- Target users beyond the single owner? (Today: one owner account.)

Blockers:
- `.claude/settings.json` (deny reads of `.env*`, keys, secrets) not created: blocked by the agent autonomy hook. The user creates it by hand from bootstrap v10.1 section 4.1.
