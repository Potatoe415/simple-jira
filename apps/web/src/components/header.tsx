import Link from "next/link";
import { signOutAction } from "@/app/actions";

const navLink = "rounded-[3px] px-2 py-1.5 text-sm font-medium text-ink-subtle hover:bg-tint hover:text-ink";

// Global top bar, shown above the side panel on every dashboard page.
export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white pl-14 pr-4 lg:pl-4">
      <Link href="/" className="mr-4 flex items-center gap-2 text-ink">
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path d="M12 2 3 11l4 4 5-5 5 5 4-4z" fill="#1868db" />
          <path d="m12 10-5 5 5 5 5-5z" fill="#357de8" />
        </svg>
        <span className="text-lg font-semibold tracking-tight">simple-jira</span>
      </Link>
      <nav className="flex items-center gap-1">
        <Link href="/" className={navLink}>
          Dashboard
        </Link>
        <Link href="/projects" className={navLink}>
          Projects
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <span className="rounded-[3px] bg-tint px-1.5 py-0.5 font-mono text-xs text-ink-subtle">v0.01</span>
        <form action={signOutAction}>
          <button className={navLink}>Sign out</button>
        </form>
      </div>
    </header>
  );
}
