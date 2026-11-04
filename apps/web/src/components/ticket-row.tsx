import { TYPE_LABELS, type TicketWithProject } from "@simple-jira/core";
import Link from "next/link";
import { timeAgo } from "@/lib/format";
import { PriorityBadge, StatusBadge } from "./status-badge";
import { TicketActions } from "./ticket-actions";

export function TicketRow({ ticket }: { ticket: TicketWithProject }) {
  const project = ticket.project?.name ?? ticket.new_project?.name ?? "?";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-800/70 py-2.5 last:border-0">
      <StatusBadge status={ticket.status} />
      <PriorityBadge priority={ticket.priority} />
      <Link href={`/tickets/${ticket.number}`} className="min-w-0 flex-1 truncate hover:text-sky-300">
        <span className="text-zinc-500">#{ticket.number}</span> {ticket.title}
      </Link>
      <span className="text-xs text-zinc-500">
        {project} · {TYPE_LABELS[ticket.type]} · {timeAgo(ticket.updated_at)}
      </span>
      {ticket.pr_url && (
        <a href={ticket.pr_url} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 hover:underline">
          PR ↗
        </a>
      )}
      <TicketActions
        id={ticket.id}
        number={ticket.number}
        status={ticket.status}
        preview_url={ticket.preview_url}
        pr_url={ticket.pr_url}
        merge_requested_at={ticket.merge_requested_at}
      />
    </li>
  );
}
