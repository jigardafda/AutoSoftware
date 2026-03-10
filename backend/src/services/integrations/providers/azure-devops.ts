import { INTEGRATION_PROVIDERS, INTEGRATION_OAUTH_CONFIGS } from "@autosoftware/shared";
import type { ExternalProject, ExternalItem, ExternalItemDetail } from "@autosoftware/shared";
import type { IntegrationAdapter } from "../types.js";
import { config } from "../../../config.js";

const meta = INTEGRATION_PROVIDERS.find((p) => p.type === "azure_devops")!;
const oauthConfig = INTEGRATION_OAUTH_CONFIGS.azure_devops!;

async function adoApi(token: string, org: string, path: string) {
  const res = await fetch(`https://dev.azure.com/${org}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Azure DevOps API error: ${res.status}`);
  }
  return res.json();
}

export const azureDevOpsAdapter: IntegrationAdapter = {
  provider: "azure_devops",
  meta,

  getOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: config.azureDevops.clientId,
      response_type: "Assertion",
      state,
      scope: oauthConfig.scopes,
      redirect_uri: redirectUri,
    });
    return `${oauthConfig.authUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: config.azureDevops.clientSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: code,
      redirect_uri: redirectUri,
    });
    const res = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Azure DevOps OAuth failed");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  },

  async listProjects(accessToken, cfg) {
    const org = cfg.organization as string;
    if (!org) throw new Error("Azure DevOps organization not configured");
    const data = await adoApi(accessToken, org, "/_apis/projects?api-version=7.0");
    return (data.value || []).map((p: any): ExternalProject => ({
      id: p.id,
      name: p.name,
      key: p.name,
      url: `https://dev.azure.com/${org}/${encodeURIComponent(p.name)}`,
      description: p.description || null,
      metadata: { state: p.state },
    }));
  },

  async listItems(accessToken, cfg, externalProjectId, options) {
    const org = cfg.organization as string;
    const limit = options?.limit || 50;

    // Use WIQL to query work items
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${externalProjectId}' ORDER BY [System.ChangedDate] DESC`;
    if (options?.search) {
      wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${externalProjectId}' AND [System.Title] CONTAINS '${options.search.replace(/'/g, "''")}' ORDER BY [System.ChangedDate] DESC`;
    }

    const wiqlResult = await fetch(`https://dev.azure.com/${org}/${encodeURIComponent(externalProjectId)}/_apis/wit/wiql?api-version=7.0&$top=${limit}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: wiql }),
    }).then((r) => r.json());

    if (!wiqlResult.workItems?.length) {
      return { items: [], nextCursor: null, total: 0 };
    }

    const ids = wiqlResult.workItems.map((w: any) => w.id).slice(0, limit);
    const details = await adoApi(accessToken, org,
      `/_apis/wit/workitems?ids=${ids.join(",")}&fields=System.Id,System.Title,System.Description,System.State,System.WorkItemType,Microsoft.VSTS.Common.Priority,System.AssignedTo,System.CreatedDate,System.ChangedDate,System.Tags&api-version=7.0`
    );

    const items: ExternalItem[] = (details.value || []).map((wi: any): ExternalItem => {
      const f = wi.fields;
      return {
        id: String(wi.id),
        title: f["System.Title"],
        description: stripHtml(f["System.Description"] || ""),
        url: wi.url ? `https://dev.azure.com/${org}/_workitems/edit/${wi.id}` : null,
        type: f["System.WorkItemType"] || "Task",
        status: f["System.State"] || "New",
        priority: f["Microsoft.VSTS.Common.Priority"] ? String(f["Microsoft.VSTS.Common.Priority"]) : null,
        labels: f["System.Tags"] ? f["System.Tags"].split("; ") : [],
        assignee: f["System.AssignedTo"]?.displayName || null,
        createdAt: f["System.CreatedDate"],
        updatedAt: f["System.ChangedDate"],
        itemType: f["System.WorkItemType"] === "Bug" ? "bug" : "work_item",
        metadata: { workItemType: f["System.WorkItemType"] },
      };
    });

    return { items, nextCursor: null, total: wiqlResult.workItems.length };
  },

  async getItemDetail(accessToken, cfg, externalProjectId, itemId) {
    const org = cfg.organization as string;
    const wi = await adoApi(accessToken, org,
      `/_apis/wit/workitems/${itemId}?$expand=all&api-version=7.0`
    );
    const comments = await adoApi(accessToken, org,
      `/_apis/wit/workitems/${itemId}/comments?api-version=7.0-preview`
    ).catch(() => ({ comments: [] }));

    const f = wi.fields;
    return {
      id: String(wi.id),
      title: f["System.Title"],
      description: stripHtml(f["System.Description"] || ""),
      url: `https://dev.azure.com/${org}/_workitems/edit/${wi.id}`,
      type: f["System.WorkItemType"] || "Task",
      status: f["System.State"] || "New",
      priority: f["Microsoft.VSTS.Common.Priority"] ? String(f["Microsoft.VSTS.Common.Priority"]) : null,
      labels: f["System.Tags"] ? f["System.Tags"].split("; ") : [],
      assignee: f["System.AssignedTo"]?.displayName || null,
      createdAt: f["System.CreatedDate"],
      updatedAt: f["System.ChangedDate"],
      itemType: f["System.WorkItemType"] === "Bug" ? "bug" : "work_item",
      metadata: { workItemType: f["System.WorkItemType"] },
      comments: (comments.comments || []).map((c: any) => ({
        id: String(c.id),
        author: c.createdBy?.displayName || "Unknown",
        body: stripHtml(c.text || ""),
        createdAt: c.createdDate,
      })),
      stackTrace: null,
      rawPayload: wi,
    };
  },

  mapToTaskFields(item) {
    const typeMap: Record<string, "bugfix" | "feature" | "improvement"> = {
      Bug: "bugfix", "User Story": "feature", Feature: "feature", Task: "improvement", Epic: "feature",
    };
    const priorityMap: Record<string, "low" | "medium" | "high" | "critical"> = {
      "1": "critical", "2": "high", "3": "medium", "4": "low",
    };
    return {
      title: item.title,
      description: item.description,
      type: typeMap[item.type] || "improvement",
      priority: priorityMap[item.priority || ""] || "medium",
    };
  },
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}
