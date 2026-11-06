"use client";

import type { ParentCandidate } from "@simple-jira/core";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TicketForm, type TicketKind } from "./ticket-form";

const KINDS: { kind: TicketKind; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "subtask", label: "Sub-task" },
  { kind: "idea", label: "Idea" },
];

const LABEL = "Add ticket";

// "+" icon in the top bar: one entry point for every new ticket, in a modal dialog.
// Native <dialog> (focus trap, Escape, backdrop); auto-refresh pauses while it is open (data-pause-refresh).
export function NewTicketDialog({
  projects,
  parents,
}: {
  projects: { slug: string; name: string }[];
  parents: ParentCandidate[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TicketKind>("task");
  const [formKey, setFormKey] = useState(0);
  const pathname = usePathname();
  const params = useParams<{ number?: string }>();
  // On a task page, "Sub-task" starts with that task as parent.
  const pageNumber = Number(params?.number);
  const pageParent = parents.find((parent) => parent.number === pageNumber)?.number;

  // The form redirects to the new ticket on success: close on navigation.
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  function show() {
    setKind("task");
    setFormKey((key) => key + 1);
    setOpen(true);
    ref.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        title={LABEL}
        aria-label={LABEL}
        data-testid="new-ticket"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-hover"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <dialog
        ref={ref}
        aria-labelledby="new-ticket-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-[3px] border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-[#091e427a]"
        {...(open ? { "data-pause-refresh": "" } : {})}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <h2 id="new-ticket-title" className="text-lg font-medium">
            {LABEL}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-subtle hover:bg-tint hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div role="radiogroup" aria-label="Kind of ticket" className="inline-flex rounded-[3px] bg-tint p-0.5">
            {KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={kind === option.kind}
                onClick={() => setKind(option.kind)}
                className={`rounded-[3px] px-3 py-1 text-sm font-medium ${
                  kind === option.kind ? "bg-white text-brand shadow-sm" : "text-ink-subtle hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {open && (
            <TicketForm
              key={`${formKey}-${kind}`}
              kind={kind}
              projects={projects}
              parents={parents}
              defaultParent={pageParent}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
