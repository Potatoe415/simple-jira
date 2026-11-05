import { STATUS_LABELS, TYPE_LABELS, type Priority, type TicketStatus, type TicketType } from "@simple-jira/core";

// Subtle lozenges, Atlassian style: uppercase, bold, 3px radius.
const COLORS: Record<TicketStatus, string> = {
  idea: "bg-[#fdd0ec] text-[#943d73]",
  queued: "bg-[#dfe1e6] text-[#44546f]",
  running: "bg-[#cce0ff] text-[#0055cc]",
  blocked: "bg-[#f8e6a0] text-[#7f5f01]",
  verifying: "bg-[#dfd8fd] text-[#5e4db2]",
  delivered: "bg-[#c6edfb] text-[#206a83]",
  merged: "bg-[#baf3db] text-[#216e4e]",
  failed: "bg-[#ffd5d2] text-[#ae2e24]",
  cancelled: "bg-[#f1f2f4] text-[#626f86]",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase leading-4 ${COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// Solid label colors, picked from the project name so a project keeps its color everywhere.
const LABEL_COLORS = [
  "bg-[#0c66e4] text-white",
  "bg-[#1f845a] text-white",
  "bg-[#c9372c] text-white",
  "bg-[#f5cd47] text-[#172b4d]",
  "bg-[#6e5dc6] text-white",
  "bg-[#227d9b] text-white",
];

export function ProjectLabel({ name }: { name: string }) {
  const hash = [...name].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  return (
    <span
      className={`inline-flex max-w-40 shrink-0 truncate rounded-[3px] px-1 text-[11px] font-bold uppercase leading-4 ${LABEL_COLORS[hash % LABEL_COLORS.length]}`}
    >
      {name}
    </span>
  );
}

const TYPE_ICONS: Record<TicketType, { color: string; path: React.ReactNode }> = {
  fix: { color: "#e2483d", path: <circle cx="8" cy="8" r="3" fill="white" /> },
  feature: { color: "#22a06b", path: <path d="M5.5 4h5v8l-2.5-2-2.5 2z" fill="white" /> },
  new_project: { color: "#8270db", path: <path d="M8 4.5v7M4.5 8h7" stroke="white" strokeWidth={1.8} /> },
};

export function TypeIcon({ type }: { type: TicketType }) {
  const icon = TYPE_ICONS[type];
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" role="img" aria-label={TYPE_LABELS[type]}>
      <title>{TYPE_LABELS[type]}</title>
      <rect width="16" height="16" rx="3" fill={icon.color} />
      {icon.path}
    </svg>
  );
}

const PRIORITY_ICONS: Record<Priority, { label: string; color: string; d: string }> = {
  1: { label: "P1: urgent", color: "#e2483d", d: "M3 8l5-4 5 4M3 12l5-4 5 4" },
  2: { label: "P2", color: "#e56910", d: "M3 10l5-4 5 4" },
  3: { label: "P3: normal", color: "#e56910", d: "M3 6h10M3 10h10" },
};

export function PriorityIcon({ priority }: { priority: Priority }) {
  const icon = PRIORITY_ICONS[priority];
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke={icon.color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={icon.label}
    >
      <title>{icon.label}</title>
      <path d={icon.d} />
    </svg>
  );
}
