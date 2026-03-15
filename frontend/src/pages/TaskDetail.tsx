import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  GitCommit,
  GitBranch,
  GitFork,
  Trash2,
  ClipboardList,
  FileCode2,
  ScanSearch,
  Timer,
  DollarSign,
  Activity,
  Ban,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Download,
  Copy,
  ChevronRight,
  ChevronDown,
  Monitor,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { SessionTree } from "@/components/tasks/SessionTree";
import { PlanComparison } from "@/components/tasks/PlanComparison";
import { LinkedText } from "@/components/LinkedText";
import { ExternalSourceBadge } from "@/components/integrations/ExternalSourceBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/ui/markdown";
import { BranchSelect } from "@/components/BranchSelect";
import { RefreshButton } from "@/components/RefreshButton";
import { ViewerBadges } from "@/components/ViewerBadges";
import { useTaskSubscription } from "@/lib/websocket";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MemorySuggestions } from "@/components/memory";

// --- Helpers ---

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDuration(startStr: string, endStr: string): string {
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diffMs = end - start;

  if (diffMs < 1000) return "<1s";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.0001) return cost > 0 ? "<$0.0001" : "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

const statusConfig: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    className: "bg-muted text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-500/15 text-blue-500 border-blue-500/20 animate-pulse",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "Completed",
    className: "bg-green-500/15 text-green-500 border-green-500/20",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/15 text-red-500 border-red-500/20",
    icon: <XCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
    icon: <XCircle className="h-3 w-3" />,
  },
  planning: {
    label: "Planning",
    className: "bg-amber-500/15 text-amber-500 border-amber-500/20 animate-pulse",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  awaiting_input: {
    label: "Awaiting Input",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/20",
    icon: <Clock className="h-3 w-3" />,
  },
  planned: {
    label: "Planned",
    className: "bg-cyan-500/15 text-cyan-500 border-cyan-500/20",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: {
    label: "Medium",
    className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20",
  },
  high: {
    label: "High",
    className: "bg-orange-500/15 text-orange-500 border-orange-500/20",
  },
  critical: {
    label: "Critical",
    className: "bg-red-500/15 text-red-500 border-red-500/20",
  },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  improvement: {
    label: "Improvement",
    className: "bg-blue-500/15 text-blue-500 border-blue-500/20",
  },
  bugfix: {
    label: "Bugfix",
    className: "bg-red-500/15 text-red-500 border-red-500/20",
  },
  feature: {
    label: "Feature",
    className: "bg-green-500/15 text-green-500 border-green-500/20",
  },
  refactor: {
    label: "Refactor",
    className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20",
  },
  security: {
    label: "Security",
    className: "bg-purple-500/15 text-purple-500 border-purple-500/20",
  },
};

// --- Loading Skeleton ---

function TaskDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-full max-w-96" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// --- Artifact Card Component ---

function ArtifactCard({ artifact }: {
  artifact: {
    id: string;
    type: string;
    name: string;
    content: string;
    language?: string;
    createdAt: string;
  }
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const typeBadgeColors: Record<string, string> = {
    markdown: "bg-blue-500/10 text-blue-500",
    code: "bg-green-500/10 text-green-500",
    html: "bg-orange-500/10 text-orange-500",
    react: "bg-cyan-500/10 text-cyan-500",
    json: "bg-yellow-500/10 text-yellow-500",
    mermaid: "bg-purple-500/10 text-purple-500",
    svg: "bg-pink-500/10 text-pink-500",
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${artifact.name}`);
  };

  const previewContent = artifact.content.length > 500
    ? artifact.content.slice(0, 500) + "..."
    : artifact.content;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4" />
          <div>
            <p className="font-medium text-sm">{artifact.name}</p>
            <p className="text-xs text-muted-foreground">
              {relativeTime(artifact.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={cn("text-xs", typeBadgeColors[artifact.type] || "")}
          >
            {artifact.type}
            {artifact.language && ` · ${artifact.language}`}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 border-t bg-background">
          {artifact.type === "markdown" ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown>{artifact.content}</Markdown>
            </div>
          ) : (
            <pre className="text-xs bg-muted/50 p-4 rounded-lg overflow-x-auto max-h-[500px]">
              <code className={artifact.language ? `language-${artifact.language}` : ""}>
                {artifact.content}
              </code>
            </pre>
          )}
        </div>
      )}

      {!isExpanded && artifact.content && (
        <div className="p-3 border-t text-xs text-muted-foreground">
          <pre className="truncate">{previewContent}</pre>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useTaskSubscription(id!);

  const deleteMutation = useMutation({
    mutationFn: () => api.tasks.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
      navigate("/tasks");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.tasks.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task cancelled");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const workspaceMutation = useMutation({
    mutationFn: () => api.tasks.openWorkspace(id!),
    onSuccess: (data) => {
      if (data.created) {
        toast.success("Workspace created");
      }
      navigate(`/workspaces/${data.workspace.id}`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to open workspace"),
  });

  const updateBranchMutation = useMutation({
    mutationFn: (targetBranch: string | null) => api.tasks.update(id!, { targetBranch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Branch updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // AI feedback state and mutation
  const [taskFeedback, setTaskFeedback] = useState<"positive" | "negative" | null>(null);
  const feedbackMutation = useMutation({
    mutationFn: (feedbackType: "thumbs_up" | "thumbs_down") =>
      api.aiMetrics.recordFeedback({
        entityType: "task",
        entityId: id!,
        feedbackType,
      }),
    onSuccess: (_, feedbackType) => {
      setTaskFeedback(feedbackType === "thumbs_up" ? "positive" : "negative");
      toast.success("Thanks for your feedback!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id!),
    enabled: !!id,
  });

  const { data: branches } = useQuery({
    queryKey: ["repo-branches", task?.repositoryId],
    queryFn: () => api.repos.branches(task!.repositoryId),
    enabled: !!task?.repositoryId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <TaskDetailSkeleton />;
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">Task not found</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => navigate("/tasks")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Tasks
        </Button>
      </div>
    );
  }

  const metadata = (task.metadata || {}) as Record<string, any>;
  const status = statusConfig[task.status] || statusConfig.pending;
  const priority = priorityConfig[task.priority] || priorityConfig.low;
  const type = typeConfig[task.type] || typeConfig.improvement;

  return (
    <div className="space-y-6">
      {/* Back button + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate("/tasks")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tasks
          </Button>
          <RefreshButton queryKeys={[["task", id]]} />
          <ViewerBadges resource={`task:${id}`} currentUserId={user?.id} />
        </div>
        <div className="flex items-center gap-2">
          {["pending", "planning", "in_progress", "awaiting_input", "planned"].includes(task.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Cancel
            </Button>
          )}
          <ConfirmDeleteDialog
            title="Delete task"
            description="This will permanently delete this task. This action cannot be undone."
            onConfirm={() => deleteMutation.mutate()}
            trigger={
              <Button variant="destructive" size="sm" disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            }
          />
        </div>
      </div>

      {/* Header section */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={status.className}>
            {status.icon}
            <span className="ml-1">{status.label}</span>
          </Badge>
          <Badge variant="outline" className={priority.className}>
            {priority.label}
          </Badge>
          <Badge variant="outline" className={type.className}>
            {type.label}
          </Badge>
          {task.status === "pending" ? (
            <BranchSelect
              branches={branches}
              value={task.targetBranch}
              onChange={(branch) => updateBranchMutation.mutate(branch)}
              size="sm"
              className="h-7"
            />
          ) : (
            <Badge variant="outline" className="gap-1">
              <GitBranch className="h-3 w-3" />
              {task.targetBranch || "default"}
            </Badge>
          )}
          {task.externalLink && (
            <ExternalSourceBadge externalLink={task.externalLink} />
          )}
          {task.confidenceScore != null && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                task.confidenceScore >= 8
                  ? "text-green-500 border-green-500/30"
                  : task.confidenceScore >= 6
                  ? "text-yellow-500 border-yellow-500/30"
                  : task.confidenceScore >= 4
                  ? "text-orange-500 border-orange-500/30"
                  : "text-red-500 border-red-500/30"
              )}
            >
              <Activity className="h-3 w-3" />
              Confidence: {task.confidenceScore.toFixed(1)}
            </Badge>
          )}
        </div>

        {/* Timestamps */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Created {relativeTime(task.createdAt)}
          </span>
          {task.completedAt && (
            <>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed {relativeTime(task.completedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="h-3.5 w-3.5" />
                Duration: {formatDuration(task.createdAt, task.completedAt)}
              </span>
            </>
          )}
        </div>

        {/* PR button and Feedback */}
        <div className="flex flex-wrap items-center gap-3">
          {task.pullRequestUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                View Pull Request
              </a>
            </Button>
          )}

          {(task.status === "completed" || task.status === "failed" || task.status === "partial_success") && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">Was this helpful?</span>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  taskFeedback === "positive" && "text-green-500 bg-green-500/10"
                )}
                onClick={() => feedbackMutation.mutate("thumbs_up")}
                disabled={feedbackMutation.isPending || taskFeedback !== null}
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  taskFeedback === "negative" && "text-red-500 bg-red-500/10"
                )}
                onClick={() => feedbackMutation.mutate("thumbs_down")}
                disabled={feedbackMutation.isPending || taskFeedback !== null}
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Workspace CTA */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Work on this task in a Workspace</p>
                <p className="text-sm text-muted-foreground">
                  Plan, execute, and iterate with an AI agent in a dedicated workspace environment.
                </p>
              </div>
            </div>
            <Button
              onClick={() => workspaceMutation.mutate()}
              disabled={workspaceMutation.isPending}
              size="lg"
            >
              {workspaceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Monitor className="h-4 w-4 mr-2" />
              )}
              Open in Workspace
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error alert */}
      {task.status === "failed" && metadata.error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-500 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-400">{metadata.error}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="forks" className="gap-1.5">
              <GitFork className="h-3.5 w-3.5" />
              Forks
            </TabsTrigger>
            <TabsTrigger value="pull-request">Pull Request</TabsTrigger>
            <TabsTrigger value="commits">Commits</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            {task.artifacts && task.artifacts.length > 0 && (
              <TabsTrigger value="artifacts" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Artifacts
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {task.artifacts.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Description Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {task.description ? (
                  <LinkedText text={task.description} repoId={task.repositoryId} />
                ) : (
                  "No description provided."
                )}
              </p>
            </CardContent>
          </Card>

          {/* Relevant Memories */}
          <MemorySuggestions
            projectId={task.projectId || undefined}
            repositoryId={task.repositoryId}
            taskTitle={task.title}
            taskDescription={task.description}
            taskType={task.type}
            affectedFiles={
              Array.isArray(task.affectedFiles)
                ? task.affectedFiles
                : typeof task.affectedFiles === "string"
                  ? JSON.parse(task.affectedFiles || "[]")
                  : []
            }
            onNavigateToTask={(taskId) => navigate(`/tasks/${taskId}`)}
          />

          {/* Enhanced Plan Card */}
          {task.enhancedPlan && (
            <Card className="border-cyan-500/30 bg-cyan-500/5">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-cyan-500" />
                  <span className="text-cyan-500">Implementation Plan</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Markdown>{task.enhancedPlan}</Markdown>
              </CardContent>
            </Card>
          )}

          {/* Affected Files Card */}
          {(() => {
            const files = Array.isArray(task.affectedFiles)
              ? task.affectedFiles
              : typeof task.affectedFiles === "string"
                ? JSON.parse(task.affectedFiles || "[]")
                : [];
            return files.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-muted-foreground" />
                    Affected Files
                    <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                      {files.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {files.map((file: string) => (
                      <code
                        key={file}
                        className="text-xs bg-muted px-2 py-1 rounded font-mono text-muted-foreground"
                      >
                        {file}
                      </code>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null;
          })()}

          {/* AI Summary Card */}
          {metadata.resultSummary && (
            <Card className="bg-ai/5 border-ai/20">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-ai" />
                  <span className="text-ai">AI Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Markdown>{metadata.resultSummary}</Markdown>
              </CardContent>
            </Card>
          )}

          {/* Scan Origin Card */}
          {task.scanResult && (
            <Card className="border-indigo-500/30 bg-indigo-500/5">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ScanSearch className="h-4 w-4 text-indigo-500" />
                  <span className="text-indigo-500">Originating Scan</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Scanned</dt>
                    <dd className="font-medium mt-0.5">
                      {relativeTime(task.scanResult.scannedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="mt-0.5">
                      <Badge
                        variant="outline"
                        className={
                          task.scanResult.status === "completed"
                            ? "bg-green-500/15 text-green-500 border-green-500/20"
                            : "bg-red-500/15 text-red-500 border-red-500/20"
                        }
                      >
                        {task.scanResult.status === "completed" ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {task.scanResult.status}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tasks Created</dt>
                    <dd className="font-medium mt-0.5">{task.scanResult.tasksCreated}</dd>
                  </div>
                  {task.scanResult.summary && (
                    <div className="sm:col-span-3">
                      <dt className="text-muted-foreground">Summary</dt>
                      <dd className="text-muted-foreground mt-0.5">{task.scanResult.summary}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Metadata Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium mt-0.5">
                    {task.source === "external_import" ? "External Import" : task.source === "auto_scan" ? "Auto-generated" : "Manual"}
                  </dd>
                </div>
                {task.externalLink && (
                  <div>
                    <dt className="text-muted-foreground">External Source</dt>
                    <dd className="mt-0.5">
                      <ExternalSourceBadge externalLink={task.externalLink} />
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Repository</dt>
                  <dd className="font-medium mt-0.5">{task.repositoryName}</dd>
                </div>
                {metadata.agentSessionId && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Agent Session ID</dt>
                    <dd className="font-mono text-xs mt-0.5">
                      {metadata.agentSessionId}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-3.5 w-3.5" />
                  <span className="text-xs">Input Tokens</span>
                </div>
                <p className="text-2xl font-semibold">{formatTokens(task.inputTokens || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-3.5 w-3.5" />
                  <span className="text-xs">Output Tokens</span>
                </div>
                <p className="text-2xl font-semibold">{formatTokens(task.outputTokens || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs">Estimated Cost</span>
                </div>
                <p className="text-2xl font-semibold text-amber-500">{formatCost(task.estimatedCostUsd || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Timer className="h-3.5 w-3.5" />
                  <span className="text-xs">Total Duration</span>
                </div>
                <p className="text-2xl font-semibold">
                  {task.completedAt
                    ? formatDuration(task.createdAt, task.completedAt)
                    : "--"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Technical Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Task ID</dt>
                  <dd className="font-mono text-xs mt-0.5">{task.id}</dd>
                </div>
                {metadata.agentSessionId && (
                  <div>
                    <dt className="text-muted-foreground">Agent Session ID</dt>
                    <dd className="font-mono text-xs mt-0.5">{metadata.agentSessionId}</dd>
                  </div>
                )}
                {metadata.branch && (
                  <div>
                    <dt className="text-muted-foreground">Branch</dt>
                    <dd className="font-mono text-xs mt-0.5">{metadata.branch}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="mt-0.5">{new Date(task.createdAt).toLocaleString()}</dd>
                </div>
                {task.completedAt && (
                  <div>
                    <dt className="text-muted-foreground">Completed</dt>
                    <dd className="mt-0.5">{new Date(task.completedAt).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pull Request Tab */}
        <TabsContent value="pull-request">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pull Request</CardTitle>
            </CardHeader>
            <CardContent>
              {task.pullRequestUrl ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <PullRequestStatusBadge
                      status={task.pullRequestStatus}
                    />
                    <a
                      href={task.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {task.pullRequestUrl}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {metadata.diffStats && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-500 font-medium">
                        +{metadata.diffStats.additions ?? 0}
                      </span>
                      <span className="text-red-500 font-medium">
                        -{metadata.diffStats.deletions ?? 0}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pull request created yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commits Tab */}
        <TabsContent value="commits">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <GitCommit className="h-4 w-4" />
                Commits
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metadata.commits && metadata.commits.length > 0 ? (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Hash</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metadata.commits.map(
                      (commit: { hash: string; message: string }, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {commit.hash.slice(0, 7)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {commit.message}
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No commits yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forks Tab */}
        <TabsContent value="forks" className="space-y-4">
          <SessionTreeWithComparison taskId={id!} />
        </TabsContent>

        {/* Artifacts Tab */}
        {task.artifacts && task.artifacts.length > 0 && (
          <TabsContent value="artifacts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Attached Artifacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {task.artifacts.map((artifact: {
                    id: string;
                    type: string;
                    name: string;
                    content: string;
                    language?: string;
                    createdAt: string;
                  }) => (
                    <ArtifactCard key={artifact.id} artifact={artifact} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// --- Session Tree with Comparison ---
function SessionTreeWithComparison({ taskId }: { taskId: string }) {
  const [compareTaskIds, setCompareTaskIds] = useState<string[] | null>(null);
  const navigate = useNavigate();

  const handleTaskSelect = (selectedId: string) => {
    navigate(`/tasks/${selectedId}`);
  };

  const handleCompareSelect = (taskIds: string[]) => {
    setCompareTaskIds(taskIds);
  };

  return (
    <div className="space-y-4">
      <SessionTree
        taskId={taskId}
        onTaskSelect={handleTaskSelect}
        onCompareSelect={handleCompareSelect}
      />

      {compareTaskIds && compareTaskIds.length >= 2 && (
        <PlanComparison
          taskIds={compareTaskIds}
          onClose={() => setCompareTaskIds(null)}
          onTaskSelect={handleTaskSelect}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

function PullRequestStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        Unknown
      </Badge>
    );
  }

  const configs: Record<string, { label: string; className: string }> = {
    open: {
      label: "Open",
      className: "bg-green-500/15 text-green-500 border-green-500/20",
    },
    merged: {
      label: "Merged",
      className: "bg-purple-500/15 text-purple-500 border-purple-500/20",
    },
    closed: {
      label: "Closed",
      className: "bg-red-500/15 text-red-500 border-red-500/20",
    },
  };

  const config = configs[status] || {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
