"use client";

import { EFFORTS, STATUS_LABELS, type ParentCandidate } from "@simple-jira/core";
import { useActionState, useState } from "react";
import { createTicketAction } from "@/app/actions";

const NEW_PROJECT = "__new__";

export type TicketKind = "task" | "subtask" | "idea";

// task: the full form. idea: project, title, description only. subtask: the full form under a chosen parent task,
// in that task's project.
export function TicketForm({
  kind,
  projects,
  parents = [],
  defaultParent,
}: {
  kind: TicketKind;
  projects: { slug: string; name: string }[];
  parents?: ParentCandidate[];
  defaultParent?: number;
}) {
  const [state, action, pending] = useActionState(createTicketAction, {});
  const isSub = kind === "subtask";
  const idea = kind === "idea";
  const [parent, setParent] = useState(defaultParent ?? parents[0]?.number);
  const parentProject = parents.find((candidate) => candidate.number === parent)?.project;
  const [chosenProject, setProject] = useState(projects[0]?.slug ?? NEW_PROJECT);
  const project = isSub ? (parentProject?.slug ?? "") : chosenProject;
  const isNew = project === NEW_PROJECT;

  if (isSub && !parents.length) {
    return (
      <p className="rounded-[3px] bg-sunken px-3 py-4 text-center text-ink-subtle">
        No task can take a sub-task right now. Create a task first: a sub-task goes under a task that is queued, an idea,
        or already split.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {isSub && (
        <div>
          <label className="label" htmlFor="parent">
            Parent task
          </label>
          <select
            id="parent"
            name="parent"
            className="input"
            value={parent}
            onChange={(event) => setParent(Number(event.target.value))}
          >
            {parents.map((candidate) => (
              <option key={candidate.number} value={candidate.number}>
                #{candidate.number} {candidate.title} ({candidate.project.name}, {STATUS_LABELS[candidate.status]})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-subtlest">
            The worker then runs only the sub-tasks; the parent task follows their status.
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="project">
            Project
          </label>
          {isSub ? (
            <>
              <input type="hidden" name="project" value={project} />
              <p className="input bg-sunken hover:bg-sunken">{parentProject?.name ?? "?"}</p>
            </>
          ) : (
            <select
              id="project"
              name="project"
              className="input"
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
              <option value={NEW_PROJECT}>+ New project</option>
            </select>
          )}
        </div>
        {!isNew && (
          <div>
            <label className="label" htmlFor="type">
              Type
            </label>
            <select id="type" name="type" className="input" defaultValue="fix">
              <option value="fix">Fix</option>
              <option value="feature">Feature</option>
            </select>
          </div>
        )}
      </div>

      {isNew && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="new_name">
              Project name
            </label>
            <input id="new_name" name="new_name" required className="input" placeholder="My great game" />
          </div>
          <div>
            <label className="label" htmlFor="new_slug">
              Slug (repo name)
            </label>
            <input
              id="new_slug"
              name="new_slug"
              required
              pattern="[a-z0-9][a-z0-9\-]*"
              className="input"
              placeholder="my-great-game"
            />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="title">
          Title
        </label>
        <input id="title" name="title" required maxLength={200} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Request
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          className="input"
          placeholder={idea ? "The idea, in your words." : "What is wrong, or what you want. As you would say it out loud."}
        />
      </div>
      {idea ? (
        <input type="hidden" name="idea" value="on" />
      ) : (
        <>
      <div>
        <label className="label" htmlFor="goal">
          Goal (&quot;done&quot; =)
        </label>
        <input id="goal" name="goal" className="input" placeholder="Optional: defaults to the title" />
      </div>
      <div>
        <label className="label" htmlFor="steps">
          Steps <span className="normal-case text-ink-subtlest">(one per line, optional)</span>
        </label>
        <textarea id="steps" name="steps" rows={4} className="input font-mono" />
      </div>
      <div className="w-40">
        <label className="label" htmlFor="priority">
          Priority
        </label>
        <select id="priority" name="priority" className="input" defaultValue="3">
          <option value="1">1: urgent</option>
          <option value="2">2</option>
          <option value="3">3: normal</option>
        </select>
      </div>
      <details className="rounded-md border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm text-ink-subtle">Advanced options</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="model">
              Model
            </label>
            <input id="model" name="model" className="input" placeholder="Project default (e.g. opus, sonnet)" />
          </div>
          <div>
            <label className="label" htmlFor="effort">
              Effort
            </label>
            <select id="effort" name="effort" className="input" defaultValue="">
              <option value="">Project default</option>
              {EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="blocked_by">
              Depends on
            </label>
            <input id="blocked_by" name="blocked_by" className="input" placeholder="#12, #14: waits for their PR" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="check_paths">
              Pages to test on the preview <span className="normal-case text-ink-subtlest">(one per line, default /)</span>
            </label>
            <textarea id="check_paths" name="check_paths" rows={2} className="input font-mono" placeholder="/projects" />
          </div>
        </div>
      </details>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="auto_merge" defaultChecked className="h-4 w-4 accent-[#22a06b]" />
        Straight to prod (auto-merge as soon as the PR is ready)
      </label>
        </>
      )}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Saving…" : idea ? "Save idea" : isSub ? "Add sub-task" : "Queue it"}
        </button>
        {state.error && <span className="whitespace-pre-wrap text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
