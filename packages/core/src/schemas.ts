import { z } from "zod";
import { DEFAULT_PRIORITY, EFFORTS, TICKET_TYPES, type Priority } from "./types";

export const prioritySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(3)
  .transform((value) => value as Priority);

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const TASK_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function slugify(text: string, max = 40): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "task";
}

export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._\[\]-]{0,63}$/;

export const modelSchema = z.string().trim().regex(MODEL_RE, "model: model identifier (e.g. opus, sonnet)");
export const effortSchema = z.enum(EFFORTS);

// A ticket reference: its uuid or its number (#n).
export const ticketRefSchema = z.union([z.string().trim().uuid(), z.coerce.number().int().positive()]);

const lines = z
  .array(z.string().trim())
  .transform((items) => items.filter((item) => item.length > 0));

export const newProjectSpecSchema = z.object({
  slug: z.string().trim().regex(SLUG_RE, "slug: lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000).default(""),
});

export const createTicketSchema = z
  .object({
    type: z.enum(TICKET_TYPES),
    project_slug: z.string().trim().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20000),
    slug: z.string().trim().regex(TASK_SLUG_RE, "slug: lowercase letters, digits and dashes").optional(),
    goal: z.string().trim().max(4000).optional(),
    steps: lines.default([]),
    auto_merge: z.boolean().default(false),
    priority: prioritySchema.default(DEFAULT_PRIORITY),
    new_project: newProjectSpecSchema.optional(),
    model: modelSchema.optional(),
    effort: effortSchema.optional(),
    parent_id: ticketRefSchema.optional(),
    blocked_by: z.array(ticketRefSchema).max(20).default([]),
    check_paths: z.array(z.string().trim().regex(/^\/[^\s]*$/, "path: must start with /")).max(10).default([]),
    source: z.enum(["mcp", "dashboard"]).default("dashboard"),
    // Saved for later: never picked up by the worker until started.
    idea: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.type === "new_project" && !value.new_project) {
      ctx.addIssue({ code: "custom", path: ["new_project"], message: "new_project required" });
    }
    if (value.type !== "new_project" && !value.project_slug) {
      ctx.addIssue({ code: "custom", path: ["project_slug"], message: "project_slug required" });
    }
  });

export type CreateTicketInput = z.input<typeof createTicketSchema>;

// What can be set when an idea is turned into a real task.
export const startIdeaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(20000).optional(),
  slug: z.string().trim().regex(TASK_SLUG_RE, "slug: lowercase letters, digits and dashes").optional(),
  goal: z.string().trim().max(4000).optional(),
  steps: lines.optional(),
  auto_merge: z.boolean().optional(),
  priority: prioritySchema.optional(),
  model: modelSchema.optional(),
  effort: effortSchema.optional(),
});

export type StartIdeaInput = z.input<typeof startIdeaSchema>;

export const projectSchema = z.object({
  slug: z.string().trim().regex(SLUG_RE, "slug: lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(100),
  aliases: lines.default([]),
  description: z.string().trim().max(4000).default(""),
  local_path: z.string().trim().min(1),
  repo: z.string().trim().regex(REPO_RE, "repo: owner/name"),
  default_branch: z.string().trim().min(1).default("main"),
  setup_commands: lines.default([]),
  verify_commands: lines.default([]),
  env_files: lines.default([]),
  agent_instructions: z.string().trim().max(8000).default(""),
  ship_command: z.string().trim().max(1000).default(""),
  default_model: modelSchema.nullable().optional(),
  default_effort: effortSchema.nullable().optional(),
  notify_url: z.httpUrl().max(500).nullable().optional(),
  browser_check: z.boolean().optional(),
});

// Columns added by the agent-visibility migration: dropped on retry when the database does not know them yet.
export const PROJECT_NEW_COLUMNS = ["default_model", "default_effort", "notify_url", "browser_check"] as const;
export const TICKET_NEW_COLUMNS = ["model", "effort", "parent_id", "blocked_by", "check_paths"] as const;

export type ProjectInput = z.input<typeof projectSchema>;
