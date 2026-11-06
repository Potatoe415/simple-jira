import { createHash, timingSafeEqual } from "node:crypto";
import {
  ACTIVE_STATUSES,
  addOwnerComment,
  answerQuestion,
  cancelTicket,
  createSubTicket,
  createTicket,
  deleteTicket,
  EFFORTS,
  getTicketByNumber,
  getTicketRelations,
  MODEL_RE,
  listEvents,
  listOpenQuestions,
  listProjects,
  listQuestions,
  listSubtasks,
  listTickets,
  requestMerge,
  retryTicket,
  setPriority,
  startIdea,
  STATUS_LABELS,
  subtaskProgress,
  TICKET_TYPES,
  TYPE_LABELS,
  type TicketWithProject,
} from "@simple-jira/core";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";

const INSTRUCTIONS = `simple-jira turns dictated requests into tickets that Claude Code runs unattended on the user's PC, delivered as pull requests.
- Before creating a ticket, call list_projects and infer the target project (aliases count). If it is ambiguous, ask the user instead of guessing.
- type is "fix" for a bug, "feature" for an enhancement, "new_project" for a project that does not exist yet.
- In description, keep the user's request faithful and add the details gathered in conversation. Do not invent anything.
- The agent cannot ask any question along the way: before creating the ticket, clarify important product choices with the user (rules, expected behavior, where it is displayed).
- goal: one or two sentences describing "done" in a verifiable way.
- steps: 3 to 10 small, concrete, verifiable steps, in order, in English. Do not include reading the project docs, the verify command or commit/push: the worker adds them.
- slug: 2 to 4 words in English kebab-case, used as the branch name (feat/<slug>).
- priority: 3 by default. 1 if the user says "priority one", "urgent", "first"; 2 if they say "priority two". Queued tickets are picked by priority (1 first), then by age; a ticket already running is not interrupted. For an existing ticket, use set_priority.
- auto_merge: true by default: the PR is merged to prod as soon as it is ready. false only if the user explicitly says "don't push to prod", "PR only", "I want to review it", "ne pousse pas en prod" or equivalent: the PR then waits for review.
- When the user asks whether there are questions or news, call list_open_questions then list_tickets.
- To answer an agent's question, call answer_question with the user's answer, without rephrasing it to the point of changing its meaning.
- To pass a clarification to an agent that is working (not blocked), call comment_ticket: it reads it before its next pass.
- model / effort: only if the user asks for it ("use opus", "max effort"). Otherwise leave empty: the project default applies.
- By default, one request = one task: call create_ticket and the worker runs it directly. Never split a request and never propose a split on your own. Use sub-tasks only when the user explicitly asks for them ("split it", "sub-tasks", "découpe", "sous-tâches").
- Hierarchy (only on request): project > task > sub-task. Create the task (create_ticket), then its sub-tasks (create_sub_ticket). A task with sub-tasks is a container: the worker never runs it, only its sub-tasks, and its status follows them. Put all the work in the sub-tasks; the task's description is the overall context. Sub-tasks cannot have sub-tasks. Sub-tasks run independently: if one needs another first, set blocked_by. Cancel, retry, priority and merge on the task apply to its sub-tasks.
- blocked_by lists the tickets that must have a ready PR or be in prod before this one starts.
- Ideas: when the user says "just an idea", "note this", "for later", "don't build it", "juste une idée" or equivalent, call save_idea instead of create_ticket. No questions, goal or steps needed: keep their words. An idea is never developed until started.
- To start an idea ("start idea #12", "build idea #12"), call get_ticket, clarify what is missing like for a new ticket, then start_idea with goal, steps and slug.
- delete_ticket is permanent: only on the user's explicit request, after confirming the ticket number and title with them. An active ticket must be cancelled first (cancel_ticket).`;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function failure(error: unknown) {
  return { ...text(`Error: ${error instanceof Error ? error.message : String(error)}`), isError: true };
}

function ticketLine(ticket: TicketWithProject) {
  const project = ticket.project?.name ?? ticket.new_project?.name ?? "?";
  const pr = ticket.pr_url ? ` — PR ${ticket.pr_url}` : "";
  const preview = ticket.preview_url ? ` — preview ${ticket.preview_url}` : "";
  return `#${ticket.number} P${ticket.priority} [${STATUS_LABELS[ticket.status]}] ${project} — ${ticket.title}${pr}${preview}`;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_projects",
      {
        title: "List projects",
        description: "Lists known projects with their aliases, to infer which project a request applies to.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const projects = await listProjects(adminDb());
          if (!projects.length) return text("No registered projects.");
          return text(
            projects
              .map(
                (p) =>
                  `- slug: ${p.slug} | name: ${p.name} | aliases: ${p.aliases.join(", ") || "-"}\n  ${p.description || ""}`,
              )
              .join("\n"),
          );
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "create_ticket",
      {
        title: "Create a ticket",
        description:
          "Queues a task. An agent will pick it up on the user's PC and deliver a pull request. For an existing project, provide project_slug. For a new project, use type new_project and new_project.",
        inputSchema: z.object({
          type: z.enum(TICKET_TYPES),
          project_slug: z.string().optional().describe("slug returned by list_projects (except new_project)"),
          title: z.string().min(1).max(200).describe("short, explicit title"),
          description: z.string().min(1).describe("the full request, faithful to the user"),
          goal: z.string().min(1).describe("one or two sentences: what 'done' looks like"),
          steps: z
            .array(z.string().min(1))
            .min(1)
            .max(15)
            .describe("concrete, verifiable steps, in English, without docs/check/commit"),
          slug: z
            .string()
            .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
            .describe("short English kebab-case, branch name"),
          auto_merge: z
            .boolean()
            .default(true)
            .describe("true by default (straight to prod); false only if the user explicitly says not to push to prod"),
          priority: z
            .number()
            .int()
            .min(1)
            .max(3)
            .default(3)
            .describe("1 = urgent, goes before the others; 3 = default. 1 or 2 only if the user asks for it"),
          model: z
            .string()
            .regex(MODEL_RE)
            .optional()
            .describe("Claude model (e.g. opus, sonnet), only if the user asks for it"),
          effort: z.enum(EFFORTS).optional().describe("reasoning effort, only if the user asks for it"),
          blocked_by: z
            .array(z.number().int().positive())
            .max(20)
            .optional()
            .describe("numbers of the tickets that must be delivered (PR ready or in prod) before this one"),
          check_paths: z
            .array(z.string().regex(/^\/\S*$/))
            .max(10)
            .optional()
            .describe("pages to open on the preview for the browser test, e.g. [\"/\", \"/settings\"]"),
          parent_id: z.number().int().positive().optional().describe("parent ticket number, for a sub-ticket"),
          new_project: z
            .object({
              slug: z.string().describe("lowercase letters, digits and dashes, used as the repo name"),
              name: z.string(),
              description: z.string(),
            })
            .optional(),
        }),
      },
      async (input) => {
        try {
          const ticket = await createTicket(adminDb(), { ...input, blocked_by: input.blocked_by ?? [], source: "mcp" });
          const delivery = ticket.auto_merge ? "merged straight to prod once delivered" : "delivered as a PR to review";
          return text(
            `Ticket #${ticket.number} created (${TYPE_LABELS[ticket.type]}, priority ${ticket.priority}): ${ticket.title}. Queued, the worker will pick it up within 5 minutes; ${delivery}.`,
          );
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "create_sub_ticket",
      {
        title: "Create a sub-ticket",
        description:
          "Only when the user explicitly asks for sub-tasks. Creates a sub-task of an existing task, in the same project. Same format as create_ticket (goal, steps, slug...). The parent task becomes a container the worker does not run itself. A sub-task cannot have sub-tasks.",
        inputSchema: z.object({
          parent: z.number().int().positive().describe("parent ticket number"),
          type: z.enum(["fix", "feature"]).default("feature"),
          title: z.string().min(1).max(200),
          description: z.string().min(1),
          goal: z.string().min(1),
          steps: z.array(z.string().min(1)).min(1).max(15),
          slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
          auto_merge: z.boolean().default(true),
          priority: z.number().int().min(1).max(3).default(3),
          model: z
            .string()
            .regex(MODEL_RE)
            .optional()
            .describe("Claude model (e.g. opus, sonnet), only if the user asks for it"),
          effort: z.enum(EFFORTS).optional().describe("reasoning effort, only if the user asks for it"),
          blocked_by: z
            .array(z.number().int().positive())
            .max(20)
            .optional()
            .describe("numbers of the tickets that must be delivered (PR ready or in prod) before this one"),
          check_paths: z
            .array(z.string().regex(/^\/\S*$/))
            .max(10)
            .optional()
            .describe("pages to open on the preview for the browser test, e.g. [\"/\", \"/settings\"]"),
        }),
      },
      async ({ parent, ...input }) => {
        try {
          const ticket = await createSubTicket(adminDb(), parent, {
            ...input,
            blocked_by: input.blocked_by ?? [],
            source: "mcp",
          });
          return text(`Sub-ticket #${ticket.number} created under #${parent}: ${ticket.title}.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "save_idea",
      {
        title: "Save an idea",
        description:
          "Saves an idea for later without developing it: the worker ignores it until start_idea. Use when the user only wants to note something.",
        inputSchema: z.object({
          type: z.enum(TICKET_TYPES).default("feature"),
          project_slug: z.string().optional().describe("slug returned by list_projects (except new_project)"),
          title: z.string().min(1).max(200).describe("short, explicit title"),
          description: z.string().min(1).describe("the idea, in the user's words"),
          new_project: z
            .object({
              slug: z.string().describe("lowercase letters, digits and dashes, used as the repo name"),
              name: z.string(),
              description: z.string(),
            })
            .optional(),
        }),
      },
      async (input) => {
        try {
          const ticket = await createTicket(adminDb(), { ...input, idea: true, source: "mcp" });
          return text(`Idea #${ticket.number} saved: ${ticket.title}. It will not be developed until you start it.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "start_idea",
      {
        title: "Start an idea",
        description:
          "Turns a saved idea into a task and queues it. Give goal, steps and slug as for create_ticket; fields left out keep their current value.",
        inputSchema: z.object({
          number: z.number().int().positive(),
          title: z.string().min(1).max(200).optional(),
          description: z.string().min(1).optional().describe("the full request, with the details gathered since"),
          goal: z.string().min(1).describe("one or two sentences: what 'done' looks like"),
          steps: z.array(z.string().min(1)).min(1).max(15).describe("concrete, verifiable steps, in English"),
          slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/).describe("short English kebab-case, branch name"),
          auto_merge: z
            .boolean()
            .default(true)
            .describe("true by default (straight to prod); false only if the user explicitly says not to push to prod"),
          priority: z.number().int().min(1).max(3).default(3),
          model: z.string().regex(MODEL_RE).optional(),
          effort: z.enum(EFFORTS).optional(),
        }),
      },
      async ({ number, ...input }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await startIdea(db, ticket.id, input);
          const delivery = input.auto_merge ? "merged straight to prod once delivered" : "delivered as a PR to review";
          return text(`Idea #${number} started: queued, the worker will pick it up within 5 minutes; ${delivery}.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "comment_ticket",
      {
        title: "Comment on a ticket",
        description:
          "Passes a user message to the agent working on the ticket (clarification, change of course). It is added to the agent's notes before its next pass. For a blocked ticket, prefer answer_question.",
        inputSchema: z.object({
          number: z.number().int().positive(),
          comment: z.string().min(1).max(4000).describe("the user's message, verbatim"),
        }),
      },
      async ({ number, comment }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await addOwnerComment(db, ticket.id, comment);
          const when = ACTIVE_STATUSES.includes(ticket.status)
            ? "The agent will read it before its next pass."
            : "The ticket is no longer active: retry it (retry_ticket) so the agent takes it into account.";
          return text(`Comment added to ticket #${number}. ${when}`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "list_open_questions",
      {
        title: "Open questions",
        description: "Lists the blocking questions asked by agents, which the user must answer.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const questions = await listOpenQuestions(adminDb());
          if (!questions.length) return text("No open questions.");
          return text(
            questions
              .map((q) => {
                const options = q.options.length ? `\n  Options: ${q.options.join(" / ")}` : "";
                const project = q.ticket.project?.name ?? "?";
                return `- question_id: ${q.id}\n  Ticket #${q.ticket.number} (${project}) — ${q.ticket.title}\n  ${q.question}${options}`;
              })
              .join("\n"),
          );
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "answer_question",
      {
        title: "Answer a question",
        description: "Passes the user's answer to the blocked agent, which then resumes its work.",
        inputSchema: z.object({
          question_id: z.string().uuid(),
          answer: z.string().min(1),
        }),
      },
      async ({ question_id, answer }) => {
        try {
          await answerQuestion(adminDb(), question_id, answer);
          return text("Answer sent. The agent will resume.");
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "list_tickets",
      {
        title: "List tickets",
        description: "Lists active (default), recent tickets, or saved ideas, with their status and PR link.",
        inputSchema: z.object({
          scope: z.enum(["active", "recent", "ideas"]).default("active"),
        }),
      },
      async ({ scope }) => {
        try {
          const tickets = await listTickets(adminDb(), {
            statuses: scope === "active" ? ACTIVE_STATUSES : scope === "ideas" ? ["idea"] : undefined,
            limit: scope === "ideas" ? 50 : 20,
          });
          if (!tickets.length) {
            return text(scope === "active" ? "No active tickets." : scope === "ideas" ? "No saved ideas." : "No tickets.");
          }
          // Sub-tasks go under their task when both are listed.
          const listed = new Set(tickets.map((ticket) => ticket.id));
          const subtasks = await listSubtasks(adminDb(), [...listed]);
          return text(
            tickets
              .filter((ticket) => !ticket.parent_id || !listed.has(ticket.parent_id))
              .flatMap((ticket) => {
                const children = subtasks.get(ticket.id) ?? [];
                if (!children.length) return [ticketLine(ticket)];
                const { done, total } = subtaskProgress(children);
                const shown = children.filter((child) => listed.has(child.id)).map((child) => `  ↳ ${ticketLine(child)}`);
                return [`${ticketLine(ticket)} — ${done}/${total} sub-tasks done`, ...shown];
              })
              .join("\n"),
          );
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "get_ticket",
      {
        title: "Ticket details",
        description: "Status, summary, PR, error, questions and latest events of a ticket.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          const [events, questions, relations] = await Promise.all([
            listEvents(db, ticket.id, { limit: 15 }),
            listQuestions(db, ticket.id),
            getTicketRelations(db, ticket),
          ]);
          const parts = [ticketLine(ticket), `Request: ${ticket.description}`];
          const settings = [ticket.model && `model ${ticket.model}`, ticket.effort && `effort ${ticket.effort}`];
          if (settings.some(Boolean)) parts.push(settings.filter(Boolean).join(", "));
          const ref = (r: { number: number; title: string; status: keyof typeof STATUS_LABELS }) =>
            `#${r.number} [${STATUS_LABELS[r.status]}] ${r.title}`;
          if (relations.parent) parts.push(`Parent: ${ref(relations.parent)}`);
          if (relations.blockers.length) parts.push(`Depends on: ${relations.blockers.map(ref).join(" ; ")}`);
          if (relations.children.length) {
            const { done, total } = subtaskProgress(relations.children);
            parts.push(`Sub-tasks (${done}/${total} done): ${relations.children.map(ref).join(" ; ")}`);
          }
          if (ticket.summary) parts.push(`Summary:\n${ticket.summary}`);
          if (ticket.error) parts.push(`Error: ${ticket.error}`);
          if (questions.length) {
            parts.push(
              `Questions:\n${questions.map((q) => `- ${q.question} → ${q.answer ?? "(pending)"}`).join("\n")}`,
            );
          }
          parts.push(`Latest events:\n${events.map((e) => `- [${e.kind}] ${e.message.slice(0, 300)}`).join("\n")}`);
          return text(parts.join("\n\n"));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "cancel_ticket",
      {
        title: "Cancel a ticket",
        description: "Cancels an active ticket. The running agent is stopped.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await cancelTicket(db, ticket.id);
          return text(`Ticket #${number} cancelled.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "set_priority",
      {
        title: "Change priority",
        description:
          "Changes the priority of a still-active ticket: 1 = urgent (goes first in the queue), 2, 3 = default. Does not interrupt a ticket already running.",
        inputSchema: z.object({
          number: z.number().int().positive(),
          priority: z.number().int().min(1).max(3),
        }),
      },
      async ({ number, priority }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await setPriority(db, ticket.id, priority);
          return text(`Ticket #${number} set to priority ${priority}.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "merge_ticket",
      {
        title: "Merge to prod",
        description:
          "Merges the PR of a delivered ticket into main: it goes to production. Only on the user's explicit request, after confirmation.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await requestMerge(db, ticket.id);
          return text(`Merge of ticket #${number} requested. The worker does it within a minute, then Vercel deploys to prod.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "delete_ticket",
      {
        title: "Delete a ticket",
        description:
          "Permanently deletes an idea or a finished ticket (PR ready, in prod, failed or cancelled) with its log and questions. Refused for an active ticket (cancel it first) or one an active ticket depends on. Only on the user's explicit request, after confirmation.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await deleteTicket(db, ticket.id);
          return text(`Ticket #${number} deleted: ${ticket.title}.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "retry_ticket",
      {
        title: "Retry a ticket",
        description: "Puts a failed or cancelled ticket back in the queue.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} not found`));
          await retryTicket(db, ticket.id);
          return text(`Ticket #${number} re-queued.`);
        } catch (error) {
          return failure(error);
        }
      },
    );
  },
  {
    serverInfo: { name: "simple-jira", version: "0.1.0" },
    instructions: INSTRUCTIONS,
  },
);

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function tokenMatches(candidate: string): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected || expected.length < 32) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

async function guarded(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!tokenMatches(token)) return new Response("Not found", { status: 404 });
  return handler(request);
}

export { guarded as DELETE, guarded as GET, guarded as POST };
