import { createHash, timingSafeEqual } from "node:crypto";
import {
  ACTIVE_STATUSES,
  addOwnerComment,
  answerQuestion,
  cancelTicket,
  createSubTicket,
  createTicket,
  EFFORTS,
  getTicketByNumber,
  getTicketRelations,
  MODEL_RE,
  listEvents,
  listOpenQuestions,
  listProjects,
  listQuestions,
  listTickets,
  requestMerge,
  retryTicket,
  setPriority,
  STATUS_LABELS,
  TICKET_TYPES,
  TYPE_LABELS,
  type TicketWithProject,
} from "@simple-jira/core";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";

const INSTRUCTIONS = `simple-jira transforme des demandes dictées en tickets exécutés sans surveillance par Claude Code sur le PC de l'utilisateur, livrés en pull request.
- Avant de créer un ticket, appelle list_projects et déduis le projet visé (les surnoms comptent). Si c'est ambigu, demande à l'utilisateur au lieu de deviner.
- Le type est "fix" pour un bug, "feature" pour une évolution, "new_project" pour un projet qui n'existe pas encore.
- Dans description, garde fidèlement la demande de l'utilisateur et ajoute les précisions obtenues en conversation. Ne l'invente pas.
- L'agent ne pourra poser aucune question en cours de route : avant de créer le ticket, clarifie avec l'utilisateur les choix produit importants (règles, comportement attendu, où ça s'affiche).
- goal : une ou deux phrases qui décrivent "fini" de façon vérifiable.
- steps : 3 à 10 étapes petites, concrètes, vérifiables, dans l'ordre, en anglais. N'inclus pas la lecture des docs du projet, la commande de vérification ni le commit/push : le worker les ajoute.
- slug : 2 à 4 mots en kebab-case anglais, il sert de nom de branche (feat/<slug>).
- priority : 3 par défaut. 1 si l'utilisateur dit "priorité un", "urgent", "en premier" ; 2 s'il dit "priorité deux". Les tickets en file passent par priorité (1 d'abord), puis par ancienneté ; un ticket déjà en cours n'est pas interrompu. Pour un ticket existant, utilise set_priority.
- auto_merge : true uniquement si l'utilisateur dit explicitement "direct en prod", "mets en prod", "merge direct" ou équivalent. Sinon false : la PR attend sa validation.
- Quand l'utilisateur demande s'il y a des questions ou des nouvelles, appelle list_open_questions puis list_tickets.
- Pour répondre à une question d'un agent, appelle answer_question avec la réponse de l'utilisateur, sans la reformuler au point d'en changer le sens.
- Pour transmettre une précision à un agent qui travaille (sans qu'il soit bloqué), appelle comment_ticket : il la lit avant sa prochaine passe.
- model / effort : seulement si l'utilisateur le demande ("en opus", "effort max"). Sinon laisse vide : le défaut du projet s'applique.
- Pour découper une grosse demande, crée le ticket parent puis des sous-tickets (create_sub_ticket ou parent_id). blocked_by liste les tickets qui doivent avoir une PR prête ou être en prod avant que celui-ci démarre.`;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function failure(error: unknown) {
  return { ...text(`Erreur : ${error instanceof Error ? error.message : String(error)}`), isError: true };
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
        title: "Lister les projets",
        description: "Liste les projets connus avec leurs surnoms, pour déduire à quel projet une demande s'applique.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const projects = await listProjects(adminDb());
          if (!projects.length) return text("Aucun projet enregistré.");
          return text(
            projects
              .map(
                (p) =>
                  `- slug: ${p.slug} | nom: ${p.name} | surnoms: ${p.aliases.join(", ") || "-"}\n  ${p.description || ""}`,
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
        title: "Créer un ticket",
        description:
          "Met une tâche dans la file. Un agent la prendra sur le PC de l'utilisateur et livrera une pull request. Pour un projet existant, fournis project_slug. Pour un nouveau projet, type new_project et new_project.",
        inputSchema: z.object({
          type: z.enum(TICKET_TYPES),
          project_slug: z.string().optional().describe("slug renvoyé par list_projects (sauf new_project)"),
          title: z.string().min(1).max(200).describe("titre court et explicite"),
          description: z.string().min(1).describe("la demande complète, fidèle à l'utilisateur"),
          goal: z.string().min(1).describe("une ou deux phrases : à quoi ressemble 'fini'"),
          steps: z
            .array(z.string().min(1))
            .min(1)
            .max(15)
            .describe("étapes concrètes et vérifiables, en anglais, sans docs/check/commit"),
          slug: z
            .string()
            .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
            .describe("kebab-case anglais court, nom de branche"),
          auto_merge: z
            .boolean()
            .default(false)
            .describe("true seulement si l'utilisateur dit explicitement de mettre direct en prod"),
          priority: z
            .number()
            .int()
            .min(1)
            .max(3)
            .default(3)
            .describe("1 = urgent, passe avant les autres ; 3 = défaut. 1 ou 2 seulement si l'utilisateur le demande"),
          model: z
            .string()
            .regex(MODEL_RE)
            .optional()
            .describe("modèle Claude (ex. opus, sonnet), seulement si l'utilisateur le demande"),
          effort: z.enum(EFFORTS).optional().describe("effort de raisonnement, seulement si l'utilisateur le demande"),
          blocked_by: z
            .array(z.number().int().positive())
            .max(20)
            .optional()
            .describe("numéros des tickets qui doivent être livrés (PR prête ou en prod) avant celui-ci"),
          check_paths: z
            .array(z.string().regex(/^\/\S*$/))
            .max(10)
            .optional()
            .describe("pages à ouvrir sur la preview pour le test navigateur, ex. [\"/\", \"/settings\"]"),
          parent_id: z.number().int().positive().optional().describe("numéro du ticket parent, pour un sous-ticket"),
          new_project: z
            .object({
              slug: z.string().describe("minuscules, chiffres et tirets, servira de nom de repo"),
              name: z.string(),
              description: z.string(),
            })
            .optional(),
        }),
      },
      async (input) => {
        try {
          const ticket = await createTicket(adminDb(), { ...input, blocked_by: input.blocked_by ?? [], source: "mcp" });
          const delivery = ticket.auto_merge ? "mergé direct en prod une fois livré" : "livré en PR à valider";
          return text(
            `Ticket #${ticket.number} créé (${TYPE_LABELS[ticket.type]}, priorité ${ticket.priority}) : ${ticket.title}. En file, le worker le prendra dans les 5 minutes ; ${delivery}.`,
          );
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "create_sub_ticket",
      {
        title: "Créer un sous-ticket",
        description:
          "Crée un ticket enfant d'un ticket existant, dans le même projet. Même format que create_ticket (goal, steps, slug...).",
        inputSchema: z.object({
          parent: z.number().int().positive().describe("numéro du ticket parent"),
          type: z.enum(["fix", "feature"]).default("feature"),
          title: z.string().min(1).max(200),
          description: z.string().min(1),
          goal: z.string().min(1),
          steps: z.array(z.string().min(1)).min(1).max(15),
          slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
          auto_merge: z.boolean().default(false),
          priority: z.number().int().min(1).max(3).default(3),
          model: z
            .string()
            .regex(MODEL_RE)
            .optional()
            .describe("modèle Claude (ex. opus, sonnet), seulement si l'utilisateur le demande"),
          effort: z.enum(EFFORTS).optional().describe("effort de raisonnement, seulement si l'utilisateur le demande"),
          blocked_by: z
            .array(z.number().int().positive())
            .max(20)
            .optional()
            .describe("numéros des tickets qui doivent être livrés (PR prête ou en prod) avant celui-ci"),
          check_paths: z
            .array(z.string().regex(/^\/\S*$/))
            .max(10)
            .optional()
            .describe("pages à ouvrir sur la preview pour le test navigateur, ex. [\"/\", \"/settings\"]"),
        }),
      },
      async ({ parent, ...input }) => {
        try {
          const ticket = await createSubTicket(adminDb(), parent, {
            ...input,
            blocked_by: input.blocked_by ?? [],
            source: "mcp",
          });
          return text(`Sous-ticket #${ticket.number} créé sous #${parent} : ${ticket.title}.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "comment_ticket",
      {
        title: "Commenter un ticket",
        description:
          "Transmet un message de l'utilisateur à l'agent qui travaille sur le ticket (précision, changement de cap). Il est ajouté aux notes de l'agent avant sa prochaine passe. Pour un ticket bloqué, préfère answer_question.",
        inputSchema: z.object({
          number: z.number().int().positive(),
          comment: z.string().min(1).max(4000).describe("le message de l'utilisateur, fidèle"),
        }),
      },
      async ({ number, comment }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} introuvable`));
          await addOwnerComment(db, ticket.id, comment);
          const when = ACTIVE_STATUSES.includes(ticket.status)
            ? "L'agent le lira avant sa prochaine passe."
            : "Le ticket n'est plus actif : relance-le (retry_ticket) pour que l'agent en tienne compte.";
          return text(`Commentaire ajouté au ticket #${number}. ${when}`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "list_open_questions",
      {
        title: "Questions en attente",
        description: "Liste les questions bloquantes posées par les agents, auxquelles l'utilisateur doit répondre.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const questions = await listOpenQuestions(adminDb());
          if (!questions.length) return text("Aucune question en attente.");
          return text(
            questions
              .map((q) => {
                const options = q.options.length ? `\n  Options : ${q.options.join(" / ")}` : "";
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
        title: "Répondre à une question",
        description: "Transmet la réponse de l'utilisateur à l'agent bloqué, qui reprend alors son travail.",
        inputSchema: z.object({
          question_id: z.string().uuid(),
          answer: z.string().min(1),
        }),
      },
      async ({ question_id, answer }) => {
        try {
          await answerQuestion(adminDb(), question_id, answer);
          return text("Réponse transmise. L'agent va reprendre.");
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "list_tickets",
      {
        title: "Lister les tickets",
        description: "Liste les tickets actifs (par défaut) ou récents, avec leur statut et le lien de PR.",
        inputSchema: z.object({
          scope: z.enum(["active", "recent"]).default("active"),
        }),
      },
      async ({ scope }) => {
        try {
          const tickets = await listTickets(adminDb(), {
            statuses: scope === "active" ? ACTIVE_STATUSES : undefined,
            limit: 20,
          });
          if (!tickets.length) return text(scope === "active" ? "Aucun ticket actif." : "Aucun ticket.");
          return text(tickets.map(ticketLine).join("\n"));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "get_ticket",
      {
        title: "Détail d'un ticket",
        description: "Statut, résumé, PR, erreur, questions et derniers événements d'un ticket.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} introuvable`));
          const [events, questions, relations] = await Promise.all([
            listEvents(db, ticket.id, { limit: 15 }),
            listQuestions(db, ticket.id),
            getTicketRelations(db, ticket),
          ]);
          const parts = [ticketLine(ticket), `Demande : ${ticket.description}`];
          const settings = [ticket.model && `modèle ${ticket.model}`, ticket.effort && `effort ${ticket.effort}`];
          if (settings.some(Boolean)) parts.push(settings.filter(Boolean).join(", "));
          const ref = (r: { number: number; title: string; status: keyof typeof STATUS_LABELS }) =>
            `#${r.number} [${STATUS_LABELS[r.status]}] ${r.title}`;
          if (relations.parent) parts.push(`Parent : ${ref(relations.parent)}`);
          if (relations.blockers.length) parts.push(`Dépend de : ${relations.blockers.map(ref).join(" ; ")}`);
          if (relations.children.length) parts.push(`Sous-tickets : ${relations.children.map(ref).join(" ; ")}`);
          if (ticket.summary) parts.push(`Résumé :\n${ticket.summary}`);
          if (ticket.error) parts.push(`Erreur : ${ticket.error}`);
          if (questions.length) {
            parts.push(
              `Questions :\n${questions.map((q) => `- ${q.question} → ${q.answer ?? "(en attente)"}`).join("\n")}`,
            );
          }
          parts.push(`Derniers événements :\n${events.map((e) => `- [${e.kind}] ${e.message.slice(0, 300)}`).join("\n")}`);
          return text(parts.join("\n\n"));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "cancel_ticket",
      {
        title: "Annuler un ticket",
        description: "Annule un ticket actif. L'agent en cours est arrêté.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} introuvable`));
          await cancelTicket(db, ticket.id);
          return text(`Ticket #${number} annulé.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "set_priority",
      {
        title: "Changer la priorité",
        description:
          "Change la priorité d'un ticket encore actif : 1 = urgent (passe en premier dans la file), 2, 3 = défaut. Ne coupe pas un ticket déjà en cours.",
        inputSchema: z.object({
          number: z.number().int().positive(),
          priority: z.number().int().min(1).max(3),
        }),
      },
      async ({ number, priority }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} introuvable`));
          await setPriority(db, ticket.id, priority);
          return text(`Ticket #${number} en priorité ${priority}.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "merge_ticket",
      {
        title: "Merger en prod",
        description:
          "Merge la PR d'un ticket livré dans main : il part en production. Uniquement sur demande explicite de l'utilisateur, après confirmation.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} introuvable`));
          await requestMerge(db, ticket.id);
          return text(`Merge du ticket #${number} demandé. Le worker le fait dans la minute, puis Vercel déploie en prod.`);
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "retry_ticket",
      {
        title: "Relancer un ticket",
        description: "Remet en file un ticket en échec ou annulé.",
        inputSchema: z.object({ number: z.number().int().positive() }),
      },
      async ({ number }) => {
        try {
          const db = adminDb();
          const ticket = await getTicketByNumber(db, number);
          if (!ticket) return failure(new Error(`Ticket #${number} introuvable`));
          await retryTicket(db, ticket.id);
          return text(`Ticket #${number} remis en file.`);
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
