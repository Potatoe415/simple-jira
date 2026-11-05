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
    <form method="get" action="/" className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Search title or #number" className="input pr-8" />
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
        </div>
        <div>
          <label className="sr-only" htmlFor="f-project">
            Project
          </label>
          <select id="f-project" name="project" defaultValue={filters.project} className="h-8 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 font-medium text-ink hover:bg-tint focus:ring-2 focus:ring-brand focus:outline-none">
            <option value="">Project</option>
            {projects.map((project) => (
              <option key={project.slug} value={project.slug}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="f-priority">
            Priority
          </label>
          <select id="f-priority" name="priority" defaultValue={filters.priority ?? ""} className="h-8 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 font-medium text-ink hover:bg-tint focus:ring-2 focus:ring-brand focus:outline-none">
            <option value="">Priority</option>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                P{priority}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="f-type">
            Type
          </label>
          <select id="f-type" name="type" defaultValue={filters.type ?? ""} className="h-8 cursor-pointer rounded-[3px] border-0 bg-transparent px-2 font-medium text-ink hover:bg-tint focus:ring-2 focus:ring-brand focus:outline-none">
            <option value="">Type</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <legend className="sr-only">Status</legend>
        <span className="text-xs font-semibold text-ink-subtle" aria-hidden>
          Status
        </span>
        <div className="contents">
          {TICKET_STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                name="status"
                value={status}
                defaultChecked={selected.has(status)}
                className="accent-brand"
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <button className="btn">Filter</button>
        <Link href="/" className="btn-ghost">
          Reset
        </Link>
        <span className="ml-auto text-sm text-ink-subtle" aria-live="polite">
          {count} ticket{count === 1 ? "" : "s"} shown
        </span>
      </div>
    </form>
  );
}
