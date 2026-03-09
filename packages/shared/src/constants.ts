export const JOB_NAMES = {
  REPO_SCAN: "repo-scan",
  TASK_EXECUTE: "task-execute",
} as const;

export const DEFAULT_SCAN_INTERVAL_MINUTES = 60;
export const DEFAULT_SCAN_BUDGET_USD = 2.0;
export const DEFAULT_TASK_BUDGET_USD = 10.0;
export const MAX_RETRIES = 3;

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
