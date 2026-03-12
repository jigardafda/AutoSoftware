/**
 * usePersonalization Hook
 *
 * Fetch and cache user preferences, track user interactions,
 * and send feedback signals for personalization.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// =============================================================================
// Types
// =============================================================================

export interface CodeStylePreferences {
  indentation: "tabs" | "spaces";
  indentSize: number;
  quotes: "single" | "double";
  semicolons: boolean;
  trailingComma: "none" | "es5" | "all";
  lineWidth: number;
  bracketSpacing: boolean;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  desktop: boolean;
  taskComplete: boolean;
  scanComplete: boolean;
  prMerged: boolean;
  reviewRequested: boolean;
  mentionedInComment: boolean;
  dailyDigest: boolean;
}

export interface LearnedPatterns {
  peakHours: number[];
  avgSessionLengthMinutes: number;
  preferredTaskTypes: string[];
  mostUsedTools: string[];
  commonCodePatterns: Record<string, number>;
  averageResponseTime: number;
  preferredFilesExtensions: string[];
  lastActivityTime: string;
}

export interface UserPreferences {
  id: string;
  userId: string;
  aiVerbosity: "minimal" | "medium" | "detailed";
  preferredLanguages: string[];
  preferredTools: string[];
  codeStyle: CodeStylePreferences;
  notificationPrefs: NotificationPreferences;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  uiDensity: "compact" | "comfortable" | "spacious";
  aiTone: "casual" | "professional" | "technical";
  learnedPatterns: LearnedPatterns;
  enableAutoDetection: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserInsights {
  productivity: {
    peakHours: { hour: number; activity: number }[];
    mostProductiveDay: string;
    avgTasksPerDay: number;
    avgSessionLength: number;
  };
  preferences: {
    topLanguages: { language: string; percentage: number }[];
    topTools: { tool: string; usageCount: number }[];
    preferredTaskTypes: { type: string; count: number }[];
  };
  patterns: {
    codeStyleConsistency: number;
    responseTimeAvg: number;
    collaborationScore: number;
  };
  recommendations: string[];
}

export interface BehaviorSignal {
  signalType: string;
  category: "ui" | "ai" | "code" | "workflow";
  data: Record<string, unknown>;
  context?: string;
  sessionId?: string;
}

export type PreferencesUpdate = Partial<{
  aiVerbosity: "minimal" | "medium" | "detailed";
  preferredLanguages: string[];
  preferredTools: string[];
  codeStyle: Partial<CodeStylePreferences>;
  notificationPrefs: Partial<NotificationPreferences>;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  uiDensity: "compact" | "comfortable" | "spacious";
  aiTone: "casual" | "professional" | "technical";
  enableAutoDetection: boolean;
}>;

// =============================================================================
// API Functions
// =============================================================================

async function fetchPreferences(): Promise<UserPreferences> {
  const res = await fetch("/api/personalization/preferences", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch preferences");
  const json = await res.json();
  return json.data;
}

async function updatePreferences(updates: PreferencesUpdate): Promise<UserPreferences> {
  const res = await fetch("/api/personalization/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || "Failed to update preferences");
  }
  const json = await res.json();
  return json.data;
}

async function fetchInsights(): Promise<UserInsights> {
  const res = await fetch("/api/personalization/insights", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch insights");
  const json = await res.json();
  return json.data;
}

async function sendFeedback(signal: BehaviorSignal): Promise<void> {
  const res = await fetch("/api/personalization/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(signal),
  });
  if (!res.ok) throw new Error("Failed to send feedback");
}

async function trackTool(tool: string, context?: string): Promise<void> {
  const res = await fetch("/api/personalization/track/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tool, context }),
  });
  if (!res.ok) throw new Error("Failed to track tool");
}

async function trackLanguage(language: string, context?: string): Promise<void> {
  const res = await fetch("/api/personalization/track/language", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ language, context }),
  });
  if (!res.ok) throw new Error("Failed to track language");
}

async function trackActivity(activityType: string, sessionId?: string): Promise<void> {
  const res = await fetch("/api/personalization/track/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ activityType, sessionId }),
  });
  if (!res.ok) throw new Error("Failed to track activity");
}

async function checkQuietHours(): Promise<boolean> {
  const res = await fetch("/api/personalization/quiet-hours/status", { credentials: "include" });
  if (!res.ok) return false;
  const json = await res.json();
  return json.data.isQuietHours;
}

async function resetPreferences(): Promise<UserPreferences> {
  const res = await fetch("/api/personalization/reset", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to reset preferences");
  const json = await res.json();
  return json.data;
}

// =============================================================================
// Hook
// =============================================================================

export interface UsePersonalizationOptions {
  /** Enable automatic activity tracking */
  autoTrackActivity?: boolean;
  /** Interval for activity tracking in ms (default: 5 minutes) */
  activityTrackingInterval?: number;
}

export interface UsePersonalizationResult {
  /** User preferences */
  preferences: UserPreferences | undefined;
  /** User insights */
  insights: UserInsights | undefined;
  /** Whether preferences are loading */
  isLoading: boolean;
  /** Whether insights are loading */
  isLoadingInsights: boolean;
  /** Whether currently in quiet hours */
  isQuietHours: boolean;
  /** Error if any */
  error: Error | null;
  /** Update preferences */
  updatePreferences: (updates: PreferencesUpdate) => Promise<void>;
  /** Send a behavior signal */
  sendFeedback: (signal: BehaviorSignal) => void;
  /** Track tool usage */
  trackTool: (tool: string, context?: string) => void;
  /** Track language usage */
  trackLanguage: (language: string, context?: string) => void;
  /** Track activity */
  trackActivity: (activityType: string) => void;
  /** Reset preferences to defaults */
  resetPreferences: () => Promise<void>;
  /** Refresh preferences */
  refresh: () => void;
  /** Refresh insights */
  refreshInsights: () => void;
  /** Whether update is pending */
  isUpdating: boolean;
}

export function usePersonalization(
  options: UsePersonalizationOptions = {}
): UsePersonalizationResult {
  const { autoTrackActivity = true, activityTrackingInterval = 5 * 60 * 1000 } = options;

  const queryClient = useQueryClient();
  const sessionIdRef = useRef<string>(generateSessionId());
  const [isQuietHours, setIsQuietHours] = useState(false);

  // Fetch preferences
  const {
    data: preferences,
    isLoading,
    error,
    refetch: refresh,
  } = useQuery({
    queryKey: ["personalization", "preferences"],
    queryFn: fetchPreferences,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Fetch insights (separate query, less frequent)
  const {
    data: insights,
    isLoading: isLoadingInsights,
    refetch: refreshInsights,
  } = useQuery({
    queryKey: ["personalization", "insights"],
    queryFn: fetchInsights,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  // Update preferences mutation
  const updateMutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(["personalization", "preferences"], data);
    },
  });

  // Reset preferences mutation
  const resetMutation = useMutation({
    mutationFn: resetPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(["personalization", "preferences"], data);
    },
  });

  // Check quiet hours periodically
  useEffect(() => {
    const check = async () => {
      const isQuiet = await checkQuietHours();
      setIsQuietHours(isQuiet);
    };

    check();
    const interval = setInterval(check, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Auto-track activity
  useEffect(() => {
    if (!autoTrackActivity) return;

    const track = () => {
      trackActivity("page_active", sessionIdRef.current).catch(() => {});
    };

    // Track on mount
    track();

    // Track periodically
    const interval = setInterval(track, activityTrackingInterval);

    // Track on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        track();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoTrackActivity, activityTrackingInterval]);

  // Wrapped functions with debouncing for tracking
  const debouncedTrackTool = useCallback(
    debounce((tool: string, context?: string) => {
      trackTool(tool, context).catch(() => {});
    }, 1000),
    []
  );

  const debouncedTrackLanguage = useCallback(
    debounce((language: string, context?: string) => {
      trackLanguage(language, context).catch(() => {});
    }, 1000),
    []
  );

  const debouncedTrackActivity = useCallback(
    debounce((activityType: string) => {
      trackActivity(activityType, sessionIdRef.current).catch(() => {});
    }, 1000),
    []
  );

  const debouncedSendFeedback = useCallback(
    debounce((signal: BehaviorSignal) => {
      sendFeedback({ ...signal, sessionId: sessionIdRef.current }).catch(() => {});
    }, 500),
    []
  );

  return {
    preferences,
    insights,
    isLoading,
    isLoadingInsights,
    isQuietHours,
    error: error as Error | null,
    updatePreferences: async (updates) => {
      await updateMutation.mutateAsync(updates);
    },
    sendFeedback: debouncedSendFeedback,
    trackTool: debouncedTrackTool,
    trackLanguage: debouncedTrackLanguage,
    trackActivity: debouncedTrackActivity,
    resetPreferences: async () => {
      await resetMutation.mutateAsync();
    },
    refresh: () => refresh(),
    refreshInsights: () => refreshInsights(),
    isUpdating: updateMutation.isPending || resetMutation.isPending,
  };
}

// =============================================================================
// Utilities
// =============================================================================

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook to get UI density class names
 */
export function useUIDensity(): {
  density: "compact" | "comfortable" | "spacious";
  className: string;
  spacing: { small: string; medium: string; large: string };
} {
  const { preferences } = usePersonalization({ autoTrackActivity: false });
  const density = preferences?.uiDensity || "comfortable";

  const classNames: Record<string, string> = {
    compact: "density-compact",
    comfortable: "density-comfortable",
    spacious: "density-spacious",
  };

  const spacing: Record<string, { small: string; medium: string; large: string }> = {
    compact: { small: "p-1", medium: "p-2", large: "p-3" },
    comfortable: { small: "p-2", medium: "p-4", large: "p-6" },
    spacious: { small: "p-3", medium: "p-6", large: "p-8" },
  };

  return {
    density,
    className: classNames[density],
    spacing: spacing[density],
  };
}

/**
 * Hook to check if notifications should be suppressed
 */
export function useShouldSuppressNotifications(): boolean {
  const { isQuietHours, preferences } = usePersonalization({ autoTrackActivity: false });

  if (isQuietHours) return true;
  if (!preferences?.notificationPrefs.desktop) return true;

  return false;
}

export default usePersonalization;
