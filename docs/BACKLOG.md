# BACKLOG

Current work only. Completed work lives in git history.

## Now
- [ ] Review the bootstrap v10.1 alignment; confirm every `(inferred — confirm)` marker.
- [ ] Decide the fate of the stashed worker changes (`git stash list`: "worker changes before bootstrap align").

## Next
- [ ] Extend `pnpm check` to typecheck + lint + tests + dependency audit (today: typecheck + web build only). Requires choosing a linter and test runner (L2).
- [ ] Add a per-package test command and fill "Test one module" in `AGENTS.md`.
- [ ] Add secret scanning (pre-commit and CI) and dependency audit in `check`. No CI exists yet.
- [ ] Add the shared logger, error type, and `trace_id` propagation from `docs/DEBUGGING.md`; decide how they relate to `ticket_events` and the ticket number.
- [ ] Add authorization tests for dashboard actions (`requireOwner`) and the MCP token check.
- [ ] Rate-limit login and the MCP endpoint.
- [ ] Web: read env once into a validated config object (today `process.env` in `lib/supabase/*`, `lib/auth.ts`, `proxy.ts`, MCP route).
- [ ] Deduplicate the owner check between `apps/web/src/proxy.ts`, `apps/web/src/lib/auth.ts`, and the events route.
- [ ] Split files over ~300 lines: `apps/web/src/app/api/mcp/[token]/route.ts` (450), `packages/core/src/ops.ts` (514).
- [ ] Record decision files for the existing stack choices (Next.js, Supabase, Vercel, pnpm, zod, worker on the owner's PC, `playwright-core`, ntfy notifications).
- [ ] Decide the target structure: keep `apps/*` + `packages/core` as modules, or migrate to `src/modules/`. Then migrate one module per step:
  - [ ] Step 1: route worker table access through `@simple-jira/core` (`tickets` in `index.ts`, `followup.ts`; `questions` in `pipeline.ts`; `worker_status` and `claim_next_ticket` in `index.ts`).
  - [ ] Step 2: add `AGENTS.md` and `DATA.md` for `packages/core` (owner of all tables).
  - [ ] Step 3: add `AGENTS.md` for `apps/worker`.
  - [ ] Step 4: add `AGENTS.md` for `apps/web`.
- [ ] Reduce `docs/DATA_MODEL.md` to the entity index format once module `DATA.md` files exist.
- [ ] Define the first testable milestone.

## Blocked
- None.
