"use client";

import type { ProjectMemory } from "@simple-jira/core";
import { useActionState, useEffect, useRef } from "react";
import { deleteMemoryAction, saveMemoryAction } from "@/app/actions";

export function MemoryEditor({ projectId, memory }: { projectId: string; memory: ProjectMemory[] }) {
  const [state, action, pending] = useActionState(saveMemoryAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-subtlest">
        Added to every TASK.md of this project. The agent enriches it with what it learns when a ticket
        finishes (40 entries max, most recent kept).
      </p>
      {memory.length === 0 ? (
        <p className="text-sm text-ink-subtlest">No entries.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {memory.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{entry.key}</span>{" "}
                <span className="text-ink-subtle">: {entry.body}</span>
              </span>
              <form action={deleteMemoryAction}>
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="id" value={entry.id} />
                <button className="text-xs text-ink-subtlest hover:text-danger" title="Delete" aria-label="Delete">
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form ref={formRef} action={action} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="project_id" value={projectId} />
        <input name="key" required maxLength={100} placeholder="Topic (e.g. build)" className="input w-40" />
        <input name="body" required maxLength={500} placeholder="The fact to remember" className="input min-w-48 flex-1" />
        <button className="btn" disabled={pending}>
          {pending ? "…" : "Add or replace"}
        </button>
        {state.error && <span className="w-full whitespace-pre-wrap text-sm text-danger">{state.error}</span>}
      </form>
    </div>
  );
}
