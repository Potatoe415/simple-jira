import { PRIORITIES, STATUS_LABELS, TICKET_STATUSES, TYPE_LABELS, TICKET_TYPES, type Project } from "@simple-jira/core";
import Link from "next/link";
import { VIEWS, type DashboardFilters } from "@/lib/filters";

// Plain GET form: the URL holds the whole view, so it can be shared and linked from the side panel.
export function TicketFilters({
  filters,
  projects,
  count,
}: {
  filters: DashboardFilters;
  projects: Pick<Project, "slug" | "name">[];
  count: number;
}) {
  const selected = new Set(filters.statuses.length || !filters.view ? filters.statuses : VIEWS[filters.view].statuses);
  return (
    <form method="get" action="/" className="card mb-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Title or #number" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="f-project">
            Project
          </label>
          <select id="f-project" name="project" defaultValue={filters.project} className="input w-auto">
            <option value="">All</option>
            {projects.map((project) => (
              <option key={project.slug} value={project.slug}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-priority">
            Priority
          </label>
          <select id="f-priority" name="priority" defaultValue={filters.priority ?? ""} className="input w-auto">
            <option value="">All</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                P{priority}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-type">
            Type
          </label>
          <select id="f-type" name="type" defaultValue={filters.type ?? ""} className="input w-auto">
            <option value="">All</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Status</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {TICKET_STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1.5 text-sm text-zinc-300">
              <input
                type="checkbox"
                name="status"
                value={status}
                defaultChecked={selected.has(status)}
                className="accent-sky-500"
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button className="btn">Filter</button>
        <Link href="/" className="btn-ghost">
          Reset
        </Link>
        <span className="ml-auto text-sm text-zinc-400" aria-live="polite">
          {count} ticket{count === 1 ? "" : "s"} shown
        </span>
      </div>
    </form>
  );
}
