import {
  ACTIVE_STATUSES,
  FINAL_STATUSES,
  listProjects,
  listTickets,
  type TicketWithProject,
} from "@simple-jira/core";
import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { TicketFilters } from "@/components/ticket-filters";
import { TicketForm } from "@/components/ticket-form";
import { TicketRow } from "@/components/ticket-row";
import { requireOwner } from "@/lib/auth";
import { effectiveStatuses, hasFilters, parseFilters, VIEWS } from "@/lib/filters";
import { adminDb } from "@/lib/supabase/admin";

const FILTERED_LIMIT = 200;

// Grey container with a title row and a white list of rows, like a sprint in a backlog.
function Panel({
  title,
  meta,
  empty,
  tickets,
}: {
  title: string;
  meta?: string;
  empty: string;
  tickets: TicketWithProject[];
}) {
  return (
    <section className="panel mb-6">
      <h2 className="flex items-center gap-2 px-2 py-2">
        <span className="section-title">{title}</span>
        {meta && <span className="text-sm text-ink-subtle">{meta}</span>}
      </h2>
      {tickets.length === 0 ? (
        <p className="rounded-[3px] border border-dashed border-line bg-white px-3 py-4 text-center text-ink-subtlest">
          {empty}
        </p>
      ) : (
        <ul className="issue-list">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  const db = adminDb();
  const filters = parseFilters(await searchParams);
  const filtered = hasFilters(filters);
  const projects = await listProjects(db);
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
  const title = filters.view ? VIEWS[filters.view].label : "Filtered tickets";

  return (
    <main className="mx-auto max-w-6xl px-6 py-6">
      <AutoRefresh />
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-ink-subtle">
        <Link href="/" className="hover:text-brand hover:underline">
          Dashboard
        </Link>
        {filtered && <span> / {title}</span>}
      </nav>
      <h1 className="mb-4 text-2xl font-medium text-ink">{filtered ? title : "Backlog"}</h1>

      <TicketFilters filters={filters} projects={projectOptions} count={filtered ? results.length : active.length + recent.length} />

      {filtered ? (
        <Panel
          title={title}
          meta={`(${results.length}${results.length === FILTERED_LIMIT ? "+" : ""} tickets)`}
          empty="No matching tickets."
          tickets={results}
        />
      ) : (
        <>
          <Panel
            title="In progress and queued"
            meta={`(${working.length} tickets)`}
            empty="Nothing in progress."
            tickets={working}
          />

          <details className="panel mb-6">
            <summary className="cursor-pointer px-2 py-2 font-medium text-ink-subtle hover:text-ink">
              + Create ticket
            </summary>
            <div className="card mt-2">
              <TicketForm projects={projectOptions} />
            </div>
          </details>

          <Panel title="Recently finished" meta={`(${recent.length} tickets)`} empty="No finished tickets." tickets={recent} />
        </>
      )}
    </main>
  );
}
