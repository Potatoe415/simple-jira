import {
  ACTIVE_STATUSES,
  getTicketByNumber,
  getWorkerStatus,
  listEvents,
  listQuestions,
  TYPE_LABELS,
  type EventKind,
} from "@simple-jira/core";
import { notFound } from "next/navigation";
import { cancelTicketAction, retryTicketAction } from "@/app/actions";
import { AnswerForm } from "@/components/answer-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { requireOwner } from "@/lib/auth";
import { clockTime, timeAgo } from "@/lib/format";
import { adminDb } from "@/lib/supabase/admin";

const EVENT_COLORS: Record<EventKind, string> = {
  status: "text-sky-300",
  agent: "text-zinc-200",
  tool: "text-zinc-500",
  verify: "text-violet-300",
  error: "text-red-400",
  info: "text-amber-300",
};

export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  await requireOwner();
  const { number } = await params;
  const parsed = Number(number);
  if (!Number.isInteger(parsed) || parsed <= 0) notFound();

  const db = adminDb();
  const ticket = await getTicketByNumber(db, parsed);
  if (!ticket) notFound();
  const [events, questions, worker] = await Promise.all([
    listEvents(db, ticket.id),
    listQuestions(db, ticket.id),
    getWorkerStatus(db),
  ]);
  const isActive = ACTIVE_STATUSES.includes(ticket.status);
  const canRetry = ticket.status === "failed" || ticket.status === "cancelled";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      {isActive && <AutoRefresh seconds={4} />}
      <Header worker={worker} />

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <StatusBadge status={ticket.status} />
        <h1 className="min-w-0 flex-1 text-xl font-semibold">
          <span className="text-zinc-500">#{ticket.number}</span> {ticket.title}
        </h1>
        {isActive && (
          <form action={cancelTicketAction}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <button className="btn-ghost">Annuler</button>
          </form>
        )}
        {canRetry && (
          <form action={retryTicketAction}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <button className="btn">Relancer</button>
          </form>
        )}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="label">Projet</dt>
          <dd>{ticket.project?.name ?? ticket.new_project?.name ?? "?"}</dd>
        </div>
        <div>
          <dt className="label">Type</dt>
          <dd>{TYPE_LABELS[ticket.type]}</dd>
        </div>
        <div>
          <dt className="label">Créé</dt>
          <dd>{timeAgo(ticket.created_at)}</dd>
        </div>
        <div>
          <dt className="label">Coût estimé</dt>
          <dd>{Number(ticket.cost_usd).toFixed(2)} $</dd>
        </div>
        {ticket.branch && (
          <div className="col-span-2">
            <dt className="label">Branche</dt>
            <dd className="truncate font-mono text-xs">{ticket.branch}</dd>
          </div>
        )}
        {ticket.pr_url && (
          <div className="col-span-2">
            <dt className="label">Pull request</dt>
            <dd>
              <a href={ticket.pr_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                {ticket.pr_url.replace("https://github.com/", "")} ↗
              </a>
            </dd>
          </div>
        )}
      </dl>

      <section className="card mb-4">
        <h2 className="label">Demande</h2>
        <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        {ticket.goal && (
          <>
            <h2 className="label mt-4">Objectif</h2>
            <p className="text-sm">{ticket.goal}</p>
          </>
        )}
        {ticket.steps.length > 0 && (
          <>
            <h2 className="label mt-4">Étapes</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {ticket.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </>
        )}
        {ticket.worktree_path && (
          <p className="mt-4 font-mono text-xs text-zinc-500">Worktree : {ticket.worktree_path}</p>
        )}
      </section>

      {ticket.error && (
        <section className="card mb-4 border-red-900/70">
          <h2 className="label text-red-400">Erreur</h2>
          <pre className="whitespace-pre-wrap font-mono text-xs text-red-300">{ticket.error}</pre>
        </section>
      )}

      {ticket.summary && (
        <section className="card mb-4 border-emerald-900/60">
          <h2 className="label">Résumé de l&apos;agent</h2>
          <p className="whitespace-pre-wrap text-sm">{ticket.summary}</p>
        </section>
      )}

      {questions.length > 0 && (
        <section className="card mb-4">
          <h2 className="label">Questions</h2>
          <ul className="space-y-4">
            {questions.map((question) => (
              <li key={question.id}>
                <p className="whitespace-pre-wrap text-sm">{question.question}</p>
                {question.answer ? (
                  <p className="mt-1 text-sm text-emerald-300">→ {question.answer}</p>
                ) : (
                  <AnswerForm questionId={question.id} options={question.options} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="label">Journal</h2>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">Pas encore d&apos;événement.</p>
        ) : (
          <ol className="space-y-1 font-mono text-xs">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="shrink-0 text-zinc-600">{clockTime(event.created_at)}</span>
                <span className={`min-w-0 whitespace-pre-wrap break-words ${EVENT_COLORS[event.kind]}`}>
                  {event.message}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
