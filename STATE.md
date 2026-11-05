# STATE

Replace on every update. Max 40 lines. History lives in git and `docs/decisions/`.

Status: Aligned with bootstrap v10.1 on 2026-11-05 (branch `chore/align-bootstrap-v10-1`).
Focus: Review the aligned docs; confirm inferred content.
Level: L2

Context:
- Working_On: `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_MODEL.md`, `docs/RUNBOOK.md`
- Relevant_Files: `package.json`, `supabase/migrations/`, `docs/claude-app-context.md`
- Do_Not_Touch: application code (alignment is docs-only)
- Relevant_Decisions: 0001

Next:
- User confirms or corrects every `(inferred — confirm)` marker.
- Extend `pnpm check` with lint, tests, and dependency audit (BACKLOG).
- Decide the target structure: keep `apps/*` + `packages/core`, or move to `src/modules/` (BACKLOG).

Open_Questions:
- Is the web app deployed to Vercel from `main` automatically?
- Rollback procedure for the web app and the database?
- Target users beyond the single owner? (Today: one owner account.)

Blockers:
- `.claude/settings.json` (deny reads of `.env*`, keys, secrets) not created: blocked by the agent autonomy hook. The user creates it by hand from bootstrap v10.1 section 4.1.
