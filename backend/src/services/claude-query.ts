import { prisma } from "../db.js";
import { config } from "../config.js";
import { decrypt, estimateCost } from "@autosoftware/shared";
import { acpQuery, acpStreamQuery } from "./acp-client.js";

export type AuthType = "oauth" | "api_key" | "cli";

export interface ResolvedAuth {
  key: string;
  apiKeyId: string | null;
  authType: AuthType;
}

/**
 * Resolve authentication for API calls.
 * Priority: OAuth token (env) > User's stored key/token (DB) > API key (env) > CLI auth
 */
export async function resolveAuth(userId: string): Promise<ResolvedAuth> {
  // 1. Check for OAuth token
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
        const authType: AuthType = dbKey.keyType === "oauth_token" ? "oauth" : "api_key";
        return { key: plainKey, apiKeyId: dbKey.id, authType };
      } catch {
        // Decryption failed, fall through
      }
    }
  }

  // 3. Fall back to env API key
  if (config.anthropicApiKey) {
    return { key: config.anthropicApiKey, apiKeyId: null, authType: "api_key" };
  }

  // 4. CLI auth (bundled mode)
  return { key: "", apiKeyId: null, authType: "cli" };
}

/**
 * Set up environment variables for the agent based on resolved auth.
 */
export function setupAgentSdkAuth(auth: ResolvedAuth): void {
  if (auth.authType === "cli") return;
  if (auth.authType === "oauth") {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = auth.key;
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = auth.key;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }
}

/**
 * Check if the key is an OAuth token (not valid for direct API calls).
 */
export function isOAuthToken(key: string): boolean {
  return key.startsWith("sk-ant-oat");
}

/**
 * Check if valid authentication is configured.
 */
export function isValidAuth(auth: ResolvedAuth): boolean {
  if (auth.authType === "cli") return true;
  if (!auth.key) return false;
  if (auth.authType === "api_key" && auth.key === "sk-ant-xxx") return false;
  if (isOAuthToken(auth.key)) return false;
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
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Simple one-shot query using an ACP-compatible agent CLI.
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
  const inputText = systemPrompt + "\n" + userMessage;
  const inputTokens = agentResult.usage.inputTokens || estimateTokens(inputText);
  const outputTokens = agentResult.usage.outputTokens || estimateTokens(agentResult.result);
  const estimatedCostUsd = agentResult.usage.costUsd || estimateCost(model, inputTokens, outputTokens);

  return {
    result: agentResult.result,
    usage: { inputTokens, outputTokens, estimatedCostUsd },
  };
}

/**
 * Record usage to the database.
 */
export async function recordUsage(
  params: {
    userId: string;
    apiKeyId: string | null;
    authType: AuthType;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    source: string;
    sourceId?: string;
    repositoryId?: string;
    projectId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const {
    userId, apiKeyId, authType, model,
    inputTokens, outputTokens, costUsd,
    source, sourceId, repositoryId, projectId,
    metadata = {},
  } = params;

  await prisma.usageRecord.create({
    data: {
      userId, repositoryId, projectId, apiKeyId,
      source, sourceId, model,
      inputTokens, outputTokens,
      estimatedCostUsd: costUsd,
      authType,
      metadata: metadata as any,
    },
  });

  if (apiKeyId) {
    await prisma.apiKeyUsage.create({
      data: {
        apiKeyId, model,
        inputTokens, outputTokens,
        estimatedCostUsd: costUsd,
        source, sourceId,
      },
    });

    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { lastUsedAt: new Date(), lastError: null },
    });
  }
}

/**
 * Streaming query using an ACP-compatible agent CLI.
 * Yields text content token-by-token as it streams.
 */
export async function* streamQuery(
  systemPrompt: string,
  userMessage: string,
  options: QueryOptions = {}
): AsyncGenerator<{ text: string; done: false } | { text: string; done: true; usage: QueryResult["usage"] }, void, unknown> {
  const { model = "claude-sonnet-4-20250514" } = options;

  const inputText = systemPrompt + "\n" + userMessage;

  for await (const chunk of acpStreamQuery({
    prompt: userMessage,
    systemPrompt,
  })) {
    if (chunk.done) {
      const inputTokens = chunk.usage.inputTokens || estimateTokens(inputText);
      const outputTokens = chunk.usage.outputTokens || estimateTokens("");
      const estimatedCostUsd = chunk.usage.costUsd || estimateCost(model, inputTokens, outputTokens);

      yield {
        text: "",
        done: true,
        usage: { inputTokens, outputTokens, estimatedCostUsd },
      };
    } else {
      yield { text: chunk.text, done: false };
    }
  }
}
