/**
 * useProjectMemory Hook
 *
 * React Query hooks for project memory operations.
 * Provides caching, optimistic updates, and auto-suggestion of relevant memories.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useEffect, useState } from "react";

// ============================================================================
// Types
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

export interface CreateMemoryInput {
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

export interface UpdateMemoryInput {
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

// ============================================================================
// API Functions
// ============================================================================

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
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

const memoryApi = {
  // Get memories for a project
  getProjectMemories: (
    projectId: string,
    options?: {
      category?: MemoryCategory;
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
      category?: MemoryCategory;
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
  getMemory: (id: string) => request<ProjectMemory>(`/memory/${id}`),

  // Create a new memory
  createMemory: (input: CreateMemoryInput) =>
    request<ProjectMemory>("/memory", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Update a memory
  updateMemory: (id: string, input: UpdateMemoryInput) =>
    request<ProjectMemory>(`/memory/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  // Delete a memory
  deleteMemory: (id: string) =>
    request<{ success: boolean }>(`/memory/${id}`, { method: "DELETE" }),

  // Get relevant memories
  getRelevantMemories: (options: {
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
  searchMemories: (
    query: string,
    options?: {
      projectId?: string;
      repositoryId?: string;
      category?: MemoryCategory;
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
  consolidateMemories: (
    memoryIds: string[],
    options?: {
      projectId?: string;
      repositoryId?: string;
      category?: MemoryCategory;
    }
  ) =>
    request<ConsolidationResult>("/memory/consolidate", {
      method: "POST",
      body: JSON.stringify({ memoryIds, ...options }),
    }),

  // Auto-consolidate old memories
  autoConsolidate: (options?: {
    projectId?: string;
    repositoryId?: string;
    olderThanDays?: number;
    minMemoriesToConsolidate?: number;
  }) =>
    request<{ consolidationCount: number; results: ConsolidationResult[] }>(
      "/memory/auto-consolidate",
      {
        method: "POST",
        body: JSON.stringify(options || {}),
      }
    ),

  // Get memory stats
  getStats: (options?: { projectId?: string; repositoryId?: string }) => {
    const params = new URLSearchParams();
    if (options?.projectId) params.set("projectId", options.projectId);
    if (options?.repositoryId) params.set("repositoryId", options.repositoryId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<MemoryStats>(`/memory/stats${qs}`);
  },

  // Create memory from task
  createFromTask: (taskId: string) =>
    request<ProjectMemory>(`/memory/from-task/${taskId}`, { method: "POST" }),
};

// ============================================================================
// Query Keys
// ============================================================================

export const memoryKeys = {
  all: ["memories"] as const,
  project: (projectId: string) => [...memoryKeys.all, "project", projectId] as const,
  repository: (repositoryId: string) => [...memoryKeys.all, "repository", repositoryId] as const,
  single: (id: string) => [...memoryKeys.all, "single", id] as const,
  relevant: (contextHash: string) => [...memoryKeys.all, "relevant", contextHash] as const,
  search: (query: string) => [...memoryKeys.all, "search", query] as const,
  stats: (scope: string) => [...memoryKeys.all, "stats", scope] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to manage project memories
 */
export function useProjectMemories(
  projectId: string,
  options?: {
    category?: MemoryCategory;
    minImportance?: number;
    limit?: number;
    tags?: string[];
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: [...memoryKeys.project(projectId), options],
    queryFn: () => memoryApi.getProjectMemories(projectId, options),
    enabled: !!projectId && options?.enabled !== false,
  });
}

/**
 * Hook to manage repository memories
 */
export function useRepositoryMemories(
  repositoryId: string,
  options?: {
    category?: MemoryCategory;
    minImportance?: number;
    limit?: number;
    tags?: string[];
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: [...memoryKeys.repository(repositoryId), options],
    queryFn: () => memoryApi.getRepositoryMemories(repositoryId, options),
    enabled: !!repositoryId && options?.enabled !== false,
  });
}

/**
 * Hook to get a single memory
 */
export function useMemory(memoryId: string | null) {
  return useQuery({
    queryKey: memoryKeys.single(memoryId || ""),
    queryFn: () => memoryApi.getMemory(memoryId!),
    enabled: !!memoryId,
  });
}

/**
 * Hook to create a memory
 */
export function useCreateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryApi.createMemory,
    onSuccess: (memory) => {
      // Invalidate relevant queries
      if (memory.projectId) {
        queryClient.invalidateQueries({
          queryKey: memoryKeys.project(memory.projectId),
        });
      }
      if (memory.repositoryId) {
        queryClient.invalidateQueries({
          queryKey: memoryKeys.repository(memory.repositoryId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: [...memoryKeys.all, "stats"],
      });
    },
  });
}

/**
 * Hook to update a memory
 */
export function useUpdateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMemoryInput }) =>
      memoryApi.updateMemory(id, input),
    onSuccess: (memory) => {
      // Update cache
      queryClient.setQueryData(memoryKeys.single(memory.id), memory);

      // Invalidate list queries
      if (memory.projectId) {
        queryClient.invalidateQueries({
          queryKey: memoryKeys.project(memory.projectId),
        });
      }
      if (memory.repositoryId) {
        queryClient.invalidateQueries({
          queryKey: memoryKeys.repository(memory.repositoryId),
        });
      }
    },
  });
}

/**
 * Hook to delete a memory
 */
export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryApi.deleteMemory,
    onSuccess: () => {
      // Invalidate all memory queries
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

/**
 * Hook to get relevant memories for a task context
 */
export function useRelevantMemories(
  context: {
    projectId?: string;
    repositoryId?: string;
    taskTitle?: string;
    taskDescription?: string;
    taskType?: string;
    affectedFiles?: string[];
  },
  options?: { limit?: number; enabled?: boolean }
) {
  // Create a stable hash for the context
  const contextHash = useMemo(() => {
    return JSON.stringify({
      projectId: context.projectId,
      repositoryId: context.repositoryId,
      taskTitle: context.taskTitle?.substring(0, 100),
      taskType: context.taskType,
    });
  }, [context.projectId, context.repositoryId, context.taskTitle, context.taskType]);

  return useQuery({
    queryKey: memoryKeys.relevant(contextHash),
    queryFn: () =>
      memoryApi.getRelevantMemories({
        ...context,
        limit: options?.limit ?? 5,
      }),
    enabled:
      options?.enabled !== false &&
      !!(context.projectId || context.repositoryId) &&
      !!(context.taskTitle || context.taskDescription),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to search memories
 */
export function useSearchMemories(
  query: string,
  options?: {
    projectId?: string;
    repositoryId?: string;
    category?: MemoryCategory;
    minImportance?: number;
    limit?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: [...memoryKeys.search(query), options],
    queryFn: () => memoryApi.searchMemories(query, options),
    enabled: options?.enabled !== false && query.length >= 2,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to consolidate memories
 */
export function useConsolidateMemories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memoryIds,
      options,
    }: {
      memoryIds: string[];
      options?: {
        projectId?: string;
        repositoryId?: string;
        category?: MemoryCategory;
      };
    }) => memoryApi.consolidateMemories(memoryIds, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

/**
 * Hook to auto-consolidate memories
 */
export function useAutoConsolidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryApi.autoConsolidate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
    },
  });
}

/**
 * Hook to get memory statistics
 */
export function useMemoryStats(options?: {
  projectId?: string;
  repositoryId?: string;
  enabled?: boolean;
}) {
  const scope = options?.projectId || options?.repositoryId || "global";

  return useQuery({
    queryKey: memoryKeys.stats(scope),
    queryFn: () => memoryApi.getStats(options),
    enabled: options?.enabled !== false,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create memory from a completed task
 */
export function useCreateMemoryFromTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryApi.createFromTask,
    onSuccess: (memory) => {
      if (memory.projectId) {
        queryClient.invalidateQueries({
          queryKey: memoryKeys.project(memory.projectId),
        });
      }
      if (memory.repositoryId) {
        queryClient.invalidateQueries({
          queryKey: memoryKeys.repository(memory.repositoryId),
        });
      }
    },
  });
}

// ============================================================================
// Auto-Suggest Hook
// ============================================================================

/**
 * Hook that auto-suggests relevant memories when task context changes
 */
export function useAutoSuggestMemories(
  context: {
    projectId?: string;
    repositoryId?: string;
    taskTitle?: string;
    taskDescription?: string;
    taskType?: string;
  },
  options?: { debounceMs?: number; enabled?: boolean }
) {
  const [debouncedContext, setDebouncedContext] = useState(context);
  const debounceMs = options?.debounceMs ?? 500;

  // Debounce context changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContext(context);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [context.taskTitle, context.taskDescription, context.taskType, debounceMs]);

  const { data: memories, isLoading } = useRelevantMemories(debouncedContext, {
    limit: 3,
    enabled:
      options?.enabled !== false &&
      !!(debouncedContext.taskTitle || debouncedContext.taskDescription),
  });

  const hasSuggestions = useMemo(
    () => !!memories && memories.length > 0,
    [memories]
  );

  return {
    suggestions: memories ?? [],
    isLoading,
    hasSuggestions,
  };
}

// ============================================================================
// Category Helpers
// ============================================================================

export const MEMORY_CATEGORIES: {
  value: MemoryCategory;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    value: "architecture",
    label: "Architecture",
    description: "Architectural decisions and patterns",
    color: "purple",
  },
  {
    value: "convention",
    label: "Convention",
    description: "Coding conventions and style guidelines",
    color: "blue",
  },
  {
    value: "decision",
    label: "Decision",
    description: "Project decisions and rationale",
    color: "green",
  },
  {
    value: "learning",
    label: "Learning",
    description: "Learnings from past work",
    color: "amber",
  },
  {
    value: "context",
    label: "Context",
    description: "General project context",
    color: "gray",
  },
];

export function getCategoryConfig(category: MemoryCategory) {
  return MEMORY_CATEGORIES.find((c) => c.value === category) ?? MEMORY_CATEGORIES[4];
}
