# STATE

Replace on every update. Max 40 lines. History lives in git and `docs/decisions/`.

Status: Aligned with bootstrap v10.1 on 2026-11-05 (branch `chore/align-bootstrap-v10-1`).
Focus: Light, Jira-like look and feel for the web app (uncommitted on `main`). Previous focus (review aligned docs) still open.
Level: L0

Context:
- Working_On: `apps/web/src/app/globals.css` (design tokens), `components/header.tsx` (top bar, now in dashboard layout), `components/side-panel.tsx`, `components/status-badge.tsx` (lozenges, type/priority icons, project labels), `components/ticket-row.tsx`, `app/(dashboard)/page.tsx` (sprint-style panels)
- Relevant_Files: all `apps/web/src/components/*.tsx`
- Do_Not_Touch: data, actions, API routes
- Relevant_Decisions: 0001

Next:
- Visual check in the browser (`pnpm dev`), then commit.
- User confirms or corrects every `(inferred — confirm)` marker.
- Extend `pnpm check` with lint, tests, and dependency audit (BACKLOG).
- Decide the target structure: keep `apps/*` + `packages/core`, or move to `src/modules/` (BACKLOG).

Open_Questions:
- Is the web app deployed to Vercel from `main` automatically?
- Rollback procedure for the web app and the database?
- Target users beyond the single owner? (Today: one owner account.)

Blockers:
- `.claude/settings.json` (deny reads of `.env*`, keys, secrets) not created: blocked by the agent autonomy hook. The user creates it by hand from bootstrap v10.1 section 4.1.
