import { getWorkerStatus, listProjects } from "@simple-jira/core";
import { Header } from "@/components/header";
import { ProjectForm } from "@/components/project-form";
import { requireOwner } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";

export default async function ProjectsPage() {
  await requireOwner();
  const db = adminDb();
  const [projects, worker] = await Promise.all([listProjects(db), getWorkerStatus(db)]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Header worker={worker} />
      <h1 className="mb-4 text-xl font-semibold">Projets</h1>

      <ul className="mb-8 space-y-3">
        {projects.map((project) => (
          <li key={project.id}>
            <details className="card">
              <summary className="cursor-pointer">
                <span className="font-medium">{project.name}</span>{" "}
                <span className="text-sm text-zinc-500">
                  {project.repo} · vérif : {project.verify_commands.join(" && ") || "aucune"}
                </span>
              </summary>
              <div className="mt-4">
                <ProjectForm project={project} />
              </div>
            </details>
          </li>
        ))}
      </ul>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Ajouter un projet existant
        </summary>
        <div className="mt-4">
          <ProjectForm />
        </div>
      </details>
    </main>
  );
}
