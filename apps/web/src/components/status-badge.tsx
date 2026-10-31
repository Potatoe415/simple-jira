import { STATUS_LABELS, type TicketStatus } from "@simple-jira/core";

const COLORS: Record<TicketStatus, string> = {
  queued: "bg-zinc-700 text-zinc-200",
  running: "bg-sky-900 text-sky-200",
  blocked: "bg-amber-900 text-amber-200",
  verifying: "bg-violet-900 text-violet-200",
  delivered: "bg-emerald-900 text-emerald-200",
  failed: "bg-red-900 text-red-200",
  cancelled: "bg-zinc-800 text-zinc-400",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex shrink-0 rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
