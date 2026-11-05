import { readFileSync, writeFileSync } from "node:fs";
import {
  TYPE_LABELS,
  type Project,
  type ProjectMemory,
  type Question,
  type Ticket,
  type TicketEvent,
} from "@simple-jira/core";

// The runner (autoclick/run_headless.ps1) and its stop hook read these exact markers.
const STATUS_RE = /^\s*STATUS:\s*(DONE|BLOCKED)\b(.*)$/im;
const OPEN_STEP_RE = /^\s*[-*]\s+\[ \]\s+(.+?)\s*$/gm;
const DONE_STEP_RE = /^\s*[-*]\s+\[x\]\s+/gim;

// Same prompt as autoclick/run_headless.ps1, so both runner paths behave alike.
export const TASK_PROMPT =
  "Work through TASK.md in this workspace. Take the next unchecked step, implement it, " +
  "verify it (tests or build), then tick it and move on to the following steps as far as you can. " +
  "Never ask questions: choose the sensible option and record the assumption under Notes in TASK.md. " +
  "When every step is done add the line 'STATUS: DONE'. If a human is needed add " +
  "'STATUS: BLOCKED: <what is needed>' and stop.";

export const JOURNAL_KINDS = ["understanding", "plan", "pitfall", "done"] as const;

export interface TaskState {
  status: "DONE" | "BLOCKED" | null;
  blockedReason: string | null;
  open: number;
  done: number;
}

function quote(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function shipStep(project: Project, branch: string) {
  const how = project.ship_command
    ? `run \`${project.ship_command}\` from the worktree root`
    : "commit with a Conventional Commits message, then run `git push origin HEAD`";
  return `Ship: ${how}. It must push the feature branch \`${branch}\`, never main.`;
}

export function conflictStep(files: string[], base: string): string {
  return `A merge of \`origin/${base}\` into this branch is in progress (started by simple-jira) and conflicts in: ${files.map((f) => `\`${f}\``).join(", ")}. Resolve every conflict keeping the intent of both sides, do not abort or redo the merge, and leave no conflict markers. The ship commit concludes the merge.`;
}

function memoryBlock(memory: ProjectMemory[]) {
  if (!memory.length) return "";
  const lines = memory.map((entry) => `- ${entry.key}: ${entry.body.replace(/\s*\n\s*/g, " ")}`);
  return `
## Project memory
Learnings kept from earlier tickets of this project. Trust them unless the code says otherwise.
${lines.join("\n")}
`;
}

export function renderTask(
  ticket: Ticket,
  project: Project,
  branch: string,
  override?: { goal: string; steps: string[] },
  memory: ProjectMemory[] = [],
): string {
  const taskSteps = override?.steps ?? ticket.steps;
  const steps = [
    "Read the project's agent instructions (AGENTS.md, CLAUDE.md, STATE.md) and any playbook they point to for this kind of task.",
    ...(taskSteps.length ? taskSteps : [`Implement the request below so that the goal is met.`]),
    ...(project.verify_commands.length
      ? [`Run ${project.verify_commands.map((c) => `\`${c}\``).join(" then ")} and fix every failure.`]
      : ["Run the project's build or tests and fix every failure."]),
    "Update the state and docs files the project's instructions require for this change.",
    shipStep(project, branch),
  ];

  const rules = [
    "Do not ask questions. Pick the sensible option and write the assumption under Notes.",
    `Never switch branch, merge, rebase, or push to main. Stay on \`${branch}\`.`,
    "No `npm install`. Never delete `node_modules`: it is a link to the main checkout.",
    "Stay in the task's scope. No new dependency.",
    "Do not claim a browser check that was not run. List under Notes what a human must check by hand.",
    "Tick each step ([x]) as soon as it is done and verified.",
    `Keep the owner informed under \`## Journal\`: one line \`- YYYY-MM-DD HH:MM <kind>: <one or two plain sentences>\` with kind ${JOURNAL_KINDS.map((k) => `\`${k}\``).join(", ")}. Write \`understanding\` after reading the request and code, \`plan\` before editing, \`pitfall\` when something surprising costs time, \`done\` with what changed and how it was verified. Never paste secrets or env values.`,
    "Under `## Learnings`, add durable facts a future agent on this project needs (build quirks, conventions, traps), one line `- <topic>: <fact>`. Only what stays true after this ticket; leave it empty otherwise.",
    "Lines starting with `Owner comment` under Notes come from the owner while you work: take them into account, and say in the Journal how.",
    "When every step is done, add the line `STATUS: DONE` at the bottom.",
    "If a human is needed (credentials, access, a product decision), add `STATUS: BLOCKED: <what is needed>` at the bottom and stop.",
  ];
  if (project.agent_instructions) rules.push(project.agent_instructions);

  return `# Task

Ticket #${ticket.number} (${TYPE_LABELS[ticket.type]}) from simple-jira: ${ticket.title}
Project: ${project.name} (${project.repo}), branch \`${branch}\`.

## Goal
${override?.goal ?? (ticket.goal?.trim() || ticket.title)}

## Request (as dictated)
${quote(ticket.description)}
${memoryBlock(memory)}
## Steps
${steps.map((step) => `- [ ] ${step}`).join("\n")}

## Rules
${rules.map((rule) => `- ${rule}`).join("\n")}

## Journal

## Learnings

## Notes
`;
}

export function readTask(path: string): string {
  return readFileSync(path, "utf8");
}

export function taskState(text: string): TaskState {
  const status = text.match(STATUS_RE);
  const kind = (status?.[1]?.toUpperCase() as "DONE" | "BLOCKED" | undefined) ?? null;
  return {
    status: kind,
    blockedReason: kind === "BLOCKED" ? status![2]!.replace(/^\s*:\s*/, "").trim() || "Blocage sans détail" : null,
    open: [...text.matchAll(OPEN_STEP_RE)].length,
    done: [...text.matchAll(DONE_STEP_RE)].length,
  };
}

export function notesSection(text: string): string {
  const notes = text.split(/^## Notes\s*$/m)[1] ?? "";
  return notes.replace(STATUS_RE, "").trim();
}

// Body of a `## <name>` section, up to the next `## ` heading.
export function section(text: string, name: string): string {
  const start = text.search(new RegExp(`^## ${name}[ \\t]*$`, "m"));
  if (start === -1) return "";
  const body = text.slice(start).replace(/^.*\r?\n?/, "");
  const end = body.search(/^## /m);
  return (end === -1 ? body : body.slice(0, end)).replace(STATUS_RE, "").trim();
}

function bullets(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1])
    .filter((line): line is string => !!line && !/^\[[ x]\]/i.test(line));
}

export function journalLines(text: string): string[] {
  return bullets(section(text, "Journal"));
}

export function learnings(text: string): { key: string; body: string }[] {
  return bullets(section(text, "Learnings"))
    .map((line) => {
      const [, topic, fact] = line.match(/^\**([^:]{2,80}?)\**\s*:\s*(.+)$/) ?? [];
      const body = (fact ?? line).trim();
      const key = (topic ?? body.slice(0, 60)).trim().toLowerCase().replace(/\s+/g, " ");
      return { key, body };
    })
    .filter((entry) => entry.body.length >= 8);
}

export function applyOwnerComments(path: string, comments: TicketEvent[]) {
  let text = readTask(path);
  for (const comment of comments) {
    const at = new Date(comment.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    text = appendToNotes(text, `Owner comment (via simple-jira, ${at}):\n${comment.message}`);
  }
  writeFileSync(path, text, "utf8");
}

export function reopenForComments(path: string) {
  const text = insertStep(clearStatus(readTask(path)), "Take into account the latest Owner comment(s) under Notes, then verify and ship again.");
  writeFileSync(path, text, "utf8");
}

function clearStatus(text: string) {
  return text.replace(new RegExp(STATUS_RE.source, "gim"), "").replace(/\n{3,}$/, "\n\n");
}

function appendToNotes(text: string, note: string) {
  return `${text.trimEnd()}\n\n${note.trim()}\n`;
}

function insertStep(text: string, step: string) {
  const rules = text.search(/^## Rules\s*$/m);
  if (rules === -1) return appendToNotes(text, `- [ ] ${step}`);
  return `${text.slice(0, rules).trimEnd()}\n- [ ] ${step}\n\n${text.slice(rules)}`;
}

export function applyAnswers(path: string, questions: Question[]) {
  let text = clearStatus(readTask(path));
  for (const q of questions) {
    text = appendToNotes(text, `Owner answer (via simple-jira) to "${q.question}":\n${q.answer}`);
  }
  writeFileSync(path, text, "utf8");
}

export function reopenAfterFailedCheck(path: string, output: string) {
  let text = clearStatus(readTask(path));
  text = insertStep(text, "Make the check command pass again (see the failure under Notes), then ship again.");
  text = appendToNotes(text, `Check failed after STATUS: DONE (run by simple-jira):\n\`\`\`\n${output.slice(-3000)}\n\`\`\``);
  writeFileSync(path, text, "utf8");
}

export function reopenForConflict(path: string, step: string) {
  let text = insertStep(clearStatus(readTask(path)), step);
  text = appendToNotes(text, "simple-jira: the PR could not be merged because main moved on; conflict step added above.");
  writeFileSync(path, text, "utf8");
}

export function reopen(path: string) {
  writeFileSync(path, clearStatus(readTask(path)), "utf8");
}
