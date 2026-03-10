export const JOB_NAMES = {
  REPO_SCAN: "repo-scan",
  TASK_PLAN: "task-plan",
  TASK_EXECUTE: "task-execute",
  EMBED_SCREEN: "embed-screen",
  EMBED_CONVERT: "embed-convert",
} as const;

export const DEFAULT_SCAN_INTERVAL_MINUTES = 60;
export const DEFAULT_SCAN_BUDGET_USD = 2.0;
export const DEFAULT_TASK_BUDGET_USD = 10.0;
export const DEFAULT_PLAN_BUDGET_USD = 1.0;
export const DEFAULT_EMBED_SCREEN_BUDGET_USD = 0.05;
export const MAX_RETRIES = 3;

// Pricing per million tokens (USD)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-sonnet-4-20250514"];
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

export const OAUTH_CONFIGS = {
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    reposUrl: "https://api.github.com/user/repos",
    scopes: "repo,read:user,user:email",
  },
  gitlab: {
    authUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    userUrl: "https://gitlab.com/api/v4/user",
    reposUrl: "https://gitlab.com/api/v4/projects?membership=true",
    scopes: "api read_user read_repository",
  },
  bitbucket: {
    authUrl: "https://bitbucket.org/site/oauth2/authorize",
    tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
    userUrl: "https://api.bitbucket.org/2.0/user",
    reposUrl: "https://api.bitbucket.org/2.0/repositories/{username}",
    scopes: "repository account pullrequest:write",
  },
} as const;

import type { IntegrationProviderMeta, IntegrationProvider } from "./types.js";

export const INTEGRATION_PROVIDERS: IntegrationProviderMeta[] = [
  {
    type: "linear",
    name: "Linear",
    category: "project_management",
    authMethod: "oauth2",
    description: "Issue tracking and project management",
    itemNoun: "issues",
  },
  {
    type: "github_issues",
    name: "GitHub Issues",
    category: "project_management",
    authMethod: "api_token",
    description: "Issue tracking via GitHub repositories",
    itemNoun: "issues",
  },
  {
    type: "jira",
    name: "Jira",
    category: "project_management",
    authMethod: "oauth2",
    description: "Issue and project tracking by Atlassian",
    itemNoun: "issues",
    configFields: [
      { key: "cloudId", label: "Cloud ID", placeholder: "Auto-detected on connect", required: false },
    ],
  },
  {
    type: "sentry",
    name: "Sentry",
    category: "monitoring",
    authMethod: "api_token",
    description: "Error monitoring and performance tracking",
    itemNoun: "errors",
    configFields: [
      { key: "orgSlug", label: "Organization Slug", placeholder: "my-org", required: true },
    ],
  },
  {
    type: "azure_devops",
    name: "Azure DevOps",
    category: "project_management",
    authMethod: "oauth2",
    description: "Work item tracking and project management",
    itemNoun: "work items",
    configFields: [
      { key: "organization", label: "Organization", placeholder: "my-org", required: true },
    ],
  },
  {
    type: "asana",
    name: "Asana",
    category: "project_management",
    authMethod: "oauth2",
    description: "Task and project management",
    itemNoun: "tasks",
  },
];

export const INTEGRATION_OAUTH_CONFIGS: Partial<Record<IntegrationProvider, {
  authUrl: string; tokenUrl: string; scopes: string;
}>> = {
  linear: {
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: "read write issues:create",
  },
  jira: {
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: "read:jira-work write:jira-work offline_access",
  },
  asana: {
    authUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scopes: "default",
  },
  azure_devops: {
    authUrl: "https://app.vssps.visualstudio.com/oauth2/authorize",
    tokenUrl: "https://app.vssps.visualstudio.com/oauth2/token",
    scopes: "vso.work_full",
  },
};
