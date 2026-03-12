import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWebSocket } from "./WebSocketProvider";

// Types
export interface PlanStep {
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
}

export interface ExecutionPlan {
  taskId: string;
  overview: string;
  steps: PlanStep[];
  totalEstimatedSeconds: number;
  confidence: number;
  reasoning?: string;
  createdAt: string;
}

export interface Blocker {
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
}

interface UseAITransparencyOptions {
  taskId: string;
  taskStatus: string;
  enabled?: boolean;
}

interface AITransparencyState {
  plan: ExecutionPlan | null;
  currentBlocker: Blocker | null;
  blockerHistory: Blocker[];
  isRetrying: boolean;
  isLoading: boolean;
}

/**
 * Hook for AI Transparency features - plan breakdown and blocker tracking
 */
export function useAITransparency({
  taskId,
  taskStatus,
  enabled = true,
}: UseAITransparencyOptions) {
  const queryClient = useQueryClient();
  const { addMessageHandler, subscribe, unsubscribe } = useWebSocket();

  const [state, setState] = useState<AITransparencyState>({
    plan: null,
    currentBlocker: null,
    blockerHistory: [],
    isRetrying: false,
    isLoading: true,
  });

  // Fetch initial plan
  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ["taskPlan", taskId],
    queryFn: () => api.tasks.getPlan(taskId),
    enabled: enabled && !!taskId,
    refetchInterval: taskStatus === "in_progress" ? 5000 : false,
  });

  // Fetch initial blockers
  const { data: blockerData, isLoading: blockerLoading } = useQuery({
    queryKey: ["taskBlockers", taskId],
    queryFn: () => api.tasks.getBlockers(taskId),
    enabled: enabled && !!taskId,
    refetchInterval: taskStatus === "in_progress" ? 3000 : false,
  });

  // Update state from query data
  useEffect(() => {
    if (planData?.plan) {
      setState((prev) => ({ ...prev, plan: planData.plan }));
    }
  }, [planData]);

  useEffect(() => {
    if (blockerData) {
      setState((prev) => ({
        ...prev,
        currentBlocker: blockerData.currentBlocker,
        blockerHistory: blockerData.blockerHistory,
      }));
    }
  }, [blockerData]);

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isLoading: planLoading || blockerLoading,
    }));
  }, [planLoading, blockerLoading]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!enabled || !taskId) return;

    // Subscribe to task resource
    subscribe(`task:${taskId}:transparency`);

    // Plan updates
    const cleanupPlan = addMessageHandler("plan:update", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setState((prev) => ({ ...prev, plan: payload.plan }));
      queryClient.invalidateQueries({ queryKey: ["taskPlan", taskId] });
    });

    const cleanupPlanStep = addMessageHandler("plan:step:update", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setState((prev) => {
        if (!prev.plan) return prev;
        return {
          ...prev,
          plan: {
            ...prev.plan,
            steps: prev.plan.steps.map((step) =>
              step.id === payload.stepId ? { ...step, ...payload.updates } : step
            ),
          },
        };
      });
    });

    // Blocker updates
    const cleanupBlockerNew = addMessageHandler("blocker:new", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setState((prev) => ({
        ...prev,
        currentBlocker: payload.blocker,
        blockerHistory: [...prev.blockerHistory, payload.blocker],
        isRetrying: false,
      }));
      queryClient.invalidateQueries({ queryKey: ["taskBlockers", taskId] });
    });

    const cleanupBlockerResolved = addMessageHandler("blocker:resolved", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setState((prev) => ({
        ...prev,
        currentBlocker: null,
        blockerHistory: prev.blockerHistory.map((b) =>
          b.id === payload.blockerId ? { ...b, resolvedAt: new Date().toISOString() } : b
        ),
        isRetrying: false,
      }));
      queryClient.invalidateQueries({ queryKey: ["taskBlockers", taskId] });
    });

    const cleanupBlockerRetrying = addMessageHandler("blocker:retrying", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setState((prev) => ({ ...prev, isRetrying: true }));
    });

    const cleanupBlockerProgress = addMessageHandler("blocker:progress", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setState((prev) => ({
        ...prev,
        currentBlocker: prev.currentBlocker
          ? { ...prev.currentBlocker, ...payload.updates }
          : null,
      }));
    });

    return () => {
      unsubscribe(`task:${taskId}:transparency`);
      cleanupPlan();
      cleanupPlanStep();
      cleanupBlockerNew();
      cleanupBlockerResolved();
      cleanupBlockerRetrying();
      cleanupBlockerProgress();
    };
  }, [taskId, enabled, addMessageHandler, subscribe, unsubscribe, queryClient]);

  // Helper functions
  const getCurrentStep = useCallback((): PlanStep | null => {
    if (!state.plan) return null;
    return state.plan.steps.find((s) => s.status === "in_progress") || null;
  }, [state.plan]);

  const getCompletedSteps = useCallback((): number => {
    if (!state.plan) return 0;
    return state.plan.steps.filter((s) => s.status === "completed").length;
  }, [state.plan]);

  const getProgress = useCallback((): { completed: number; total: number; percentage: number } => {
    if (!state.plan) return { completed: 0, total: 0, percentage: 0 };
    const total = state.plan.steps.length;
    const completed = state.plan.steps.filter((s) => s.status === "completed").length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }, [state.plan]);

  const hasBlocker = useCallback((): boolean => {
    return state.currentBlocker !== null;
  }, [state.currentBlocker]);

  const getConfidenceLevel = useCallback((): "high" | "medium" | "low" | "very-low" | null => {
    if (!state.plan) return null;
    const confidence = state.plan.confidence;
    if (confidence >= 80) return "high";
    if (confidence >= 60) return "medium";
    if (confidence >= 40) return "low";
    return "very-low";
  }, [state.plan]);

  return {
    ...state,
    getCurrentStep,
    getCompletedSteps,
    getProgress,
    hasBlocker,
    getConfidenceLevel,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ["taskPlan", taskId] });
      queryClient.invalidateQueries({ queryKey: ["taskBlockers", taskId] });
    },
  };
}
