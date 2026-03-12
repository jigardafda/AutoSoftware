import { query, type SDKResultSuccess, type SDKResultError } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../db.js";
import { estimateCost } from "@autosoftware/shared";
import { emitTerminalOutput, emitFileChange } from "./event-notifier.js";

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
 * Extract actual usage from SDK result message.
 */
function extractUsageFromResult(
  result: SDKResultSuccess | SDKResultError
): { inputTokens: number; outputTokens: number; costUsd: number } {
  // Use actual cost from SDK
  const costUsd = result.total_cost_usd || 0;

  // Extract tokens from modelUsage (aggregates all models used)
  let inputTokens = 0;
  let outputTokens = 0;

  if (result.modelUsage) {
    for (const usage of Object.values(result.modelUsage)) {
      inputTokens += usage.inputTokens || 0;
      outputTokens += usage.outputTokens || 0;
    }
  }

  // Fallback to usage object if modelUsage is empty
  if (inputTokens === 0 && outputTokens === 0 && result.usage) {
    inputTokens = (result.usage as any).input_tokens || 0;
    outputTokens = (result.usage as any).output_tokens || 0;
  }

  return { inputTokens, outputTokens, costUsd };
}

/**
 * Estimate token count from text (fallback for when SDK doesn't provide tokens).
 * Rough approximation: ~3.5 characters per token for English/code.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Simple one-shot query using the Agent SDK.
 * Uses OAuth token if available, falls back to API key.
 * Returns result with actual token usage from SDK.
 */
export async function simpleQuery(
  systemPrompt: string,
  userMessage: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  const { model = "claude-sonnet-4-20250514" } = options;

  let result = "";
  let sdkResult: SDKResultSuccess | SDKResultError | null = null;

  for await (const message of query({
    prompt: userMessage,
    options: {
      allowedTools: [],
      maxTurns: 1,
      systemPrompt,
      model,
    },
  })) {
    if (message.type === "result") {
      sdkResult = message;
      if (message.subtype === "success") {
        result = message.result;
      }
    }
  }

  // Extract actual usage from SDK result
  const usage = sdkResult
    ? extractUsageFromResult(sdkResult)
    : {
        // Fallback to estimation if no result (shouldn't happen)
        inputTokens: estimateTokens(systemPrompt + "\n" + userMessage),
        outputTokens: estimateTokens(result),
        costUsd: estimateCost(model, estimateTokens(systemPrompt + "\n" + userMessage), estimateTokens(result)),
      };

  return { result, usage };
}

/**
 * Record usage to the database for a specific API key.
 * Now uses actual cost from SDK when available.
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
      estimatedCostUsd: costUsd, // Now stores actual cost from SDK
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

  // Record usage if we have an API key ID
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
    allowedTools: string[];
    permissionMode?: "bypassPermissions" | "default";
    maxTurns: number;
    maxBudgetUsd?: number;
    cwd?: string;
    systemPrompt?: string;
    model?: string;
    plugins?: PluginPath[];
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
 * Uses actual token counts and costs from SDK result.
 */
export async function agentQueryWithUsage(
  config: AgentQueryConfig,
  usageOptions: AgentQueryWithUsageOptions
): Promise<AgentQueryResult> {
  const { apiKeyId, source, sourceId, onLog, taskId } = usageOptions;
  const model = config.options.model || "claude-sonnet-4-20250514";

  let result = "";
  let sessionId: string | undefined;
  let turnCount = 0;
  let sdkResult: SDKResultSuccess | SDKResultError | null = null;

  for await (const message of query(config)) {
    // Capture session ID
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
      await onLog?.("step", "Agent session started", { sessionId });
    }

    // Log assistant output
    if (message.type === "assistant" && message.message?.content) {
      turnCount++;
      for (const block of message.message.content) {
        if (block.type === "text") {
          // Log thinking/response (truncated for display)
          const preview = block.text.length > 200
            ? block.text.slice(0, 200) + "..."
            : block.text;
          await onLog?.("info", preview, { turn: turnCount, type: "text" });

          // Emit terminal output for live view
          if (taskId) {
            await emitTerminalOutput(taskId, "stdout", block.text).catch(() => {});
          }
        }
        // Log tool calls
        if (block.type === "tool_use") {
          await onLog?.("tool", `Using tool: ${block.name}`, {
            turn: turnCount,
            tool: block.name,
            input: block.input
          });

          // Emit terminal output for tool calls
          if (taskId) {
            const toolOutput = `[Tool: ${block.name}] ${JSON.stringify(block.input, null, 2)}`;
            await emitTerminalOutput(taskId, "stdout", toolOutput).catch(() => {});

            // Emit file change events for Edit/Write tools
            if (block.name === "Edit" || block.name === "Write") {
              const input = block.input as { file_path?: string; old_string?: string; new_string?: string; content?: string };
              if (input.file_path) {
                const operation = block.name === "Write" ? "create" : "modify";
                await emitFileChange(taskId, operation, input.file_path, {
                  oldContent: input.old_string,
                  newContent: input.new_string || input.content,
                }).catch(() => {});
              }
            }
          }
        }
      }
    }

    // Log tool results
    if (message.type === "user" && (message as any).message?.content) {
      const content = (message as any).message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && taskId) {
            const resultContent = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content);
            // Emit tool result as terminal output
            const truncated = resultContent.length > 500
              ? resultContent.slice(0, 500) + "... [truncated]"
              : resultContent;
            await emitTerminalOutput(
              taskId,
              block.is_error ? "stderr" : "stdout",
              `[Result] ${truncated}`
            ).catch(() => {});
          }
        }
      }
    }

    // Capture final result
    if (message.type === "result") {
      sdkResult = message;
      if (message.subtype === "success") {
        result = message.result;
        await onLog?.("success", "Agent completed successfully", {
          turns: turnCount,
          cost: message.total_cost_usd,
        });
      } else {
        await onLog?.("error", `Agent stopped: ${message.subtype}`, { subtype: message.subtype });
        throw new Error(`Agent stopped: ${message.subtype}`);
      }
    }
  }

  // Extract actual usage from SDK result
  const usage = sdkResult
    ? extractUsageFromResult(sdkResult)
    : { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  // Record usage if we have an API key ID
  if (apiKeyId) {
    await recordUsage(apiKeyId, model, usage.inputTokens, usage.outputTokens, usage.costUsd, source, sourceId);
  }

  return {
    result,
    sessionId,
    usage,
  };
}
