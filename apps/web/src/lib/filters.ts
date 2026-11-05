import {
  PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type Priority,
  type TicketStatus,
  type TicketType,
} from "@simple-jira/core";

// Status groups of the side panel, also usable as `?view=` in the dashboard URL.
export const VIEWS = {
  actives: { label: "Active", statuses: ["queued", "running", "verifying"] },
  questions: { label: "Waiting for answer", statuses: ["blocked"] },
  pr: { label: "PRs ready", statuses: ["delivered"] },
  prod: { label: "In prod", statuses: ["merged"] },
  echecs: { label: "Failures", statuses: ["failed"] },
} as const satisfies Record<string, { label: string; statuses: readonly TicketStatus[] }>;

export type View = keyof typeof VIEWS;

export interface DashboardFilters {
  q: string;
  statuses: TicketStatus[];
  project: string;
  priority: Priority | null;
  type: TicketType | null;
  view: View | null;
}

type Params = Record<string, string | string[] | undefined>;

function values(params: Params, name: string): string[] {
  const raw = params[name];
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((value) => value.split(",")).filter(Boolean);
}

export function parseFilters(params: Params): DashboardFilters {
  const view = values(params, "view")[0];
  const priority = Number(values(params, "priority")[0]);
  const type = values(params, "type")[0];
  return {
    q: (values(params, "q")[0] ?? "").slice(0, 100),
    statuses: values(params, "status").filter((s): s is TicketStatus => TICKET_STATUSES.includes(s as TicketStatus)),
    project: values(params, "project")[0] ?? "",
    priority: PRIORITIES.includes(priority as Priority) ? (priority as Priority) : null,
    type: TICKET_TYPES.includes(type as TicketType) ? (type as TicketType) : null,
    view: view && view in VIEWS ? (view as View) : null,
  };
}

export function hasFilters(filters: DashboardFilters): boolean {
  return !!(filters.q || filters.statuses.length || filters.project || filters.priority || filters.type || filters.view);
}

// Statuses to query: explicit selection wins over the side-panel view.
export function effectiveStatuses(filters: DashboardFilters): readonly TicketStatus[] | undefined {
  if (filters.statuses.length) return filters.statuses;
  return filters.view ? VIEWS[filters.view].statuses : undefined;
}

export function filtersHref(patch: Partial<Record<"q" | "status" | "project" | "priority" | "type" | "view", string>>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(patch)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
