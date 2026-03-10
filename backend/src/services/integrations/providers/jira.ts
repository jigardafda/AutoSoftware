import { INTEGRATION_PROVIDERS, INTEGRATION_OAUTH_CONFIGS } from "@autosoftware/shared";
import type { ExternalProject, ExternalItem, ExternalItemDetail } from "@autosoftware/shared";
import type { IntegrationAdapter } from "../types.js";
import { config } from "../../../config.js";

const meta = INTEGRATION_PROVIDERS.find((p) => p.type === "jira")!;
const oauthConfig = INTEGRATION_OAUTH_CONFIGS.jira!;

function jiraApi(token: string, cloudId: string, path: string) {
  return fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Jira API error: ${res.status}`);
    }
    return res.json();
  });
}

export const jiraAdapter: IntegrationAdapter = {
  provider: "jira",
  meta,

  getOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: config.jira.clientId,
      scope: oauthConfig.scopes,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
    });
    return `${oauthConfig.authUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: config.jira.clientId,
        client_secret: config.jira.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Jira OAuth failed");

    // Get accessible resources (cloud instances)
    const resourcesRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/json" },
    });
    const resources = await resourcesRes.json();
    const site = resources[0];

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accountId: site?.id,
      accountEmail: site?.name,
      config: {
        cloudId: site?.id,
        siteUrl: site?.url,
        siteName: site?.name,
      },
    };
  },

  async listProjects(accessToken, cfg) {
    const cloudId = cfg.cloudId as string;
    if (!cloudId) throw new Error("Jira cloudId not configured");
    const data = await jiraApi(accessToken, cloudId, "/project/search?maxResults=100");
    return data.values.map((p: any): ExternalProject => ({
      id: p.id,
      name: p.name,
      key: p.key,
      url: `${cfg.siteUrl || ""}/browse/${p.key}`,
      description: p.description || null,
      metadata: { style: p.style, projectTypeKey: p.projectTypeKey },
    }));
  },

  async listItems(accessToken, cfg, externalProjectId, options) {
    const cloudId = cfg.cloudId as string;
    const limit = options?.limit || 50;
    const startAt = options?.cursor ? parseInt(options.cursor) : 0;

    let jql = `project = ${externalProjectId} ORDER BY updated DESC`;
    if (options?.search) {
      jql = `project = ${externalProjectId} AND text ~ "${options.search.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
    }

    const data = await jiraApi(accessToken, cloudId,
      `/search?jql=${encodeURIComponent(jql)}&maxResults=${limit}&startAt=${startAt}&fields=summary,status,priority,labels,assignee,issuetype,created,updated`
    );

    const items: ExternalItem[] = data.issues.map((issue: any) => mapJiraIssue(issue, cfg));
    const nextStart = startAt + limit;
    return {
      items,
      nextCursor: nextStart < data.total ? String(nextStart) : null,
      total: data.total,
    };
  },

  async getItemDetail(accessToken, cfg, _externalProjectId, itemId) {
    const cloudId = cfg.cloudId as string;
    const issue = await jiraApi(accessToken, cloudId,
      `/issue/${itemId}?fields=summary,description,status,priority,labels,assignee,issuetype,created,updated,comment`
    );

    const base = mapJiraIssue(issue, cfg);
    const comments = (issue.fields.comment?.comments || []).map((c: any) => ({
      id: c.id,
      author: c.author?.displayName || "Unknown",
      body: c.body?.content?.map((block: any) =>
        block.content?.map((node: any) => node.text || "").join("") || ""
      ).join("\n") || "",
      createdAt: c.created,
    }));

    return { ...base, comments, stackTrace: null, rawPayload: issue };
  },

  mapToTaskFields(item) {
    const typeMap: Record<string, "bugfix" | "feature" | "improvement"> = {
      Bug: "bugfix", Story: "feature", Task: "improvement", Epic: "feature",
    };
    const priorityMap: Record<string, "low" | "medium" | "high" | "critical"> = {
      Lowest: "low", Low: "low", Medium: "medium", High: "high", Highest: "critical",
    };
    return {
      title: item.title,
      description: item.description,
      type: typeMap[item.type] || "improvement",
      priority: priorityMap[item.priority || ""] || "medium",
    };
  },
};

function mapJiraIssue(issue: any, cfg: Record<string, unknown>): ExternalItem {
  const f = issue.fields;
  return {
    id: issue.key,
    title: `${issue.key}: ${f.summary}`,
    description: f.description?.content?.map((block: any) =>
      block.content?.map((node: any) => node.text || "").join("") || ""
    ).join("\n") || "",
    url: `${cfg.siteUrl || ""}/browse/${issue.key}`,
    type: f.issuetype?.name || "Task",
    status: f.status?.name || "Unknown",
    priority: f.priority?.name || null,
    labels: f.labels || [],
    assignee: f.assignee?.displayName || null,
    createdAt: f.created,
    updatedAt: f.updated,
    itemType: f.issuetype?.name === "Bug" ? "bug" : "issue",
    metadata: { issueId: issue.id },
  };
}
