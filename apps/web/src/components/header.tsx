import { isWorkerOnline, type WorkerStatus } from "@simple-jira/core";
import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { timeAgo } from "@/lib/format";

export function Header({ worker }: { worker: WorkerStatus | null }) {
  const online = isWorkerOnline(worker);
  return (
    <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-zinc-800 pb-4">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        simple-jira
      </Link>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
          online ? "bg-emerald-950 text-emerald-300" : "bg-zinc-800 text-zinc-400"
        }`}
        title={worker ? `${worker.hostname}, vu ${timeAgo(worker.last_seen_at)}` : "jamais vu"}
      >
        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-zinc-500"}`} />
        {online ? "Worker en ligne" : "Worker hors ligne"}
      </span>
      <nav className="ml-auto flex items-center gap-3 text-sm text-zinc-400">
        <Link href="/" className="hover:text-zinc-100">
          Tableau de bord
        </Link>
        <Link href="/projects" className="hover:text-zinc-100">
          Projets
        </Link>
        <form action={signOutAction}>
          <button className="hover:text-zinc-100">Déconnexion</button>
        </form>
      </nav>
    </header>
  );
}
