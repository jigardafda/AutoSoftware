const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
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
    get: (id: string) => request<any>(`/scans/${id}`),
  },
};
