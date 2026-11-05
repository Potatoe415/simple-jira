export const TICKET_TYPES = ["fix", "feature", "new_project"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = [
  "idea",
  "queued",
  "running",
  "blocked",
  "verifying",
  "delivered",
  "merged",
  "failed",
  "cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ACTIVE_STATUSES: readonly TicketStatus[] = ["queued", "running", "blocked", "verifying"];
export const FINAL_STATUSES: readonly TicketStatus[] = ["delivered", "merged", "failed", "cancelled"];

export const PRIORITIES = [1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];
export const DEFAULT_PRIORITY: Priority = 3;

export const EVENT_KINDS = [
  "status",
  "agent",
  "tool",
  "verify",
  "error",
  "info",
  "plan",
  "message",
  "comment",
  "question",
  "owner_comment",
  "pr",
  "check",
  "browser",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export interface NewProjectSpec {
  slug: string;
  name: string;
  description: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  description: string;
  local_path: string;
  repo: string;
  default_branch: string;
  setup_commands: string[];
  verify_commands: string[];
  env_files: string[];
  agent_instructions: string;
  ship_command: string;
  // Added by 20261105090000_agent_visibility.sql: undefined until the migration is applied.
  default_model?: string | null;
  default_effort?: Effort | null;
  notify_url?: string | null;
  browser_check?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  number: number;
  project_id: string | null;
  type: TicketType;
  title: string;
  description: string;
  slug: string | null;
  goal: string | null;
  steps: string[];
  priority: Priority;
  auto_merge: boolean;
  new_project: NewProjectSpec | null;
  status: TicketStatus;
  source: "mcp" | "dashboard";
  session_id: string | null;
  branch: string | null;
  worktree_path: string | null;
  pr_url: string | null;
  preview_url: string | null;
  merge_requested_at: string | null;
  merged_at: string | null;
  summary: string | null;
  error: string | null;
  verify_attempts: number;
  cost_usd: number;
  // Added by 20261105090000_agent_visibility.sql: undefined until the migration is applied.
  model?: string | null;
  effort?: Effort | null;
  parent_id?: string | null;
  blocked_by?: string[] | null;
  check_paths?: string[];
  comment_cursor?: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Question {
  id: string;
  ticket_id: string;
  question: string;
  options: string[];
  answer: string | null;
  created_at: string;
  answered_at: string | null;
  forwarded_at: string | null;
}

export interface TicketEvent {
  id: number;
  ticket_id: string;
  kind: EventKind;
  message: string;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface ProjectMemory {
  id: string;
  project_id: string;
  key: string;
  body: string;
  updated_at: string;
}

export type TicketRef = Pick<Ticket, "id" | "number" | "title" | "status">;

export interface WorkerStatus {
  id: string;
  hostname: string;
  current_ticket_id: string | null;
  last_seen_at: string;
}

export type TicketWithProject = Ticket & { project: Pick<Project, "slug" | "name"> | null };

export type OpenQuestion = Question & {
  ticket: Pick<Ticket, "id" | "number" | "title" | "type"> & {
    project: Pick<Project, "slug" | "name"> | null;
  };
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  idea: "Idea",
  queued: "Queued",
  running: "Running",
  blocked: "Blocked",
  verifying: "Verifying",
  delivered: "PR ready",
  merged: "In prod",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const TYPE_LABELS: Record<TicketType, string> = {
  fix: "Fix",
  feature: "Feature",
  new_project: "New project",
};
