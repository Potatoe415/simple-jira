import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTicketSchema,
  PROJECT_NEW_COLUMNS,
  prioritySchema,
  projectSchema,
  slugify,
  TICKET_NEW_COLUMNS,
  type CreateTicketInput,
  type ProjectInput,
} from "./schemas";
import {
  ACTIVE_STATUSES,
  type EventKind,
  type OpenQuestion,
  type Priority,
  type Project,
  type ProjectMemory,
  type Question,
  type Ticket,
  type TicketEvent,
  type TicketRef,
  type TicketStatus,
  type TicketType,
  type TicketWithProject,
  type WorkerStatus,
} from "./types";

export type Db = SupabaseClient;

const TICKET_WITH_PROJECT = "*, project:projects(slug, name)";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

type DbError = { code?: string; message: string } | null;

// True when a table or column added by a migration is not there yet (Postgres or PostgREST wording).
export function isMissingSchema(error: DbError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "")) return true;
  return /does not exist|could not find the .*(column|table)|schema cache/i.test(error.message);
}

function isKindCheck(error: DbError): boolean {
  return error?.code === "23514" && /ticket_events_kind_check/.test(error.message);
}

export const MIGRATION_HINT =
  "Applique la migration supabase/migrations/20261105090000_agent_visibility.sql dans l'éditeur SQL Supabase.";

function without(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key)));
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
  const parsed = projectSchema.parse(input);
  const values = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
  const write = (row: Record<string, unknown>) =>
    (id ? db.from("projects").update(row).eq("id", id) : db.from("projects").insert(row)).select("*").single();
  let { data, error } = await write(values);
  if (isMissingSchema(error)) ({ data, error } = await write(without(values, PROJECT_NEW_COLUMNS)));
  if (error) fail("saveProject", error);
  return data as Project;
}

// Before the agent-visibility migration the kind check only knows the first six kinds and there is no `meta`.
const LEGACY_KIND: Record<EventKind, EventKind> = {
  status: "status",
  agent: "agent",
  tool: "tool",
  verify: "verify",
  error: "error",
  info: "info",
  plan: "agent",
  message: "agent",
  comment: "agent",
  question: "info",
  owner_comment: "info",
  pr: "status",
  check: "verify",
  browser: "info",
};

let legacyEvents = false;

export interface NewEvent {
  ticket_id: string;
  kind: EventKind;
  message: string;
  meta?: Record<string, unknown> | null;
}

export async function addEvents(db: Db, rows: NewEvent[]): Promise<void> {
  if (!rows.length) return;
  const clean = rows.map((row) => ({ ...row, message: row.message.slice(0, 20000), meta: row.meta ?? null }));
  if (!legacyEvents) {
    const { error } = await db.from("ticket_events").insert(clean);
    if (!error) return;
    if (!isMissingSchema(error) && !isKindCheck(error)) fail("addEvent", error);
    legacyEvents = true;
  }
  const legacy = clean.map((row) => ({ ticket_id: row.ticket_id, kind: LEGACY_KIND[row.kind], message: row.message }));
  const { error } = await db.from("ticket_events").insert(legacy);
  if (error) fail("addEvent", error);
}

export async function addEvent(
  db: Db,
  ticketId: string,
  kind: EventKind,
  message: string,
  meta?: Record<string, unknown> | null,
) {
  await addEvents(db, [{ ticket_id: ticketId, kind, message, meta }]);
}

export async function addOwnerComment(db: Db, ticketId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error("Commentaire vide");
  if (text.length > 4000) throw new Error("Commentaire trop long (4000 caractères max)");
  const { error } = await db.from("ticket_events").insert({ ticket_id: ticketId, kind: "owner_comment", message: text });
  // The worker could not read it back: say so rather than store it under another kind.
  if (isMissingSchema(error) || isKindCheck(error)) throw new Error(`Commentaires indisponibles. ${MIGRATION_HINT}`);
  if (error) fail("addOwnerComment", error);
}

// Owner comments the worker has not copied into TASK.md yet.
export async function listUnreadOwnerComments(
  db: Db,
  ticket: Pick<Ticket, "id" | "comment_cursor">,
): Promise<TicketEvent[]> {
  const { data, error } = await db
    .from("ticket_events")
    .select("*")
    .eq("ticket_id", ticket.id)
    .eq("kind", "owner_comment")
    .gt("id", ticket.comment_cursor ?? 0)
    .order("id");
  if (isMissingSchema(error)) return [];
  if (error) fail("listUnreadOwnerComments", error);
  return data as TicketEvent[];
}

export async function markCommentsRead(db: Db, ticketId: string, cursor: number): Promise<void> {
  const { error } = await db.from("tickets").update({ comment_cursor: cursor }).eq("id", ticketId);
  if (error && !isMissingSchema(error)) fail("markCommentsRead", error);
}

export const MEMORY_MAX_ENTRIES = 40;
export const MEMORY_MAX_BODY = 500;

export async function getProjectMemory(db: Db, projectId: string): Promise<ProjectMemory[]> {
  const { data, error } = await db
    .from("project_memory")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(MEMORY_MAX_ENTRIES);
  if (isMissingSchema(error)) return [];
  if (error) fail("getProjectMemory", error);
  return data as ProjectMemory[];
}

// Upserts entries by key and keeps the newest MEMORY_MAX_ENTRIES. Returns false before the migration.
export async function setProjectMemory(
  db: Db,
  projectId: string,
  entries: { key: string; body: string }[],
): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = entries
    .map(({ key, body }) => ({ key: key.trim().slice(0, 100), body: body.trim().slice(0, MEMORY_MAX_BODY) }))
    .filter((entry) => entry.key && entry.body)
    .map((entry) => ({ ...entry, project_id: projectId, updated_at: now }));
  if (!rows.length) return true;
  const unique = [...new Map(rows.map((row) => [row.key, row])).values()];
  const { error } = await db.from("project_memory").upsert(unique, { onConflict: "project_id,key" });
  if (isMissingSchema(error)) return false;
  if (error) fail("setProjectMemory", error);

  const { data: stale } = await db
    .from("project_memory")
    .select("id")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .range(MEMORY_MAX_ENTRIES, MEMORY_MAX_ENTRIES + 500);
  if (stale?.length) {
    await db
      .from("project_memory")
      .delete()
      .in(
        "id",
        stale.map((row: { id: string }) => row.id),
      );
  }
  return true;
}

export async function deleteProjectMemory(db: Db, projectId: string, id: string): Promise<void> {
  const { error } = await db.from("project_memory").delete().eq("id", id).eq("project_id", projectId);
  if (isMissingSchema(error)) throw new Error(`Mémoire indisponible. ${MIGRATION_HINT}`);
  if (error) fail("deleteProjectMemory", error);
}

async function resolveTicketId(db: Db, ref: string | number): Promise<string> {
  if (typeof ref === "string") return ref;
  const ticket = await getTicketByNumber(db, ref);
  if (!ticket) throw new Error(`Ticket #${ref} introuvable`);
  return ticket.id;
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

  const parentId = values.parent_id !== undefined ? await resolveTicketId(db, values.parent_id) : null;
  const blockedBy = [...new Set(await Promise.all(values.blocked_by.map((ref) => resolveTicketId(db, ref))))];

  const row: Record<string, unknown> = {
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
    ...(values.model ? { model: values.model } : {}),
    ...(values.effort ? { effort: values.effort } : {}),
    ...(parentId ? { parent_id: parentId } : {}),
    ...(blockedBy.length ? { blocked_by: blockedBy } : {}),
    ...(values.check_paths.length ? { check_paths: values.check_paths } : {}),
  };

  const insert = (values: Record<string, unknown>) => db.from("tickets").insert(values).select("*").single();
  let { data, error } = await insert(row);
  const dropped = isMissingSchema(error) ? TICKET_NEW_COLUMNS.filter((key) => key in row) : [];
  if (dropped.length) ({ data, error } = await insert(without(row, TICKET_NEW_COLUMNS)));
  if (error) fail("createTicket", error);

  const ticket = data as Ticket;
  await addEvent(db, ticket.id, "status", `Ticket créé (${values.source})`);
  if (dropped.length) await addEvent(db, ticket.id, "info", `Champs ignorés (${dropped.join(", ")}). ${MIGRATION_HINT}`);
  return ticket;
}

// A child ticket, in the parent's project unless another project is given.
export async function createSubTicket(
  db: Db,
  parent: string | number,
  input: Omit<CreateTicketInput, "parent_id" | "type"> & { type?: Exclude<TicketType, "new_project"> },
): Promise<Ticket> {
  const parentId = await resolveTicketId(db, parent);
  const { data, error } = await db.from("tickets").select("project:projects(slug)").eq("id", parentId).single();
  if (error) fail("createSubTicket", error);
  const projectSlug = (data as unknown as { project: { slug: string } | null }).project?.slug;
  return createTicket(db, {
    ...input,
    type: input.type ?? "feature",
    project_slug: input.project_slug ?? projectSlug,
    parent_id: parentId,
  });
}

export interface TicketRelations {
  parent: TicketRef | null;
  children: TicketRef[];
  blockers: TicketRef[];
}

export async function getTicketRelations(
  db: Db,
  ticket: Pick<Ticket, "id" | "parent_id" | "blocked_by">,
): Promise<TicketRelations> {
  const refs = "id, number, title, status";
  const ids = [...(ticket.parent_id ? [ticket.parent_id] : []), ...(ticket.blocked_by ?? [])];
  const [linked, children] = await Promise.all([
    ids.length ? db.from("tickets").select(refs).in("id", ids) : Promise.resolve({ data: [], error: null }),
    db.from("tickets").select(refs).eq("parent_id", ticket.id).order("number"),
  ]);
  if (linked.error) fail("getTicketRelations", linked.error);
  if (children.error && !isMissingSchema(children.error)) fail("getTicketRelations", children.error);
  const byId = new Map(((linked.data ?? []) as TicketRef[]).map((ref) => [ref.id, ref]));
  return {
    parent: ticket.parent_id ? (byId.get(ticket.parent_id) ?? null) : null,
    children: (children.data ?? []) as TicketRef[],
    blockers: (ticket.blocked_by ?? []).map((id) => byId.get(id)).filter((ref): ref is TicketRef => !!ref),
  };
}

export interface TicketFilters {
  statuses?: readonly TicketStatus[];
  search?: string;
  projectId?: string;
  priority?: Priority;
  type?: TicketType;
  limit?: number;
}

export async function listTickets(db: Db, options: TicketFilters = {}): Promise<TicketWithProject[]> {
  let query = db
    .from("tickets")
    .select(TICKET_WITH_PROJECT)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.statuses) query = query.in("status", [...options.statuses]);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  if (options.priority) query = query.eq("priority", options.priority);
  if (options.type) query = query.eq("type", options.type);
  // Characters that would break or extend a PostgREST filter expression are dropped.
  const search = options.search?.replace(/[,()*%\\:"']/g, " ").trim();
  if (search) {
    const number = search.replace(/^#/, "");
    query = /^\d{1,9}$/.test(number)
      ? query.or(`number.eq.${number},title.ilike.*${number}*`)
      : query.ilike("title", `%${search}%`);
  }
  const { data, error } = await query;
  if (error) fail("listTickets", error);
  return data as TicketWithProject[];
}

export interface TicketCounts {
  total: number;
  byStatus: Partial<Record<TicketStatus, number>>;
  byProject: Record<string, number>;
  activeByPriority: Partial<Record<Priority, number>>;
}

// One owner, a few hundred tickets: one light query counted here beats a dozen count queries.
export async function getTicketCounts(db: Db): Promise<TicketCounts> {
  const { data, error } = await db.from("tickets").select("status, project_id, priority").limit(10000);
  if (error) fail("getTicketCounts", error);
  const counts: TicketCounts = { total: 0, byStatus: {}, byProject: {}, activeByPriority: {} };
  for (const row of data as Pick<Ticket, "status" | "project_id" | "priority">[]) {
    counts.total += 1;
    counts.byStatus[row.status] = (counts.byStatus[row.status] ?? 0) + 1;
    if (row.project_id) counts.byProject[row.project_id] = (counts.byProject[row.project_id] ?? 0) + 1;
    if (ACTIVE_STATUSES.includes(row.status)) {
      counts.activeByPriority[row.priority] = (counts.activeByPriority[row.priority] ?? 0) + 1;
    }
  }
  return counts;
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

// Latest events in chronological order, or only the ones after `afterId` (live polling).
export async function listEvents(
  db: Db,
  ticketId: string,
  options: { afterId?: number; limit?: number } = {},
): Promise<TicketEvent[]> {
  const limit = options.limit ?? 300;
  const base = db.from("ticket_events").select("*").eq("ticket_id", ticketId);
  if (options.afterId !== undefined) {
    const { data, error } = await base.gt("id", options.afterId).order("id").limit(limit);
    if (error) fail("listEvents", error);
    return data as TicketEvent[];
  }
  const { data, error } = await base.order("id", { ascending: false }).limit(limit);
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
