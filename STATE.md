# STATE

Replace on every update. Max 40 lines. History lives in git and `docs/decisions/`.

Status: Aligned with bootstrap v10.1 on 2026-11-05 (branch `chore/align-bootstrap-v10-1`).
Focus: Agent questions moved from the dashboard block to a bell in the top bar (count badge + dropdown with answer forms). Changes are committed and pushed to `main` automatically (test env).
Level: L1

Context:
- Working_On: `apps/web/src/components/alerts-menu.tsx`, `components/header.tsx`, `app/(dashboard)/layout.tsx` (loads open questions), `app/(dashboard)/page.tsx`
- Recent: straight to prod by default + post-merge cleanup (2166a2a), Context download link (9fbbcea), ticket deletion (7c6d134, 9ed22ac)
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
