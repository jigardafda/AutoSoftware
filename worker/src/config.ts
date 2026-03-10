import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  // OAuth token (Claude Max subscription) takes precedence over API key
  claudeOauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  workDir: process.env.WORK_DIR || "/tmp/autosoftware-workspaces",
  defaultScanBudget: parseFloat(process.env.DEFAULT_SCAN_BUDGET || "2.0"),
  defaultTaskBudget: parseFloat(process.env.DEFAULT_TASK_BUDGET || "10.0"),
  defaultPlanBudget: parseFloat(process.env.DEFAULT_PLAN_BUDGET || "1.0"),
  apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET || "",
};

/**
 * Set up authentication for the Agent SDK.
 * OAuth token takes precedence over API key.
 */
export function setupAgentAuth(): void {
  if (config.claudeOauthToken) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = config.claudeOauthToken;
    delete process.env.ANTHROPIC_API_KEY;
    console.log("Using Claude OAuth token (Max subscription)");
  } else if (config.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    console.log("Using Anthropic API key");
  }
}

/**
 * Check if any authentication is configured.
 */
export function hasAuthConfigured(): boolean {
  return !!(config.claudeOauthToken || config.anthropicApiKey);
}
