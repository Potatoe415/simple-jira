import { z } from "zod";
import { TICKET_TYPES } from "./types";

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

const lines = z
  .array(z.string().trim())
  .transform((items) => items.filter((item) => item.length > 0));

export const newProjectSpecSchema = z.object({
  slug: z.string().trim().regex(SLUG_RE, "slug: minuscules, chiffres et tirets"),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000).default(""),
});

export const createTicketSchema = z
  .object({
    type: z.enum(TICKET_TYPES),
    project_slug: z.string().trim().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20000),
    slug: z.string().trim().regex(TASK_SLUG_RE, "slug: minuscules, chiffres et tirets").optional(),
    goal: z.string().trim().max(4000).optional(),
    steps: lines.default([]),
    auto_merge: z.boolean().default(false),
    new_project: newProjectSpecSchema.optional(),
    source: z.enum(["mcp", "dashboard"]).default("dashboard"),
  })
  .superRefine((value, ctx) => {
    if (value.type === "new_project" && !value.new_project) {
      ctx.addIssue({ code: "custom", path: ["new_project"], message: "new_project requis" });
    }
    if (value.type !== "new_project" && !value.project_slug) {
      ctx.addIssue({ code: "custom", path: ["project_slug"], message: "project_slug requis" });
    }
  });

export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const projectSchema = z.object({
  slug: z.string().trim().regex(SLUG_RE, "slug: minuscules, chiffres et tirets"),
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
});

export type ProjectInput = z.input<typeof projectSchema>;
