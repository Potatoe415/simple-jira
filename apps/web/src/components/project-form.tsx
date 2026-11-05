"use client";

import { EFFORTS, type Project } from "@simple-jira/core";
import { useActionState } from "react";
import { saveProjectAction } from "@/app/actions";

function Field(props: { name: string; label: string; value?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        defaultValue={props.value}
        placeholder={props.placeholder}
        required={props.required}
        className="input"
      />
    </div>
  );
}

function Lines(props: { name: string; label: string; value?: string[]; placeholder?: string }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>
        {props.label} <span className="normal-case text-zinc-500">(une par ligne)</span>
      </label>
      <textarea
        id={props.name}
        name={props.name}
        rows={3}
        defaultValue={props.value?.join("\n")}
        placeholder={props.placeholder}
        className="input font-mono"
      />
    </div>
  );
}

export function ProjectForm({ project }: { project?: Project }) {
  const [state, action, pending] = useActionState(saveProjectAction, {});

  return (
    <form action={action} className="space-y-3">
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="name" label="Nom" value={project?.name} required />
        <Field name="slug" label="Slug" value={project?.slug} placeholder="mon-projet" required />
        <Field name="repo" label="Repo GitHub" value={project?.repo} placeholder="owner/name" required />
        <Field name="default_branch" label="Branche de base" value={project?.default_branch ?? "main"} />
      </div>
      <Field
        name="local_path"
        label="Chemin local"
        value={project?.local_path}
        placeholder="C:\Users\...\dev-projects\mon-projet"
        required
      />
      <div>
        <label className="label" htmlFor="description">
          Description (aide le routage)
        </label>
        <textarea id="description" name="description" rows={2} defaultValue={project?.description} className="input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Lines name="aliases" label="Surnoms" value={project?.aliases} placeholder="mucho" />
        <Lines name="env_files" label="Fichiers env à copier" value={project?.env_files} placeholder=".env.local" />
        <Lines name="setup_commands" label="Installation" value={project?.setup_commands} placeholder="npm ci" />
        <Lines name="verify_commands" label="Vérification" value={project?.verify_commands} placeholder="npm run check" />
      </div>
      <Field
        name="ship_command"
        label="Commande de livraison (commit + push de la branche)"
        value={project?.ship_command}
        placeholder={'powershell -File scripts/ship.ps1 -Message "<why>"'}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="default_model" label="Modèle par défaut" value={project?.default_model ?? ""} placeholder="CLI par défaut" />
        <div>
          <label className="label" htmlFor="default_effort">
            Effort par défaut
          </label>
          <select id="default_effort" name="default_effort" defaultValue={project?.default_effort ?? ""} className="input">
            <option value="">CLI par défaut</option>
            {EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </div>
        <Field name="notify_url" label="Notifications (URL ntfy)" value={project?.notify_url ?? ""} placeholder="NOTIFY_URL du worker" />
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          name="browser_check"
          defaultChecked={project?.browser_check !== false}
          className="h-4 w-4 accent-sky-500"
        />
        Test navigateur sur la preview (captures et erreurs console)
      </label>
      <div>
        <label className="label" htmlFor="agent_instructions">
          Consignes pour l&apos;agent
        </label>
        <textarea
          id="agent_instructions"
          name="agent_instructions"
          rows={4}
          defaultValue={project?.agent_instructions}
          className="input"
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Enregistrement…" : project ? "Enregistrer" : "Ajouter le projet"}
        </button>
        {state.ok && <span className="text-sm text-emerald-400">Enregistré</span>}
        {state.error && <span className="whitespace-pre-wrap text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
