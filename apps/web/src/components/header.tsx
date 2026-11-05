import type { OpenQuestion } from "@simple-jira/core";
import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { filtersHref } from "@/lib/filters";
import { AlertsMenu } from "./alerts-menu";

const navLink = "rounded-[3px] px-2 py-1.5 text-sm font-medium text-ink-subtle hover:bg-tint hover:text-ink";

// Global top bar, shown above the side panel on every dashboard page.
export function Header({ questions }: { questions: OpenQuestion[] }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white pl-14 pr-4 lg:pl-4">
      <Link href="/" className="mr-1 flex items-center gap-2 text-ink sm:mr-4" aria-label="simple-jira home">
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path d="M12 2 3 11l4 4 5-5 5 5 4-4z" fill="#1868db" />
          <path d="m12 10-5 5 5 5 5-5z" fill="#357de8" />
        </svg>
        <span className="hidden text-lg font-semibold tracking-tight sm:inline">simple-jira</span>
      </Link>
      <nav className="flex items-center gap-1">
        <Link href="/" className={`${navLink} hidden sm:block`}>
          Dashboard
        </Link>
        <Link href="/projects" className={navLink}>
          Projects
        </Link>
        <a
          href="/api/context"
          download="claude-app-context.md"
          title="Download the Claude capture assistant context (claude-app-context.md)"
          className={`${navLink} inline-flex items-center gap-1.5`}
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
          </svg>
          Context
        </a>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <AlertsMenu questions={questions} blockedHref={filtersHref({ view: "questions" })} />
        <span className="hidden rounded-[3px] bg-tint px-1.5 py-0.5 font-mono text-xs text-ink-subtle sm:inline">v0.01</span>
        <form action={signOutAction}>
          <button className={navLink}>Sign out</button>
        </form>
      </div>
    </header>
  );
}
