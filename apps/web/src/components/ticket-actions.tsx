"use client";

import type { Ticket } from "@simple-jira/core";
import { useTransition } from "react";
import { requestMergeAction } from "@/app/actions";

type Props = Pick<Ticket, "id" | "number" | "status" | "preview_url" | "pr_url" | "merge_requested_at">;

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 7v10M6 9c0 3 3 3 6 3h4" />
    </svg>
  );
}

const iconButton =
  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium disabled:cursor-wait disabled:opacity-60";

export function TicketActions(props: Props) {
  const [pending, startTransition] = useTransition();
  const canMerge = props.status === "delivered";
  const merging = canMerge && (!!props.merge_requested_at || pending);

  return (
    <div className="flex items-center gap-2">
      {props.preview_url ? (
        <a
          href={props.preview_url}
          target="_blank"
          rel="noreferrer"
          title="View preview"
          aria-label="View preview"
          className={`${iconButton} border-brand/40 text-brand hover:bg-brand-subtle`}
        >
          <EyeIcon />
          <span className="hidden sm:inline">Preview</span>
        </a>
      ) : (
        canMerge && (
          <span className={`${iconButton} border-line text-ink-subtlest`} title="Preview deploying">
            <EyeIcon />
            <span className="hidden sm:inline">…</span>
          </span>
        )
      )}
      {canMerge && (
        <button
          type="button"
          disabled={merging}
          title="Merge to prod"
          aria-label="Merge to prod"
          className={`${iconButton} border-success/40 text-success hover:bg-success-subtle`}
          onClick={() => {
            if (!confirm(`Merge ticket #${props.number} into main? It will ship to prod.`)) return;
            const form = new FormData();
            form.set("ticket_id", props.id);
            startTransition(() => requestMergeAction(form));
          }}
        >
          <MergeIcon />
          <span className="hidden sm:inline">{merging ? "Merge…" : "Merge to prod"}</span>
        </button>
      )}
    </div>
  );
}
