import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTicketSchema,
  prioritySchema,
  projectSchema,
  slugify,
  type CreateTicketInput,
  type ProjectInput,
} from "./schemas";
import {
  ACTIVE_STATUSES,
  type EventKind,
  type OpenQuestion,
  type Project,
  type Question,
  type Ticket,
  type TicketEvent,
  type TicketStatus,
  type TicketWithProject,
  type WorkerStatus,
} from "./types";

export type Db = SupabaseClient;

const TICKET_WITH_PROJECT = "*, project:projects(slug, name)";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export async function listProjects(db: Db): Promise<Project[]> {
  const { data, error } = await db.from("projects").select("*").order("name");
  if (error) fail("listProjects", error);
  return data as Project[];
}

export async function getProjectBySlug(db: Db, slug: string): Promise<Project | null> {
  const { data, error } = await db.from("projects").select("*").eq("slug", slug).maybeSingle();
  if (error) fail("getProjectBySlug", error);
  return data as Project | null;
}

export async function getProject(db: Db, id: string): Promise<Project> {
  const { data, error } = await db.from("projects").select("*").eq("id", id).single();
  if (error) fail("getProject", error);
  return data as Project;
}

export async function saveProject(db: Db, input: ProjectInput, id?: string): Promise<Project> {
  const values = projectSchema.parse(input);
  const query = id
    ? db.from("projects").update(values).eq("id", id)
    : db.from("projects").insert(values);
  const { data, error } = await query.select("*").single();
  if (error) fail("saveProject", error);
  return data as Project;
}

export async function addEvent(db: Db, ticketId: string, kind: EventKind, message: string) {
  const { error } = await db
    .from("ticket_events")
    .insert({ ticket_id: ticketId, kind, message: message.slice(0, 20000) });
  if (error) fail("addEvent", error);
}

export async function createTicket(db: Db, input: CreateTicketInput): Promise<Ticket> {
  const values = createTicketSchema.parse(input);
  let projectId: string | null = null;

  if (values.type === "new_project") {
    const existing = await getProjectBySlug(db, values.new_project!.slug);
    if (existing) throw new Error(`Le projet "${values.new_project!.slug}" existe déjà`);
  } else {
    const project = await getProjectBySlug(db, values.project_slug!);
    if (!project) throw new Error(`Projet inconnu : "${values.project_slug}"`);
    projectId = project.id;
  }

  const { data, error } = await db
    .from("tickets")
    .insert({
      project_id: projectId,
      type: values.type,
      title: values.title,
      description: values.description,
      slug: values.slug ?? slugify(values.new_project?.slug ?? values.title),
      goal: values.goal || null,
      steps: values.steps,
      auto_merge: values.auto_merge,
      priority: values.priority,
      new_project: values.type === "new_project" ? values.new_project : null,
      source: values.source,
    })
    .select("*")
    .single();
  if (error) fail("createTicket", error);

  const ticket = data as Ticket;
  await addEvent(db, ticket.id, "status", `Ticket créé (${values.source})`);
  return ticket;
}

export async function listTickets(
  db: Db,
  options: { statuses?: readonly TicketStatus[]; limit?: number } = {},
): Promise<TicketWithProject[]> {
  let query = db
    .from("tickets")
    .select(TICKET_WITH_PROJECT)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.statuses) query = query.in("status", [...options.statuses]);
  const { data, error } = await query;
  if (error) fail("listTickets", error);
  return data as TicketWithProject[];
}

export async function getTicketByNumber(db: Db, number: number): Promise<TicketWithProject | null> {
  const { data, error } = await db
    .from("tickets")
    .select(TICKET_WITH_PROJECT)
    .eq("number", number)
    .maybeSingle();
  if (error) fail("getTicketByNumber", error);
  return data as TicketWithProject | null;
}

export async function getTicket(db: Db, id: string): Promise<Ticket> {
  const { data, error } = await db.from("tickets").select("*").eq("id", id).single();
  if (error) fail("getTicket", error);
  return data as Ticket;
}

export async function updateTicket(db: Db, id: string, patch: Partial<Ticket>): Promise<void> {
  const { error } = await db.from("tickets").update(patch).eq("id", id);
  if (error) fail("updateTicket", error);
}

export async function listEvents(db: Db, ticketId: string, limit = 300): Promise<TicketEvent[]> {
  const { data, error } = await db
    .from("ticket_events")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) fail("listEvents", error);
  return (data as TicketEvent[]).reverse();
}

export async function listQuestions(db: Db, ticketId: string): Promise<Question[]> {
  const { data, error } = await db
    .from("questions")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at");
  if (error) fail("listQuestions", error);
  return data as Question[];
}

export async function listOpenQuestions(db: Db): Promise<OpenQuestion[]> {
  const { data, error } = await db
    .from("questions")
    .select("*, ticket:tickets!inner(id, number, title, type, project:projects(slug, name))")
    .is("answer", null)
    .order("created_at");
  if (error) fail("listOpenQuestions", error);
  return data as OpenQuestion[];
}

export async function askQuestion(db: Db, ticketId: string, question: string, options: string[] = []) {
  const { error } = await db.from("questions").insert({ ticket_id: ticketId, question, options });
  if (error) fail("askQuestion", error);
}

export async function answerQuestion(db: Db, questionId: string, answer: string): Promise<string> {
  const { data, error } = await db.rpc("answer_question", {
    p_question_id: questionId,
    p_answer: answer,
  });
  if (error) fail("answerQuestion", error);
  return data as string;
}

export async function cancelTicket(db: Db, ticketId: string): Promise<void> {
  const { data, error } = await db
    .from("tickets")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", ticketId)
    .in("status", [...ACTIVE_STATUSES])
    .select("id");
  if (error) fail("cancelTicket", error);
  if (!data.length) throw new Error("Ce ticket n'est plus actif");
  await addEvent(db, ticketId, "status", "Ticket annulé");
}

export async function retryTicket(db: Db, ticketId: string): Promise<void> {
  const { data, error } = await db
    .from("tickets")
    .update({ status: "queued", error: null, finished_at: null, verify_attempts: 0 })
    .eq("id", ticketId)
    .in("status", ["failed", "cancelled"])
    .select("id");
  if (error) fail("retryTicket", error);
  if (!data.length) throw new Error("Seul un ticket en échec ou annulé peut être relancé");
  await addEvent(db, ticketId, "status", "Relance demandée");
}

export async function setPriority(db: Db, ticketId: string, priority: number): Promise<void> {
  const value = prioritySchema.parse(priority);
  const { data, error } = await db
    .from("tickets")
    .update({ priority: value })
    .eq("id", ticketId)
    .in("status", [...ACTIVE_STATUSES])
    .select("id");
  if (error) fail("setPriority", error);
  if (!data.length) throw new Error("La priorité ne change que pour un ticket encore actif");
  await addEvent(db, ticketId, "status", `Priorité ${value}`);
}

export async function requestMerge(db: Db, ticketId: string): Promise<void> {
  const { data, error } = await db
    .from("tickets")
    .update({ merge_requested_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("status", "delivered")
    .is("merged_at", null)
    .select("id");
  if (error) fail("requestMerge", error);
  if (!data.length) throw new Error("Seul un ticket avec une PR prête peut être mergé");
  await addEvent(db, ticketId, "status", "Merge en prod demandé");
}

export async function getWorkerStatus(db: Db): Promise<WorkerStatus | null> {
  const { data, error } = await db
    .from("worker_status")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("getWorkerStatus", error);
  return data as WorkerStatus | null;
}

export function isWorkerOnline(status: WorkerStatus | null, now = Date.now()): boolean {
  return !!status && now - new Date(status.last_seen_at).getTime() < 90_000;
}
