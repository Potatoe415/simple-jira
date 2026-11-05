import {
  ACTIVE_STATUSES,
  getTicketByNumber,
  getTicketRelations,
  listEvents,
  listQuestions,
  STATUS_LABELS,
  TYPE_LABELS,
  type TicketEvent,
  type TicketRef,
} from "@simple-jira/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelTicketAction, retryTicketAction, setPriorityAction, startIdeaAction } from "@/app/actions";
import { AnswerForm } from "@/components/answer-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { CommentForm } from "@/components/comment-form";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { TicketActions } from "@/components/ticket-actions";
import { requireOwner } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { adminDb } from "@/lib/supabase/admin";

const SCREENS_BUCKET = "ticket-screens";

type Screen = { path: string; status: number | null; local: string; storage: string | null };

// Screenshots of the latest browser check: signed URLs (1 h) from the private bucket, else local paths.
async function latestScreens(db: ReturnType<typeof adminDb>, events: TicketEvent[]) {
  const event = [...events].reverse().find((e) => e.kind === "browser" && Array.isArray(e.meta?.screens));
  if (!event) return null;
  const screens = event.meta!.screens as Screen[];
  const keys = screens.map((screen) => screen.storage).filter((key): key is string => !!key);
  const signed = keys.length
    ? ((await db.storage.from(SCREENS_BUCKET).createSignedUrls(keys, 3600)).data ?? [])
    : [];
  const urls = new Map(signed.map((entry) => [entry.path, entry.signedUrl]));
  return {
    ok: event.meta!.ok === true,
    at: event.created_at,
    screens: screens.map((screen) => ({ ...screen, url: screen.storage ? urls.get(screen.storage) : undefined })),
  };
}

function RefLink({ ticket }: { ticket: TicketRef }) {
  return (
    <Link href={`/tickets/${ticket.number}`} className="hover:text-brand hover:underline">
      <span className="text-ink-subtlest">#{ticket.number}</span> {ticket.title}{" "}
      <span className="text-xs text-ink-subtlest">({STATUS_LABELS[ticket.status]})</span>
    </Link>
  );
}

export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  await requireOwner();
  const { number } = await params;
  const parsed = Number(number);
  if (!Number.isInteger(parsed) || parsed <= 0) notFound();

  const db = adminDb();
  const ticket = await getTicketByNumber(db, parsed);
  if (!ticket) notFound();
  const [events, questions, relations] = await Promise.all([
    listEvents(db, ticket.id),
    listQuestions(db, ticket.id),
    getTicketRelations(db, ticket),
  ]);
  const browser = await latestScreens(db, events).catch(() => null);
  const waiting = relations.blockers.filter((b) => b.status !== "delivered" && b.status !== "merged");
  const isActive = ACTIVE_STATUSES.includes(ticket.status);
  const canRetry = ticket.status === "failed" || ticket.status === "cancelled";

  return (
    <main className="mx-auto max-w-5xl px-6 py-6">
      {ticket.status === "queued" && <AutoRefresh seconds={10} />}
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-subtle">
        <Link href="/" className="hover:text-brand hover:underline">
          Dashboard
        </Link>{" "}
        / {ticket.project?.name ?? ticket.new_project?.name ?? "?"} / #{ticket.number}
      </nav>

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <StatusBadge status={ticket.status} />
        <h1 className="min-w-0 flex-1 text-2xl font-medium text-ink">
          <span className="text-ink-subtlest">#{ticket.number}</span> {ticket.title}
        </h1>
        <TicketActions
          id={ticket.id}
          number={ticket.number}
          status={ticket.status}
          preview_url={ticket.preview_url}
          pr_url={ticket.pr_url}
          merge_requested_at={ticket.merge_requested_at}
        />
        {isActive && (
          <form action={cancelTicketAction}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <button className="btn-ghost">Cancel</button>
          </form>
        )}
        {ticket.status === "idea" && (
          <form action={startIdeaAction}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <button className="btn" title="Queue this idea: the worker will develop it">
              Start
            </button>
          </form>
        )}
        {canRetry && (
          <form action={retryTicketAction}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <button className="btn">Retry</button>
          </form>
        )}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="label">Project</dt>
          <dd>{ticket.project?.name ?? ticket.new_project?.name ?? "?"}</dd>
        </div>
        <div>
          <dt className="label">Type</dt>
          <dd>{TYPE_LABELS[ticket.type]}</dd>
        </div>
        <div>
          <dt className="label">Created</dt>
          <dd>{timeAgo(ticket.created_at)}</dd>
        </div>
        <div>
          <dt className="label">Delivery</dt>
          <dd>{ticket.auto_merge ? "Straight to prod" : "PR to review"}</dd>
        </div>
        <div>
          <dt className="label">Priority</dt>
          <dd>
            {isActive ? (
              <form action={setPriorityAction} className="flex items-center gap-2">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <select name="priority" defaultValue={String(ticket.priority)} className="input w-auto py-1">
                  <option value="1">1: urgent</option>
                  <option value="2">2</option>
                  <option value="3">3: normal</option>
                </select>
                <button className="btn-ghost py-1 text-xs">OK</button>
              </form>
            ) : (
              ticket.priority
            )}
          </dd>
        </div>
        {(ticket.model || ticket.effort) && (
          <div>
            <dt className="label">Model</dt>
            <dd>{[ticket.model, ticket.effort && `effort ${ticket.effort}`].filter(Boolean).join(", ")}</dd>
          </div>
        )}
        {Number(ticket.cost_usd) > 0 && (
          <div>
            <dt className="label">Cost</dt>
            <dd>${Number(ticket.cost_usd).toFixed(2)}</dd>
          </div>
        )}
        {ticket.branch && (
          <div className="col-span-2">
            <dt className="label">Branch</dt>
            <dd className="truncate font-mono text-xs">{ticket.branch}</dd>
          </div>
        )}
        {ticket.pr_url && (
          <div className="col-span-2">
            <dt className="label">Pull request</dt>
            <dd>
              <a href={ticket.pr_url} target="_blank" rel="noreferrer" className="text-success hover:underline">
                {ticket.pr_url.replace("https://github.com/", "")} ↗
              </a>
            </dd>
          </div>
        )}
      </dl>

      <CommentForm ticketId={ticket.id} number={ticket.number} active={isActive} />

      {(relations.parent || relations.children.length > 0 || relations.blockers.length > 0) && (
        <section className="card mb-4 space-y-3 text-sm">
          {relations.parent && (
            <div>
              <h2 className="label">Parent ticket</h2>
              <RefLink ticket={relations.parent} />
            </div>
          )}
          {relations.blockers.length > 0 && (
            <div>
              <h2 className="label">
                Depends on{" "}
                {waiting.length > 0 && ticket.status === "queued" && (
                  <span className="normal-case text-warning">: waiting on {waiting.length} ticket(s)</span>
                )}
              </h2>
              <ul className="space-y-1">
                {relations.blockers.map((blocker) => (
                  <li key={blocker.id}>
                    <RefLink ticket={blocker} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {relations.children.length > 0 && (
            <div>
              <h2 className="label">Sub-tickets</h2>
              <ul className="space-y-1">
                {relations.children.map((child) => (
                  <li key={child.id}>
                    <RefLink ticket={child} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="card mb-4">
        <h2 className="label">Request</h2>
        <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        {ticket.goal && (
          <>
            <h2 className="label mt-4">Goal</h2>
            <p className="text-sm">{ticket.goal}</p>
          </>
        )}
        {ticket.steps.length > 0 && (
          <>
            <h2 className="label mt-4">Steps</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {ticket.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </>
        )}
        {ticket.worktree_path && (
          <p className="mt-4 font-mono text-xs text-ink-subtlest">Worktree: {ticket.worktree_path}</p>
        )}
      </section>

      {ticket.error && (
        <section className="card mb-4 border-[#ffd5d2] bg-danger-subtle">
          <h2 className="label text-danger">Error</h2>
          <pre className="whitespace-pre-wrap font-mono text-xs text-danger">{ticket.error}</pre>
        </section>
      )}

      {ticket.summary && (
        <section className="card mb-4 border-[#baf3db] bg-success-subtle">
          <h2 className="label">Agent summary</h2>
          <p className="whitespace-pre-wrap text-sm">{ticket.summary}</p>
        </section>
      )}

      {questions.length > 0 && (
        <section className="card mb-4">
          <h2 className="label">Questions</h2>
          <ul className="space-y-4">
            {questions.map((question) => (
              <li key={question.id}>
                <p className="whitespace-pre-wrap text-sm">{question.question}</p>
                {question.answer ? (
                  <p className="mt-1 text-sm text-success">→ {question.answer}</p>
                ) : (
                  <AnswerForm questionId={question.id} options={question.options} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {browser && (
        <section className={`card mb-4 ${browser.ok ? "border-[#c6edfb] bg-info-subtle" : "border-[#f8e6a0] bg-warning-subtle"}`}>
          <h2 className="label">
            Browser test {browser.ok ? "✓" : "⚠"}{" "}
            <span className="normal-case text-ink-subtlest">{timeAgo(browser.at)}</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {browser.screens.map((screen) => (
              <li key={screen.path} className="text-xs">
                <div className="mb-1 font-mono text-ink-subtle">
                  {screen.path} · HTTP {screen.status ?? "?"}
                </div>
                {screen.url ? (
                  <a href={screen.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={screen.url} alt={`Screenshot of ${screen.path}`} className="rounded border border-line" />
                  </a>
                ) : (
                  <span className="font-mono text-ink-subtlest">Local screenshot: {screen.local}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Timeline number={ticket.number} status={ticket.status} initial={events} />
    </main>
  );
}
