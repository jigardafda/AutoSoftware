import { query } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { decrypt, estimateCost } from "@autosoftware/shared";

type AuthType = "oauth" | "api_key";

interface ResolvedAuth {
  key: string;
  apiKeyId: string | null;
  authType: AuthType;
}

/**
 * Resolve authentication for Claude API calls.
 * Priority: OAuth token (env) > User's stored key/token (DB) > API key (env)
 */
export async function resolveAuth(userId: string): Promise<ResolvedAuth> {
  // 1. Check for OAuth token (uses Claude Max subscription - FREE!)
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauthToken) {
    return { key: oauthToken, apiKeyId: null, authType: "oauth" };
  }

  // 2. Check for user's stored API key or OAuth token in database
  if (config.apiKeyEncryptionSecret) {
    const dbKey = await prisma.apiKey.findFirst({
      where: { userId, isActive: true },
      orderBy: { priority: "asc" },
    });
    if (dbKey) {
      try {
        const plainKey = decrypt(dbKey.encryptedKey, config.apiKeyEncryptionSecret);
        // Use the stored keyType to determine auth type
        const authType: AuthType = dbKey.keyType === "oauth_token" ? "oauth" : "api_key";
        return { key: plainKey, apiKeyId: dbKey.id, authType };
      } catch {
        // Decryption failed, fall through
      }
    }
  }

  // 3. Fall back to env API key
  return { key: config.anthropicApiKey || "", apiKeyId: null, authType: "api_key" };
}

/**
 * Set up environment variables for the Agent SDK based on resolved auth.
 */
export function setupAgentSdkAuth(auth: ResolvedAuth): void {
  if (auth.authType === "oauth") {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = auth.key;
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = auth.key;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
}

/**
 * Check if valid authentication is configured.
 */
export function isValidAuth(auth: ResolvedAuth): boolean {
  if (!auth.key) return false;
  if (auth.authType === "api_key" && auth.key === "sk-ant-xxx") return false;
  return true;
}

interface QueryOptions {
  model?: string;
  maxTokens?: number;
}

interface QueryResult {
  result: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

/**
 * Estimate token count from text.
 * Rough approximation: ~3.5 characters per token for English/code.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Simple one-shot query using the Agent SDK.
 * Uses OAuth token if available, falls back to API key.
 */
export async function simpleQuery(
  systemPrompt: string,
  userMessage: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  const { model = "claude-sonnet-4-20250514" } = options;

  let result = "";
  const inputText = systemPrompt + "\n" + userMessage;

  for await (const message of query({
    prompt: userMessage,
    options: {
      allowedTools: [],
      maxTurns: 1,
      systemPrompt,
      model,
    },
  })) {
    if (message.type === "result" && message.subtype === "success") {
      result = message.result;
    }
  }

  // Estimate tokens from character counts
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(result);
  const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);

  return {
    result,
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    },
  };
}

/**
 * Record usage to the database for a specific API key.
 */
export async function recordUsage(
  apiKeyId: string | null,
  model: string,
  inputTokens: number,
  outputTokens: number,
  source: string,
  sourceId?: string
): Promise<void> {
  if (!apiKeyId) return;

  const cost = estimateCost(model, inputTokens, outputTokens);

  await prisma.apiKeyUsage.create({
    data: {
      apiKeyId,
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: cost,
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
 * Streaming query using the Agent SDK with includePartialMessages.
 * Yields text content token-by-token as it streams.
 */
export async function* streamQuery(
  systemPrompt: string,
  userMessage: string,
  options: QueryOptions = {}
): AsyncGenerator<{ text: string; done: false } | { text: string; done: true; usage: QueryResult["usage"] }, void, unknown> {
  const { model = "claude-sonnet-4-20250514" } = options;

  const inputText = systemPrompt + "\n" + userMessage;
  let fullResult = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const message of query({
    prompt: userMessage,
    options: {
      allowedTools: [],
      maxTurns: 1,
      systemPrompt,
      model,
      includePartialMessages: true, // Enable streaming
    },
  })) {
    // Handle streaming events for real-time text output
    if (message.type === "stream_event") {
      const event = message.event as any;

      // Extract text deltas for streaming
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const text = event.delta.text || "";
        fullResult += text;
        yield { text, done: false };
      }

      // Capture usage from message events
      if (event.type === "message_start" && event.message?.usage) {
        inputTokens = event.message.usage.input_tokens || 0;
      }
      if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens || 0;
      }
    }
  }

  // Fall back to estimated tokens if not captured from events
  if (inputTokens === 0) {
    inputTokens = estimateTokens(inputText);
  }
  if (outputTokens === 0) {
    outputTokens = estimateTokens(fullResult);
  }

  const estimatedCostUsd = estimateCost(model, inputTokens, outputTokens);

  yield {
    text: "",
    done: true,
    usage: { inputTokens, outputTokens, estimatedCostUsd },
  };
}
