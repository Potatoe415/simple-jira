"use client";

import { useState } from "react";
import { TicketForm, type TicketFormDefaults } from "./ticket-form";

type Mode = "ticket" | "idea" | null;

// Buttons that open the creation form. Open state lives in React (not a <details>), and auto-refresh
// pauses while the form is open (data-pause-refresh), so the form never closes or resets on its own.
export function CreateTicketPanel({
  projects,
  initial = null,
  defaults = {},
  subtaskOnly = false,
}: {
  projects: { slug: string; name: string }[];
  initial?: Mode;
  defaults?: TicketFormDefaults;
  // On a task page: a single "+ Add sub-task" button.
  subtaskOnly?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initial);

  return (
    <section className="panel mb-6">
      <div className="flex flex-wrap items-center gap-2 px-2 py-2">
        <button
          type="button"
          className={mode === "ticket" ? "btn" : "btn-ghost"}
          aria-expanded={mode === "ticket"}
          onClick={() => setMode(mode === "ticket" ? null : "ticket")}
        >
          {subtaskOnly ? "+ Add sub-task" : "+ Create ticket"}
        </button>
        {!subtaskOnly && (
        <button
          type="button"
          className={mode === "idea" ? "btn" : "btn-ghost"}
          aria-expanded={mode === "idea"}
          onClick={() => setMode(mode === "idea" ? null : "idea")}
        >
          + New idea
        </button>
        )}
        {subtaskOnly && (
          <span className="text-sm text-ink-subtle">
            The worker then runs only the sub-tasks; this task follows their status.
          </span>
        )}
      </div>
      {mode && (
        <div className="card" data-pause-refresh>
          <TicketForm key={mode} projects={projects} idea={mode === "idea"} defaults={defaults} />
        </div>
      )}
    </section>
  );
}
