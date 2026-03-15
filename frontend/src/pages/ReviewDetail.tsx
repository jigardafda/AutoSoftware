import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertTriangle,
  Lightbulb,
  ThumbsUp,
  FileCode2,
  GitPullRequestArrow,
  RotateCcw,
  Clock,
  Ban,
  Trash2,
  GitBranch,
  Monitor,
  ChevronDown,
  ChevronRight,
  Hash,
  Shield,
  Eye,
  Folder,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// -- Helpers --

function getProviderLabel(provider: string) {
  switch (provider) {
    case "github": return "GitHub";
    case "gitlab": return "GitLab";
    case "bitbucket": return "Bitbucket";
    default: return provider;
  }
}

function getProviderIcon(provider: string) {
  switch (provider) {
    case "github": return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    );
    default: return <GitPullRequestArrow className="h-4 w-4" />;
  }
}

const VERDICT_CONFIG = {
  approve: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
    headerBg: "bg-gradient-to-r from-green-500/10 via-green-500/5 to-transparent",
    iconBg: "bg-green-500/15",
  },
  request_changes: {
    label: "Changes Requested",
    icon: XCircle,
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    headerBg: "bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent",
    iconBg: "bg-red-500/15",
  },
  comment: {
    label: "Commented",
    icon: MessageSquare,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    headerBg: "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent",
    iconBg: "bg-amber-500/15",
  },
} as const;

const SEVERITY_CONFIG: Record<string, {
  label: string;
  icon: typeof AlertTriangle;
  dotClass: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  tagBg: string;
}> = {
  critical: {
    label: "Critical",
    icon: XCircle,
    dotClass: "bg-red-500",
    bgClass: "bg-red-500/5 dark:bg-red-500/10",
    textClass: "text-red-600 dark:text-red-400",
    borderClass: "border-red-500/20",
    tagBg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-500/5 dark:bg-amber-500/10",
    textClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-500/20",
    tagBg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  suggestion: {
    label: "Suggestion",
    icon: Lightbulb,
    dotClass: "bg-blue-500",
    bgClass: "bg-blue-500/5 dark:bg-blue-500/10",
    textClass: "text-blue-600 dark:text-blue-400",
    borderClass: "border-blue-500/20",
    tagBg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  nitpick: {
    label: "Nitpick",
    icon: MessageSquare,
    dotClass: "bg-gray-400",
    bgClass: "bg-gray-500/5 dark:bg-gray-500/10",
    textClass: "text-gray-500 dark:text-gray-400",
    borderClass: "border-gray-500/20",
    tagBg: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
  },
  praise: {
    label: "Praise",
    icon: ThumbsUp,
    dotClass: "bg-green-500",
    bgClass: "bg-green-500/5 dark:bg-green-500/10",
    textClass: "text-green-600 dark:text-green-400",
    borderClass: "border-green-500/20",
    tagBg: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
  },
};

function SeverityBadge({ severity }: { severity: string }) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.suggestion;
  const Icon = config.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
      config.tagBg
    )}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// -- Collapsible File Section --

function FileCommentSection({ file, comments }: { file: string; comments: any[] }) {
  const [isOpen, setIsOpen] = useState(true);
  const dirParts = file.split("/");
  const fileName = dirParts.pop() || file;
  const dirPath = dirParts.join("/");

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of comments) {
      const sev = c.severity || "suggestion";
      counts[sev] = (counts[sev] || 0) + 1;
    }
    return counts;
  }, [comments]);

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      {/* File header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-4 py-3 border-b border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <FileCode2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {dirPath && (
            <span className="text-xs text-muted-foreground/60 font-mono truncate">{dirPath}/</span>
          )}
          <span className="text-sm font-mono font-semibold text-foreground/90">{fileName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {Object.entries(severityCounts).map(([sev, count]) => {
            const config = SEVERITY_CONFIG[sev];
            if (!config) return null;
            return (
              <span key={sev} className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border", config.tagBg)}>
                {count}
              </span>
            );
          })}
        </div>
      </button>

      {/* Comments */}
      {isOpen && (
        <div className="divide-y divide-border/30">
          {comments.map((comment: any, idx: number) => {
            const config = SEVERITY_CONFIG[comment.severity] || SEVERITY_CONFIG.suggestion;
            return (
              <div key={idx} className={cn("flex gap-3 px-4 py-3.5 transition-colors", config.bgClass + "/30")}>
                <div className="shrink-0 pt-0.5">
                  <span className={cn("flex h-2.5 w-2.5 rounded-full mt-1", config.dotClass)} />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={comment.severity || "suggestion"} />
                    {comment.line != null && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/30">
                        <Hash className="h-2.5 w-2.5" />
                        {comment.line}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {comment.comment || comment.body || comment.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- Steps indicator for processing --

function ProcessingSteps({ status }: { status: string }) {
  const steps = [
    { key: "fetch", label: "Fetching PR", description: "Retrieving diff and metadata" },
    { key: "analyze", label: "Analyzing code", description: "AI reviewing your changes" },
    { key: "complete", label: "Generating report", description: "Formatting results" },
  ];

  const currentIndex = status === "pending" ? 0 : status === "running" ? 1 : 2;

  return (
    <div className="flex items-start gap-0 w-full max-w-md mx-auto">
      {steps.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={step.key} className="flex-1 flex flex-col items-center text-center relative">
            {i > 0 && (
              <div className={cn(
                "absolute top-3 right-1/2 w-full h-0.5 -z-10",
                isDone ? "bg-primary" : "bg-border"
              )} />
            )}
            <div className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 border-2 transition-all",
              isActive
                ? "border-primary bg-primary text-primary-foreground scale-110"
                : isDone
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
            )}>
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                i + 1
              )}
            </div>
            <p className={cn(
              "text-[11px] font-medium",
              isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
            )}>
              {step.label}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.description}</p>
          </div>
        );
      })}
    </div>
  );
}

// -- Main Component --

export function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fileFilter, setFileFilter] = useState<string | null>(null);

  const { data: review, isLoading } = useQuery({
    queryKey: ["reviews", id],
    queryFn: () => api.reviews.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 3000 : false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => api.reviews.retry(id!),
    onSuccess: () => {
      toast.success("Review restarted");
      queryClient.invalidateQueries({ queryKey: ["reviews", id] });
    },
    onError: () => toast.error("Failed to retry review"),
  });

  const redoMutation = useMutation({
    mutationFn: () => api.reviews.redo(id!),
    onSuccess: () => {
      toast.success("Review restarted from scratch");
      queryClient.invalidateQueries({ queryKey: ["reviews", id] });
    },
    onError: () => toast.error("Failed to redo review"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.reviews.cancel(id!),
    onSuccess: () => {
      toast.success("Review cancelled");
      queryClient.invalidateQueries({ queryKey: ["reviews", id] });
    },
    onError: () => toast.error("Failed to cancel review"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.reviews.delete(id!),
    onSuccess: () => {
      toast.success("Review deleted");
      navigate("/reviews");
    },
    onError: () => toast.error("Failed to delete review"),
  });

  const workspaceMutation = useMutation({
    mutationFn: () => api.reviews.openWorkspace(id!),
    onSuccess: (data) => {
      if (data.created) {
        toast.success("Workspace created");
      }
      navigate(`/workspaces/${data.workspace.id}`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to open workspace"),
  });

  const commentsByFile = useMemo(() => {
    if (!review?.comments) return {};
    const grouped: Record<string, any[]> = {};
    for (const comment of review.comments) {
      const file = comment.file || "General";
      if (!grouped[file]) grouped[file] = [];
      grouped[file].push(comment);
    }
    for (const file of Object.keys(grouped)) {
      grouped[file].sort((a: any, b: any) => (a.line ?? 0) - (b.line ?? 0));
    }
    return grouped;
  }, [review?.comments]);

  const stats = useMemo(() => {
    if (!review?.comments) return null;
    const counts: Record<string, number> = { critical: 0, warning: 0, suggestion: 0, nitpick: 0, praise: 0 };
    for (const comment of review.comments) {
      const sev = comment.severity || "suggestion";
      if (counts[sev] !== undefined) counts[sev]++;
    }
    return counts;
  }, [review?.comments]);

  const fileCount = Object.keys(commentsByFile).length;
  const totalComments = review?.comments?.length || 0;

  // Group files by directory for the sidebar
  const filesByDirectory = useMemo(() => {
    if (!review?.filesChanged?.length) return {};
    const dirs: Record<string, string[]> = {};
    for (const file of review.filesChanged) {
      const parts = file.split("/");
      const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
      if (!dirs[dir]) dirs[dir] = [];
      dirs[dir].push(file);
    }
    return dirs;
  }, [review?.filesChanged]);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-80" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        <GitPullRequestArrow className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Review not found.</p>
        <Button variant="outline" asChild>
          <Link to="/reviews">Back to Reviews</Link>
        </Button>
      </div>
    );
  }

  const isProcessing = review.status === "pending" || review.status === "running";
  const isFailed = review.status === "failed";
  const isCancelled = review.status === "cancelled";
  const verdictConfig = review.verdict ? VERDICT_CONFIG[review.verdict as keyof typeof VERDICT_CONFIG] : null;

  const filteredCommentsByFile = fileFilter
    ? { [fileFilter]: commentsByFile[fileFilter] || [] }
    : commentsByFile;

  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto space-y-6">
      {/* -- Header -- */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
              <Link to="/reviews"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight leading-tight">
                {review.title || "Untitled Review"}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {getProviderIcon(review.provider)}
                  {getProviderLabel(review.provider)}
                </span>
                {review.owner && review.repo && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono text-xs">{review.owner}/{review.repo}</span>
                  </>
                )}
                {review.prNumber && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono text-xs">#{review.prNumber}</span>
                  </>
                )}
                {review.baseBranch && review.headBranch && (
                  <>
                    <span className="text-border">·</span>
                    <span className="font-mono text-xs inline-flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {review.headBranch} &rarr; {review.baseBranch}
                    </span>
                  </>
                )}
                <span className="text-border">·</span>
                <span className="text-xs">
                  {new Date(review.createdAt).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isProcessing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Ban className="h-4 w-4 mr-1.5" />}
              Cancel
            </Button>
          )}

          {(isFailed || isCancelled) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
              Retry
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {review.status === "completed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => redoMutation.mutate()}
                disabled={redoMutation.isPending}
              >
                {redoMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                Redo Review
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => workspaceMutation.mutate()}
                disabled={workspaceMutation.isPending}
              >
                {workspaceMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Monitor className="h-4 w-4 mr-1.5" />}
                Open in Workspace
              </Button>
            </>
          )}

          {review.prUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={review.prUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View PR
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* -- Processing State -- */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent p-8 space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-card border-2 border-primary/20 flex items-center justify-center">
                <GitPullRequestArrow className="h-3.5 w-3.5 text-primary" />
              </div>
            </div>
          </div>
          <ProcessingSteps status={review.status} />
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Usually takes 15-30 seconds
            </span>
          </div>
        </div>
      )}

      {/* -- Failed State -- */}
      {isFailed && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-600 dark:text-red-400">Review Failed</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {review.error || "An unexpected error occurred while processing this review."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                Retry Review
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* -- Cancelled State -- */}
      {isCancelled && (
        <div className="rounded-xl border border-gray-500/20 bg-gray-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-gray-500/10 flex items-center justify-center shrink-0">
              <Ban className="h-5 w-5 text-gray-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-600 dark:text-gray-400">Review Cancelled</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This review was cancelled before it could complete.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                Restart Review
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* -- Completed Review Content -- */}
      {review.status === "completed" && (
        <>
          {/* Verdict + Stats Row */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
            {/* Verdict Card */}
            {verdictConfig && (
              <div className={cn("rounded-xl border overflow-hidden", verdictConfig.className)}>
                <div className={cn("px-5 py-4 flex items-center gap-4", verdictConfig.headerBg)}>
                  <div className={cn("h-11 w-11 rounded-full flex items-center justify-center shrink-0", verdictConfig.iconBg)}>
                    <verdictConfig.icon className="h-5.5 w-5.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold">{verdictConfig.label}</h3>
                    <p className="text-sm opacity-75">
                      {totalComments} comment{totalComments !== 1 ? "s" : ""} across {fileCount} file{fileCount !== 1 ? "s" : ""}
                      {review.filesChanged?.length ? ` · ${review.filesChanged.length} files changed` : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Severity Stats */}
            {stats && (
              <div className="flex gap-2">
                {Object.entries(SEVERITY_CONFIG).map(([severity, config]) => {
                  const count = stats[severity] || 0;
                  const Icon = config.icon;
                  return (
                    <button
                      key={severity}
                      onClick={() => count > 0 ? setFileFilter(null) : undefined}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-center transition-all min-w-[72px]",
                        count > 0 ? `${config.bgClass} ${config.borderClass}` : "border-border/50 opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Icon className={cn("h-3.5 w-3.5", count > 0 ? config.textClass : "text-muted-foreground/50")} />
                        <span className={cn(
                          "text-xl font-bold tabular-nums",
                          count > 0 ? config.textClass : "text-muted-foreground/30"
                        )}>
                          {count}
                        </span>
                      </div>
                      <span className={cn(
                        "text-[10px] font-medium capitalize",
                        count > 0 ? config.textClass : "text-muted-foreground/50"
                      )}>
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {review.summary && (
            <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/50 bg-muted/30 flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Summary</h2>
              </div>
              <div className="px-5 py-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {review.summary.split("\n\n").map((paragraph: string, i: number) => (
                    <p key={i} className="text-sm leading-relaxed text-foreground/90 [&:not(:last-child)]:mb-3">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Two column layout: Files sidebar + Comments */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* Files Sidebar */}
            {review.filesChanged?.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-card overflow-hidden self-start lg:sticky lg:top-20">
                <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Files</h2>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{review.filesChanged.length}</Badge>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                  {/* All files button */}
                  <button
                    onClick={() => setFileFilter(null)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs transition-colors border-b border-border/20",
                      !fileFilter ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    All files ({review.filesChanged.length})
                  </button>
                  {Object.entries(filesByDirectory).map(([dir, files]) => (
                    <div key={dir}>
                      <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider bg-muted/20">
                        {dir === "/" ? "Root" : dir}
                      </div>
                      {files.map((file: string) => {
                        const fileName = file.split("/").pop() || file;
                        const hasComments = (commentsByFile[file]?.length || 0) > 0;
                        const commentCount = commentsByFile[file]?.length || 0;
                        const isActive = fileFilter === file;
                        return (
                          <button
                            key={file}
                            onClick={() => setFileFilter(isActive ? null : file)}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : hasComments
                                  ? "text-foreground/80 hover:bg-muted/30"
                                  : "text-muted-foreground/60 hover:bg-muted/20"
                            )}
                          >
                            <FileCode2 className={cn("h-3 w-3 shrink-0", hasComments ? "text-amber-500" : "text-muted-foreground/40")} />
                            <span className="truncate flex-1">{fileName}</span>
                            {commentCount > 0 && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-sans">
                                {commentCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-3">
              {fileFilter && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Filtered to:</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {fileFilter.split("/").pop()}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFileFilter(null)}>
                    Clear
                  </Button>
                </div>
              )}

              {Object.keys(filteredCommentsByFile).length > 0 ? (
                Object.entries(filteredCommentsByFile).map(([file, comments]) => (
                  <FileCommentSection key={file} file={file} comments={comments} />
                ))
              ) : totalComments === 0 ? (
                <div className="rounded-xl border border-border/50 bg-card p-8 text-center">
                  <Shield className="h-10 w-10 text-green-500/50 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-foreground/80">No issues found</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    The review completed without finding any comments to report.
                  </p>
                </div>
              ) : fileFilter ? (
                <div className="rounded-xl border border-border/50 bg-card p-6 text-center">
                  <p className="text-sm text-muted-foreground">No comments for this file.</p>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The review and all its comments will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
