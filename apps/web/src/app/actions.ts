"use server";

import {
  answerQuestion,
  cancelTicket,
  createTicket,
  requestMerge,
  retryTicket,
  saveProject,
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
      },
      id,
    );
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function signOutAction() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect("/login");
}
