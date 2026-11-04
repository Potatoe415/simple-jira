import { readFileSync, writeFileSync } from "node:fs";
import { TYPE_LABELS, type Project, type Question, type Ticket } from "@simple-jira/core";

// The runner (autoclick/run_headless.ps1) and its stop hook read these exact markers.
const STATUS_RE = /^\s*STATUS:\s*(DONE|BLOCKED)\b(.*)$/im;
const OPEN_STEP_RE = /^\s*[-*]\s+\[ \]\s+(.+?)\s*$/gm;
const DONE_STEP_RE = /^\s*[-*]\s+\[x\]\s+/gim;

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

export function renderTask(ticket: Ticket, project: Project, branch: string): string {
  const steps = [
    "Read the project's agent instructions (AGENTS.md, CLAUDE.md, STATE.md) and any playbook they point to for this kind of task.",
    ...(ticket.steps.length ? ticket.steps : [`Implement the request below so that the goal is met.`]),
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
    "When every step is done, add the line `STATUS: DONE` at the bottom.",
    "If a human is needed (credentials, access, a product decision), add `STATUS: BLOCKED: <what is needed>` at the bottom and stop.",
  ];
  if (project.agent_instructions) rules.push(project.agent_instructions);

  return `# Task

Ticket #${ticket.number} (${TYPE_LABELS[ticket.type]}) from simple-jira: ${ticket.title}
Project: ${project.name} (${project.repo}), branch \`${branch}\`.

## Goal
${ticket.goal?.trim() || ticket.title}

## Request (as dictated)
${quote(ticket.description)}

## Steps
${steps.map((step) => `- [ ] ${step}`).join("\n")}

## Rules
${rules.map((rule) => `- ${rule}`).join("\n")}

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

export function reopen(path: string) {
  writeFileSync(path, clearStatus(readTask(path)), "utf8");
}
