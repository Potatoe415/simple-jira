import { STATUS_LABELS, type Priority, type TicketStatus } from "@simple-jira/core";

const COLORS: Record<TicketStatus, string> = {
  queued: "bg-zinc-700 text-zinc-200",
  running: "bg-sky-900 text-sky-200",
  blocked: "bg-amber-900 text-amber-200",
  verifying: "bg-violet-900 text-violet-200",
  delivered: "bg-teal-900 text-teal-200",
  merged: "bg-emerald-700 text-white",
  failed: "bg-red-900 text-red-200",
  cancelled: "bg-zinc-800 text-zinc-400",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  1: "bg-red-600 text-white",
  2: "bg-orange-800 text-orange-100",
  3: "",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 3) return null;
  return (
    <span
      className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${PRIORITY_COLORS[priority]}`}
      title={`Priorité ${priority}`}
    >
      P{priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex shrink-0 rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
