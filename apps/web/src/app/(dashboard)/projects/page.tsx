import { getProjectMemory, getWorkerStatus, listProjects } from "@simple-jira/core";
import { Header } from "@/components/header";
import { MemoryEditor } from "@/components/memory-editor";
import { ProjectForm } from "@/components/project-form";
import { requireOwner } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";

export default async function ProjectsPage() {
  await requireOwner();
  const db = adminDb();
  const [projects, worker] = await Promise.all([listProjects(db), getWorkerStatus(db)]);
  const memories = await Promise.all(projects.map((project) => getProjectMemory(db, project.id)));

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Header worker={worker} />
      <h1 className="mb-4 text-xl font-semibold">Projects</h1>

      <ul className="mb-8 space-y-3">
        {projects.map((project, index) => (
          <li key={project.id}>
            <details className="card">
              <summary className="cursor-pointer">
                <span className="font-medium">{project.name}</span>{" "}
                <span className="text-sm text-zinc-500">
                  {project.repo} · verify: {project.verify_commands.join(" && ") || "none"}
                </span>
              </summary>
              <div className="mt-4">
                <ProjectForm project={project} />
              </div>
              <div className="mt-6 border-t border-zinc-800 pt-4">
                <h2 className="label">Project memory ({memories[index]!.length})</h2>
                <MemoryEditor projectId={project.id} memory={memories[index]!} />
              </div>
            </details>
          </li>
        ))}
      </ul>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Add an existing project
        </summary>
        <div className="mt-4">
          <ProjectForm />
        </div>
      </details>
    </main>
  );
}
