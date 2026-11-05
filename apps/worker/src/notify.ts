import type { Project, Ticket } from "@simple-jira/core";
import { config } from "./config";
import { redact } from "./redact";

export type NotifyEvent = "pr_ready" | "question" | "failed" | "merged";

const TITLES: Record<NotifyEvent, string> = {
  pr_ready: "PR prête",
  question: "Question en attente",
  failed: "Échec",
  merged: "En prod",
};

const TAGS: Record<NotifyEvent, string> = {
  pr_ready: "eyes",
  question: "question",
  failed: "x",
  merged: "rocket",
};

// ntfy-style push: POST the body to the topic URL, title/tags/click in headers. No-op when no URL is set.
export async function notify(
  event: NotifyEvent,
  ticket: Pick<Ticket, "number" | "title">,
  project: Pick<Project, "notify_url"> | null,
  detail?: string,
): Promise<void> {
  const url = project?.notify_url || config.notifyUrl;
  if (!url) return;
  const link = config.dashboardUrl ? `${config.dashboardUrl}/tickets/${ticket.number}` : "";
  const body = redact([`#${ticket.number} ${ticket.title}`, detail?.slice(0, 300), link].filter(Boolean).join("\n"));
  // HTTP headers must stay ASCII: accents are stripped from the title.
  const title = `simple-jira : ${TITLES[event]} #${ticket.number}`.normalize("NFD").replace(/[^\x20-\x7e]/g, "");
  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      headers: { Title: title, Tags: TAGS[event], ...(link ? { Click: link } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.warn(`notify ${event}: HTTP ${response.status}`);
  } catch (error) {
    console.warn(`notify ${event}: ${(error as Error).message}`);
  }
}
