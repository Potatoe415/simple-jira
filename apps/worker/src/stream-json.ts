import { isAbsolute, relative } from "node:path";
import type { TicketLogger } from "./logger";

// Claude Code `--output-format stream-json --verbose`: one JSON object per line.
type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

interface StreamLine {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  model?: string;
  message?: { content?: Block[] | string };
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
}

export interface StreamSummary {
  costUsd: number;
  lastResult: string | null;
  isError: boolean;
}

const CHECK_RE = /\b(check|test|tests|typecheck|tsc|lint|build|vitest|jest|playwright|pytest|cargo test|go test)\b/i;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function oneLine(text: string, max = 160): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && "text" in part ? str(part.text) : "")).join("\n");
  }
  return "";
}

export function createStreamParser(options: { worktree: string; verifyCommands: string[]; log: TicketLogger }) {
  const { worktree, log } = options;
  const pending = new Map<string, { name: string; command: string }>();
  const summary: StreamSummary = { costUsd: 0, lastResult: null, isError: false };

  const path = (value: unknown) => {
    const raw = str(value);
    if (!raw) return "?";
    const rel = isAbsolute(raw) ? relative(worktree, raw) : raw;
    return (rel.startsWith("..") ? raw : rel).replace(/\\/g, "/");
  };

  const isCheck = (command: string) =>
    options.verifyCommands.some((verify) => command.includes(verify)) || CHECK_RE.test(command);

  function label(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case "Edit":
      case "MultiEdit":
        return `Edit ${path(input.file_path)}`;
      case "Write":
        return `Write ${path(input.file_path)}`;
      case "NotebookEdit":
        return `Edit ${path(input.notebook_path)}`;
      case "Read":
        return `Read ${path(input.file_path)}`;
      case "Bash":
      case "PowerShell":
        return `Run ${oneLine(str(input.command), 200)}`;
      case "Grep":
        return `Search "${oneLine(str(input.pattern), 80)}"${input.path ? ` in ${path(input.path)}` : ""}`;
      case "Glob":
        return `Find ${oneLine(str(input.pattern), 80)}`;
      case "WebFetch":
        return `Fetch ${oneLine(str(input.url), 120)}`;
      case "WebSearch":
        return `Web search "${oneLine(str(input.query), 80)}"`;
      case "Task":
      case "Agent":
        return `Agent: ${oneLine(str(input.description) || str(input.prompt), 120)}`;
      default:
        return name.replace(/^mcp__/, "");
    }
  }

  function onAssistant(blocks: Block[]) {
    for (const block of blocks) {
      if (block.type === "text" && block.text.trim()) {
        log.event("message", block.text.trim());
      } else if (block.type === "tool_use") {
        if (block.name === "TodoWrite" && Array.isArray(block.input.todos)) {
          const todos = block.input.todos as { content?: string; status?: string }[];
          const mark = (status?: string) => (status === "completed" ? "[x]" : status === "in_progress" ? "[~]" : "[ ]");
          log.event("plan", todos.map((todo) => `${mark(todo.status)} ${str(todo.content)}`).join("\n"));
          continue;
        }
        const command = str(block.input.command);
        pending.set(block.id, { name: block.name, command });
        log.event("tool", label(block.name, block.input), { tool: block.name });
      }
    }
  }

  function onUser(blocks: Block[]) {
    for (const block of blocks) {
      if (block.type !== "tool_result") continue;
      const call = pending.get(block.tool_use_id);
      pending.delete(block.tool_use_id);
      if (!call || !call.command || !isCheck(call.command)) {
        if (block.is_error && call) log.event("tool", `✗ ${call.name}: ${oneLine(resultText(block.content), 300)}`);
        continue;
      }
      const output = resultText(block.content);
      const failed = !!block.is_error || /exit code [1-9]|\bfailed\b|✗|error TS\d+/i.test(output);
      const tail = output.trim().split(/\r?\n/).slice(-15).join("\n");
      log.event("check", `${failed ? "✗" : "✓"} ${oneLine(call.command, 200)}${tail ? `\n${tail}` : ""}`, {
        ok: !failed,
        command: oneLine(call.command, 200),
      });
    }
  }

  return {
    summary,
    line(raw: string) {
      let parsed: StreamLine;
      try {
        parsed = JSON.parse(raw) as StreamLine;
      } catch {
        if (raw.trim()) log.info(oneLine(raw, 500));
        return;
      }
      const blocks = Array.isArray(parsed.message?.content) ? parsed.message.content : [];
      if (parsed.type === "system" && parsed.subtype === "init") {
        log.info(`Claude Code session started${parsed.model ? ` (${parsed.model})` : ""}`);
      } else if (parsed.type === "assistant") {
        onAssistant(blocks);
      } else if (parsed.type === "user") {
        onUser(blocks);
      } else if (parsed.type === "result") {
        summary.costUsd += parsed.total_cost_usd ?? 0;
        summary.lastResult = parsed.result ?? null;
        summary.isError = !!parsed.is_error;
        const seconds = parsed.duration_ms ? Math.round(parsed.duration_ms / 1000) : null;
        const stats = [parsed.num_turns && `${parsed.num_turns} turns`, seconds && `${seconds}s`]
          .filter(Boolean)
          .join(", ");
        if (parsed.is_error) log.error(`Claude Code: ${oneLine(parsed.result ?? parsed.subtype ?? "error", 1500)}`);
        else log.info(`Pass finished${stats ? ` (${stats})` : ""}`);
      }
    },
  };
}
