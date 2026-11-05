"use server";

import {
  addOwnerComment,
  answerQuestion,
  cancelTicket,
  createTicket,
  deleteProjectMemory,
  MIGRATION_HINT,
  requestMerge,
  retryTicket,
  saveProject,
  setPriority,
  setProjectMemory,
  type Effort,
  type TicketType,
} from "@simple-jira/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { authClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean };

const NEW_PROJECT = "__new__";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function lines(form: FormData, name: string): string[] {
  return field(form, name)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// "#12, 14 #15" -> [12, 14, 15]
function ticketNumbers(form: FormData, name: string): number[] {
  return [...field(form, name).matchAll(/d+/g)].map((match) => Number(match[0]));
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return z.prettifyError(error);
  return error instanceof Error ? error.message : String(error);
}

export async function createTicketAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const project = field(form, "project");
  const isNew = project === NEW_PROJECT;

  let number: number;
  try {
    const ticket = await createTicket(adminDb(), {
      type: isNew ? "new_project" : (field(form, "type") as TicketType),
      project_slug: isNew ? undefined : project,
      title: field(form, "title"),
      description: field(form, "description"),
      goal: field(form, "goal") || undefined,
      steps: lines(form, "steps"),
      auto_merge: form.get("auto_merge") === "on",
      priority: Number(field(form, "priority") || 3) as 1 | 2 | 3,
      model: field(form, "model") || undefined,
      effort: (field(form, "effort") || undefined) as Effort | undefined,
      parent_id: ticketNumbers(form, "parent")[0],
      blocked_by: ticketNumbers(form, "blocked_by"),
      check_paths: lines(form, "check_paths"),
      new_project: isNew
        ? { slug: field(form, "new_slug"), name: field(form, "new_name"), description: field(form, "description") }
        : undefined,
      source: "dashboard",
    });
    number = ticket.number;
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/");
  redirect(`/tickets/${number}`);
}

export async function answerQuestionAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  try {
    await answerQuestion(adminDb(), field(form, "question_id"), field(form, "answer"));
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelTicketAction(form: FormData) {
  await requireOwner();
  await cancelTicket(adminDb(), field(form, "ticket_id"));
  revalidatePath("/", "layout");
}

export async function setPriorityAction(form: FormData) {
  await requireOwner();
  await setPriority(adminDb(), field(form, "ticket_id"), Number(field(form, "priority")));
  revalidatePath("/", "layout");
}

export async function requestMergeAction(form: FormData) {
  await requireOwner();
  await requestMerge(adminDb(), field(form, "ticket_id"));
  revalidatePath("/", "layout");
}

export async function retryTicketAction(form: FormData) {
  await requireOwner();
  await retryTicket(adminDb(), field(form, "ticket_id"));
  revalidatePath("/", "layout");
}

export async function saveProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  const id = field(form, "id") || undefined;
  try {
    await saveProject(
      adminDb(),
      {
        slug: field(form, "slug"),
        name: field(form, "name"),
        aliases: lines(form, "aliases"),
        description: field(form, "description"),
        local_path: field(form, "local_path"),
        repo: field(form, "repo"),
        default_branch: field(form, "default_branch") || "main",
        setup_commands: lines(form, "setup_commands"),
        verify_commands: lines(form, "verify_commands"),
        env_files: lines(form, "env_files"),
        agent_instructions: field(form, "agent_instructions"),
        ship_command: field(form, "ship_command"),
        default_model: field(form, "default_model") || null,
        default_effort: (field(form, "default_effort") || null) as Effort | null,
        notify_url: field(form, "notify_url") || null,
        browser_check: form.get("browser_check") === "on",
      },
      id,
    );
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function addCommentAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  try {
    await addOwnerComment(adminDb(), field(form, "ticket_id"), field(form, "body"));
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/tickets/${field(form, "number")}`);
  return { ok: true };
}

export async function saveMemoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireOwner();
  try {
    const saved = await setProjectMemory(adminDb(), field(form, "project_id"), [
      { key: field(form, "key"), body: field(form, "body") },
    ]);
    if (!saved) return { error: `Mémoire indisponible. ${MIGRATION_HINT}` };
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteMemoryAction(form: FormData) {
  await requireOwner();
  await deleteProjectMemory(adminDb(), field(form, "project_id"), field(form, "id"));
  revalidatePath("/projects");
}

export async function signOutAction() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect("/login");
}
