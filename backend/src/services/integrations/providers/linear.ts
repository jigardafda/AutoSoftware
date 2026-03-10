import { INTEGRATION_PROVIDERS, INTEGRATION_OAUTH_CONFIGS } from "@autosoftware/shared";
import type { ExternalProject, ExternalItem, ExternalItemDetail } from "@autosoftware/shared";
import type { IntegrationAdapter } from "../types.js";
import { config } from "../../../config.js";

const meta = INTEGRATION_PROVIDERS.find((p) => p.type === "linear")!;
const oauthConfig = INTEGRATION_OAUTH_CONFIGS.linear!;

async function graphql(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || "Linear GraphQL error");
  return json.data;
}

export const linearAdapter: IntegrationAdapter = {
  provider: "linear",
  meta,

  getOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: config.linear.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: oauthConfig.scopes,
      state,
      prompt: "consent",
    });
    return `${oauthConfig.authUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.linear.clientId,
        client_secret: config.linear.clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Linear OAuth failed");

    // Get user info
    const viewer = await graphql(data.access_token, `{ viewer { id email name } }`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accountId: viewer.viewer.id,
      accountEmail: viewer.viewer.email,
    };
  },

  async listProjects(accessToken) {
    const data = await graphql(accessToken, `{
      teams {
        nodes {
          id name key
          projects { nodes { id name } }
        }
      }
    }`);

    return data.teams.nodes.map((team: any): ExternalProject => ({
      id: team.id,
      name: team.name,
      key: team.key,
      url: `https://linear.app/team/${team.key}`,
      description: null,
      metadata: { projects: team.projects?.nodes || [] },
    }));
  },

  async listItems(accessToken, _config, externalProjectId, options) {
    const limit = options?.limit || 50;
    const variables: Record<string, unknown> = {
      teamId: externalProjectId,
      first: limit,
    };
    if (options?.cursor) variables.after = options.cursor;

    let filter = `teamId: { eq: $teamId }`;
    if (options?.search) {
      filter += `, title: { containsIgnoreCase: "${options.search.replace(/"/g, '\\"')}" }`;
    }

    const data = await graphql(accessToken, `
      query($teamId: String!, $first: Int!, $after: String) {
        issues(filter: { ${filter} }, first: $first, after: $after, orderBy: updatedAt) {
          nodes {
            id title description url state { name } priority priorityLabel
            labels { nodes { name } }
            assignee { name }
            createdAt updatedAt identifier
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, variables);

    const items: ExternalItem[] = data.issues.nodes.map((issue: any) => ({
      id: issue.id,
      title: `${issue.identifier}: ${issue.title}`,
      description: issue.description || "",
      url: issue.url,
      type: "issue",
      status: issue.state?.name || "Unknown",
      priority: issue.priorityLabel || null,
      labels: issue.labels?.nodes?.map((l: any) => l.name) || [],
      assignee: issue.assignee?.name || null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      itemType: "issue" as const,
      metadata: { identifier: issue.identifier },
    }));

    return {
      items,
      nextCursor: data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null,
      total: null,
    };
  },

  async getItemDetail(accessToken, _config, _externalProjectId, itemId) {
    const data = await graphql(accessToken, `
      query($id: String!) {
        issue(id: $id) {
          id title description url state { name } priority priorityLabel
          labels { nodes { name } }
          assignee { name }
          createdAt updatedAt identifier
          comments { nodes { id body createdAt user { name } } }
        }
      }
    `, { id: itemId });

    const issue = data.issue;
    return {
      id: issue.id,
      title: `${issue.identifier}: ${issue.title}`,
      description: issue.description || "",
      url: issue.url,
      type: "issue",
      status: issue.state?.name || "Unknown",
      priority: issue.priorityLabel || null,
      labels: issue.labels?.nodes?.map((l: any) => l.name) || [],
      assignee: issue.assignee?.name || null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      itemType: "issue" as const,
      metadata: { identifier: issue.identifier },
      comments: (issue.comments?.nodes || []).map((c: any) => ({
        id: c.id,
        author: c.user?.name || "Unknown",
        body: c.body,
        createdAt: c.createdAt,
      })),
      stackTrace: null,
      rawPayload: issue,
    };
  },

  mapToTaskFields(item) {
    const priorityMap: Record<string, "low" | "medium" | "high" | "critical"> = {
      "No priority": "low",
      "Low": "low",
      "Medium": "medium",
      "High": "high",
      "Urgent": "critical",
    };
    const hasLabel = (name: string) => item.labels.some((l) => l.toLowerCase().includes(name));

    return {
      title: item.title,
      description: item.description,
      type: hasLabel("bug") ? "bugfix" : hasLabel("feature") ? "feature" : "improvement",
      priority: priorityMap[item.priority || ""] || "medium",
    };
  },
};
