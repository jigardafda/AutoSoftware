import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus,
  Loader2,
  Trash2,
  GitPullRequestArrow,
  Search,
  CheckCircle2,
  XCircle,
  MessageSquare,
  RotateCcw,
  Ban,
  ExternalLink,
  Clock,
  FileCode2,
  AlertTriangle,
  Link2,
  GitBranch,
  User,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AgentSelector } from "@/components/workspace/AgentSelector";
import { GitHubAuthDialog, useGitHubAuth } from "@/components/GitHubAuthDialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getProviderLabel(provider: string) {
  switch (provider) {
    case "github": return "GitHub";
    case "gitlab": return "GitLab";
    case "bitbucket": return "Bitbucket";
    default: return provider;
  }
}

function getProviderColor(provider: string) {
  switch (provider) {
    case "github": return "bg-gray-900 text-white dark:bg-white dark:text-gray-900";
    case "gitlab": return "bg-orange-600 text-white";
    case "bitbucket": return "bg-blue-600 text-white";
    default: return "";
  }
}

const VERDICT_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  approve: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  request_changes: {
    label: "Changes Requested",
    icon: XCircle,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  comment: {
    label: "Commented",
    icon: MessageSquare,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
};

function StatusBadge({ review }: { review: any }) {
  if (review.verdict && VERDICT_CONFIG[review.verdict]) {
    const config = VERDICT_CONFIG[review.verdict];
    const Icon = config.icon;
    return (
      <Badge className={cn("gap-1 font-medium", config.className)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  }

  switch (review.status) {
    case "pending":
    case "running":
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 font-medium">
          <Loader2 className="h-3 w-3 animate-spin" />
          {review.status === "running" ? "Analyzing..." : "Pending"}
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 gap-1 font-medium">
          <AlertTriangle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20 gap-1 font-medium">
          <Ban className="h-3 w-3" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="secondary">{review.status}</Badge>;
  }
}

function ReviewCard({
  review,
  onNavigate,
  onDelete,
  onCancel,
  onRetry,
  cancelPending,
  retryPending,
}: {
  review: any;
  onNavigate: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onRetry: () => void;
  cancelPending: boolean;
  retryPending: boolean;
}) {
  const isProcessing = review.status === "pending" || review.status === "running";
  const isFailed = review.status === "failed";
  const isCancelled = review.status === "cancelled";
  const commentCount = review.comments?.length || 0;
  const fileCount = review.filesChanged?.length || review.fileCount || 0;

  // Count severities
  const severityCounts = useMemo(() => {
    if (!review.comments?.length) return null;
    const counts: Record<string, number> = { critical: 0, warning: 0, suggestion: 0, nitpick: 0, praise: 0 };
    for (const c of review.comments) {
      const s = c.severity || "suggestion";
      if (counts[s] !== undefined) counts[s]++;
    }
    return counts;
  }, [review.comments]);

  const timeAgo = useMemo(() => {
    const d = new Date(review.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [review.createdAt]);

  return (
    <div
      onClick={onNavigate}
      className={cn(
        "group relative rounded-xl border bg-card transition-all hover:shadow-md cursor-pointer overflow-hidden",
        isProcessing
          ? "border-primary/30 bg-primary/[0.02]"
          : isFailed
            ? "border-red-500/20"
            : isCancelled
              ? "border-gray-500/20"
              : "border-border/50 hover:border-border",
      )}
    >
      {/* Processing shimmer */}
      {isProcessing && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-pulse" />
      )}

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          {/* Left content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title row */}
            <div className="flex items-center gap-2.5">
              <GitPullRequestArrow className={cn(
                "h-4.5 w-4.5 shrink-0",
                isProcessing ? "text-primary" : isFailed ? "text-red-500" : "text-muted-foreground"
              )} />
              <h3 className="font-semibold truncate text-[15px]">
                {review.title || "Untitled Review"}
              </h3>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {review.provider && (
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-medium", getProviderColor(review.provider))}>
                  {getProviderLabel(review.provider)}
                </Badge>
              )}
              {review.owner && review.repo && (
                <span className="font-mono text-[11px]">{review.owner}/{review.repo}</span>
              )}
              {review.headBranch && review.baseBranch && (
                <span className="font-mono text-[11px] text-muted-foreground/60 hidden sm:inline">
                  {review.headBranch} &rarr; {review.baseBranch}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            </div>

            {/* Stats row for completed reviews */}
            {review.verdict && (
              <div className="flex items-center gap-3 text-xs pt-0.5">
                {fileCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <FileCode2 className="h-3 w-3" />
                    {fileCount} file{fileCount !== 1 ? "s" : ""}
                  </span>
                )}
                {commentCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    {commentCount} comment{commentCount !== 1 ? "s" : ""}
                  </span>
                )}
                {severityCounts && severityCounts.critical > 0 && (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {severityCounts.critical} critical
                  </span>
                )}
                {severityCounts && severityCounts.warning > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {severityCounts.warning} warning{severityCounts.warning !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Processing message */}
            {isProcessing && (
              <p className="text-xs text-primary/70 pt-0.5">
                {review.status === "pending" ? "Fetching PR details..." : "AI is analyzing code changes..."}
              </p>
            )}

            {/* Error message */}
            {isFailed && review.error && (
              <p className="text-xs text-red-500/80 truncate pt-0.5 max-w-md">
                {review.error}
              </p>
            )}
          </div>

          {/* Right side: status + actions */}
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge review={review} />

            {/* Action buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isProcessing && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                        onClick={(e) => { e.stopPropagation(); onCancel(); }}
                        disabled={cancelPending}
                      >
                        {cancelPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel review</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {(isFailed || isCancelled) && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); onRetry(); }}
                        disabled={retryPending}
                      >
                        {retryPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Retry review</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {review.prUrl && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); window.open(review.prUrl, "_blank"); }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open PR</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete review</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type DialogMode = "pick" | "url";

function NewReviewDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (prUrl: string, agentId?: string) => void;
  isPending: boolean;
}) {
  const [mode, setMode] = useState<DialogMode>("pick");
  const [prUrl, setPrUrl] = useState("");
  const [agentId, setAgentId] = useState<string | undefined>();
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [selectedPrUrl, setSelectedPrUrl] = useState<string | null>(null);

  const {
    isAuthenticated: ghAuthenticated,
    isLoading: ghLoading,
    showAuthDialog,
    setShowAuthDialog,
  } = useGitHubAuth();

  // Fetch user's connected repos
  const { data: repos = [] } = useQuery({
    queryKey: ["repos"],
    queryFn: () => api.repos.list(),
    enabled: open,
  });

  // Filter to remote repos only (not local)
  const remoteRepos = useMemo(
    () => repos.filter((r: any) => r.provider !== "local"),
    [repos]
  );

  // Fetch PRs for selected repo
  const { data: pullRequests = [], isLoading: prsLoading } = useQuery({
    queryKey: ["repo-prs", selectedRepoId],
    queryFn: () => api.repos.pullRequests(selectedRepoId!),
    enabled: !!selectedRepoId,
  });

  const handleSubmit = () => {
    const url = mode === "pick" ? selectedPrUrl : prUrl.trim();
    if (!url) {
      toast.error("Please select or enter a PR");
      return;
    }
    onSubmit(url, agentId);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setPrUrl("");
      setAgentId(undefined);
      setSelectedRepoId(null);
      setSelectedPrUrl(null);
    }, 200);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New PR Review</DialogTitle>
          <DialogDescription>
            Select a pull request from your repos or paste a URL directly.
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5">
          <button
            onClick={() => setMode("pick")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "pick" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GitPullRequestArrow className="h-3.5 w-3.5" />
            Select from Repos
          </button>
          <button
            onClick={() => setMode("url")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "url" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
            Paste URL
          </button>
        </div>

        <div className="space-y-4 py-1">
          {mode === "pick" ? (
            <>
              {/* GitHub auth check */}
              {!ghLoading && !ghAuthenticated && remoteRepos.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 text-center">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                  <div>
                    <p className="text-sm font-medium">GitHub not connected</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Connect your GitHub account to browse repositories and pull requests, or use the URL tab to paste a PR link directly.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setShowAuthDialog(true)}>
                    Connect GitHub
                  </Button>
                </div>
              ) : (
              <>
              {/* Repo selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Repository</label>
                {remoteRepos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                    No remote repositories connected. Connect a GitHub repo in the Repos page, or use the URL tab.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedRepoId || ""}
                      onChange={(e) => {
                        setSelectedRepoId(e.target.value || null);
                        setSelectedPrUrl(null);
                      }}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="">Select a repository...</option>
                      {remoteRepos.map((repo: any) => (
                        <option key={repo.id} value={repo.id}>
                          {repo.fullName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>

              {/* PR list */}
              {selectedRepoId && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pull Request</label>
                  {prsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : pullRequests.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                      No open pull requests found for this repository.
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-lg border border-border/50 p-1.5">
                      {pullRequests.map((pr: any) => (
                        <button
                          key={pr.number}
                          onClick={() => setSelectedPrUrl(pr.url)}
                          className={cn(
                            "w-full text-left rounded-md p-3 transition-colors",
                            selectedPrUrl === pr.url
                              ? "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
                              : "hover:bg-muted/50 border border-transparent"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground">#{pr.number}</span>
                                <span className="text-sm font-medium truncate">{pr.title}</span>
                                {pr.draft && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">Draft</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <GitBranch className="h-3 w-3" />
                                  {pr.headBranch} &rarr; {pr.baseBranch}
                                </span>
                                {pr.author && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {pr.author}
                                  </span>
                                )}
                                {pr.changedFiles > 0 && (
                                  <span>{pr.changedFiles} files</span>
                                )}
                              </div>
                            </div>
                            {selectedPrUrl === pr.url && (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Pull Request URL</label>
              <Input
                placeholder="https://github.com/owner/repo/pull/123"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Supports GitHub, GitLab, and Bitbucket pull request URLs.
              </p>
            </div>
          )}

          {/* Agent selector — shared across both modes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Agent</label>
            <AgentSelector value={agentId} onChange={setAgentId} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || (mode === "pick" ? !selectedPrUrl : !prUrl.trim())}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <GitHubAuthDialog
      open={showAuthDialog}
      onOpenChange={setShowAuthDialog}
    />
    </>
  );
}

export function Reviews() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: () => api.reviews.list(),
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasPending = data?.some((r: any) => r.status === "pending" || r.status === "running");
      return hasPending ? 3000 : false;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { prUrl: string; agentId?: string }) => api.reviews.create(data),
    onSuccess: (result) => {
      toast.success("Review submitted successfully");
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setDialogOpen(false);
      if (result?.id) {
        navigate(`/reviews/${result.id}`);
      }
    },
    onError: () => toast.error("Failed to submit review"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.reviews.delete(id),
    onSuccess: () => {
      toast.success("Review deleted");
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setDeleteId(null);
    },
    onError: () => toast.error("Failed to delete review"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.reviews.cancel(id),
    onSuccess: () => {
      toast.success("Review cancelled");
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: () => toast.error("Failed to cancel review"),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.reviews.retry(id),
    onSuccess: () => {
      toast.success("Review restarted");
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: () => toast.error("Failed to retry review"),
  });

  const filteredReviews = useMemo(() => {
    if (!search.trim()) return reviews;
    const q = search.toLowerCase();
    return reviews.filter(
      (r: any) =>
        r.title?.toLowerCase().includes(q) ||
        r.prUrl?.toLowerCase().includes(q) ||
        r.provider?.toLowerCase().includes(q) ||
        r.owner?.toLowerCase().includes(q) ||
        r.repo?.toLowerCase().includes(q)
    );
  }, [reviews, search]);

  // Stats
  const stats = useMemo(() => {
    const total = reviews.length;
    const approved = reviews.filter((r: any) => r.verdict === "approve").length;
    const changesRequested = reviews.filter((r: any) => r.verdict === "request_changes").length;
    const pending = reviews.filter((r: any) => r.status === "pending" || r.status === "running").length;
    return { total, approved, changesRequested, pending };
  }, [reviews]);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PR Reviews</h1>
          <p className="text-muted-foreground text-sm">
            AI-powered pull request reviews
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={["reviews"]} />
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Review
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {reviews.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground font-medium">Total Reviews</p>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{stats.approved}</p>
            <p className="text-[11px] text-green-600/70 dark:text-green-400/70 font-medium">Approved</p>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{stats.changesRequested}</p>
            <p className="text-[11px] text-red-600/70 dark:text-red-400/70 font-medium">Changes Requested</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-2xl font-bold tabular-nums text-primary">{stats.pending}</p>
            <p className="text-[11px] text-primary/70 font-medium">In Progress</p>
          </div>
        </div>
      )}

      {/* Search */}
      {reviews.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reviews..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="grid gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredReviews.length === 0 && !search ? (
        <div className="rounded-xl border-2 border-dashed border-border/50 bg-card/50 py-16">
          <EmptyState
            icon={GitPullRequestArrow}
            title="No reviews yet"
            description="Submit a pull request URL to get an AI-powered code review. Supports GitHub, GitLab, and Bitbucket."
            action={
              <Button onClick={() => setDialogOpen(true)} size="lg">
                <Plus className="h-4 w-4 mr-2" />
                New Review
              </Button>
            }
          />
        </div>
      ) : filteredReviews.length === 0 && search ? (
        <div className="rounded-xl border border-border/50 bg-card py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No reviews matching "{search}"</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredReviews.map((review: any) => (
            <ReviewCard
              key={review.id}
              review={review}
              onNavigate={() => navigate(`/reviews/${review.id}`)}
              onDelete={() => setDeleteId(review.id)}
              onCancel={() => cancelMutation.mutate(review.id)}
              onRetry={() => retryMutation.mutate(review.id)}
              cancelPending={cancelMutation.isPending && cancelMutation.variables === review.id}
              retryPending={retryMutation.isPending && retryMutation.variables === review.id}
            />
          ))}
        </div>
      )}

      {/* New Review Dialog */}
      <NewReviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(prUrl, agentId) => createMutation.mutate({ prUrl, agentId })}
        isPending={createMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
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
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
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
