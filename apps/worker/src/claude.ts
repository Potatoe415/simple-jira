import { z } from "zod";
import { config } from "./config";
import { run } from "./exec";
import type { TicketLogger } from "./logger";

const agentResultSchema = z.object({
  status: z.enum(["done", "needs_input", "cannot_do"]),
  summary: z.string(),
  question: z.string().optional(),
  options: z.array(z.string()).optional(),
  commit_message: z.string().optional(),
  setup_commands: z.array(z.string()).optional(),
  verify_commands: z.array(z.string()).optional(),
});

export type AgentResult = z.infer<typeof agentResultSchema>;

const AGENT_RESULT_JSON_SCHEMA = JSON.stringify(z.toJSONSchema(agentResultSchema));

export interface ClaudeRun {
  sessionId: string | null;
  result: AgentResult | null;
  costUsd: number;
  error: string | null;
}

interface StreamContent {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface StreamMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: StreamContent[] | string };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  structured_output?: unknown;
}

function describeTool(name: string, input: Record<string, unknown> = {}): string {
  const detail = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query;
  return detail ? `${name} ${String(detail).slice(0, 300)}` : name;
}

function parseResult(message: StreamMessage): AgentResult | null {
  const candidates: unknown[] = [message.structured_output];
  const text = message.result ?? "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    if (candidate == null) continue;
    try {
      const value = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
      const parsed = agentResultSchema.safeParse(value);
      if (parsed.success) return parsed.data;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function runClaude(params: {
  cwd: string;
  prompt: string;
  systemPrompt: string;
  resumeSessionId: string | null;
  signal: AbortSignal;
  log: TicketLogger;
}): Promise<ClaudeRun> {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    AGENT_RESULT_JSON_SCHEMA,
    "--setting-sources",
    config.claudeSettingSources,
    "--permission-mode",
    config.claudePermissionMode,
    "--append-system-prompt",
    params.systemPrompt,
  ];
  if (config.claudeModel) args.push("--model", config.claudeModel);
  if (params.resumeSessionId) args.push("--resume", params.resumeSessionId);
  if (config.claudeAllowedTools.length) args.push("--allowedTools", config.claudeAllowedTools.join(","));
  if (config.claudeDisallowedTools.length) {
    args.push("--disallowedTools", config.claudeDisallowedTools.join(","));
  }

  let sessionId = params.resumeSessionId;
  let final: StreamMessage | null = null;

  const outcome = await run(config.claudeBin, args, {
    cwd: params.cwd,
    input: params.prompt,
    claudeAuth: true,
    timeoutMs: config.agentTimeoutMs,
    signal: params.signal,
    onStdoutLine: (line) => {
      let message: StreamMessage;
      try {
        message = JSON.parse(line) as StreamMessage;
      } catch {
        params.log.info(line.slice(0, 2000));
        return;
      }
      if (message.session_id) sessionId = message.session_id;
      if (message.type === "result") {
        final = message;
        return;
      }
      if (message.type !== "assistant" || !Array.isArray(message.message?.content)) return;
      for (const part of message.message.content) {
        if (part.type === "text" && part.text?.trim()) params.log.agent(part.text.trim().slice(0, 4000));
        if (part.type === "tool_use" && part.name && part.name !== "StructuredOutput") {
          params.log.tool(describeTool(part.name, part.input));
        }
      }
    },
  });

  const result = final as StreamMessage | null;
  const costUsd = result?.total_cost_usd ?? 0;

  if (outcome.aborted) return { sessionId, result: null, costUsd, error: "Agent interrompu" };
  if (outcome.timedOut) {
    return { sessionId, result: null, costUsd, error: `Agent arrêté après ${config.agentTimeoutMs / 60_000} min` };
  }
  if (!result) {
    return {
      sessionId,
      result: null,
      costUsd,
      error: `Claude s'est arrêté sans résultat (code ${outcome.code}) : ${outcome.output.trim().slice(-1500)}`,
    };
  }
  if (result.is_error) {
    return { sessionId, result: null, costUsd, error: `Erreur Claude : ${result.result ?? result.subtype}` };
  }

  const parsed = parseResult(result);
  if (!parsed) {
    return {
      sessionId,
      result: null,
      costUsd,
      error: `Réponse finale illisible : ${(result.result ?? "").slice(0, 1500)}`,
    };
  }
  return { sessionId, result: parsed, costUsd, error: null };
}
