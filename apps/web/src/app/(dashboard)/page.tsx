import {
  ACTIVE_STATUSES,
  FINAL_STATUSES,
  getWorkerStatus,
  listOpenQuestions,
  listProjects,
  listTickets,
} from "@simple-jira/core";
import Link from "next/link";
import { AnswerForm } from "@/components/answer-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { Header } from "@/components/header";
import { TicketFilters } from "@/components/ticket-filters";
import { TicketForm } from "@/components/ticket-form";
import { TicketRow } from "@/components/ticket-row";
import { requireOwner } from "@/lib/auth";
import { effectiveStatuses, hasFilters, parseFilters, VIEWS } from "@/lib/filters";
import { timeAgo } from "@/lib/format";
import { adminDb } from "@/lib/supabase/admin";

const FILTERED_LIMIT = 200;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  const db = adminDb();
  const filters = parseFilters(await searchParams);
  const filtered = hasFilters(filters);
  const [questions, worker, projects] = await Promise.all([listOpenQuestions(db), getWorkerStatus(db), listProjects(db)]);
  const projectId = filters.project ? (projects.find((p) => p.slug === filters.project)?.id ?? "none") : undefined;

  const [results, active, recent] = await Promise.all([
    filtered
      ? listTickets(db, {
          statuses: effectiveStatuses(filters),
          search: filters.q,
          projectId,
          priority: filters.priority ?? undefined,
          type: filters.type ?? undefined,
          limit: FILTERED_LIMIT,
        })
      : Promise.resolve([]),
    filtered ? Promise.resolve([]) : listTickets(db, { statuses: ACTIVE_STATUSES, limit: 50 }),
    filtered ? Promise.resolve([]) : listTickets(db, { statuses: FINAL_STATUSES, limit: 20 }),
  ]);
  const working = active
    .filter((ticket) => ticket.status !== "blocked")
    .sort((a, b) => {
      const inProgress = Number(b.status !== "queued") - Number(a.status !== "queued");
      return inProgress || a.priority - b.priority || a.created_at.localeCompare(b.created_at);
    });
  const projectOptions = projects.map(({ slug, name }) => ({ slug, name }));
  const title = filters.view ? VIEWS[filters.view].label : "Tickets filtrés";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <AutoRefresh />
      <Header worker={worker} />

      <TicketFilters filters={filters} projects={projectOptions} count={filtered ? results.length : active.length + recent.length} />

      {filtered ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {title} ({results.length}
            {results.length === FILTERED_LIMIT ? "+" : ""})
          </h2>
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun ticket ne correspond.</p>
          ) : (
            <ul className="card py-1">
              {results.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-300">
              Questions des agents {questions.length > 0 && `(${questions.length})`}
            </h2>
            {questions.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucun agent bloqué.</p>
            ) : (
              <ul className="space-y-3">
                {questions.map((question) => (
                  <li key={question.id} className="card border-amber-900/60">
                    <div className="mb-1 text-xs text-zinc-400">
                      <Link href={`/tickets/${question.ticket.number}`} className="hover:text-zinc-200">
                        #{question.ticket.number} · {question.ticket.project?.name ?? "?"} · {question.ticket.title}
                      </Link>{" "}
                      · {timeAgo(question.created_at)}
                    </div>
                    <p className="whitespace-pre-wrap">{question.question}</p>
                    <AnswerForm questionId={question.id} options={question.options} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              En cours et en file ({working.length})
            </h2>
            {working.length === 0 ? (
              <p className="text-sm text-zinc-500">Rien en cours.</p>
            ) : (
              <ul className="card py-1">
                {working.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8">
            <details className="card">
              <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Nouveau ticket
              </summary>
              <div className="mt-4">
                <TicketForm projects={projectOptions} />
              </div>
            </details>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Terminés récemment</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucun ticket terminé.</p>
            ) : (
              <ul className="card py-1">
                {recent.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
