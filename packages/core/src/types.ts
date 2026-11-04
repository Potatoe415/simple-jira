export const TICKET_TYPES = ["fix", "feature", "new_project"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = [
  "queued",
  "running",
  "blocked",
  "verifying",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ACTIVE_STATUSES: readonly TicketStatus[] = ["queued", "running", "blocked", "verifying"];
export const FINAL_STATUSES: readonly TicketStatus[] = ["delivered", "failed", "cancelled"];

export type EventKind = "status" | "agent" | "tool" | "verify" | "error" | "info";

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
  new_project: NewProjectSpec | null;
  status: TicketStatus;
  source: "mcp" | "dashboard";
  session_id: string | null;
  branch: string | null;
  worktree_path: string | null;
  pr_url: string | null;
  summary: string | null;
  error: string | null;
  verify_attempts: number;
  cost_usd: number;
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
  created_at: string;
}

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
  queued: "En file",
  running: "En cours",
  blocked: "Bloqué",
  verifying: "Vérification",
  delivered: "Livré",
  failed: "Échec",
  cancelled: "Annulé",
};

export const TYPE_LABELS: Record<TicketType, string> = {
  fix: "Correctif",
  feature: "Fonctionnalité",
  new_project: "Nouveau projet",
};
