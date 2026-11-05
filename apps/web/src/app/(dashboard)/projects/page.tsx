import { getProjectMemory, listProjects } from "@simple-jira/core";
import Link from "next/link";
import { MemoryEditor } from "@/components/memory-editor";
import { ProjectForm } from "@/components/project-form";
import { requireOwner } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";

export default async function ProjectsPage() {
  await requireOwner();
  const db = adminDb();
  const projects = await listProjects(db);
  const memories = await Promise.all(projects.map((project) => getProjectMemory(db, project.id)));

  return (
    <main className="mx-auto max-w-5xl px-6 py-6">
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-ink-subtle">
        <Link href="/" className="hover:text-brand hover:underline">
          Dashboard
        </Link>{" "}
        / Projects
      </nav>
      <h1 className="mb-4 text-2xl font-medium text-ink">Projects</h1>

      <ul className="mb-8 space-y-3">
        {projects.map((project, index) => (
          <li key={project.id}>
            <details className="card">
              <summary className="cursor-pointer">
                <span className="font-medium text-ink">{project.name}</span>{" "}
                <span className="text-sm text-ink-subtlest">
                  {project.repo} · verify: {project.verify_commands.join(" && ") || "none"}
                </span>
              </summary>
              <div className="mt-4">
                <ProjectForm project={project} />
              </div>
              <div className="mt-6 border-t border-line pt-4">
                <h2 className="label">Project memory ({memories[index]!.length})</h2>
                <MemoryEditor projectId={project.id} memory={memories[index]!} />
              </div>
            </details>
          </li>
        ))}
      </ul>

      <details className="card">
        <summary className="cursor-pointer font-medium text-ink-subtle hover:text-ink">
          Add an existing project
        </summary>
        <div className="mt-4">
          <ProjectForm />
        </div>
      </details>
    </main>
  );
}
