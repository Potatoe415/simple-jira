"use client";

import type { EventKind, TicketEvent, TicketStatus } from "@simple-jira/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clockTime } from "@/lib/format";

const KIND_STYLE: Record<EventKind, { icon: string; label: string; color: string }> = {
  status: { icon: "●", label: "Status", color: "text-brand" },
  agent: { icon: "›", label: "Agent", color: "text-ink" },
  message: { icon: "›", label: "Agent", color: "text-ink" },
  plan: { icon: "☰", label: "Plan", color: "text-ink" },
  comment: { icon: "✎", label: "Agent note", color: "text-brand" },
  tool: { icon: "⚙", label: "Tool", color: "text-ink-subtlest" },
  verify: { icon: "✓", label: "Verification", color: "text-discovery" },
  check: { icon: "✓", label: "Verification", color: "text-discovery" },
  question: { icon: "?", label: "Question", color: "text-warning" },
  owner_comment: { icon: "✉", label: "You", color: "text-success" },
  pr: { icon: "⇄", label: "PR", color: "text-info" },
  browser: { icon: "◐", label: "Browser", color: "text-info" },
  error: { icon: "✗", label: "Error", color: "text-danger" },
  info: { icon: "·", label: "Info", color: "text-warning" },
};

const LIVE: TicketStatus[] = ["running", "verifying", "blocked"];

type Item = { kind: "single"; event: TicketEvent } | { kind: "tools"; events: TicketEvent[] };

// Consecutive tool calls collapse into one line the owner can open.
function group(events: TicketEvent[]): Item[] {
  const items: Item[] = [];
  for (const event of events) {
    const last = items[items.length - 1];
    if (event.kind === "tool" && last?.kind === "tools") last.events.push(event);
    else if (event.kind === "tool") items.push({ kind: "tools", events: [event] });
    else items.push({ kind: "single", event });
  }
  return items;
}

function Line({ event }: { event: TicketEvent }) {
  const style = KIND_STYLE[event.kind] ?? KIND_STYLE.info;
  const long = event.message.length > 400 || event.message.split("\n").length > 6;
  const body = long ? (
    <details>
      <summary className="cursor-pointer">{event.message.split("\n")[0]!.slice(0, 200)}</summary>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{event.message}</pre>
    </details>
  ) : (
    <span className="whitespace-pre-wrap break-words">{event.message}</span>
  );
  return (
    <li className="flex gap-2">
      <span className="w-16 shrink-0 text-ink-subtlest">{clockTime(event.created_at)}</span>
      <span className={`w-4 shrink-0 text-center ${style.color}`} title={style.label} aria-label={style.label}>
        {style.icon}
      </span>
      <div className={`min-w-0 flex-1 ${style.color}`}>{body}</div>
    </li>
  );
}

function Tools({ events }: { events: TicketEvent[] }) {
  const last = events[events.length - 1]!;
  if (events.length === 1) return <Line event={last} />;
  return (
    <li className="flex gap-2">
      <span className="w-16 shrink-0 text-ink-subtlest">{clockTime(last.created_at)}</span>
      <span className="w-4 shrink-0 text-center text-ink-subtlest" title="Tools">
        ⚙
      </span>
      <details className="min-w-0 flex-1 text-ink-subtlest">
        <summary className="cursor-pointer">
          {events.length} actions · last: {last.message.slice(0, 120)}
        </summary>
        <ol className="mt-1 space-y-0.5 border-l border-line pl-3">
          {events.map((event) => (
            <li key={event.id} className="break-words">
              <span className="text-ink-subtlest">{clockTime(event.created_at)}</span> {event.message}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

// Polls the owner-only events route while the agent works, and refreshes the page when the status changes.
export function Timeline({
  number,
  status,
  initial,
}: {
  number: number;
  status: TicketStatus;
  initial: TicketEvent[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initial);
  const [hideTools, setHideTools] = useState(false);
  const lastId = useRef(initial[initial.length - 1]?.id ?? 0);
  const statusRef = useRef(status);
  const live = LIVE.includes(status) || status === "queued";

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/tickets/${number}/events?after=${lastId.current}`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const data = (await response.json()) as { status: TicketStatus; events: TicketEvent[] };
        if (data.events.length) {
          lastId.current = data.events[data.events.length - 1]!.id;
          setEvents((current) => [...current, ...data.events].slice(-1000));
        }
        if (data.status !== statusRef.current) router.refresh();
      } catch {
        // Offline for a moment: the next tick retries.
      }
    };
    const id = setInterval(tick, LIVE.includes(status) ? 2500 : 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [live, number, router, status]);

  const shown = hideTools ? events.filter((event) => event.kind !== "tool") : events;

  return (
    <section className="card">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="label mb-0">Log</h2>
        {LIVE.includes(status) && (
          <span className="inline-flex items-center gap-1 text-xs text-brand">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> live
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-subtle">
          <input
            type="checkbox"
            checked={hideTools}
            onChange={(event) => setHideTools(event.target.checked)}
            className="accent-brand"
          />
          Hide tools
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-ink-subtlest">No events yet.</p>
      ) : (
        <ol className="space-y-1 font-mono text-xs">
          {group(shown).map((item) =>
            item.kind === "single" ? (
              <Line key={item.event.id} event={item.event} />
            ) : (
              <Tools key={item.events[0]!.id} events={item.events} />
            ),
          )}
        </ol>
      )}
    </section>
  );
}
