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
  amber: "bg-[#f8e6a0] text-[#7f5f01]",
  red: "bg-[#ffd5d2] text-[#ae2e24]",
  teal: "bg-[#c6edfb] text-[#206a83]",
  emerald: "bg-[#baf3db] text-[#216e4e]",
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
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4 text-sm">
      <div className="flex items-center gap-3 px-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#6e5dc6] text-base text-white" aria-hidden>
          ◆
        </span>
        <Link href="/" className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-semibold text-ink">simple-jira</span>
          <span className="block text-xs text-ink-subtle">Agent control center</span>
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden rounded-[3px] p-1 text-ink-subtle hover:bg-tint hover:text-ink lg:block"
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-[3px] p-1 text-ink-subtle hover:bg-tint lg:hidden"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>
      <span
        className={`mx-1 inline-flex w-fit items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-xs font-medium ${
          worker.online ? "bg-success-subtle text-success" : "bg-tint text-ink-subtle"
        }`}
        title={worker.title}
      >
        <span className={`h-2 w-2 rounded-full ${worker.online ? "bg-[#22a06b]" : "bg-line-bold"}`} />
        {worker.label}
      </span>
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{section.title}</h2>
          <ul className="space-y-0.5">
            {section.links.map((link) => {
              const active = isActive(link.href, pathname, search);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2 rounded-[3px] px-3 py-2 font-medium ${
                      active
                        ? "bg-brand-subtle text-brand before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-brand"
                        : "text-ink-subtle hover:bg-tint hover:text-ink"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    {link.count !== undefined && link.count > 0 && (
                      <span
                        className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                          link.tone ? TONES[link.tone] : "bg-tint text-ink-subtle"
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
        className="fixed left-3 top-3 z-30 rounded-[3px] bg-tint px-2.5 py-1 text-sm text-ink hover:bg-tint-hover lg:hidden"
        aria-label="Open menu"
      >
        ☰
      </button>
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="fixed bottom-4 left-2 z-30 hidden rounded-full border border-line bg-white px-2 py-1 text-sm text-ink-subtle shadow hover:text-brand lg:block"
          title="Expand panel"
          aria-label="Expand panel"
        >
          »
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-40 bg-[#091e427d] lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 border-r border-line bg-white transition-transform lg:sticky lg:top-14 lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:hidden" : ""}`}
      >
        {nav}
      </aside>
    </>
  );
}
