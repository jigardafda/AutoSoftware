import type { OAuthProvider, BranchInfo } from "@autosoftware/shared";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface ProviderRepo {
  id: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  description: string | null;
  isPrivate: boolean;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  description: string;
  url: string;
  state: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  draft: boolean;
}

export interface PrDiffInfo {
  provider: string;
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

/**
 * Get a GitHub token from any available source:
 * 1. Provided accessToken (from Account table in web mode)
 * 2. `gh auth token` (from gh CLI login in local/CLI mode)
 *
 * Throws if no token can be resolved.
 */
export async function resolveGitHubToken(accessToken?: string | null): Promise<string> {
  if (accessToken) return accessToken;

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], {
      timeout: 5_000,
    });
    const token = stdout.trim();
    if (token) return token;
  } catch {
    // gh CLI not installed or not logged in
  }

  throw new Error(
    "No GitHub authentication found. Either connect GitHub in Settings, " +
    "or run 'gh auth login' to authenticate via the GitHub CLI."
  );
}

export async function listRemoteRepos(
  provider: OAuthProvider,
  accessToken: string
): Promise<ProviderRepo[]> {
  switch (provider) {
    case "github": {
      const res = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`GitHub API error (${res.status}):`, errorText);
        throw new Error(`Failed to fetch GitHub repos: ${res.status}`);
      }
      const data = await res.json();
      console.log(`GitHub returned ${data.length} repos`);
      return data.map((r: any) => ({
        id: String(r.id),
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        defaultBranch: r.default_branch || "main",
        description: r.description,
        isPrivate: r.private,
      }));
    }
    case "gitlab": {
      const res = await fetch(
        "https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=100",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch GitLab repos");
      const data = await res.json();
      return data.map((r: any) => ({
        id: String(r.id),
        fullName: r.path_with_namespace,
        cloneUrl: r.http_url_to_repo,
        defaultBranch: r.default_branch || "main",
        description: r.description,
        isPrivate: r.visibility === "private",
      }));
    }
    case "bitbucket": {
      const userRes = await fetch("https://api.bitbucket.org/2.0/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) throw new Error("Failed to fetch Bitbucket user");
      const user = await userRes.json();
      const username = user.username;

      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${username}?pagelen=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch Bitbucket repos");
      const data = await res.json();
      return (data.values || []).map((r: any) => ({
        id: r.uuid,
        fullName: r.full_name,
        cloneUrl: r.links?.clone?.find((c: any) => c.name === "https")?.href || "",
        defaultBranch: r.mainbranch?.name || "main",
        description: r.description,
        isPrivate: r.is_private,
      }));
    }
  }
}

export async function listRemoteBranches(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  defaultBranch: string
): Promise<BranchInfo[]> {
  switch (provider) {
    case "github": {
      const res = await fetch(
        `https://api.github.com/repos/${repoFullName}/branches?per_page=100`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`GitHub branches API error (${res.status}):`, errorText);
        if (res.status === 429) throw new Error("Rate limited by GitHub. Please try again later.");
        throw new Error(`Failed to fetch GitHub branches: ${res.status}`);
      }
      const data = await res.json();
      const branches: BranchInfo[] = data.map((b: any) => ({
        name: b.name,
        isDefault: b.name === defaultBranch,
      }));
      // Sort: default branch first, then alphabetically
      branches.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
      return branches;
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/repository/branches?per_page=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        if (res.status === 429) throw new Error("Rate limited by GitLab. Please try again later.");
        throw new Error(`Failed to fetch GitLab branches: ${res.status}`);
      }
      const data = await res.json();
      const branches: BranchInfo[] = data.map((b: any) => ({
        name: b.name,
        isDefault: b.default || b.name === defaultBranch,
      }));
      branches.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
      return branches;
    }
    case "bitbucket": {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/refs/branches?pagelen=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        if (res.status === 429) throw new Error("Rate limited by Bitbucket. Please try again later.");
        throw new Error(`Failed to fetch Bitbucket branches: ${res.status}`);
      }
      const data = await res.json();
      const branches: BranchInfo[] = (data.values || []).map((b: any) => ({
        name: b.name,
        isDefault: b.name === defaultBranch,
      }));
      branches.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
      return branches;
    }
  }
}

export async function listPullRequests(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  state: "open" | "closed" | "all" = "open",
): Promise<PullRequestInfo[]> {
  switch (provider) {
    case "github": {
      const token = await resolveGitHubToken(accessToken);
      const res = await fetch(
        `https://api.github.com/repos/${repoFullName}/pulls?state=${state}&per_page=50&sort=updated&direction=desc`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!res.ok) {
        if (res.status === 404) throw new Error(`Repository "${repoFullName}" not found or not accessible`);
        throw new Error(`Failed to fetch GitHub PRs: ${res.status}`);
      }
      const data = await res.json();
      return data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        description: pr.body || "",
        url: pr.html_url,
        state: pr.state,
        headBranch: pr.head?.ref || "",
        baseBranch: pr.base?.ref || "",
        author: pr.user?.login || "",
        authorAvatarUrl: pr.user?.avatar_url || null,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
        labels: (pr.labels || []).map((l: any) => l.name),
        draft: pr.draft || false,
      }));
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const glState = state === "open" ? "opened" : state === "closed" ? "closed" : "all";
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/merge_requests?state=${glState}&per_page=50&order_by=updated_at`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch GitLab MRs: ${res.status}`);
      const data = await res.json();
      return data.map((mr: any) => ({
        number: mr.iid,
        title: mr.title,
        description: mr.description || "",
        url: mr.web_url,
        state: mr.state,
        headBranch: mr.source_branch || "",
        baseBranch: mr.target_branch || "",
        author: mr.author?.username || "",
        authorAvatarUrl: mr.author?.avatar_url || null,
        createdAt: mr.created_at,
        updatedAt: mr.updated_at,
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        labels: mr.labels || [],
        draft: mr.draft || mr.work_in_progress || false,
      }));
    }
    case "bitbucket": {
      const bbState = state === "open" ? "OPEN" : state === "closed" ? "MERGED" : "";
      const stateParam = bbState ? `&state=${bbState}` : "";
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests?pagelen=50${stateParam}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Failed to fetch Bitbucket PRs: ${res.status}`);
      const data = await res.json();
      return (data.values || []).map((pr: any) => ({
        number: pr.id,
        title: pr.title,
        description: pr.description || "",
        url: pr.links?.html?.href || "",
        state: pr.state?.toLowerCase() || "open",
        headBranch: pr.source?.branch?.name || "",
        baseBranch: pr.destination?.branch?.name || "",
        author: pr.author?.display_name || pr.author?.nickname || "",
        authorAvatarUrl: pr.author?.links?.avatar?.href || null,
        createdAt: pr.created_on,
        updatedAt: pr.updated_on,
        additions: 0,
        deletions: 0,
        changedFiles: 0,
        labels: [],
        draft: false,
      }));
    }
  }
}

export async function fetchPullRequestDiff(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  prNumber: number,
): Promise<PrDiffInfo> {
  const [owner, repo] = repoFullName.split("/");

  switch (provider) {
    case "github": {
      const token = await resolveGitHubToken(accessToken);
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

      // Fetch PR metadata
      const metaRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
        { headers }
      );
      if (!metaRes.ok) throw new Error(`Failed to fetch PR #${prNumber}: ${metaRes.status}`);
      const meta = await metaRes.json() as any;

      // Fetch diff
      const diffRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3.diff" } }
      );
      if (!diffRes.ok) throw new Error(`Failed to fetch PR diff: ${diffRes.status}`);
      const diff = await diffRes.text();

      // Fetch changed files
      const filesRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=100`,
        { headers }
      );
      const filesData = filesRes.ok ? (await filesRes.json() as any[]) : [];

      return {
        provider: "github",
        owner,
        repo,
        number: prNumber,
        title: meta.title || "",
        description: meta.body || "",
        diff,
        url: meta.html_url || `https://github.com/${repoFullName}/pull/${prNumber}`,
        baseBranch: meta.base?.ref || "main",
        headBranch: meta.head?.ref || "",
        files: filesData.map((f: any) => f.filename),
      };
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const headers = { Authorization: `Bearer ${accessToken}` };

      const metaRes = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${prNumber}`,
        { headers }
      );
      if (!metaRes.ok) throw new Error(`Failed to fetch MR !${prNumber}: ${metaRes.status}`);
      const meta = await metaRes.json() as any;

      // GitLab: get changes (includes diff)
      const changesRes = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${prNumber}/changes`,
        { headers }
      );
      const changes = changesRes.ok ? (await changesRes.json() as any) : { changes: [] };

      // Build unified diff from changes
      const diff = (changes.changes || []).map((c: any) =>
        `diff --git a/${c.old_path} b/${c.new_path}\n${c.diff || ""}`
      ).join("\n");

      return {
        provider: "gitlab",
        owner,
        repo,
        number: prNumber,
        title: meta.title || "",
        description: meta.description || "",
        diff,
        url: meta.web_url || "",
        baseBranch: meta.target_branch || "main",
        headBranch: meta.source_branch || "",
        files: (changes.changes || []).map((c: any) => c.new_path),
      };
    }
    case "bitbucket": {
      const headers = { Authorization: `Bearer ${accessToken}` };

      const metaRes = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests/${prNumber}`,
        { headers }
      );
      if (!metaRes.ok) throw new Error(`Failed to fetch PR #${prNumber}: ${metaRes.status}`);
      const meta = await metaRes.json() as any;

      const diffRes = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests/${prNumber}/diff`,
        { headers }
      );
      const diff = diffRes.ok ? await diffRes.text() : "";

      return {
        provider: "bitbucket",
        owner,
        repo,
        number: prNumber,
        title: meta.title || "",
        description: meta.description || "",
        diff,
        url: meta.links?.html?.href || "",
        baseBranch: meta.destination?.branch?.name || "main",
        headBranch: meta.source?.branch?.name || "",
        files: [],
      };
    }
  }
}

export async function createPullRequest(
  provider: OAuthProvider,
  accessToken: string,
  repoFullName: string,
  opts: { title: string; body: string; head: string; base: string }
): Promise<{ url: string }> {
  switch (provider) {
    case "github": {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: opts.title, body: opts.body, head: opts.head, base: opts.base }),
      });
      if (!res.ok) throw new Error(`GitHub PR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.html_url };
    }
    case "gitlab": {
      const projectId = encodeURIComponent(repoFullName);
      const res = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/merge_requests`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: opts.title,
          description: opts.body,
          source_branch: opts.head,
          target_branch: opts.base,
        }),
      });
      if (!res.ok) throw new Error(`GitLab MR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.web_url };
    }
    case "bitbucket": {
      const res = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: opts.title,
            description: opts.body,
            source: { branch: { name: opts.head } },
            destination: { branch: { name: opts.base } },
          }),
        }
      );
      if (!res.ok) throw new Error(`Bitbucket PR creation failed: ${await res.text()}`);
      const data = await res.json();
      return { url: data.links?.html?.href || "" };
    }
  }
}
