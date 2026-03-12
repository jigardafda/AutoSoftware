/**
 * GitHubStatusBadge Component
 *
 * Displays comprehensive GitHub status for tasks linked to PRs:
 * - CI status (checks passing/failing/pending)
 * - Review status (approved/changes requested/pending)
 * - PR state (draft/open/merged/closed)
 */

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  GitPullRequest,
  GitMerge,
  MessageSquare,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface CICheck {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

interface Reviewer {
  login: string;
  state: string;
  avatarUrl: string;
}

interface GitHubStatus {
  ci: {
    status: "pending" | "success" | "failure" | "neutral";
    checks: CICheck[];
  };
  reviews: {
    status: "pending" | "approved" | "changes_requested" | "commented";
    reviewers: Reviewer[];
  };
  mergeable: boolean | null;
  draft: boolean;
  merged: boolean;
}

interface GitHubContext {
  type: "issue" | "pull_request";
  number: number;
  title: string;
  url: string;
  state: string;
  baseBranch?: string;
  headBranch?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export interface GitHubStatusBadgeProps {
  pullRequestUrl?: string | null;
  pullRequestStatus?: string | null;
  githubStatus?: GitHubStatus | null;
  githubContext?: GitHubContext | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  compact?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

function CIStatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  switch (status) {
    case "success":
      return <CheckCircle2 className={cn("text-green-500", className)} />;
    case "failure":
      return <XCircle className={cn("text-red-500", className)} />;
    case "neutral":
      return <AlertCircle className={cn("text-yellow-500", className)} />;
    default:
      return <Clock className={cn("text-blue-500 animate-pulse", className)} />;
  }
}

function ReviewStatusIcon({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  switch (status) {
    case "approved":
      return <CheckCircle2 className={cn("text-green-500", className)} />;
    case "changes_requested":
      return <XCircle className={cn("text-orange-500", className)} />;
    case "commented":
      return <MessageSquare className={cn("text-blue-500", className)} />;
    default:
      return <Clock className={cn("text-muted-foreground", className)} />;
  }
}

function PRStateIcon({
  merged,
  draft,
  state,
  className,
}: {
  merged: boolean;
  draft: boolean;
  state: string;
  className?: string;
}) {
  if (merged) {
    return <GitMerge className={cn("text-purple-500", className)} />;
  }
  if (draft) {
    return (
      <GitPullRequest className={cn("text-muted-foreground", className)} />
    );
  }
  if (state === "closed") {
    return <GitPullRequest className={cn("text-red-500", className)} />;
  }
  return <GitPullRequest className={cn("text-green-500", className)} />;
}

// ============================================================================
// Main Component
// ============================================================================

export function GitHubStatusBadge({
  pullRequestUrl,
  pullRequestStatus,
  githubStatus,
  githubContext,
  onRefresh,
  isRefreshing,
  compact = false,
}: GitHubStatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  // No PR linked
  if (!pullRequestUrl && !githubContext) {
    return null;
  }

  // Determine overall status for badge color
  const getOverallStatus = () => {
    if (githubStatus?.merged) return "merged";
    if (githubStatus?.ci.status === "failure") return "failure";
    if (githubStatus?.reviews.status === "changes_requested")
      return "changes_requested";
    if (
      githubStatus?.ci.status === "success" &&
      githubStatus?.reviews.status === "approved"
    )
      return "ready";
    if (githubStatus?.ci.status === "pending") return "pending";
    return pullRequestStatus || "unknown";
  };

  const overallStatus = getOverallStatus();

  // Badge styling based on status
  const getBadgeVariant = () => {
    switch (overallStatus) {
      case "merged":
        return "bg-purple-500/15 text-purple-500 border-purple-500/20";
      case "ready":
      case "approved":
        return "bg-green-500/15 text-green-500 border-green-500/20";
      case "failure":
      case "checks_failing":
        return "bg-red-500/15 text-red-500 border-red-500/20";
      case "changes_requested":
        return "bg-orange-500/15 text-orange-500 border-orange-500/20";
      case "pending":
        return "bg-blue-500/15 text-blue-500 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground border-muted";
    }
  };

  // Simple badge for compact mode
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn("cursor-pointer", getBadgeVariant())}
              onClick={() => pullRequestUrl && window.open(pullRequestUrl, "_blank")}
            >
              {githubStatus ? (
                <PRStateIcon
                  merged={githubStatus.merged}
                  draft={githubStatus.draft}
                  state={githubContext?.state || "open"}
                  className="h-3 w-3"
                />
              ) : (
                <GitPullRequest className="h-3 w-3" />
              )}
              <span className="ml-1">
                #{githubContext?.number || "PR"}
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{githubContext?.title || "View Pull Request"}</p>
            {githubStatus && (
              <p className="text-xs text-muted-foreground">
                CI: {githubStatus.ci.status} | Reviews:{" "}
                {githubStatus.reviews.status}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "cursor-pointer gap-1.5 hover:opacity-80 transition-opacity",
            getBadgeVariant()
          )}
        >
          {githubStatus ? (
            <PRStateIcon
              merged={githubStatus.merged}
              draft={githubStatus.draft}
              state={githubContext?.state || "open"}
              className="h-3.5 w-3.5"
            />
          ) : (
            <GitPullRequest className="h-3.5 w-3.5" />
          )}
          <span>
            PR #{githubContext?.number || pullRequestUrl?.match(/\/(\d+)$/)?.[1] || "?"}
          </span>
          {githubStatus && (
            <>
              <span className="mx-0.5 text-muted-foreground">|</span>
              <CIStatusIcon
                status={githubStatus.ci.status}
                className="h-3.5 w-3.5"
              />
              <ReviewStatusIcon
                status={githubStatus.reviews.status}
                className="h-3.5 w-3.5"
              />
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Badge>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="start">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">
              Pull Request #{githubContext?.number}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
                />
              </Button>
            )}
            {pullRequestUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => window.open(pullRequestUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Title */}
        {githubContext?.title && (
          <div className="px-3 py-2 border-b">
            <p className="text-sm font-medium line-clamp-2">
              {githubContext.title}
            </p>
            {githubContext.headBranch && githubContext.baseBranch && (
              <p className="text-xs text-muted-foreground mt-1">
                {githubContext.headBranch} -&gt; {githubContext.baseBranch}
              </p>
            )}
          </div>
        )}

        {/* Status Sections */}
        {githubStatus ? (
          <div className="divide-y">
            {/* CI Status */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  CI Checks
                </span>
                <div className="flex items-center gap-1.5">
                  <CIStatusIcon
                    status={githubStatus.ci.status}
                    className="h-4 w-4"
                  />
                  <span className="text-sm capitalize">
                    {githubStatus.ci.status}
                  </span>
                </div>
              </div>

              {githubStatus.ci.checks.length > 0 ? (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {githubStatus.ci.checks.slice(0, 5).map((check, idx) => (
                    <a
                      key={idx}
                      href={check.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-xs hover:bg-muted/50 rounded px-1.5 py-1 -mx-1.5 transition-colors"
                    >
                      <span className="truncate">{check.name}</span>
                      <CIStatusIcon
                        status={check.conclusion || check.status}
                        className="h-3.5 w-3.5 shrink-0 ml-2"
                      />
                    </a>
                  ))}
                  {githubStatus.ci.checks.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      +{githubStatus.ci.checks.length - 5} more checks
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No checks found</p>
              )}
            </div>

            {/* Reviews */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reviews
                </span>
                <div className="flex items-center gap-1.5">
                  <ReviewStatusIcon
                    status={githubStatus.reviews.status}
                    className="h-4 w-4"
                  />
                  <span className="text-sm capitalize">
                    {githubStatus.reviews.status.replace("_", " ")}
                  </span>
                </div>
              </div>

              {githubStatus.reviews.reviewers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {githubStatus.reviews.reviewers.map((reviewer, idx) => (
                    <TooltipProvider key={idx}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-full px-2 py-1">
                            {reviewer.avatarUrl ? (
                              <img
                                src={reviewer.avatarUrl}
                                alt={reviewer.login}
                                className="h-4 w-4 rounded-full"
                              />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            <span>{reviewer.login}</span>
                            <ReviewStatusIcon
                              status={reviewer.state.toLowerCase()}
                              className="h-3 w-3"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{reviewer.state.replace("_", " ")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No reviews yet
                </p>
              )}
            </div>

            {/* Stats */}
            {githubContext && (
              <div className="p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Changes</span>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">
                      +{githubContext.additions || 0}
                    </span>
                    <span className="text-red-500">
                      -{githubContext.deletions || 0}
                    </span>
                    <span className="text-muted-foreground">
                      ({githubContext.changedFiles || 0} files)
                    </span>
                  </div>
                </div>

                {githubStatus.mergeable !== null && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-muted-foreground">Mergeable</span>
                    {githubStatus.mergeable ? (
                      <span className="text-green-500 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        No
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Status information not available
            </p>
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    isRefreshing && "animate-spin"
                  )}
                />
                Fetch Status
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// GitHub Comments List Component
// ============================================================================

interface TaskComment {
  id: string;
  author: string;
  authorAvatarUrl: string;
  body: string;
  createdAt: string;
  source: "github_review" | "github_issue" | "user";
  sourceUrl?: string;
  filePath?: string;
  lineNumber?: number;
  diffHunk?: string;
}

interface GitHubCommentsListProps {
  comments: TaskComment[];
  className?: string;
}

export function GitHubCommentsList({
  comments,
  className,
}: GitHubCommentsListProps) {
  if (!comments || comments.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        PR Review Comments ({comments.length})
      </h4>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="border rounded-lg p-3 text-sm bg-muted/30"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {comment.authorAvatarUrl ? (
                  <img
                    src={comment.authorAvatarUrl}
                    alt={comment.author}
                    className="h-5 w-5 rounded-full"
                  />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="font-medium">{comment.author}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              {comment.sourceUrl && (
                <a
                  href={comment.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {comment.filePath && (
              <div className="text-xs text-muted-foreground mb-2 font-mono">
                {comment.filePath}
                {comment.lineNumber && `:${comment.lineNumber}`}
              </div>
            )}

            {comment.diffHunk && (
              <pre className="text-xs bg-muted/50 rounded p-2 mb-2 overflow-x-auto max-h-24 font-mono">
                {comment.diffHunk}
              </pre>
            )}

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {comment.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GitHubStatusBadge;
