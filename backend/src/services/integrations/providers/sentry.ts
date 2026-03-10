import { INTEGRATION_PROVIDERS } from "@autosoftware/shared";
import type { ExternalProject, ExternalItem, ExternalItemDetail } from "@autosoftware/shared";
import type { IntegrationAdapter } from "../types.js";

const meta = INTEGRATION_PROVIDERS.find((p) => p.type === "sentry")!;

async function sentryApi(token: string, path: string) {
  const res = await fetch(`https://sentry.io/api/0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Sentry API error: ${res.status}`);
  }
  return res.json();
}

export const sentryAdapter: IntegrationAdapter = {
  provider: "sentry",
  meta,

  async validateToken(token, cfg) {
    try {
      const orgSlug = cfg.orgSlug as string;
      if (!orgSlug) return { valid: false };
      const org = await sentryApi(token, `/organizations/${orgSlug}/`);
      return { valid: true, displayName: org.name, accountEmail: org.slug };
    } catch {
      return { valid: false };
    }
  },

  async listProjects(accessToken, cfg) {
    const orgSlug = cfg.orgSlug as string;
    const projects = await sentryApi(accessToken, `/organizations/${orgSlug}/projects/`);
    return projects.map((p: any): ExternalProject => ({
      id: p.slug,
      name: p.name,
      key: p.slug,
      url: `https://sentry.io/organizations/${orgSlug}/projects/${p.slug}/`,
      description: null,
      metadata: { platform: p.platform, status: p.status },
    }));
  },

  async listItems(accessToken, cfg, externalProjectId, options) {
    const orgSlug = cfg.orgSlug as string;
    let path = `/projects/${orgSlug}/${externalProjectId}/issues/?limit=${options?.limit || 25}`;
    if (options?.cursor) path += `&cursor=${options.cursor}`;
    if (options?.search) path += `&query=${encodeURIComponent(options.search)}`;

    const res = await fetch(`https://sentry.io/api/0${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Sentry API error: ${res.status}`);

    const issues = await res.json();
    // Parse Link header for cursor
    const link = res.headers.get("link") || "";
    const nextMatch = link.match(/results="true".*cursor="([^"]+)"/);
    const nextCursor = nextMatch ? nextMatch[1] : null;

    return {
      items: issues.map(mapSentryIssue),
      nextCursor,
      total: null,
    };
  },

  async getItemDetail(accessToken, cfg, externalProjectId, itemId) {
    const orgSlug = cfg.orgSlug as string;
    const issue = await sentryApi(accessToken, `/issues/${itemId}/`);
    const events = await sentryApi(accessToken, `/issues/${itemId}/events/latest/`).catch(() => null);

    const stackTrace = events?.entries
      ?.filter((e: any) => e.type === "exception")
      ?.flatMap((e: any) => e.data?.values || [])
      ?.map((ex: any) => {
        const frames = ex.stacktrace?.frames?.map((f: any) =>
          `  ${f.filename}:${f.lineNo} in ${f.function || "?"}`
        ).reverse().join("\n") || "";
        return `${ex.type}: ${ex.value}\n${frames}`;
      }).join("\n\n") || null;

    const base = mapSentryIssue(issue);
    return {
      ...base,
      comments: [],
      stackTrace,
      rawPayload: { issue, latestEvent: events },
    };
  },

  mapToTaskFields(item) {
    return {
      title: item.title,
      description: item.description,
      type: "bugfix",
      priority: item.metadata.count && (item.metadata.count as number) > 100 ? "high" : "medium",
    };
  },
};

function mapSentryIssue(issue: any): ExternalItem {
  return {
    id: String(issue.id),
    title: issue.title || issue.culprit || "Unknown Error",
    description: `${issue.metadata?.type || ""}: ${issue.metadata?.value || issue.title || ""}\n\nEvents: ${issue.count || 0} | Users: ${issue.userCount || 0}`,
    url: issue.permalink || null,
    type: issue.type || "error",
    status: issue.status,
    priority: issue.priority || null,
    labels: [],
    assignee: issue.assignedTo?.name || null,
    createdAt: issue.firstSeen,
    updatedAt: issue.lastSeen,
    itemType: "error",
    metadata: {
      count: parseInt(issue.count) || 0,
      userCount: parseInt(issue.userCount) || 0,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      platform: issue.platform,
    },
  };
}
