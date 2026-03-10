const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers,
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Request failed");
  return data.data;
}

async function requestFull<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers,
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Request failed");
  return data;
}

export const api = {
  auth: {
    me: () => request<any>("/auth/me"),
    logout: () => request<any>("/auth/logout", { method: "POST" }),
  },
  repos: {
    list: () => request<any[]>("/repos"),
    available: (provider: string) => request<any[]>(`/repos/available/${provider}`),
    connect: (body: any) => request<any>("/repos", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<any>(`/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/repos/${id}`, { method: "DELETE" }),
    scan: (id: string, projectId?: string) =>
      request<any>(`/repos/${id}/scan`, {
        method: "POST",
        body: projectId ? JSON.stringify({ projectId }) : undefined,
      }),
    scans: (id: string) => request<any[]>(`/repos/${id}/scans`),
    stats: (id: string) => request<any>(`/repos/${id}/stats`),
    tree: (id: string, path?: string) => {
      const qs = path ? `?path=${encodeURIComponent(path)}` : "";
      return requestFull<{ data: any[]; branch?: string }>(`/repos/${id}/tree${qs}`);
    },
    file: (id: string, path: string) =>
      request<any>(`/repos/${id}/file?path=${encodeURIComponent(path)}`),
    rawUrl: (id: string, path: string) =>
      `/api/repos/${id}/raw?path=${encodeURIComponent(path)}`,
  },
  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return request<any[]>(`/tasks${qs}`);
    },
    get: (id: string) => request<any>(`/tasks/${id}`),
    create: (body: any) => request<any>("/tasks", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<any>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/tasks/${id}`, { method: "DELETE" }),
    bulkDelete: (ids: string[]) =>
      request<{ deleted: number }>("/tasks/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    submitAnswers: (id: string, body: { answers: Record<string, any> }) =>
      request<any>(`/tasks/${id}/answers`, { method: "POST", body: JSON.stringify(body) }),
    startPlanning: (id: string) =>
      request<any>(`/tasks/${id}/plan`, { method: "POST" }),
  },
  projects: {
    list: () => request<any[]>("/projects"),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (body: { name: string; description?: string }) =>
      request<any>("/projects", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; description?: string }) =>
      request<any>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/projects/${id}`, { method: "DELETE" }),
    stats: (id: string) => request<any>(`/projects/${id}/stats`),
    addRepo: (id: string, repositoryId: string) =>
      request<any>(`/projects/${id}/repos`, { method: "POST", body: JSON.stringify({ repositoryId }) }),
    removeRepo: (id: string, repoId: string) =>
      request<any>(`/projects/${id}/repos/${repoId}`, { method: "DELETE" }),
    documents: {
      list: (id: string) => request<any[]>(`/projects/${id}/documents`),
      create: (id: string, body: { title: string; content?: string }) =>
        request<any>(`/projects/${id}/documents`, { method: "POST", body: JSON.stringify(body) }),
      update: (id: string, docId: string, body: { title?: string; content?: string; sortOrder?: number }) =>
        request<any>(`/projects/${id}/documents/${docId}`, { method: "PATCH", body: JSON.stringify(body) }),
      delete: (id: string, docId: string) =>
        request<any>(`/projects/${id}/documents/${docId}`, { method: "DELETE" }),
    },
  },
  scans: {
    list: () => request<any[]>("/scans"),
    get: (id: string) => request<any>(`/scans/${id}`),
    logs: (id: string, after?: string) => {
      const qs = after ? `?after=${encodeURIComponent(after)}` : "";
      return request<any[]>(`/scans/${id}/logs${qs}`);
    },
  },
  ai: {
    command: (text: string) =>
      request<any>("/ai/command", { method: "POST", body: JSON.stringify({ text }) }),
    insights: () => request<any[]>("/ai/insights"),
    dismissInsight: (id: string) =>
      request<any>(`/ai/insights/${id}/dismiss`, { method: "POST" }),
  },
  queues: {
    list: () => request<any[]>("/queues"),
    jobs: (name: string, params?: Record<string, string | undefined>) => {
      const filtered = Object.fromEntries(
        Object.entries(params || {}).filter(([, v]) => v !== undefined)
      ) as Record<string, string>;
      const qs = Object.keys(filtered).length ? `?${new URLSearchParams(filtered)}` : "";
      return request<{ jobs: any[]; total: number }>(`/queues/${name}/jobs${qs}`);
    },
  },
  integrations: {
    providers: () => request<any[]>("/integrations/providers"),
    list: () => request<any[]>("/integrations"),
    connectToken: (body: { provider: string; token: string; config?: Record<string, string>; displayName?: string }) =>
      request<any>("/integrations", { method: "POST", body: JSON.stringify(body) }),
    disconnect: (id: string) =>
      request<any>(`/integrations/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      request<any>(`/integrations/${id}/test`, { method: "POST" }),
    listProjects: (id: string) =>
      request<any[]>(`/integrations/${id}/projects`),
    listItems: (id: string, extProjectId: string, params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return request<any>(`/integrations/${id}/projects/${encodeURIComponent(extProjectId)}/items${qs}`);
    },
    getItemDetail: (id: string, extProjectId: string, itemId: string) =>
      request<any>(`/integrations/${id}/projects/${encodeURIComponent(extProjectId)}/items/${encodeURIComponent(itemId)}`),
    projectLinks: (projectId: string) =>
      request<any[]>(`/integrations/projects/${projectId}/links`),
    createLink: (projectId: string, body: any) =>
      request<any>(`/integrations/projects/${projectId}/links`, { method: "POST", body: JSON.stringify(body) }),
    deleteLink: (linkId: string) =>
      request<any>(`/integrations/links/${linkId}`, { method: "DELETE" }),
    importItems: (linkId: string, body: { itemIds: string[]; repositoryId: string }) =>
      request<any>(`/integrations/links/${linkId}/import`, { method: "POST", body: JSON.stringify(body) }),
  },
  activity: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return request<any[]>(`/activity${qs}`);
    },
  },
  apiKeys: {
    list: () => request<any[]>("/api-keys"),
    create: (body: { label: string; apiKey: string }) =>
      request<any>("/api-keys", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { label?: string; isActive?: boolean }) =>
      request<any>(`/api-keys/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<any>(`/api-keys/${id}`, { method: "DELETE" }),
    reorder: (keyIds: string[]) =>
      request<any>("/api-keys/reorder", { method: "PUT", body: JSON.stringify({ keyIds }) }),
    usage: (id: string, days?: number) => {
      const qs = days ? `?days=${days}` : "";
      return request<any>(`/api-keys/${id}/usage${qs}`);
    },
  },
};
