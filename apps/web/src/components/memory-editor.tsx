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
      <p className="text-xs text-zinc-500">
        Added to every TASK.md of this project. The agent enriches it with what it learns when a ticket
        finishes (40 entries max, most recent kept).
      </p>
      {memory.length === 0 ? (
        <p className="text-sm text-zinc-500">No entries.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {memory.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-zinc-200">{entry.key}</span>{" "}
                <span className="text-zinc-400">: {entry.body}</span>
              </span>
              <form action={deleteMemoryAction}>
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="id" value={entry.id} />
                <button className="text-xs text-zinc-500 hover:text-red-400" title="Delete" aria-label="Delete">
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
        {state.error && <span className="w-full whitespace-pre-wrap text-sm text-red-400">{state.error}</span>}
      </form>
    </div>
  );
}
