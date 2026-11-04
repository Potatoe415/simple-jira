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
          title="Voir la preview"
          aria-label="Voir la preview"
          className={`${iconButton} border-sky-800 text-sky-300 hover:bg-sky-950`}
        >
          <EyeIcon />
          <span className="hidden sm:inline">Preview</span>
        </a>
      ) : (
        canMerge && (
          <span className={`${iconButton} border-zinc-800 text-zinc-500`} title="Preview en cours de déploiement">
            <EyeIcon />
            <span className="hidden sm:inline">…</span>
          </span>
        )
      )}
      {canMerge && (
        <button
          type="button"
          disabled={merging}
          title="Merger en prod"
          aria-label="Merger en prod"
          className={`${iconButton} border-emerald-800 text-emerald-300 hover:bg-emerald-950`}
          onClick={() => {
            if (!confirm(`Merger le ticket #${props.number} dans main ? Il partira en prod.`)) return;
            const form = new FormData();
            form.set("ticket_id", props.id);
            startTransition(() => requestMergeAction(form));
          }}
        >
          <MergeIcon />
          <span className="hidden sm:inline">{merging ? "Merge…" : "Merger en prod"}</span>
        </button>
      )}
    </div>
  );
}
