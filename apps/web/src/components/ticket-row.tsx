import type { SubtaskProgress, TicketWithProject } from "@simple-jira/core";
import Link from "next/link";
import { timeAgo } from "@/lib/format";
import { startIdeaAction } from "@/app/actions";
import { DeleteTicketButton } from "./delete-ticket-button";
import { PriorityIcon, ProjectLabel, StatusBadge, TypeIcon } from "./status-badge";
import { TicketActions } from "./ticket-actions";

// `progress`: the row is a task with sub-tasks. `sub`: the row is a sub-task shown under its task.
export function TicketRow({
  ticket,
  progress,
  sub = false,
}: {
  ticket: TicketWithProject;
  progress?: SubtaskProgress;
  sub?: boolean;
}) {
  const project = ticket.project?.name ?? ticket.new_project?.name ?? "?";
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-3 hover:bg-sunken ${sub ? "pl-9" : "pl-3"}`}>
      {sub && (
        <span aria-hidden className="-ml-5 text-ink-subtlest">
          ↳
        </span>
      )}
      <TypeIcon type={ticket.type} />
      <Link href={`/tickets/${ticket.number}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand hover:underline">
        <span className="text-ink-subtle">#{ticket.number}</span>
        <span className="ml-2">{ticket.title}</span>
      </Link>
      {progress && (
        <span
          className="shrink-0 rounded-[3px] bg-tint px-1.5 text-xs text-ink-subtle"
          title={`${progress.done} of ${progress.total} sub-task(s) delivered or in prod`}
        >
          {progress.done}/{progress.total}
        </span>
      )}
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
      {ticket.status === "idea" && (
        <form action={startIdeaAction}>
          <input type="hidden" name="ticket_id" value={ticket.id} />
          <button className="btn-ghost h-8 py-0 text-xs" title="Queue this idea: the worker will develop it">
            Start
          </button>
        </form>
      )}
      <DeleteTicketButton id={ticket.id} number={ticket.number} status={ticket.status} />
    </li>
  );
}
