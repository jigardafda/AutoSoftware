import { prisma } from "../db.js";
import { config } from "../config.js";
import { decrypt } from "@autosoftware/shared";

export type AuthType = "oauth" | "api_key";

export interface ResolvedAuth {
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
  if (config.claudeOauthToken) {
    return { key: config.claudeOauthToken, apiKeyId: null, authType: "oauth" };
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
  return { key: config.anthropicApiKey, apiKeyId: null, authType: "api_key" };
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

// Legacy export for backwards compatibility
export async function resolveApiKey(userId: string): Promise<{ key: string; apiKeyId: string | null }> {
  const auth = await resolveAuth(userId);
  return { key: auth.key, apiKeyId: auth.apiKeyId };
}
