import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PrInfo {
  provider: "github" | "gitlab" | "bitbucket";
  owner: string;
  repo: string;
  number: number;
  title: string;
  description: string;
  diff: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  files: string[];
}

interface ParsedUrl {
  provider: "github" | "gitlab" | "bitbucket";
  owner: string;
  repo: string;
  number: number;
}

export function parsePrUrl(url: string): ParsedUrl {
  // GitHub: https://github.com/owner/repo/pull/123
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (ghMatch) {
    return { provider: "github", owner: ghMatch[1], repo: ghMatch[2], number: parseInt(ghMatch[3], 10) };
  }

  // GitLab: https://gitlab.com/owner/repo/-/merge_requests/123
  const glMatch = url.match(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/merge_requests\/(\d+)/);
  if (glMatch) {
    return { provider: "gitlab", owner: glMatch[1], repo: glMatch[2], number: parseInt(glMatch[3], 10) };
  }

  // Bitbucket: https://bitbucket.org/owner/repo/pull-requests/123
  const bbMatch = url.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/);
  if (bbMatch) {
    return { provider: "bitbucket", owner: bbMatch[1], repo: bbMatch[2], number: parseInt(bbMatch[3], 10) };
  }

  throw new Error(
    "Could not parse PR URL. Supported formats:\n" +
    "  GitHub:    https://github.com/owner/repo/pull/123\n" +
    "  GitLab:    https://gitlab.com/owner/repo/-/merge_requests/123\n" +
    "  Bitbucket: https://bitbucket.org/owner/repo/pull-requests/123"
  );
}

// --- GitHub (uses gh CLI) ---

async function fetchGitHub(owner: string, repo: string, number: number): Promise<PrInfo> {
  // Check gh CLI is available
  try {
    await execFileAsync("gh", ["--version"], { timeout: 5000 });
  } catch {
    throw new Error(
      "GitHub CLI (gh) is required for GitHub PR reviews.\n" +
      "Install it: https://cli.github.com\n" +
      "Then authenticate: gh auth login"
    );
  }

  const repoSlug = `${owner}/${repo}`;

  // Fetch PR metadata
  const { stdout: metaJson } = await execFileAsync(
    "gh", ["pr", "view", String(number), "--repo", repoSlug, "--json", "title,body,baseRefName,headRefName,files"],
    { timeout: 30_000 }
  );
  const meta = JSON.parse(metaJson);

  // Fetch diff
  const { stdout: diff } = await execFileAsync(
    "gh", ["pr", "diff", String(number), "--repo", repoSlug],
    { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }
  );

  return {
    provider: "github",
    owner,
    repo,
    number,
    title: meta.title || "",
    description: meta.body || "",
    diff,
    url: `https://github.com/${repoSlug}/pull/${number}`,
    baseBranch: meta.baseRefName || "main",
    headBranch: meta.headRefName || "",
    files: (meta.files || []).map((f: any) => f.path),
  };
}

// --- GitLab (uses PAT) ---

async function fetchGitLab(owner: string, repo: string, number: number, token: string): Promise<PrInfo> {
  const projectId = encodeURIComponent(`${owner}/${repo}`);
  const baseUrl = "https://gitlab.com/api/v4";
  const headers: Record<string, string> = { "PRIVATE-TOKEN": token };

  // Fetch MR metadata
  const metaRes = await fetch(`${baseUrl}/projects/${projectId}/merge_requests/${number}`, { headers });
  if (!metaRes.ok) throw new Error(`GitLab API error: ${metaRes.status} ${metaRes.statusText}`);
  const meta = await metaRes.json() as any;

  // Fetch MR changes (includes diff)
  const changesRes = await fetch(`${baseUrl}/projects/${projectId}/merge_requests/${number}/changes`, { headers });
  if (!changesRes.ok) throw new Error(`GitLab API error: ${changesRes.status} ${changesRes.statusText}`);
  const changes = await changesRes.json() as any;

  // Build unified diff from changes
  const diff = (changes.changes || [])
    .map((c: any) => `diff --git a/${c.old_path} b/${c.new_path}\n${c.diff}`)
    .join("\n");

  return {
    provider: "gitlab",
    owner,
    repo,
    number,
    title: meta.title || "",
    description: meta.description || "",
    diff,
    url: meta.web_url || `https://gitlab.com/${owner}/${repo}/-/merge_requests/${number}`,
    baseBranch: meta.target_branch || "main",
    headBranch: meta.source_branch || "",
    files: (changes.changes || []).map((c: any) => c.new_path),
  };
}

// --- Bitbucket (uses App Password / PAT) ---

async function fetchBitbucket(owner: string, repo: string, number: number, token: string): Promise<PrInfo> {
  const baseUrl = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests/${number}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  // Fetch PR metadata
  const metaRes = await fetch(baseUrl, { headers });
  if (!metaRes.ok) throw new Error(`Bitbucket API error: ${metaRes.status} ${metaRes.statusText}`);
  const meta = await metaRes.json() as any;

  // Fetch diff
  const diffRes = await fetch(`${baseUrl}/diff`, { headers });
  if (!diffRes.ok) throw new Error(`Bitbucket API error: ${diffRes.status} ${diffRes.statusText}`);
  const diff = await diffRes.text();

  // Extract file list from diffstat
  const diffstatRes = await fetch(`${baseUrl}/diffstat`, { headers });
  let files: string[] = [];
  if (diffstatRes.ok) {
    const diffstat = await diffstatRes.json() as any;
    files = (diffstat.values || []).map((f: any) => f.new?.path || f.old?.path).filter(Boolean);
  }

  return {
    provider: "bitbucket",
    owner,
    repo,
    number,
    title: meta.title || "",
    description: meta.description || "",
    diff,
    url: meta.links?.html?.href || `https://bitbucket.org/${owner}/${repo}/pull-requests/${number}`,
    baseBranch: meta.destination?.branch?.name || "main",
    headBranch: meta.source?.branch?.name || "",
    files,
  };
}

// --- Main fetch function ---

export interface FetchOptions {
  gitlabToken?: string;
  bitbucketToken?: string;
}

export async function fetchPrInfo(url: string, options: FetchOptions = {}): Promise<PrInfo> {
  const parsed = parsePrUrl(url);

  switch (parsed.provider) {
    case "github":
      return fetchGitHub(parsed.owner, parsed.repo, parsed.number);
    case "gitlab":
      if (!options.gitlabToken) {
        throw new Error(
          "GitLab personal access token required.\n" +
          "Set GITLAB_TOKEN environment variable or run:\n" +
          "  npx auto-software review <url> --gitlab-token <token>\n\n" +
          "Create a token at: https://gitlab.com/-/user_settings/personal_access_tokens\n" +
          "Required scope: read_api"
        );
      }
      return fetchGitLab(parsed.owner, parsed.repo, parsed.number, options.gitlabToken);
    case "bitbucket":
      if (!options.bitbucketToken) {
        throw new Error(
          "Bitbucket app password required.\n" +
          "Set BITBUCKET_TOKEN environment variable or run:\n" +
          "  npx auto-software review <url> --bitbucket-token <token>\n\n" +
          "Create an app password at: https://bitbucket.org/account/settings/app-passwords/\n" +
          "Required permission: Repositories → Read"
        );
      }
      return fetchBitbucket(parsed.owner, parsed.repo, parsed.number, options.bitbucketToken);
  }
}
