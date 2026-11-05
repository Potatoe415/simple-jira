import type { TicketWithProject } from "@simple-jira/core";
import Link from "next/link";
import { timeAgo } from "@/lib/format";
import { DeleteTicketButton } from "./delete-ticket-button";
import { PriorityIcon, ProjectLabel, StatusBadge, TypeIcon } from "./status-badge";
import { TicketActions } from "./ticket-actions";

export function TicketRow({ ticket }: { ticket: TicketWithProject }) {
  const project = ticket.project?.name ?? ticket.new_project?.name ?? "?";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-sunken">
      <TypeIcon type={ticket.type} />
      <Link href={`/tickets/${ticket.number}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand hover:underline">
        <span className="text-ink-subtle">#{ticket.number}</span>
        <span className="ml-2">{ticket.title}</span>
      </Link>
      <ProjectLabel name={project} />
      <StatusBadge status={ticket.status} />
      <span className="hidden w-24 text-right text-xs text-ink-subtlest sm:inline">{timeAgo(ticket.updated_at)}</span>
      <PriorityIcon priority={ticket.priority} />
      {ticket.pr_url && (
        <a href={ticket.pr_url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
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
      <DeleteTicketButton id={ticket.id} number={ticket.number} status={ticket.status} />
    </li>
  );
}
