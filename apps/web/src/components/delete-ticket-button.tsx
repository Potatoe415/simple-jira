"use client";

import { ACTIVE_STATUSES, type TicketStatus } from "@simple-jira/core";
import { useTransition } from "react";
import { deleteTicketAction } from "@/app/actions";

export function DeleteTicketButton({ id, number, status }: { id: string; number: number; status: TicketStatus }) {
  const [pending, startTransition] = useTransition();
  const active = ACTIVE_STATUSES.includes(status);
  const label = active ? "Cancel the ticket before deleting it" : `Delete ticket #${number}`;

  return (
    <button
      type="button"
      disabled={active || pending}
      title={label}
      aria-label={label}
      data-testid="delete-ticket"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-ink-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-subtle"
      onClick={() => {
        if (!confirm(`Delete ticket #${number}? Its log and questions are deleted too. This cannot be undone.`)) return;
        const form = new FormData();
        form.set("ticket_id", id);
        startTransition(async () => {
          const result = await deleteTicketAction({}, form);
          if (result.error) alert(result.error);
        });
      }}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5" />
      </svg>
    </button>
  );
}
