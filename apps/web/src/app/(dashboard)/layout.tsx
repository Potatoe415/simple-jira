import { ACTIVE_STATUSES, getTicketCounts, getWorkerStatus, isWorkerOnline, listProjects } from "@simple-jira/core";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SidePanel, type PanelSection } from "@/components/side-panel";
import { requireOwner } from "@/lib/auth";
import { filtersHref, VIEWS, type View } from "@/lib/filters";
import { timeAgo } from "@/lib/format";
import { adminDb } from "@/lib/supabase/admin";

const VIEW_TONES: Partial<Record<View, "amber" | "red" | "teal" | "emerald">> = {
  questions: "amber",
  pr: "teal",
  echecs: "red",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const db = adminDb();
  const [counts, projects, worker] = await Promise.all([getTicketCounts(db), listProjects(db), getWorkerStatus(db)]);
  const online = isWorkerOnline(worker);

  const sections: PanelSection[] = [
    {
      title: "Tickets",
      links: [
        { href: "/", label: "Dashboard" },
        ...(Object.entries(VIEWS) as [View, (typeof VIEWS)[View]][]).map(([view, { label, statuses }]) => ({
          href: filtersHref({ view }),
          label,
          count: statuses.reduce((sum, status) => sum + (counts.byStatus[status] ?? 0), 0),
          tone: VIEW_TONES[view],
        })),
      ],
    },
    {
      title: "Priority (active)",
      links: [1, 2, 3].map((priority) => ({
        href: filtersHref({ priority: String(priority), status: ACTIVE_STATUSES.join(",") }),
        label: priority === 1 ? "P1: urgent" : priority === 2 ? "P2" : "P3: normal",
        count: counts.activeByPriority[priority as 1 | 2 | 3] ?? 0,
        tone: priority === 1 ? ("red" as const) : undefined,
      })),
    },
    {
      title: "Projects",
      links: [
        ...projects.map((project) => ({
          href: filtersHref({ project: project.slug }),
          label: project.name,
          count: counts.byProject[project.id] ?? 0,
        })),
        { href: "/projects", label: "Manage projects →" },
      ],
    },
  ];

  return (
    <>
      <Header />
      <div className="lg:flex">
        <Suspense>
          <SidePanel
            sections={sections}
            worker={{
              online,
              label: online ? "Worker online" : "Worker offline",
              title: worker ? `${worker.hostname}, seen ${timeAgo(worker.last_seen_at)}` : "never seen",
            }}
          />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
