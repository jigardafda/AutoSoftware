/**
 * useGitHubStatus Hook
 *
 * Custom hook for fetching and syncing GitHub status for tasks.
 * Provides real-time status updates with auto-refresh capability.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api, GitHubStatus, GitHubContext, GitHubComment } from "@/lib/api";

export interface UseGitHubStatusOptions {
  /** Task ID to fetch status for */
  taskId: string;
  /** Whether to auto-refresh status */
  autoRefresh?: boolean;
  /** Auto-refresh interval in milliseconds (default: 60000 = 1 minute) */
  refreshInterval?: number;
  /** Whether to include comments in sync */
  includeComments?: boolean;
  /** Callback when status changes */
  onStatusChange?: (status: GitHubStatus | null) => void;
}

export interface UseGitHubStatusResult {
  /** Current GitHub PR status */
  status: GitHubStatus | null;
  /** GitHub issue/PR context */
  context: GitHubContext | null;
  /** PR review comments */
  comments: GitHubComment[];
  /** PR URL if available */
  pullRequestUrl: string | null;
  /** Current PR status string */
  pullRequestStatus: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Error if any */
  error: string | null;
  /** Last sync timestamp */
  lastSynced: Date | null;
  /** Manually refresh status */
  refresh: () => Promise<void>;
  /** Sync with GitHub (fetch latest) */
  sync: (includeComments?: boolean) => Promise<void>;
  /** Inject GitHub context into task */
  injectContext: (
    issueOrPrNumber: number,
    owner?: string,
    repo?: string
  ) => Promise<void>;
}

export function useGitHubStatus(
  options: UseGitHubStatusOptions
): UseGitHubStatusResult {
  const {
    taskId,
    autoRefresh = false,
    refreshInterval = 60000,
    includeComments = false,
    onStatusChange,
  } = options;

  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [context, setContext] = useState<GitHubContext | null>(null);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);
  const [pullRequestStatus, setPullRequestStatus] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const previousStatusRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current status from backend
  const fetchStatus = useCallback(async () => {
    if (!taskId) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.github.getTaskStatus(taskId);

      setStatus(response.githubStatus);
      setContext(response.githubContext);
      setComments(response.githubComments || []);
      setPullRequestUrl(response.pullRequestUrl);
      setPullRequestStatus(response.pullRequestStatus);

      if (response.lastStatusSync) {
        setLastSynced(new Date(response.lastStatusSync));
      }

      // Notify on status change
      const currentStatusStr = JSON.stringify(response.githubStatus);
      if (
        onStatusChange &&
        previousStatusRef.current !== null &&
        previousStatusRef.current !== currentStatusStr
      ) {
        onStatusChange(response.githubStatus);
      }
      previousStatusRef.current = currentStatusStr;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setIsLoading(false);
    }
  }, [taskId, onStatusChange]);

  // Sync with GitHub API
  const sync = useCallback(
    async (syncComments?: boolean) => {
      if (!taskId) return;

      try {
        setIsSyncing(true);
        setError(null);

        const response = await api.github.syncTaskStatus(
          taskId,
          syncComments ?? includeComments
        );

        setStatus(response.status);
        if (response.comments) {
          setComments(response.comments);
        }
        setLastSynced(new Date());

        // Re-fetch to get full context
        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sync status");
      } finally {
        setIsSyncing(false);
      }
    },
    [taskId, includeComments, fetchStatus]
  );

  // Inject GitHub context
  const injectContext = useCallback(
    async (issueOrPrNumber: number, owner?: string, repo?: string) => {
      if (!taskId) return;

      try {
        setIsSyncing(true);
        setError(null);

        const response = await api.github.injectContext(
          taskId,
          issueOrPrNumber,
          owner,
          repo
        );

        setContext(response.context);

        // Re-fetch to get full status
        await fetchStatus();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to inject context"
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [taskId, fetchStatus]
  );

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) {
      return;
    }

    refreshTimerRef.current = setInterval(() => {
      fetchStatus();
    }, refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchStatus]);

  return {
    status,
    context,
    comments,
    pullRequestUrl,
    pullRequestStatus,
    isLoading,
    isSyncing,
    error,
    lastSynced,
    refresh,
    sync,
    injectContext,
  };
}

/**
 * Helper function to determine if a PR is ready to merge
 */
export function isPRReadyToMerge(status: GitHubStatus | null): boolean {
  if (!status) return false;
  return (
    status.ci.status === "success" &&
    status.reviews.status === "approved" &&
    status.mergeable === true &&
    !status.draft &&
    !status.merged
  );
}

/**
 * Helper function to get a human-readable status summary
 */
export function getStatusSummary(status: GitHubStatus | null): string {
  if (!status) return "Unknown";

  if (status.merged) return "Merged";
  if (status.draft) return "Draft";

  const issues: string[] = [];

  if (status.ci.status === "failure") {
    issues.push("CI failing");
  } else if (status.ci.status === "pending") {
    issues.push("CI pending");
  }

  if (status.reviews.status === "changes_requested") {
    issues.push("Changes requested");
  } else if (status.reviews.status === "pending") {
    issues.push("Awaiting review");
  }

  if (status.mergeable === false) {
    issues.push("Merge conflicts");
  }

  if (issues.length === 0) {
    if (isPRReadyToMerge(status)) {
      return "Ready to merge";
    }
    return "Open";
  }

  return issues.join(", ");
}

export default useGitHubStatus;
