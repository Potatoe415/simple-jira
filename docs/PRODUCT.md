# PRODUCT

Agents propose changes; the user confirms before any edit.

Name: simple-jira
Objective: A personal ticket queue: requests dictated to a Claude app become tickets that a local worker executes unattended with Claude Code and delivers as pull requests with a preview.
Problem: Turning loose, often spoken requests into finished, reviewable changes across the owner's projects without supervising each agent run. (inferred — confirm)
User-facing language: English (dashboard, MCP tool messages, worker messages, ticket fields). The capture assistant writes tickets in English.

## Target users
One owner. Dashboard access is limited to the single account in `OWNER_EMAIL`.

## User roles
- Owner: signs in to the dashboard; creates, cancels, retries, prioritises, and merges tickets; answers agent questions; manages projects.
- Capture assistant (Claude app via the MCP connector): creates and follows tickets on the owner's behalf. Guide: `docs/claude-app-context.md`.
- Worker (owner's PC): claims queued tickets, runs the agent, verifies, ships, and opens a PR.

## Core features
- Project registry: slug, aliases, local path, repo, default branch, setup/verify/ship commands, env files, agent instructions.
- Tickets of type `fix`, `feature`, `new_project`, with goal, steps, slug, priority 1–3, and auto-merge.
- Queue ordered by priority, then age. A running ticket is not interrupted.
- Unattended execution in an isolated worktree on branch `feat/<slug>` or `fix/<slug>`, with verify retries.
- Blocking questions from agents, answered from the dashboard or MCP; the ticket requeues once all are answered.
- Delivery as a pull request with a preview link; merge from the dashboard or MCP, or automatically when "direct en prod" was requested.
- Live agent journal per ticket (timeline polled every few seconds); worker heartbeat and online status.
- Owner comments on a running ticket, read by the agent before its next pass (dashboard or MCP `comment_ticket`).
- Project memory: learnings saved per project when a ticket is delivered.
- Model and effort per ticket (project defaults) and dependencies (`blocked_by`).
- Project > task > sub-task: a task with sub-tasks is a container, run through its sub-tasks; its status and a done/total counter follow them (decision 0003).
- Browser check of the preview with screenshots, posted on the PR.
- Notifications (ntfy-style URL): PR ready, question, failure, merge.
- Dashboard side panel and ticket filters.

## Out of scope
Not defined yet.

## Success criteria
Not defined yet.

## Constraints
- The worker runs on the owner's Windows PC (scheduled task at logon). (inferred — confirm)
- Agents cannot ask questions mid-run without blocking the ticket; ambiguities must be resolved at capture time.
