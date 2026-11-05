"use client";

import type { OpenQuestion } from "@simple-jira/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { timeAgo } from "@/lib/format";
import { AnswerForm } from "./answer-form";

// Bell in the top bar: count of open agent questions, and a dropdown to answer them in place.
export function AlertsMenu({ questions, blockedHref }: { questions: OpenQuestion[]; blockedHref: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const count = questions.length;
  const label = count ? `${count} agent question${count === 1 ? "" : "s"} waiting` : "No agent questions";

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const close = (event: Event) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.contains(event.target as Node)) {
        menu.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        title={label}
        aria-label={label}
        data-testid="alerts-menu"
        className="relative flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-ink-subtle hover:bg-tint hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c9372c] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </summary>

      <div className="fixed inset-x-2 top-14 z-30 max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-[3px] border border-line bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-[28rem]">
        <h2 className="border-b border-line px-4 py-3 font-semibold text-ink">Agent questions</h2>
        {count === 0 ? (
          <p className="px-4 py-6 text-center text-ink-subtlest">No blocked agents.</p>
        ) : (
          <ul className="divide-y divide-line">
            {questions.map((question) => (
              <li key={question.id} className="px-4 py-3">
                <div className="mb-1 text-xs text-ink-subtle">
                  <Link href={`/tickets/${question.ticket.number}`} className="text-brand hover:underline">
                    #{question.ticket.number} · {question.ticket.project?.name ?? "?"} · {question.ticket.title}
                  </Link>{" "}
                  · {timeAgo(question.created_at)}
                </div>
                <p className="whitespace-pre-wrap text-ink">{question.question}</p>
                <AnswerForm questionId={question.id} options={question.options} />
              </li>
            ))}
          </ul>
        )}
        {count > 0 && (
          <Link href={blockedHref} className="block border-t border-line px-4 py-2 text-sm text-brand hover:bg-sunken">
            See blocked tickets
          </Link>
        )}
      </div>
    </details>
  );
}
