import { INTEGRATION_PROVIDERS } from "@autosoftware/shared";
import type { ExternalProject, ExternalItem, ExternalItemDetail } from "@autosoftware/shared";
import type { IntegrationAdapter } from "../types.js";

const meta = INTEGRATION_PROVIDERS.find((p) => p.type === "github_issues")!;

async function ghApi(token: string, path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }
  return res.json();
}

export const githubIssuesAdapter: IntegrationAdapter = {
  provider: "github_issues",
  meta,

  async validateToken(token) {
    try {
      const user = await ghApi(token, "/user");
      return { valid: true, accountEmail: user.email, displayName: user.login };
    } catch {
      return { valid: false };
    }
  },

  async listProjects(accessToken) {
    const repos = await ghApi(accessToken, "/user/repos?per_page=100&sort=updated&type=all");
    return repos.map((repo: any): ExternalProject => ({
      id: repo.full_name,
      name: repo.full_name,
      key: repo.name,
      url: repo.html_url,
      description: repo.description,
      metadata: { private: repo.private, language: repo.language },
    }));
  },

  async listItems(accessToken, _config, externalProjectId, options) {
    const limit = options?.limit || 30;
    let path = `/repos/${externalProjectId}/issues?per_page=${limit}&state=all&sort=updated`;
    if (options?.cursor) path += `&page=${options.cursor}`;
    if (options?.search) {
      // Use search API for better results
      const q = encodeURIComponent(`repo:${externalProjectId} is:issue ${options.search}`);
      const data = await ghApi(accessToken, `/search/issues?q=${q}&per_page=${limit}`);
      return {
        items: data.items.map(mapIssue),
        nextCursor: null,
        total: data.total_count,
      };
    }

    const issues = await ghApi(accessToken, path);
    // Filter out pull requests (GitHub returns them in issues API)
    const filtered = issues.filter((i: any) => !i.pull_request);

    const currentPage = options?.cursor ? parseInt(options.cursor) : 1;
    return {
      items: filtered.map(mapIssue),
      nextCursor: filtered.length === limit ? String(currentPage + 1) : null,
      total: null,
    };
  },

  async getItemDetail(accessToken, _config, externalProjectId, itemId) {
    const issue = await ghApi(accessToken, `/repos/${externalProjectId}/issues/${itemId}`);
    const comments = await ghApi(accessToken, `/repos/${externalProjectId}/issues/${itemId}/comments?per_page=50`);

    return {
      ...mapIssue(issue),
      comments: comments.map((c: any) => ({
        id: String(c.id),
        author: c.user?.login || "unknown",
        body: c.body || "",
        createdAt: c.created_at,
      })),
      stackTrace: null,
      rawPayload: issue,
    };
  },

  mapToTaskFields(item) {
    const hasLabel = (name: string) => item.labels.some((l) => l.toLowerCase().includes(name));
    return {
      title: item.title,
      description: item.description,
      type: hasLabel("bug") ? "bugfix" : hasLabel("feature") || hasLabel("enhancement") ? "feature" : "improvement",
      priority: "medium",
    };
  },
};

function mapIssue(issue: any): ExternalItem {
  return {
    id: String(issue.number),
    title: issue.title,
    description: issue.body || "",
    url: issue.html_url,
    type: "issue",
    status: issue.state,
    priority: null,
    labels: (issue.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)),
    assignee: issue.assignee?.login || null,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    itemType: "issue",
    metadata: { number: issue.number },
  };
}
