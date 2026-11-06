# 0003 — Project > task > sub-task, tasks with sub-tasks are containers

Date: 2026-11-06
Status: Accepted
Decision: A ticket with sub-tasks (`tickets.parent_id` pointing at it) is a container: the worker never claims it, and its status is rolled up from its sub-tasks by a database trigger. Two levels at most.
Context: The owner wants Jira-like Project > Task > Sub-task. `parent_id` already existed, but the worker also ran the parent, so the same work could be done twice (once in the parent, once in the sub-tasks).
Rationale: Keeping all the work in the sub-tasks gives one PR per sub-task and nothing to reconcile at the end. A trigger keeps the parent status right whoever writes a sub-task (worker, dashboard, MCP) with no worker change. Two levels cover the need and keep the UI and the rollup simple.
Consequences: Migration `20261106100000_task_hierarchy.sql` (`ticket_rollup_status`, two triggers, `claim_next_ticket` skips containers). Any direct status write on a container is overwritten by the rollup. Cancel, retry, start, priority and merge on a container act on its sub-tasks (`packages/core`). A sub-task cannot have sub-tasks; a task that is running, blocked or already has a PR cannot get sub-tasks. The dashboard lists tasks with their sub-tasks nested under them.
Alternatives_Rejected: Running the parent last as an integration pass (a second, large run over code already shipped by the sub-tasks; unclear what it should change). An unlimited tree (recursive rollup and UI for no real need). A separate `epics` table (second owner, duplicated tools).
