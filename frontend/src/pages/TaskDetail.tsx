import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  GitCommit,
} from "lucide-react";
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
        <Skeleton className="h-8 w-96" />
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

// --- Main Component ---

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "in_progress" ? 3000 : false,
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
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => navigate("/tasks")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tasks
      </Button>

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
        </div>

        {/* Timestamps */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Created {relativeTime(task.createdAt)}
          </span>
          {task.completedAt && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed {relativeTime(task.completedAt)}
            </span>
          )}
        </div>

        {/* PR button */}
        {task.pullRequestUrl && (
          <div>
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
          </div>
        )}
      </div>

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
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agent-log">Agent Log</TabsTrigger>
          <TabsTrigger value="pull-request">Pull Request</TabsTrigger>
          <TabsTrigger value="commits">Commits</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Description Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {task.description || "No description provided."}
              </p>
            </CardContent>
          </Card>

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
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {metadata.resultSummary}
                </p>
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
                    {task.source === "auto_scan" ? "Auto-generated" : "Manual"}
                  </dd>
                </div>
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

        {/* Agent Log Tab */}
        <TabsContent value="agent-log">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Agent Log</CardTitle>
            </CardHeader>
            <CardContent>
              {metadata.log ? (
                <pre className="font-mono text-xs bg-muted rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {metadata.log}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No agent log available.
                </p>
              )}
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  No commits yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
