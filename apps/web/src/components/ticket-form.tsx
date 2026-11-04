"use client";

import { useActionState, useState } from "react";
import { createTicketAction } from "@/app/actions";

const NEW_PROJECT = "__new__";

export function TicketForm({ projects }: { projects: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTicketAction, {});
  const [project, setProject] = useState(projects[0]?.slug ?? NEW_PROJECT);
  const isNew = project === NEW_PROJECT;

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="project">
            Projet
          </label>
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
            <option value={NEW_PROJECT}>+ Nouveau projet</option>
          </select>
        </div>
        {!isNew && (
          <div>
            <label className="label" htmlFor="type">
              Type
            </label>
            <select id="type" name="type" className="input" defaultValue="fix">
              <option value="fix">Correctif</option>
              <option value="feature">Fonctionnalité</option>
            </select>
          </div>
        )}
      </div>

      {isNew && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="new_name">
              Nom du projet
            </label>
            <input id="new_name" name="new_name" required className="input" placeholder="Mon super jeu" />
          </div>
          <div>
            <label className="label" htmlFor="new_slug">
              Slug (nom du repo)
            </label>
            <input
              id="new_slug"
              name="new_slug"
              required
              pattern="[a-z0-9][a-z0-9\-]*"
              className="input"
              placeholder="mon-super-jeu"
            />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="title">
          Titre
        </label>
        <input id="title" name="title" required maxLength={200} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Demande
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          className="input"
          placeholder="Ce qui ne va pas, ou ce que tu veux. Comme tu le dirais à voix haute."
        />
      </div>
      <div>
        <label className="label" htmlFor="goal">
          Objectif (&quot;fini&quot; =)
        </label>
        <input id="goal" name="goal" className="input" placeholder="Optionnel : par défaut, le titre" />
      </div>
      <div>
        <label className="label" htmlFor="steps">
          Étapes <span className="normal-case text-zinc-500">(une par ligne, optionnel)</span>
        </label>
        <textarea id="steps" name="steps" rows={4} className="input font-mono" />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="auto_merge" className="h-4 w-4 accent-emerald-500" />
        Direct en prod (merge automatique dès que la PR est prête)
      </label>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Création…" : "Mettre en file"}
        </button>
        {state.error && <span className="whitespace-pre-wrap text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
