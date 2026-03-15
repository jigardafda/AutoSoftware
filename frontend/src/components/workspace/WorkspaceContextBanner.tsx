import { useState } from "react";
import {
  GitPullRequestArrow,
  ClipboardList,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceContextBannerProps {
  workspace: any;
  className?: string;
}

const VERDICT_STYLES: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  approve: { label: "Approved", className: "text-green-600 dark:text-green-400", icon: CheckCircle2 },
  request_changes: { label: "Changes Requested", className: "text-red-600 dark:text-red-400", icon: XCircle },
  comment: { label: "Commented", className: "text-amber-600 dark:text-amber-400", icon: MessageSquare },
};

export function WorkspaceContextBanner({ workspace, className }: WorkspaceContextBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!workspace?.prReview && !workspace?.task && !workspace?.taskId) return null;

  const review = workspace.prReview;
  const task = workspace.task;

  return (
    <div className={cn(
      "mx-3 mt-2 rounded-lg border text-xs overflow-hidden transition-all",
      review ? "border-purple-500/20 bg-purple-500/5" : "border-blue-500/20 bg-blue-500/5",
      className
    )}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {review ? (
          <>
            <GitPullRequestArrow className="h-3.5 w-3.5 text-purple-500 shrink-0" />
            <span className="font-medium truncate">
              PR Review: {review.owner}/{review.repo}#{review.prNumber}
            </span>
            {review.verdict && VERDICT_STYLES[review.verdict] && (
              <Badge
                variant="secondary"
                className={cn("text-[10px] px-1.5 py-0 gap-1 shrink-0", VERDICT_STYLES[review.verdict].className)}
              >
                {(() => { const Icon = VERDICT_STYLES[review.verdict].icon; return <Icon className="h-2.5 w-2.5" />; })()}
                {VERDICT_STYLES[review.verdict].label}
              </Badge>
            )}
          </>
        ) : (
          <>
            <ClipboardList className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span className="font-medium truncate">
              Task: {task?.title || workspace.name}
            </span>
            {task?.status && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {task.status}
              </Badge>
            )}
            {task?.priority && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                {task.priority}
              </Badge>
            )}
          </>
        )}
        <div className="ml-auto shrink-0">
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2.5 space-y-2 border-t border-border/30 pt-2">
          {review ? (
            <>
              {review.title && (
                <p className="text-muted-foreground">{review.title}</p>
              )}
              {review.summary && (
                <p className="text-muted-foreground line-clamp-3">{review.summary}</p>
              )}
              <div className="flex gap-3 text-muted-foreground">
                {review.baseBranch && review.headBranch && (
                  <span className="font-mono text-[11px]">
                    {review.headBranch} → {review.baseBranch}
                  </span>
                )}
                {Array.isArray(review.comments) && review.comments.length > 0 && (
                  <span>{review.comments.length} comments</span>
                )}
                {Array.isArray(review.filesChanged) && review.filesChanged.length > 0 && (
                  <span>{review.filesChanged.length} files</span>
                )}
              </div>
              {review.prUrl && (
                <a
                  href={review.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View PR
                </a>
              )}
            </>
          ) : task ? (
            <>
              {task.description && (
                <p className="text-muted-foreground line-clamp-4">{task.description}</p>
              )}
              <div className="flex gap-3 text-muted-foreground">
                {task.type && <span>Type: <strong>{task.type}</strong></span>}
                {task.targetBranch && <span>Branch: <code className="text-[11px]">{task.targetBranch}</code></span>}
              </div>
              {task.pullRequestUrl && (
                <a
                  href={task.pullRequestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View PR
                </a>
              )}
            </>
          ) : (
            <>
              {workspace.description && (
                <p className="text-muted-foreground line-clamp-3">{workspace.description}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
