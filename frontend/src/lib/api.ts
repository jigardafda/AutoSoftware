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
    scan: (id: string) => request<any>(`/repos/${id}/scan`, { method: "POST" }),
    scans: (id: string) => request<any[]>(`/repos/${id}/scans`),
    stats: (id: string) => request<any>(`/repos/${id}/stats`),
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
  },
  scans: {
    list: () => request<any[]>("/scans"),
    get: (id: string) => request<any>(`/scans/${id}`),
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
