import { prisma } from "../db.js";
import { estimateCost } from "@autosoftware/shared";
import { emitTerminalOutput, emitFileChange } from "./event-notifier.js";
import { acpQuery, resolveAgentConfig, type AgentConfig } from "./acp-client.js";

interface QueryOptions {
  model?: string;
  maxTokens?: number;
}

interface QueryResult {
  result: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

interface AgentQueryResult {
  result: string;
  sessionId?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

/**
 * Estimate token count from text (fallback for when agent doesn't provide tokens).
 * Rough approximation: ~3.5 characters per token for English/code.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Simple one-shot query using an ACP-compatible agent CLI.
 * Sends a prompt and returns the result text with usage estimates.
 */
export async function simpleQuery(
  systemPrompt: string,
  userMessage: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  const { model = "claude-sonnet-4-20250514" } = options;

  const agentResult = await acpQuery({
    prompt: userMessage,
    systemPrompt,
  });

  // Use actual usage from ACP if available, fall back to estimation
  const usage = agentResult.usage.inputTokens > 0
    ? {
        inputTokens: agentResult.usage.inputTokens,
        outputTokens: agentResult.usage.outputTokens,
        costUsd: agentResult.usage.costUsd,
      }
    : {
        inputTokens: estimateTokens(systemPrompt + "\n" + userMessage),
        outputTokens: estimateTokens(agentResult.result),
        costUsd: estimateCost(
          model,
          estimateTokens(systemPrompt + "\n" + userMessage),
          estimateTokens(agentResult.result)
        ),
      };

  return { result: agentResult.result, usage };
}

/**
 * Record usage to the database for a specific API key.
 */
export async function recordUsage(
  apiKeyId: string | null,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  source: string,
  sourceId?: string
): Promise<void> {
  if (!apiKeyId) return;

  await prisma.apiKeyUsage.create({
    data: {
      apiKeyId,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      source,
      sourceId,
    },
  });

  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: new Date(), lastError: null },
  });
}

/**
 * Simple query with automatic usage recording.
 */
export async function simpleQueryWithUsage(
  systemPrompt: string,
  userMessage: string,
  options: QueryOptions & { apiKeyId?: string | null; source?: string; sourceId?: string } = {}
): Promise<QueryResult> {
  const { apiKeyId, source, sourceId, ...queryOptions } = options;
  const model = queryOptions.model || "claude-sonnet-4-20250514";

  const result = await simpleQuery(systemPrompt, userMessage, queryOptions);

  if (apiKeyId) {
    await recordUsage(
      apiKeyId,
      model,
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.costUsd,
      source || "unknown",
      sourceId
    );
  }

  return result;
}

interface PluginPath {
  type: "local";
  path: string;
}

interface AgentQueryConfig {
  prompt: string;
  options: {
    allowedTools?: string[];
    permissionMode?: "bypassPermissions" | "default";
    maxTurns?: number;
    maxBudgetUsd?: number;
    cwd?: string;
    systemPrompt?: string;
    model?: string;
    plugins?: PluginPath[];
    /** Agent ID to use (e.g. "claude-code", "codex", "gemini") */
    agentId?: string;
  };
}

interface AgentQueryWithUsageOptions {
  apiKeyId?: string | null;
  source: string;
  sourceId?: string;
  /** Callback to emit logs during execution */
  onLog?: (level: string, message: string, metadata?: Record<string, any>) => Promise<void>;
  /** Task ID for live streaming events */
  taskId?: string;
}

/**
 * Run an agentic query with usage tracking and optional live logging.
 * Spawns an ACP-compatible agent CLI and streams events.
 */
export async function agentQueryWithUsage(
  config: AgentQueryConfig,
  usageOptions: AgentQueryWithUsageOptions
): Promise<AgentQueryResult> {
  const { apiKeyId, source, sourceId, onLog, taskId } = usageOptions;
  const model = config.options.model || "claude-sonnet-4-20250514";

  const agent = resolveAgentConfig(config.options.agentId);

  await onLog?.("step", "Starting agent session...");

  const agentResult = await acpQuery({
    prompt: config.prompt,
    systemPrompt: config.options.systemPrompt,
    cwd: config.options.cwd,
    agent,
    onUpdate: async (event) => {
      switch (event.type) {
        case "text": {
          const textData = event.data as { text: string };
          const preview =
            textData.text.length > 200
              ? textData.text.slice(0, 200) + "..."
              : textData.text;
          await onLog?.("info", preview, { type: "text" });
          if (taskId) {
            await emitTerminalOutput(taskId, "stdout", textData.text).catch(
              () => {}
            );
          }
          break;
        }

        case "tool_call": {
          const toolData = event.data as {
            title?: string;
            status?: string;
            kind?: string;
            rawInput?: unknown;
            locations?: Array<{ uri: string }>;
          };
          await onLog?.("tool", `Using tool: ${toolData.title || "unknown"}`, {
            tool: toolData.title,
            status: toolData.status,
          });
          if (taskId) {
            const toolOutput = `[Tool: ${toolData.title}] ${JSON.stringify(toolData.rawInput, null, 2)}`;
            await emitTerminalOutput(taskId, "stdout", toolOutput).catch(
              () => {}
            );

            // Emit file change events for edit/write tools
            if (
              toolData.kind === "file" &&
              toolData.locations?.length
            ) {
              for (const loc of toolData.locations) {
                await emitFileChange(taskId, "modify", loc.uri).catch(
                  () => {}
                );
              }
            }
          }
          break;
        }

        case "tool_call_update": {
          const updateData = event.data as {
            toolCallId?: string;
            status?: string;
          };
          if (taskId && updateData.status) {
            await emitTerminalOutput(
              taskId,
              "stdout",
              `[Tool Result] ${updateData.status}`
            ).catch(() => {});
          }
          break;
        }

        default:
          break;
      }
    },
  });

  // Use actual usage from ACP if available, fall back to estimation
  const usage =
    agentResult.usage.inputTokens > 0
      ? agentResult.usage
      : {
          inputTokens: estimateTokens(config.prompt),
          outputTokens: estimateTokens(agentResult.result),
          costUsd: agentResult.usage.costUsd || 0,
        };

  await onLog?.("success", "Agent completed successfully", {
    cost: usage.costUsd,
    stopReason: agentResult.stopReason,
  });

  // Record usage if we have an API key ID
  if (apiKeyId) {
    await recordUsage(
      apiKeyId,
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.costUsd,
      source,
      sourceId
    );
  }

  return {
    result: agentResult.result,
    sessionId: agentResult.sessionId,
    usage,
  };
}
