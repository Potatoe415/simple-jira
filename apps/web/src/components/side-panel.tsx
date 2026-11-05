"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export interface PanelLink {
  href: string;
  label: string;
  count?: number;
  tone?: "amber" | "red" | "teal" | "emerald";
}

export interface PanelSection {
  title: string;
  links: PanelLink[];
}

const TONES = {
  amber: "bg-amber-900 text-amber-200",
  red: "bg-red-900 text-red-200",
  teal: "bg-teal-900 text-teal-200",
  emerald: "bg-emerald-900 text-emerald-200",
};

// Active when the path matches and every query param of the link is in the current URL (and nothing else for "/").
function isActive(href: string, pathname: string, search: URLSearchParams): boolean {
  const url = new URL(href, "http://x");
  if (url.pathname !== pathname) return pathname.startsWith(url.pathname) && url.pathname !== "/";
  const wanted = [...url.searchParams.entries()];
  if (!wanted.length) return pathname !== "/" || [...search.keys()].length === 0;
  return wanted.every(([key, value]) => search.get(key) === value) && [...search.keys()].length === wanted.length;
}

export function SidePanel({
  sections,
  worker,
}: {
  sections: PanelSection[];
  worker: { online: boolean; label: string; title: string };
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setOpen(false), [pathname, search]);
  useEffect(() => setCollapsed(localStorage.getItem("side-panel") === "collapsed"), []);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      localStorage.setItem("side-panel", value ? "open" : "collapsed");
      return !value;
    });
  };

  const nav = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-4 text-sm">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          simple-jira
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="ml-auto hidden rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 lg:block"
          title="Replier le panneau"
          aria-label="Replier le panneau"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto rounded p-1 text-zinc-400 hover:bg-zinc-800 lg:hidden"
          aria-label="Fermer le menu"
        >
          ✕
        </button>
      </div>
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
          worker.online ? "bg-emerald-950 text-emerald-300" : "bg-zinc-800 text-zinc-400"
        }`}
        title={worker.title}
      >
        <span className={`h-2 w-2 rounded-full ${worker.online ? "bg-emerald-400" : "bg-zinc-500"}`} />
        {worker.label}
      </span>
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{section.title}</h2>
          <ul className="space-y-0.5">
            {section.links.map((link) => {
              const active = isActive(link.href, pathname, search);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                      active ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {link.count !== undefined && link.count > 0 && (
                      <span
                        className={`rounded px-1.5 text-xs tabular-nums ${
                          link.tone ? TONES[link.tone] : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {link.count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-30 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm lg:hidden"
        aria-label="Ouvrir le menu"
      >
        ☰
      </button>
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="fixed left-2 top-3 z-30 hidden rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100 lg:block"
          title="Déplier le panneau"
          aria-label="Déplier le panneau"
        >
          »
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-zinc-950 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:hidden" : ""}`}
      >
        {nav}
      </aside>
    </>
  );
}
