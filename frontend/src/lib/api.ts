const BASE = "/api";

// Task Step Types
export interface TaskStep {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  order: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  inProgress: number;
  pending: number;
  percentage: number;
  currentStep: TaskStep | null;
}

// Task Fork Types
export interface TaskForkNode {
  id: string;
  title: string;
  status: string;
  forkReason: string | null;
  forkDepth: number;
  parentTaskId: string | null;
  selectedApproach: number | null;
  enhancedPlan: boolean;
  pullRequestUrl: string | null;
  createdAt: string;
  repositoryName: string;
  children: TaskForkNode[];
}

// Task Genealogy Types
export interface GenealogyNodeMetadata {
  repositoryName?: string;
  branch?: string;
  tasksCreated?: number;
  taskType?: string;
  priority?: string;
  forkReason?: string;
  forkDepth?: number;
  parentTaskId?: string;
  scanResultId?: string;
  pullRequestUrl?: string;
  selectedApproach?: number | null;
  source?: string;
}

export interface GenealogyNode {
  id: string;
  type: "scan" | "task";
  title: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  metadata: GenealogyNodeMetadata;
  children: GenealogyNode[];
}

// Analytics Types
interface AnalyticsOverview {
  totalTasks: number;
  totalTasksTrend: number;
  hoursSaved: number;
  hoursSavedTrend: number;
  totalCost: number;
  totalCostTrend: number;
  roi: number;
  roiTrend: number;
  successRate: number;
  successRateTrend: number;
  sparklines: {
    tasks: number[];
    hoursSaved: number[];
    cost: number[];
    roi: number[];
    successRate: number[];
  };
}

interface ROIData {
  engineeringCostSaved: number;
  platformCost: number;
  netSavings: number;
  roi: number;
  hourlyRate: number;
  totalHoursSaved: number;
}

interface CostData {
  total: number;
  byModel: { model: string; cost: number; percentage: number }[];
  byTokenType: { type: 'input' | 'output'; tokens: number; cost: number }[];
  timeline: { date: string; cost: number }[];
}

interface PipelineHealth {
  pending: number;
  planning: number;
  inProgress: number;
  completed: number;
  failed: number;
  avgTimeToComplete: number;
  avgPlanningRounds: number;
}

interface DistributionData {
  items: { label: string; value: number; percentage: number }[];
}

interface ContributorData {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  taskCount: number;
  hoursSaved: number;
  linesChanged: number;
}

interface TrendData {
  date: string;
  value: number;
}

interface LOCData {
  date: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

interface TimeSavedData {
  date: string;
  minutesSaved: number;
  taskCount: number;
}

interface DrillDownData {
  summary: {
    totalTasks: number;
    totalHoursSaved: number;
    totalLinesChanged: number;
    successRate: number;
  };
  items: {
    id: string;
    name: string;
    taskCount: number;
    hoursSaved: number;
    linesChanged: number;
  }[];
}

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
    devLogin: (email: string) =>
      request<{ success: boolean; user: { id: string; email: string; name: string } }>("/auth/dev-login", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    // Disconnect a provider from the current user
    disconnect: (provider: string) =>
      request<{ success: boolean; provider: string }>(`/auth/disconnect/${provider}`, {
        method: "POST",
      }),
  },
  repos: {
    list: () => request<any[]>("/repos"),
    available: (provider: string) => request<any[]>(`/repos/available/${provider}`),
    connect: (body: any) => request<any>("/repos", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      request<any>(`/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/repos/${id}`, { method: "DELETE" }),
    scan: (id: string, projectId?: string, branch?: string) => {
      const body: Record<string, string> = {};
      if (projectId) body.projectId = projectId;
      if (branch) body.branch = branch;
      return request<any>(`/repos/${id}/scan`, {
        method: "POST",
        body: Object.keys(body).length ? JSON.stringify(body) : undefined,
      });
    },
    scans: (id: string) => request<any[]>(`/repos/${id}/scans`),
    stats: (id: string) => request<any>(`/repos/${id}/stats`),
    tree: (id: string, path?: string, branch?: string) => {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      if (branch) params.set("branch", branch);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return requestFull<{ data: any[]; branch?: string }>(`/repos/${id}/tree${qs}`);
    },
    file: (id: string, path: string, branch?: string) => {
      const params = new URLSearchParams({ path });
      if (branch) params.set("branch", branch);
      return request<any>(`/repos/${id}/file?${params.toString()}`);
    },
    rawUrl: (id: string, path: string) =>
      `/api/repos/${id}/raw?path=${encodeURIComponent(path)}`,
    branches: (id: string) =>
      request<{ name: string; isDefault: boolean }[]>(`/repos/${id}/branches`),
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
    retry: (id: string) =>
      request<{ success: boolean }>(`/tasks/${id}/retry`, { method: "POST" }),
    cancel: (id: string) =>
      request<{ success: boolean }>(`/tasks/${id}/cancel`, { method: "POST" }),
    bulkRetry: (ids: string[]) =>
      request<{ retried: number }>("/tasks/bulk-retry", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    bulkPlan: (ids: string[]) =>
      request<{ planned: number }>("/tasks/bulk-plan", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    execute: (id: string) =>
      request<{ success: boolean }>(`/tasks/${id}/execute`, { method: "POST" }),
    bulkExecute: (ids: string[]) =>
      request<{ executed: number }>("/tasks/bulk-execute", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    submitAnswers: (id: string, body: { answers: Record<string, any> }) =>
      request<any>(`/tasks/${id}/answers`, { method: "POST", body: JSON.stringify(body) }),
    startPlanning: (id: string) =>
      request<any>(`/tasks/${id}/plan`, { method: "POST" }),
    selectApproach: (id: string, approachIndex: number) =>
      request<{ success: boolean; selectedApproach: any }>(`/tasks/${id}/select-approach`, {
        method: "POST",
        body: JSON.stringify({ approachIndex }),
      }),
    regenerateApproaches: (id: string) =>
      request<{ success: boolean }>(`/tasks/${id}/regenerate-approaches`, { method: "POST" }),
    logs: (id: string, after?: string) => {
      const qs = after ? `?after=${encodeURIComponent(after)}` : "";
      return request<any[]>(`/tasks/${id}/logs${qs}`);
    },
    executionLogs: (id: string) =>
      request<{
        terminalLines: Array<{
          timestamp: number;
          stream: string;
          data: string;
          sequence: number;
        }>;
        fileChanges: Array<{
          timestamp: number;
          operation: string;
          filePath: string;
          diff?: string;
          language?: string;
        }>;
        lastSequence: number;
      }>(`/tasks/${id}/execution-logs`),
    steps: (id: string) =>
      request<{
        steps: TaskStep[];
        progress: TaskProgress;
      }>(`/tasks/${id}/steps`),
    // AI Transparency: Get execution plan
    getPlan: (id: string) =>
      request<{
        plan: {
          taskId: string;
          overview: string;
          steps: Array<{
            id: string;
            title: string;
            description?: string;
            status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
            estimatedSeconds?: number;
            actualSeconds?: number;
            confidence?: number;
            reasoning?: string;
            blockerMessage?: string;
            startedAt?: string;
            completedAt?: string;
          }>;
          totalEstimatedSeconds: number;
          confidence: number;
          reasoning?: string;
          createdAt: string;
        } | null;
      }>(`/tasks/${id}/plan`),
    // AI Transparency: Get blockers
    getBlockers: (id: string) =>
      request<{
        hasBlocker: boolean;
        currentBlocker: {
          id: string;
          taskId: string;
          type: "error" | "stuck" | "needs_input" | "rate_limit" | "dependency";
          severity: "low" | "medium" | "high" | "critical";
          title: string;
          description: string;
          context?: string;
          suggestedActions?: string[];
          retryable: boolean;
          createdAt: string;
          resolvedAt?: string;
          retryCount?: number;
          maxRetries?: number;
        } | null;
        blockerHistory: any[];
        retryCount: number;
        maxRetries: number;
      }>(`/tasks/${id}/blockers`),

    // Fork operations
    fork: (id: string, body?: { reason?: string; title?: string; startPlanning?: boolean }) =>
      request<any>(`/tasks/${id}/fork`, {
        method: "POST",
        body: JSON.stringify(body || {}),
      }),
    getForkTree: (id: string) =>
      request<{
        tree: TaskForkNode;
        currentTaskId: string;
        rootTaskId: string;
      }>(`/tasks/${id}/fork-tree`),
    getForks: (id: string) => request<any[]>(`/tasks/${id}/forks`),
    getForkHistory: (id: string) =>
      request<{
        currentTask: { id: string; title: string; forkDepth: number };
        ancestors: any[];
      }>(`/tasks/${id}/fork-history`),
    compareTasks: (taskIds: string[]) =>
      request<any[]>(`/tasks/compare?taskIds=${taskIds.join(",")}`),
    mergeParts: (body: {
      sourceTaskId: string;
      targetTaskId: string;
      parts: {
        enhancedPlan?: boolean;
        approaches?: boolean;
        selectedApproach?: boolean;
        affectedFiles?: boolean;
      };
    }) =>
      request<any>("/tasks/merge-parts", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    // Task Genealogy API
    genealogy: {
      // Get full genealogy tree
      getTree: (params?: {
        repositoryId?: string;
        projectId?: string;
        scanId?: string;
        taskId?: string;
        includeCompleted?: boolean;
        maxDepth?: number;
        limit?: number;
      }) => {
        const searchParams = new URLSearchParams();
        if (params?.repositoryId) searchParams.set("repositoryId", params.repositoryId);
        if (params?.projectId) searchParams.set("projectId", params.projectId);
        if (params?.scanId) searchParams.set("scanId", params.scanId);
        if (params?.taskId) searchParams.set("taskId", params.taskId);
        if (params?.includeCompleted !== undefined)
          searchParams.set("includeCompleted", String(params.includeCompleted));
        if (params?.maxDepth !== undefined) searchParams.set("maxDepth", String(params.maxDepth));
        if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
        const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
        return request<{
          roots: GenealogyNode[];
          stats: {
            totalScans: number;
            totalTasks: number;
            totalSubtasks: number;
            maxDepth: number;
          };
        }>(`/tasks/genealogy${qs}`);
      },

      // Get ancestors for a task
      getAncestors: (taskId: string) =>
        request<{
          currentTask: { id: string; title: string; forkDepth: number };
          ancestors: Array<{
            id: string;
            type: "scan" | "task";
            title: string;
            status: string;
            repositoryName?: string;
            branch?: string;
            forkReason?: string;
            forkDepth?: number;
            createdAt: string;
          }>;
          depth: number;
        }>(`/tasks/genealogy/tasks/${taskId}/ancestors`),

      // Get descendants for a task
      getDescendants: (taskId: string, maxDepth?: number) => {
        const qs = maxDepth !== undefined ? `?maxDepth=${maxDepth}` : "";
        return request<{
          rootTask: { id: string; title: string; status: string; forkDepth: number };
          descendants: GenealogyNode[];
          totalDescendants: number;
        }>(`/tasks/genealogy/tasks/${taskId}/descendants${qs}`);
      },

      // Get spawn map
      getSpawnMap: (params?: {
        repositoryId?: string;
        projectId?: string;
        groupBy?: "scan" | "task" | "day";
      }) => {
        const searchParams = new URLSearchParams();
        if (params?.repositoryId) searchParams.set("repositoryId", params.repositoryId);
        if (params?.projectId) searchParams.set("projectId", params.projectId);
        if (params?.groupBy) searchParams.set("groupBy", params.groupBy);
        const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
        return request<{
          groups: Array<{
            key: string;
            label: string;
            tasks: Array<{
              id: string;
              title: string;
              status: string;
              type: string;
              forkCount: number;
              spawnedFrom: string;
              parentId: string | null;
            }>;
            totalForks: number;
            spawnedFrom: string;
          }>;
          summary: {
            totalGroups: number;
            totalTasks: number;
            totalForks: number;
          };
        }>(`/tasks/genealogy/spawn-map${qs}`);
      },

      // Filter by lineage
      filterByLineage: (ancestorId: string, params?: { includeAncestor?: boolean; status?: string }) => {
        const searchParams = new URLSearchParams({ ancestorId });
        if (params?.includeAncestor !== undefined)
          searchParams.set("includeAncestor", String(params.includeAncestor));
        if (params?.status) searchParams.set("status", params.status);
        return request<{
          ancestorType: "scan" | "task";
          ancestor: {
            id: string;
            type: string;
            title?: string;
            summary?: string;
            status: string;
            createdAt: string;
          };
          tasks: Array<{
            id: string;
            title: string;
            status: string;
            type: string;
            priority: string;
            forkDepth: number;
            forkCount?: number;
            parentTaskId?: string;
            repositoryName: string;
            createdAt: string;
          }>;
          totalCount: number;
        }>(`/tasks/genealogy/filter-by-lineage?${searchParams.toString()}`);
      },
    },
  },
  projects: {
    list: () => request<any[]>("/projects"),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (body: { name: string; description?: string }) =>
      request<any>("/projects", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { name?: string; description?: string; defaultBranch?: string | null }) =>
      request<any>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<any>(`/projects/${id}`, { method: "DELETE" }),
    stats: (id: string) => request<any>(`/projects/${id}/stats`),
    addRepo: (id: string, repositoryId: string) =>
      request<any>(`/projects/${id}/repos`, { method: "POST", body: JSON.stringify({ repositoryId }) }),
    updateRepo: (id: string, repoId: string, body: { branchOverride?: string | null }) =>
      request<any>(`/projects/${id}/repos/${repoId}`, { method: "PATCH", body: JSON.stringify(body) }),
    removeRepo: (id: string, repoId: string) =>
      request<any>(`/projects/${id}/repos/${repoId}`, { method: "DELETE" }),
    getEmbedConfig: (id: string) => request<any>(`/projects/${id}/embed-config`),
    updateEmbedConfig: (id: string, body: any) => request<any>(`/projects/${id}/embed-config`, { method: "PUT", body: JSON.stringify(body) }),
    listSubmissions: (id: string, status?: string) => {
      const params = status ? `?status=${status}` : "";
      return request<any>(`/projects/${id}/submissions${params}`);
    },
    approveSubmission: (id: string, subId: string, repositoryId: string) =>
      request<any>(`/projects/${id}/submissions/${subId}/approve`, { method: "POST", body: JSON.stringify({ repositoryId }) }),
    rejectSubmission: (id: string, subId: string) =>
      request<any>(`/projects/${id}/submissions/${subId}/reject`, { method: "POST" }),
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
    cancel: (id: string) => request<{ success: boolean }>(`/scans/${id}/cancel`, { method: "POST" }),
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
  settings: {
    get: () => request<{ scanBudget: number; taskBudget: number; planBudget: number }>("/settings"),
    update: (body: { scanBudget?: number; taskBudget?: number; planBudget?: number }) =>
      request<{ scanBudget: number; taskBudget: number; planBudget: number }>("/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    usage: () =>
      request<{
        totals: { inputTokens: number; outputTokens: number; cost: number; tasks: number; scans: number };
        daily: { date: string; cost: number; inputTokens: number; outputTokens: number; taskCount: number; scanCount: number }[];
      }>("/settings/usage"),
  },
  plugins: {
    // Marketplaces
    listMarketplaces: () => request<any[]>("/plugins/marketplaces"),
    addMarketplace: (body: { name: string; url: string }) =>
      request<any>("/plugins/marketplaces", { method: "POST", body: JSON.stringify(body) }),
    addOfficialMarketplace: () =>
      request<any>("/plugins/marketplaces/add-official", { method: "POST" }),
    removeMarketplace: (id: string) =>
      request<any>(`/plugins/marketplaces/${id}`, { method: "DELETE" }),

    // Browse & Install
    browse: (params?: { search?: string; category?: string }) => {
      const filtered = Object.fromEntries(
        Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== "")
      ) as Record<string, string>;
      const qs = Object.keys(filtered).length ? `?${new URLSearchParams(filtered)}` : "";
      return request<any[]>(`/plugins/browse${qs}`);
    },
    install: (body: { pluginId: string; repoUrl: string; scope?: string; projectId?: string }) =>
      request<any>("/plugins/install", { method: "POST", body: JSON.stringify(body) }),

    // Installed plugins
    listInstalled: (params?: { scope?: string; projectId?: string }) => {
      const qs = params ? `?${new URLSearchParams(params as Record<string, string>)}` : "";
      return request<any[]>(`/plugins/installed${qs}`);
    },
    get: (id: string) => request<any>(`/plugins/${id}`),
    update: (id: string, body: any) =>
      request<any>(`/plugins/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    sync: (id: string) =>
      request<any>(`/plugins/${id}/sync`, { method: "POST" }),
    uninstall: (id: string) =>
      request<any>(`/plugins/${id}`, { method: "DELETE" }),
  },
  // Analytics API
  analytics: {
    getOverview: (params?: { startDate?: string; endDate?: string; projectId?: string; repositoryId?: string }) =>
      request<AnalyticsOverview>(`/analytics/overview?${new URLSearchParams(params as any)}`),

    getROI: (params?: { hourlyRate?: number; startDate?: string; endDate?: string }) =>
      request<ROIData>(`/analytics/roi?${new URLSearchParams(params as any)}`),

    getCosts: (params?: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' }) =>
      request<CostData>(`/analytics/costs?${new URLSearchParams(params as any)}`),

    getPipeline: () =>
      request<PipelineHealth>('/analytics/pipeline'),

    getDistribution: (type: 'type' | 'priority' | 'repository' | 'project') =>
      request<DistributionData>(`/analytics/distribution?type=${type}`),

    getContributors: (params?: { limit?: number; startDate?: string; endDate?: string }) =>
      request<ContributorData[]>(`/analytics/contributors?${new URLSearchParams(params as any)}`),

    getTrends: (params: { metric: string; groupBy: 'day' | 'week' | 'month'; startDate?: string; endDate?: string }) =>
      request<TrendData[]>(`/analytics/trends?${new URLSearchParams(params as any)}`),

    getLOC: (params?: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' }) =>
      request<LOCData[]>(`/analytics/loc?${new URLSearchParams(params as any)}`),

    getTimeSaved: (params?: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' }) =>
      request<TimeSavedData[]>(`/analytics/time-saved?${new URLSearchParams(params as any)}`),

    getDrillDown: (type: 'user' | 'project' | 'task', id: string) =>
      request<DrillDownData>(`/analytics/drill-down/${type}/${id}`),

    exportData: (params: { format: 'csv' | 'json'; startDate?: string; endDate?: string }) =>
      request<Blob>(`/analytics/export?${new URLSearchParams(params as any)}`, {
        headers: { Accept: params.format === 'csv' ? 'text/csv' : 'application/json' },
      }),

    updateSettings: (settings: { hourlyRate?: number; displayPreferences?: object }) =>
      request<void>('/analytics/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  },

  // AI Metrics API - Self-improvement metrics
  aiMetrics: {
    getOverview: (params?: { startDate?: string; endDate?: string }) =>
      request<any>(`/ai-metrics/overview?${new URLSearchParams(params as any)}`),

    getAccuracy: (params?: { startDate?: string; endDate?: string }) =>
      request<any>(`/ai-metrics/accuracy?${new URLSearchParams(params as any)}`),

    getFalsePositives: (params?: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' }) =>
      request<any>(`/ai-metrics/false-positives?${new URLSearchParams(params as any)}`),

    getExecutionSuccess: (params?: { startDate?: string; endDate?: string }) =>
      request<any>(`/ai-metrics/execution-success?${new URLSearchParams(params as any)}`),

    getTrends: (params?: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' }) =>
      request<any>(`/ai-metrics/trends?${new URLSearchParams(params as any)}`),

    getFeedback: (params?: { limit?: number; feedbackType?: string }) =>
      request<any>(`/ai-metrics/feedback?${new URLSearchParams(params as any)}`),

    recordFeedback: (body: { entityType: string; entityId: string; feedbackType: string; comment?: string }) =>
      request<any>('/ai-metrics/feedback', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    recordTaskOutcome: (body: {
      taskId: string;
      success: boolean;
      falsePositive?: boolean;
      falseNegative?: boolean;
      taskType: string;
      repositoryId: string;
      planWasAccurate: boolean;
      executionWasCorrect: boolean;
    }) =>
      request<any>('/ai-metrics/task-outcome', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    recordScanFindingOutcome: (body: {
      findingId: string;
      wasAccurate: boolean;
      falsePositive: boolean;
      findingType: string;
      repositoryId: string;
      scanId: string;
    }) =>
      request<any>('/ai-metrics/scan-finding-outcome', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getPromptSuggestions: (params?: { category?: string; minFailureCount?: number }) =>
      request<any>(`/ai-metrics/prompt-suggestions?${new URLSearchParams(params as any)}`),

    applyPromptSuggestion: (id: string) =>
      request<any>(`/ai-metrics/prompt-suggestions/${id}/apply`, {
        method: 'POST',
      }),

    getRefinementHistory: (params?: { category?: string; limit?: number }) =>
      request<any>(`/ai-metrics/refinement-history?${new URLSearchParams(params as any)}`),
  },

  // AI Chat API
  chat: {
    // Conversations
    listConversations: (params?: {
      contextType?: 'global' | 'project' | 'repository';
      contextId?: string;
      limit?: number;
      includeArchived?: boolean;
    }) => {
      // Filter out undefined values to avoid "undefined" strings in URL
      const filtered = params
        ? Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined)
          )
        : {};
      const qs = Object.keys(filtered).length > 0
        ? `?${new URLSearchParams(filtered as any)}`
        : '';
      return request<any[]>(`/chat/conversations${qs}`);
    },
    createConversation: (body?: {
      contextType?: 'global' | 'project' | 'repository';
      contextId?: string;
    }) => {
      // Filter out undefined values from body
      const filtered = body
        ? Object.fromEntries(
            Object.entries(body).filter(([, v]) => v !== undefined)
          )
        : {};
      return request<{ id: string }>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify(filtered),
      });
    },
    getConversation: (id: string) => request<any>(`/chat/conversations/${id}`),
    updateConversation: (id: string, body: { title?: string; archive?: boolean }) =>
      request<{ success: boolean }>(`/chat/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteConversation: (id: string) =>
      request<{ success: boolean }>(`/chat/conversations/${id}`, {
        method: 'DELETE',
      }),
    searchConversations: (q: string, limit?: number) => {
      const params = new URLSearchParams({ q });
      if (limit) params.set('limit', String(limit));
      return request<any[]>(`/chat/conversations/search?${params}`);
    },

    // Messages (streaming handled separately)
    addFeedback: (messageId: string, feedback: 'positive' | 'negative', note?: string) =>
      request<{ success: boolean }>(`/chat/messages/${messageId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ feedback, note }),
      }),
    regenerateMessage: (messageId: string) =>
      // Returns SSE stream - use with fetch directly
      `/chat/messages/${messageId}/regenerate`,
    createTaskFromMessage: (
      messageId: string,
      body: {
        repositoryId: string;
        title: string;
        description: string;
        type: 'improvement' | 'bugfix' | 'feature' | 'refactor' | 'security';
        priority: 'low' | 'medium' | 'high' | 'critical';
        attachArtifacts?: boolean;
      }
    ) =>
      request<any>(`/chat/messages/${messageId}/create-task`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    // Artifacts
    getArtifact: (id: string) => request<any>(`/chat/artifacts/${id}`),
    attachArtifactToTask: (artifactId: string, taskId: string) =>
      request<{ success: boolean }>(`/chat/artifacts/${artifactId}/attach-task`, {
        method: 'POST',
        body: JSON.stringify({ taskId }),
      }),

    // Voice Settings
    getVoiceSettings: () => request<any>('/chat/voice-settings'),
    updateVoiceSettings: (body: {
      voiceEnabled?: boolean;
      pushToTalk?: boolean;
      autoSendDelay?: number;
      language?: string;
      ttsEnabled?: boolean;
      ttsVoice?: string;
      ttsSpeed?: number;
      ttsVolume?: number;
    }) =>
      request<any>('/chat/voice-settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    // Custom MCP Servers
    listMcpServers: (enabledOnly?: boolean) => {
      const qs = enabledOnly ? '?enabledOnly=true' : '';
      return request<any[]>(`/chat/mcp-servers${qs}`);
    },
    addMcpServer: (body: {
      name: string;
      url: string;
      description?: string;
      authType?: 'bearer' | 'api_key' | 'none';
      authToken?: string;
    }) =>
      request<any>('/chat/mcp-servers', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    validateMcpServer: (url: string, authToken?: string) =>
      request<{
        valid: boolean;
        error?: string;
        serverInfo?: any;
        capabilities?: any;
      }>('/chat/mcp-servers/validate', {
        method: 'POST',
        body: JSON.stringify({ url, authToken }),
      }),
    updateMcpServer: (id: string, body: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      priority?: number;
      authToken?: string;
    }) =>
      request<any>(`/chat/mcp-servers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteMcpServer: (id: string) =>
      request<{ success: boolean }>(`/chat/mcp-servers/${id}`, {
        method: 'DELETE',
      }),
    testMcpServer: (id: string) =>
      request<{
        success: boolean;
        error?: string;
        serverInfo?: any;
        capabilities?: any;
      }>(`/chat/mcp-servers/${id}/test`, { method: 'POST' }),

    // Streaming chat endpoint URL (use with fetch + SSE)
    chatEndpoint: (conversationId: string) =>
      `/api/chat/conversations/${conversationId}/messages`,
  },

  // Batch Operations API
  batch: {
    create: (body: {
      name: string;
      description: string;
      repositoryIds: string[];
      taskTemplate: {
        title: string;
        description: string;
        type: string;
        priority: string;
        targetBranch?: string;
      };
      executionMode?: 'parallel' | 'sequential';
      skipPlanning?: boolean;
      projectId?: string;
    }) =>
      request<any>('/batch/tasks', { method: 'POST', body: JSON.stringify(body) }),

    list: () => request<any[]>('/batch'),

    get: (id: string) => request<any>(`/batch/${id}`),

    cancel: (id: string) =>
      request<{ success: boolean; cancelledTasks: number }>(`/batch/${id}/cancel`, { method: 'POST' }),

    retry: (id: string) =>
      request<{ success: boolean; retriedTasks: number }>(`/batch/${id}/retry`, { method: 'POST' }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/batch/${id}`, { method: 'DELETE' }),

    stats: () =>
      request<{
        total: number;
        inProgress: number;
        completed: number;
        failed: number;
        successRate: number;
      }>('/batch/stats'),
  },

  // Predictions API - Predictive Analysis
  predictions: {
    // Get comprehensive predictive insights
    getInsights: (params?: { repositoryId?: string; projectId?: string; taskId?: string }) => {
      const filtered = params
        ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
        : {};
      const qs = Object.keys(filtered).length > 0 ? `?${new URLSearchParams(filtered as any)}` : '';
      return request<{
        breakingChangeWarnings: any[];
        regressionRiskScores: any[];
        technicalDebtForecast: any;
        complexityAlerts: any[];
        overallHealthScore: number;
        trends: {
          codeQuality: 'improving' | 'stable' | 'degrading';
          riskLevel: 'low' | 'medium' | 'high' | 'critical';
          debtTrajectory: 'improving' | 'stable' | 'worsening';
        };
      }>(`/predictions/insights${qs}`);
    },

    // Analyze breaking changes for a task
    getBreakingChanges: (taskId: string) =>
      request<{
        taskId: string;
        warnings: any[];
        summary: {
          total: number;
          critical: number;
          high: number;
          medium: number;
          low: number;
        };
      }>(`/predictions/breaking-changes/${taskId}`),

    // Get regression risk score for a task
    getRegressionRisk: (taskId: string) =>
      request<{
        task: { id: string; title: string; status: string };
        risk: {
          taskId: string;
          overallScore: number;
          factors: { name: string; score: number; weight: number; description: string }[];
          recommendation: string;
          historicalData: { similarChanges: number; regressionRate: number; avgTimeToDetect: number };
        };
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
      }>(`/predictions/regression-risk/${taskId}`),

    // Get technical debt forecast
    getTechnicalDebt: (repositoryId: string) =>
      request<{
        repository: { id: string; name: string };
        forecast: {
          currentScore: number;
          projectedScore30Days: number;
          projectedScore90Days: number;
          trend: 'improving' | 'stable' | 'degrading' | 'critical';
          trajectory: any[];
          recommendations: { priority: 'high' | 'medium' | 'low'; action: string; impact: number }[];
        };
      }>(`/predictions/technical-debt?repositoryId=${repositoryId}`),

    // Get complexity alerts
    getComplexityAlerts: (repositoryId: string, limit?: number) => {
      const params = new URLSearchParams({ repositoryId });
      if (limit) params.set('limit', String(limit));
      return request<{
        repository: { id: string; name: string };
        alerts: any[];
        summary: {
          total: number;
          critical: number;
          rapidGrowth: number;
          growing: number;
          stable: number;
        };
      }>(`/predictions/complexity-alerts?${params}`);
    },

    // Get file complexity history
    getFileComplexityHistory: (repositoryId: string, filePath: string) =>
      request<{
        path: string;
        history: { date: string; complexity: number; linesOfCode: number; changes: number }[];
      }>(`/predictions/file-complexity-history?repositoryId=${repositoryId}&filePath=${encodeURIComponent(filePath)}`),

    // Get health score summary
    getHealthScore: (params?: { repositoryId?: string; projectId?: string }) => {
      const filtered = params
        ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
        : {};
      const qs = Object.keys(filtered).length > 0 ? `?${new URLSearchParams(filtered as any)}` : '';
      return request<{
        overallScore: number;
        trends: {
          codeQuality: 'improving' | 'stable' | 'degrading';
          riskLevel: 'low' | 'medium' | 'high' | 'critical';
          debtTrajectory: 'improving' | 'stable' | 'worsening';
        };
        summary: {
          breakingChangeWarnings: number;
          highRiskTasks: number;
          complexityAlerts: number;
          debtScore: number;
        };
      }>(`/predictions/health-score${qs}`);
    },

    // Comprehensive PR analysis
    analyzePR: (taskId: string) =>
      request<{
        task: { id: string; title: string; status: string; pullRequestUrl: string | null };
        analysis: {
          breakingChanges: { warnings: any[]; count: number; hasCritical: boolean };
          regressionRisk: any;
          technicalDebt: { currentScore: number; trend: string; projected30Days: number };
          complexityAlerts: { alerts: any[]; total: number; criticalCount: number };
        };
        readiness: {
          score: number;
          recommendation: 'merge' | 'review' | 'hold' | 'block';
          blockers: string[];
          checklistItems: { item: string; passed: boolean }[];
        };
      }>('/predictions/analyze-pr', {
        method: 'POST',
        body: JSON.stringify({ taskId }),
      }),

    // Get trending risk patterns
    getTrending: () =>
      request<{
        repositories: {
          repositoryId: string;
          repositoryName: string;
          healthScore: number;
          trends: any;
          criticalIssues: number;
          highRiskTasks: number;
        }[];
        overallHealth: number;
        needsAttention: number;
      }>('/predictions/trending'),
  },

  // Collaboration API - Real-time team features for planning
  collaboration: {
    // Planning session management
    joinSession: (taskId: string) =>
      request<{
        participants: {
          userId: string;
          userName: string;
          avatarUrl: string | null;
          x: number;
          y: number;
          viewportSection: string | null;
        }[];
      }>(`/collaboration/tasks/${taskId}/join`, { method: 'POST' }),

    leaveSession: (taskId: string) =>
      request<{ success: boolean }>(`/collaboration/tasks/${taskId}/leave`, { method: 'POST' }),

    // Cursor tracking
    updateCursor: (taskId: string, x: number, y: number, viewportSection?: string) =>
      request<{ success: boolean }>(`/collaboration/tasks/${taskId}/cursor`, {
        method: 'POST',
        body: JSON.stringify({ x, y, viewportSection }),
      }),

    getCursors: (taskId: string) =>
      request<{
        data: {
          userId: string;
          userName: string;
          avatarUrl: string | null;
          x: number;
          y: number;
          viewportSection: string | null;
          lastUpdatedAt: string;
        }[];
      }>(`/collaboration/tasks/${taskId}/cursors`),

    // Comments
    getComments: (taskId: string, approachIdx?: number) => {
      const params = approachIdx !== undefined ? `?approachIdx=${approachIdx}` : '';
      return request<{ data: any[] }>(`/collaboration/tasks/${taskId}/comments${params}`);
    },

    createComment: (taskId: string, content: string, approachIdx: number, parentId?: string) =>
      request<{ data: any }>(`/collaboration/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, approachIdx, parentId }),
      }),

    updateComment: (commentId: string, body: { content?: string; isResolved?: boolean }) =>
      request<{ data: any }>(`/collaboration/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    deleteComment: (commentId: string) =>
      request<{ success: boolean }>(`/collaboration/comments/${commentId}`, {
        method: 'DELETE',
      }),

    // Voting
    getVotes: (taskId: string) =>
      request<{
        data: Record<number, { upvotes: number; downvotes: number; userVote: 'upvote' | 'downvote' | null }>;
      }>(`/collaboration/tasks/${taskId}/votes`),

    vote: (taskId: string, approachIdx: number, voteType: 'upvote' | 'downvote') =>
      request<{
        data: {
          vote: any;
          counts: { upvotes: number; downvotes: number };
        };
      }>(`/collaboration/tasks/${taskId}/votes`, {
        method: 'POST',
        body: JSON.stringify({ approachIdx, voteType }),
      }),

    removeVote: (taskId: string, approachIdx: number) =>
      request<{ success: boolean; counts: { upvotes: number; downvotes: number } }>(
        `/collaboration/tasks/${taskId}/votes/${approachIdx}`,
        { method: 'DELETE' }
      ),

    // Notifications
    getNotifications: (params?: { unreadOnly?: boolean; limit?: number }) => {
      const qs = params
        ? `?${new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )}`
        : '';
      return request<{ data: any[]; unreadCount: number }>(`/collaboration/notifications${qs}`);
    },

    markNotificationRead: (notificationId: string) =>
      request<{ success: boolean }>(`/collaboration/notifications/${notificationId}/read`, {
        method: 'POST',
      }),

    markAllNotificationsRead: () =>
      request<{ success: boolean }>('/collaboration/notifications/read-all', {
        method: 'POST',
      }),

    // Team members for @mention autocomplete
    searchTeamMembers: (search: string, limit?: number) => {
      const params = new URLSearchParams({ search });
      if (limit) params.set('limit', String(limit));
      return request<{
        data: { id: string; name: string | null; email: string; avatarUrl: string | null }[];
      }>(`/collaboration/team-members?${params}`);
    },
  },

  // Dependencies API - Dependency Intelligence
  dependencies: {
    // Get alert summary across all repositories
    getSummary: () =>
      request<{
        totalAlerts: number;
        bySeverity: Record<string, number>;
        byType: Record<string, number>;
        byRepository: { repositoryId: string; name: string; count: number }[];
      }>('/dependencies/summary'),

    // Get statistics
    getStats: () =>
      request<{
        totalAlerts: number;
        alertsBySeverity: Record<string, number>;
        alertsByType: Record<string, number>;
        recentAlerts: {
          id: string;
          title: string;
          severity: string;
          type: string;
          repository: string;
          createdAt: string;
        }[];
        ecosystems: { ecosystem: string; snapshotCount: number }[];
      }>('/dependencies/stats'),

    // Analyze dependencies for a repository
    analyze: (repositoryId: string, branch?: string) =>
      request<{
        analyzed: boolean;
        manifests: string[];
        results: {
          repositoryId: string;
          ecosystem: string;
          totalDependencies: number;
          securityAlerts: number;
          unmaintainedPackages: number;
          outdatedPackages: number;
          deprecatedPackages: number;
          alerts: any[];
        }[];
      }>(`/dependencies/${repositoryId}/analyze`, {
        method: 'POST',
        body: branch ? JSON.stringify({ branch }) : undefined,
      }),

    // Get alerts for a repository
    getRepositoryAlerts: (repositoryId: string, params?: {
      status?: string;
      severity?: string;
      type?: string;
      limit?: number;
    }) => {
      const filtered = params
        ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
        : {};
      const qs = Object.keys(filtered).length > 0 ? `?${new URLSearchParams(filtered as any)}` : '';
      return request<any[]>(`/dependencies/${repositoryId}/alerts${qs}`);
    },

    // Get dependency snapshots for a repository
    getSnapshots: (repositoryId: string) =>
      request<any[]>(`/dependencies/${repositoryId}/snapshots`),

    // Get all alerts for the user
    listAlerts: (params?: {
      status?: string;
      severity?: string;
      type?: string;
      repositoryId?: string;
      limit?: number;
    }) => {
      const filtered = params
        ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
        : {};
      const qs = Object.keys(filtered).length > 0 ? `?${new URLSearchParams(filtered as any)}` : '';
      return request<any[]>(`/dependencies/alerts${qs}`);
    },

    // Get a specific alert
    getAlert: (alertId: string) =>
      request<any>(`/dependencies/alerts/${alertId}`),

    // Dismiss an alert
    dismissAlert: (alertId: string, reason?: string) =>
      request<{ success: boolean }>(`/dependencies/alerts/${alertId}/dismiss`, {
        method: 'POST',
        body: reason ? JSON.stringify({ reason }) : undefined,
      }),

    // Resolve an alert
    resolveAlert: (alertId: string, taskId?: string) =>
      request<{ success: boolean }>(`/dependencies/alerts/${alertId}/resolve`, {
        method: 'POST',
        body: taskId ? JSON.stringify({ taskId }) : undefined,
      }),

    // Reactivate a dismissed alert
    reactivateAlert: (alertId: string) =>
      request<{ success: boolean }>(`/dependencies/alerts/${alertId}/reactivate`, {
        method: 'POST',
      }),

    // Bulk dismiss alerts
    bulkDismissAlerts: (alertIds: string[], reason?: string) =>
      request<{ dismissed: number }>('/dependencies/alerts/bulk-dismiss', {
        method: 'POST',
        body: JSON.stringify({ alertIds, reason }),
      }),

    // Create a task from an alert
    createTaskFromAlert: (alertId: string, options?: { projectId?: string; priority?: string }) =>
      request<any>(`/dependencies/alerts/${alertId}/create-task`, {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),

    // Get package info
    getPackageInfo: (ecosystem: string, packageName: string) =>
      request<{
        name: string;
        ecosystem: string;
        latestVersion: string;
        latestStableVersion?: string;
        lastPublishDate?: string;
        isDeprecated: boolean;
        deprecationMessage?: string;
        repositoryUrl?: string;
        homepage?: string;
        license?: string;
        versions: { version: string; publishedAt: string }[];
      }>(`/dependencies/package/${ecosystem}/${encodeURIComponent(packageName)}`),
  },

  // Code Health API - Code health monitoring and metrics
  codeHealth: {
    // Get full health dashboard for a repository or project
    getDashboard: (params: { repositoryId?: string; projectId?: string; branch?: string; days?: number }) => {
      const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
      const qs = Object.keys(filtered).length > 0 ? `?${new URLSearchParams(filtered as any)}` : '';
      return request<{
        scores: {
          overall: number;
          complexity: number;
          duplication: number;
          coverage: number;
          maintainability: number;
          security: number;
          dependencies: number;
        };
        trends: {
          overall: { date: string; value: number; change: number }[];
          complexity: { date: string; value: number; change: number }[];
          coverage: { date: string; value: number; change: number }[];
          duplication: { date: string; value: number; change: number }[];
        };
        hotspots: {
          id?: string;
          filePath: string;
          changeCount: number;
          additionCount: number;
          deletionCount: number;
          authorCount: number;
          complexity: number;
          riskScore: number;
          riskLevel: 'low' | 'medium' | 'high' | 'critical';
        }[];
        summary: {
          totalFiles: number;
          totalLines: number;
          avgComplexity: number;
          duplicationPct: number;
          testCoveragePct: number | null;
          technicalDebtHours: number;
          codeSmellCount: number;
        };
        comparison: {
          lastWeek: {
            overall: number;
            complexity: number;
            duplication: number;
            coverage: number;
            maintainability: number;
            security: number;
            dependencies: number;
          } | null;
          lastMonth: {
            overall: number;
            complexity: number;
            duplication: number;
            coverage: number;
            maintainability: number;
            security: number;
            dependencies: number;
          } | null;
        };
      }>(`/code-health/dashboard${qs}`);
    },

    // Get current health scores
    getScores: (repositoryId: string, branch?: string) => {
      const params = new URLSearchParams({ repositoryId });
      if (branch) params.set('branch', branch);
      return request<{
        overall: number;
        complexity: number;
        duplication: number;
        coverage: number;
        maintainability: number;
        security: number;
        dependencies: number;
        analyzedAt: string | null;
      }>(`/code-health/scores?${params}`);
    },

    // Get trend data for metrics
    getTrends: (repositoryId: string, params?: { branch?: string; metricType?: string; days?: number }) => {
      const queryParams = new URLSearchParams({ repositoryId });
      if (params?.branch) queryParams.set('branch', params.branch);
      if (params?.metricType) queryParams.set('metricType', params.metricType);
      if (params?.days) queryParams.set('days', String(params.days));
      return request<{ date: string; value: number; change: number }[]>(`/code-health/trends?${queryParams}`);
    },

    // Get hotspots (high-churn risky files)
    getHotspots: (repositoryId: string, params?: { branch?: string; limit?: number; riskLevel?: string }) => {
      const queryParams = new URLSearchParams({ repositoryId });
      if (params?.branch) queryParams.set('branch', params.branch);
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.riskLevel) queryParams.set('riskLevel', params.riskLevel);
      return request<{
        id: string;
        filePath: string;
        changeCount: number;
        additionCount: number;
        deletionCount: number;
        authorCount: number;
        complexity: number;
        testCoverage: number | null;
        riskScore: number;
        riskLevel: string;
        firstSeenAt: string;
        lastChangedAt: string;
      }[]>(`/code-health/hotspots?${queryParams}`);
    },

    // Get summary metrics
    getSummary: (params: { repositoryId?: string; projectId?: string }) => {
      const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
      const qs = Object.keys(filtered).length > 0 ? `?${new URLSearchParams(filtered as any)}` : '';
      return request<{
        overallScore: number;
        totalFiles: number;
        totalLines: number;
        technicalDebtHours: number;
        codeSmellCount: number;
        hotspots: { low: number; medium: number; high: number; critical: number };
        lastAnalyzed: string | null;
      }>(`/code-health/summary${qs}`);
    },

    // Trigger health analysis
    analyze: (repositoryId: string, branch?: string) =>
      request<{
        snapshotId: string;
        overallScore: number;
        analyzedAt: string;
        message: string;
      }>('/code-health/analyze', {
        method: 'POST',
        body: JSON.stringify({ repositoryId, branch }),
      }),

    // Get comparison between time periods
    getComparison: (repositoryId: string, period1Start: string, period1End: string, period2Start: string, period2End: string) =>
      request<{
        period1: {
          overall: number;
          complexity: number;
          duplication: number;
          coverage: number;
          maintainability: number;
          security: number;
          dependencies: number;
          snapshotCount: number;
        };
        period2: {
          overall: number;
          complexity: number;
          duplication: number;
          coverage: number;
          maintainability: number;
          security: number;
          dependencies: number;
          snapshotCount: number;
        };
        changes: {
          overall: number;
          complexity: number;
          duplication: number;
          coverage: number;
          maintainability: number;
          security: number;
          dependencies: number;
        };
        improvement: 'improving' | 'degrading' | 'stable';
      }>(`/code-health/comparison?repositoryId=${repositoryId}&period1Start=${period1Start}&period1End=${period1End}&period2Start=${period2Start}&period2End=${period2End}`),

    // Get historical snapshots
    getMetricsHistory: (repositoryId: string, params?: { branch?: string; days?: number }) => {
      const queryParams = new URLSearchParams({ repositoryId });
      if (params?.branch) queryParams.set('branch', params.branch);
      if (params?.days) queryParams.set('days', String(params.days));
      return request<{
        id: string;
        overallScore: number;
        complexityScore: number;
        duplicationScore: number;
        coverageScore: number;
        maintainabilityScore: number;
        securityScore: number;
        dependencyScore: number;
        totalFiles: number;
        totalLines: number;
        technicalDebtHours: number;
        codeSmellCount: number;
        analyzedAt: string;
        date: string;
      }[]>(`/code-health/metrics/history?${queryParams}`);
    },

    // Get technical debt analysis
    getDebt: (repositoryId: string) =>
      request<{
        totalDebtHours: number;
        byCategory: {
          complexity: number;
          duplication: number;
          testCoverage: number;
          hotspots: number;
        };
        codeSmellCount: number;
        topHotspots: {
          filePath: string;
          riskScore: number;
          riskLevel: string;
          estimatedHours: number;
        }[];
        recommendations: string[];
      }>(`/code-health/debt?repositoryId=${repositoryId}`),
  },

  // Proactive Suggestions API
  suggestions: {
    // Generate suggestions for a task or context
    generate: (body: {
      repositoryId: string;
      projectId?: string;
      taskId?: string;
      taskDescription?: string;
      affectedFiles?: string[];
      taskType?: string;
    }) =>
      request<{
        suggestions: any[];
        count: number;
        repository: { id: string; name: string };
      }>('/suggestions/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    // List suggestions for a repository
    list: (repositoryId: string, params?: {
      type?: string;
      priority?: string;
      status?: string;
      limit?: string;
    }) => {
      const queryParams = new URLSearchParams({ repositoryId });
      if (params?.type) queryParams.set('type', params.type);
      if (params?.priority) queryParams.set('priority', params.priority);
      if (params?.status) queryParams.set('status', params.status);
      if (params?.limit) queryParams.set('limit', params.limit);
      return request<{
        suggestions: any[];
        count: number;
        repository: { id: string; name: string };
      }>(`/suggestions?${queryParams}`);
    },

    // Get suggestion summary for a repository
    summary: (repositoryId: string) =>
      request<{
        summary: {
          total: number;
          byType: Record<string, number>;
          byPriority: Record<string, number>;
          pendingCount: number;
          recentlyDismissed: number;
          recentlyApplied: number;
        };
        repository: { id: string; name: string };
      }>(`/suggestions/summary?repositoryId=${repositoryId}`),

    // Get scheduled improvement recommendations
    scheduled: (repositoryId: string) =>
      request<{
        recommendations: any[];
        count: number;
        repository: { id: string; name: string };
      }>(`/suggestions/scheduled?repositoryId=${repositoryId}`),

    // Get suggestions for a specific task
    forTask: (taskId: string) =>
      request<{
        taskId: string;
        task: { id: string; title: string; type: string; status: string };
        generatedSuggestions: any[];
        storedSuggestions: any[];
        totalCount: number;
      }>(`/suggestions/for-task/${taskId}`),

    // Get a specific suggestion
    get: (id: string) => request<any>(`/suggestions/${id}`),

    // Dismiss a suggestion
    dismiss: (id: string, reason?: string) =>
      request<{ id: string; dismissed: boolean }>(`/suggestions/${id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),

    // Apply a suggestion action
    apply: (id: string, actionId: string) =>
      request<{ id: string; applied: boolean; actionId: string; result?: any }>(`/suggestions/${id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ actionId }),
      }),

    // Update suggestion status
    update: (id: string, body: { status: string; reason?: string }) =>
      request<{ id: string; status: string; success: boolean }>(`/suggestions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    // Create a custom suggestion
    create: (body: {
      repositoryId: string;
      type: string;
      priority: string;
      title: string;
      description: string;
      rationale?: string;
      affectedFiles?: string[];
      relatedTaskId?: string;
      suggestedActions?: any[];
      estimatedImpact?: {
        codeQuality: number;
        performance: number;
        maintainability: number;
        timeToFix: number;
        riskLevel: 'low' | 'medium' | 'high';
      };
      metadata?: Record<string, any>;
    }) =>
      request<any>('/suggestions', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    // Delete a suggestion
    delete: (id: string) =>
      request<{ id: string; deleted: boolean }>(`/suggestions/${id}`, {
        method: 'DELETE',
      }),

    // Bulk dismiss suggestions
    bulkDismiss: (suggestionIds: string[], reason?: string) =>
      request<{ dismissed: number; notFound: number }>('/suggestions/bulk-dismiss', {
        method: 'POST',
        body: JSON.stringify({ suggestionIds, reason }),
      }),

    // Get pattern suggestions for a description
    patterns: (description: string, repositoryId?: string) => {
      const params = new URLSearchParams({ description });
      if (repositoryId) params.set('repositoryId', repositoryId);
      return request<{ patterns: any[]; count: number }>(`/suggestions/patterns?${params}`);
    },

    // Cleanup expired suggestions
    cleanup: () =>
      request<{ cleaned: number }>('/suggestions/cleanup', {
        method: 'POST',
      }),
  },

  // ============================================================================
  // GitHub Integration API
  // ============================================================================

  github: {
    // Get GitHub status for a task
    getTaskStatus: (taskId: string) =>
      request<{
        pullRequestUrl: string | null;
        pullRequestStatus: string | null;
        githubStatus: GitHubStatus | null;
        githubContext: GitHubContext | null;
        githubComments: GitHubComment[];
        lastStatusSync: string | null;
        lastCommentsSync: string | null;
      }>(`/tasks/${taskId}/github-status`),

    // Sync GitHub status for a task
    syncTaskStatus: (taskId: string, syncComments?: boolean) =>
      request<{
        success: boolean;
        status: GitHubStatus;
        comments?: GitHubComment[];
      }>(`/tasks/${taskId}/sync-github`, {
        method: 'POST',
        body: JSON.stringify({ syncComments }),
      }),

    // Inject GitHub issue/PR context into a task
    injectContext: (
      taskId: string,
      issueOrPrNumber: number,
      owner?: string,
      repo?: string
    ) =>
      request<{
        success: boolean;
        context: GitHubContext;
        updatedPriority: string;
        updatedType: string;
      }>(`/tasks/${taskId}/inject-github-context`, {
        method: 'POST',
        body: JSON.stringify({ issueOrPrNumber, owner, repo }),
      }),
  },

  // ============================================================================
  // Webhook Management API
  // ============================================================================

  webhooks: {
    // List all webhook configurations
    list: () =>
      request<WebhookConfig[]>('/webhooks'),

    // Create a new webhook configuration
    create: (body: {
      provider: 'github' | 'linear' | 'jira';
      repositoryId?: string;
      projectId?: string;
    }) =>
      request<WebhookConfig & { secret: string; webhookUrl: string }>('/webhooks', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    // Delete a webhook configuration
    delete: (id: string) =>
      request<{ success: boolean }>(`/webhooks/${id}`, {
        method: 'DELETE',
      }),

    // Update webhook configuration
    update: (id: string, body: { enabled?: boolean; regenerateSecret?: boolean }) =>
      request<WebhookConfig & { secret?: string }>(`/webhooks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    // Get webhook events for debugging
    getEvents: (id: string, limit?: number) =>
      request<WebhookEvent[]>(`/webhooks/${id}/events?limit=${limit || 50}`),
  },

  // ============================================================================
  // GitHub Label Mapping Settings
  // ============================================================================

  githubLabels: {
    // Get current label mappings
    get: () =>
      request<{
        customMappings: {
          priorityLabels?: Record<string, string>;
          typeLabels?: Record<string, string>;
        };
        defaultPriorityLabels: Record<string, string>;
        defaultTypeLabels: Record<string, string>;
      }>('/settings/github-labels'),

    // Update label mappings
    update: (body: {
      priorityLabels?: Record<string, string>;
      typeLabels?: Record<string, string>;
    }) =>
      request<{ githubLabelMapping: any }>('/settings/github-labels', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    // Remove a label mapping
    remove: (label: string, mappingType: 'priority' | 'type') =>
      request<{ success: boolean }>(
        `/settings/github-labels/${encodeURIComponent(label)}?mappingType=${mappingType}`,
        { method: 'DELETE' }
      ),
  },

  // ============================================================================
  // Team Coordination API - RTS-style activity view
  // ============================================================================

  team: {
    // Get team activity feed
    getActivity: (params?: {
      limit?: number;
      offset?: number;
      userId?: string;
      type?: string;
      since?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.offset) searchParams.set("offset", params.offset.toString());
      if (params?.userId) searchParams.set("userId", params.userId);
      if (params?.type) searchParams.set("type", params.type);
      if (params?.since) searchParams.set("since", params.since);
      const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
      return request<{
        data: Array<{
          id: string;
          userId: string;
          userName: string | null;
          userAvatar: string | null;
          type: string;
          entityId: string | null;
          entityType: string | null;
          entityTitle: string | null;
          metadata: Record<string, unknown> | null;
          createdAt: string;
        }>;
      }>(`/team/activity${qs}`);
    },

    // Get team members with status
    getMembers: () =>
      request<{
        data: Array<{
          id: string;
          name: string | null;
          email: string;
          avatarUrl: string | null;
          isOnline: boolean;
          currentActivity: string | null;
          currentEntityId: string | null;
          currentEntityType: string | null;
          lastActivityAt: string | null;
          taskCount: number;
          completedToday: number;
        }>;
      }>("/team/members"),

    // Get workload distribution
    getWorkload: () =>
      request<{
        data: Array<{
          userId: string;
          userName: string | null;
          userAvatar: string | null;
          pending: number;
          inProgress: number;
          completed: number;
          failed: number;
          total: number;
          avgCompletionTime: number | null;
        }>;
      }>("/team/workload"),

    // Get collaboration suggestions
    getCollaborationSuggestions: () =>
      request<{
        data: Array<{
          type: "pair" | "review" | "handoff" | "sync";
          users: Array<{ id: string; name: string | null; avatarUrl: string | null }>;
          reason: string;
          entityId: string | null;
          entityType: string | null;
          priority: "low" | "medium" | "high";
        }>;
      }>("/team/collaboration"),

    // Ping a team member
    pingUser: (userId: string, message?: string) =>
      request<{ success: boolean; data: { id: string } }>(`/team/ping/${userId}`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),

    // Get unread pings
    getPings: () =>
      request<{
        data: Array<{
          id: string;
          fromUserId: string;
          fromUserName: string | null;
          fromUserAvatar: string | null;
          message: string | null;
          createdAt: string;
        }>;
      }>("/team/pings"),

    // Mark ping as read
    markPingRead: (pingId: string) =>
      request<{ success: boolean }>(`/team/pings/${pingId}/read`, { method: "POST" }),

    // Get activity stats
    getStats: (since?: string) => {
      const qs = since ? `?since=${since}` : "";
      return request<{
        data: {
          totalActivities: number;
          byType: Record<string, number>;
          byUser: Array<{ userId: string; userName: string | null; count: number }>;
          hourlyDistribution: Array<{ hour: number; count: number }>;
        };
      }>(`/team/stats${qs}`);
    },

    // Track an activity manually
    trackActivity: (data: {
      type: string;
      entityId?: string;
      entityType?: string;
      metadata?: Record<string, unknown>;
    }) =>
      request<{ success: boolean }>("/team/track", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // ============================================================================
  // Project Memory API
  // ============================================================================

  memory: {
    // Get memories for a project
    getProjectMemories: (
      projectId: string,
      options?: {
        category?: string;
        minImportance?: number;
        limit?: number;
        tags?: string[];
      }
    ) => {
      const params = new URLSearchParams();
      if (options?.category) params.set("category", options.category);
      if (options?.minImportance) params.set("minImportance", options.minImportance.toString());
      if (options?.limit) params.set("limit", options.limit.toString());
      if (options?.tags?.length) params.set("tags", options.tags.join(","));
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<ProjectMemory[]>(`/memory/project/${projectId}${qs}`);
    },

    // Get memories for a repository
    getRepositoryMemories: (
      repositoryId: string,
      options?: {
        category?: string;
        minImportance?: number;
        limit?: number;
        tags?: string[];
      }
    ) => {
      const params = new URLSearchParams();
      if (options?.category) params.set("category", options.category);
      if (options?.minImportance) params.set("minImportance", options.minImportance.toString());
      if (options?.limit) params.set("limit", options.limit.toString());
      if (options?.tags?.length) params.set("tags", options.tags.join(","));
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<ProjectMemory[]>(`/memory/repository/${repositoryId}${qs}`);
    },

    // Get a single memory
    get: (id: string) => request<ProjectMemory>(`/memory/${id}`),

    // Create a new memory
    create: (input: CreateProjectMemoryInput) =>
      request<ProjectMemory>("/memory", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    // Update a memory
    update: (id: string, input: UpdateProjectMemoryInput) =>
      request<ProjectMemory>(`/memory/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),

    // Delete a memory
    delete: (id: string) =>
      request<{ success: boolean }>(`/memory/${id}`, { method: "DELETE" }),

    // Get relevant memories for task context
    getRelevant: (options: {
      projectId?: string;
      repositoryId?: string;
      taskTitle?: string;
      taskDescription?: string;
      taskType?: string;
      affectedFiles?: string[];
      limit?: number;
    }) => {
      const params = new URLSearchParams();
      if (options.projectId) params.set("projectId", options.projectId);
      if (options.repositoryId) params.set("repositoryId", options.repositoryId);
      if (options.taskTitle) params.set("taskTitle", options.taskTitle);
      if (options.taskDescription) params.set("taskDescription", options.taskDescription);
      if (options.taskType) params.set("taskType", options.taskType);
      if (options.affectedFiles?.length) params.set("affectedFiles", options.affectedFiles.join(","));
      if (options.limit) params.set("limit", options.limit.toString());
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<ProjectMemory[]>(`/memory/relevant${qs}`);
    },

    // Search memories
    search: (
      query: string,
      options?: {
        projectId?: string;
        repositoryId?: string;
        category?: string;
        minImportance?: number;
        limit?: number;
      }
    ) => {
      const params = new URLSearchParams({ q: query });
      if (options?.projectId) params.set("projectId", options.projectId);
      if (options?.repositoryId) params.set("repositoryId", options.repositoryId);
      if (options?.category) params.set("category", options.category);
      if (options?.minImportance) params.set("minImportance", options.minImportance.toString());
      if (options?.limit) params.set("limit", options.limit.toString());
      return request<ProjectMemory[]>(`/memory/search?${params.toString()}`);
    },

    // Consolidate memories
    consolidate: (
      memoryIds: string[],
      options?: {
        projectId?: string;
        repositoryId?: string;
        category?: string;
      }
    ) =>
      request<ConsolidationResult>("/memory/consolidate", {
        method: "POST",
        body: JSON.stringify({ memoryIds, ...options }),
      }),

    // Get memory stats
    getStats: (options?: { projectId?: string; repositoryId?: string }) => {
      const params = new URLSearchParams();
      if (options?.projectId) params.set("projectId", options.projectId);
      if (options?.repositoryId) params.set("repositoryId", options.repositoryId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<MemoryStats>(`/memory/stats${qs}`);
    },

    // Create memory from completed task
    createFromTask: (taskId: string) =>
      request<ProjectMemory>(`/memory/from-task/${taskId}`, { method: "POST" }),
  },

  // ============================================================================
  // Triggers API
  // ============================================================================

  triggers: {
    // List all triggers
    list: () => request<{ data: any[] }>("/triggers"),

    // Get single trigger
    get: (id: string) => request<{ data: any }>(`/triggers/${id}`),

    // Create trigger
    create: (data: {
      name: string;
      description?: string;
      triggerType: string;
      conditions: any;
      actions: any[];
      enabled?: boolean;
      repositoryId?: string;
      projectId?: string;
    }) =>
      request<{ data: any }>("/triggers", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    // Update trigger
    update: (
      id: string,
      data: {
        name?: string;
        description?: string;
        triggerType?: string;
        conditions?: any;
        actions?: any[];
        enabled?: boolean;
        repositoryId?: string | null;
        projectId?: string | null;
      }
    ) =>
      request<{ data: any }>(`/triggers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    // Delete trigger
    delete: (id: string) =>
      request<{ data: { success: boolean } }>(`/triggers/${id}`, {
        method: "DELETE",
      }),

    // Toggle trigger enabled/disabled
    toggle: (id: string) =>
      request<{ data: any }>(`/triggers/${id}/toggle`, {
        method: "PATCH",
      }),

    // Test trigger with sample data
    test: (id: string, testData: Record<string, any>) =>
      request<{ data: any }>(`/triggers/${id}/test`, {
        method: "POST",
        body: JSON.stringify({ testData }),
      }),

    // Get execution history
    history: (id: string, options?: { limit?: number; offset?: number; status?: string }) => {
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", options.limit.toString());
      if (options?.offset) params.set("offset", options.offset.toString());
      if (options?.status) params.set("status", options.status);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<{ data: any[]; pagination: any }>(`/triggers/${id}/history${qs}`);
    },

    // Get trigger stats
    stats: () => request<{ data: any }>("/triggers/stats"),

    // Get trigger templates
    templates: () => request<{ data: any[] }>("/triggers/templates"),
  },
};

// ============================================================================
// GitHub Integration Types
// ============================================================================

export interface GitHubStatus {
  ci: {
    status: 'pending' | 'success' | 'failure' | 'neutral';
    checks: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      url: string;
    }>;
  };
  reviews: {
    status: 'pending' | 'approved' | 'changes_requested' | 'commented';
    reviewers: Array<{
      login: string;
      state: string;
      avatarUrl: string;
    }>;
  };
  mergeable: boolean | null;
  draft: boolean;
  merged: boolean;
}

export interface GitHubContext {
  type: 'issue' | 'pull_request';
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  assignees: string[];
  state: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  baseBranch?: string;
  headBranch?: string;
  draft?: boolean;
  merged?: boolean;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  mappedPriority: string;
  mappedType: string;
}

export interface GitHubComment {
  id: string;
  author: string;
  authorAvatarUrl: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  source: 'github_review' | 'github_issue' | 'user';
  sourceUrl?: string;
  filePath?: string;
  lineNumber?: number;
  diffHunk?: string;
  inReplyToId?: string;
}

export interface WebhookConfig {
  id: string;
  provider: 'github' | 'linear' | 'jira';
  repositoryId: string | null;
  projectId: string | null;
  enabled: boolean;
  createdAt: string;
  lastEventAt: string | null;
  eventCount: number;
  webhookUrl: string;
  repository?: { fullName: string };
  project?: { name: string };
}

export interface WebhookEvent {
  id: string;
  webhookConfigId: string;
  eventType: string;
  deliveryId: string | null;
  processed: boolean;
  action: string | null;
  error: string | null;
  createdAt: string;
}

// ============================================================================
// Project Memory Types
// ============================================================================

export type MemoryCategory =
  | "architecture"
  | "convention"
  | "decision"
  | "learning"
  | "context";

export interface ProjectMemory {
  id: string;
  projectId: string | null;
  repositoryId: string | null;
  userId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  importance: number;
  tags: string[];
  relatedTaskIds: string[];
  isConsolidated: boolean;
  consolidatedAt?: string;
  sourceMemoryIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectMemoryInput {
  projectId?: string;
  repositoryId?: string;
  category: MemoryCategory;
  title: string;
  content: string;
  importance?: number;
  tags?: string[];
  relatedTaskIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectMemoryInput {
  title?: string;
  content?: string;
  category?: MemoryCategory;
  importance?: number;
  tags?: string[];
  relatedTaskIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  avgImportance: number;
  consolidated: number;
  recentCount: number;
}

export interface ConsolidationResult {
  consolidatedMemory: ProjectMemory;
  sourceMemoryIds: string[];
  summary: string;
}
