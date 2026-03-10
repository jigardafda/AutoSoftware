import { INTEGRATION_PROVIDERS, INTEGRATION_OAUTH_CONFIGS } from "@autosoftware/shared";
import type { ExternalProject, ExternalItem, ExternalItemDetail } from "@autosoftware/shared";
import type { IntegrationAdapter } from "../types.js";
import { config } from "../../../config.js";

const meta = INTEGRATION_PROVIDERS.find((p) => p.type === "asana")!;
const oauthConfig = INTEGRATION_OAUTH_CONFIGS.asana!;

async function asanaApi(token: string, path: string) {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors?.[0]?.message || `Asana API error: ${res.status}`);
  }
  return res.json();
}

export const asanaAdapter: IntegrationAdapter = {
  provider: "asana",
  meta,

  getOAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: config.asana.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    return `${oauthConfig.authUrl}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.asana.clientId,
        client_secret: config.asana.clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Asana OAuth failed");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accountId: data.data?.id ? String(data.data.id) : undefined,
      accountEmail: data.data?.email,
      config: { workspaceId: data.data?.workspaces?.[0]?.gid },
    };
  },

  async listProjects(accessToken, cfg) {
    const workspaceId = cfg.workspaceId as string;
    let path = "/projects?opt_fields=name,notes,permalink_url&limit=100";
    if (workspaceId) path += `&workspace=${workspaceId}`;

    const data = await asanaApi(accessToken, path);
    return (data.data || []).map((p: any): ExternalProject => ({
      id: p.gid,
      name: p.name,
      key: p.gid,
      url: p.permalink_url || null,
      description: p.notes || null,
      metadata: {},
    }));
  },

  async listItems(accessToken, _cfg, externalProjectId, options) {
    const limit = options?.limit || 50;
    let path = `/projects/${externalProjectId}/tasks?opt_fields=name,notes,completed,assignee.name,tags.name,created_at,modified_at,permalink_url&limit=${limit}`;
    if (options?.cursor) path += `&offset=${options.cursor}`;

    const data = await asanaApi(accessToken, path);
    let items: ExternalItem[] = (data.data || []).map(mapAsanaTask);

    if (options?.search) {
      const term = options.search.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(term));
    }

    return {
      items,
      nextCursor: data.next_page?.offset || null,
      total: null,
    };
  },

  async getItemDetail(accessToken, _cfg, _externalProjectId, itemId) {
    const data = await asanaApi(accessToken,
      `/tasks/${itemId}?opt_fields=name,notes,completed,assignee.name,tags.name,created_at,modified_at,permalink_url`
    );
    const stories = await asanaApi(accessToken,
      `/tasks/${itemId}/stories?opt_fields=text,created_by.name,created_at,type&limit=50`
    );

    const base = mapAsanaTask(data.data);
    const comments = (stories.data || [])
      .filter((s: any) => s.type === "comment")
      .map((s: any) => ({
        id: s.gid,
        author: s.created_by?.name || "Unknown",
        body: s.text || "",
        createdAt: s.created_at,
      }));

    return { ...base, comments, stackTrace: null, rawPayload: data.data };
  },

  mapToTaskFields(item) {
    return {
      title: item.title,
      description: item.description,
      type: "improvement" as const,
      priority: "medium" as const,
    };
  },
};

function mapAsanaTask(task: any): ExternalItem {
  return {
    id: task.gid,
    title: task.name || "Untitled",
    description: task.notes || "",
    url: task.permalink_url || null,
    type: "task",
    status: task.completed ? "completed" : "open",
    priority: null,
    labels: (task.tags || []).map((t: any) => t.name),
    assignee: task.assignee?.name || null,
    createdAt: task.created_at,
    updatedAt: task.modified_at,
    itemType: "issue",
    metadata: {},
  };
}
