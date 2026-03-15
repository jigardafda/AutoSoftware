import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  ExternalLink,
  Monitor,
  Loader2,
  GitBranch,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Maximize2,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { InlineWorkspaceChat } from "@/components/workspace/InlineWorkspaceChat";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-slate-500" },
  planning: { label: "Planning", color: "bg-amber-500" },
  awaiting_input: { label: "Awaiting Input", color: "bg-amber-600" },
  planned: { label: "Planned", color: "bg-cyan-500" },
  in_progress: { label: "In Progress", color: "bg-blue-500" },
  completed: { label: "Completed", color: "bg-green-500" },
  partial_success: { label: "Partial", color: "bg-yellow-500" },
  failed: { label: "Failed", color: "bg-red-500" },
  cancelled: { label: "Cancelled", color: "bg-gray-400" },
};

const TYPE_COLOR: Record<string, string> = {
  improvement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bugfix: "bg-red-500/10 text-red-500 border-red-500/20",
  feature: "bg-green-500/10 text-green-500 border-green-500/20",
  refactor: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  security: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-slate-400",
};

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

interface TaskDetailPanelProps {
  task: any;
  onClose: () => void;
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;

  // Fetch workspaces for this task
  const { data: workspaces = [], isLoading: loadingWorkspaces } = useQuery({
    queryKey: ["task-workspaces", task.id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${task.id}/workspaces`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || data.workspaces || [];
    },
    staleTime: 10_000,
  });

  // Create workspace mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: () => api.tasks.openWorkspace(task.id),
    onSuccess: (res: any) => {
      const ws = res?.workspace || res?.data?.workspace || res;
      queryClient.invalidateQueries({ queryKey: ["task-workspaces", task.id] });
      setActiveWorkspaceId(ws.id);
    },
  });

  // If viewing a workspace chat, show the inline chat
  if (activeWorkspaceId) {
    return (
      <div className="flex flex-col h-full">
        {/* Workspace chat header */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-1.5 min-w-0 text-sm">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setActiveWorkspaceId(null)}
              title="Back to task"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-muted-foreground truncate max-w-[100px]">
              {task.title}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">Workspace</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Open full workspace"
              onClick={() => navigate(`/workspaces/${activeWorkspaceId}`)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Full workspace chat */}
        <InlineWorkspaceChat
          workspaceId={activeWorkspaceId}
          task={task}
          className="flex-1 min-h-0"
        />
      </div>
    );
  }

  // Task detail view
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{task.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="View full details"
            onClick={() => navigate(`/tasks/${task.id}`)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Status, priority, type */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", statusCfg.color)} />
              {statusCfg.label}
            </Badge>
            {task.priority && (
              <Badge variant="outline" className="gap-1.5 text-xs">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    PRIORITY_DOT[task.priority] || "bg-slate-400"
                  )}
                />
                <span className="capitalize">{task.priority}</span>
              </Badge>
            )}
            {task.type && (
              <Badge
                variant="outline"
                className={cn("text-xs", TYPE_COLOR[task.type])}
              >
                {task.type}
              </Badge>
            )}
          </div>
          {(task.repositoryName || task.repository?.fullName) && (
            <p className="text-xs text-muted-foreground mt-2">
              {task.repositoryName || task.repository?.fullName}
            </p>
          )}
          {task.targetBranch && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <GitBranch className="h-3 w-3" />
              {task.targetBranch}
            </div>
          )}
        </div>

        {/* Title & Description */}
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">{task.title}</h3>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-6">
              {task.description}
            </p>
          )}
        </div>

        {/* Workspaces section */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Workspaces
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => createWorkspaceMutation.mutate()}
              disabled={createWorkspaceMutation.isPending}
            >
              {createWorkspaceMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Monitor className="h-3 w-3" />
              )}
            </Button>
          </div>

          {loadingWorkspaces ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : workspaces.length === 0 ? (
            <div className="py-3">
              <p className="text-xs text-muted-foreground mb-2">
                No workspaces yet
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={() => createWorkspaceMutation.mutate()}
                disabled={createWorkspaceMutation.isPending}
              >
                {createWorkspaceMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Monitor className="h-3.5 w-3.5 mr-1.5" />
                )}
                Open Workspace
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {workspaces.map((ws: any) => {
                const wsStatus = ws.status || "active";
                const isActive = wsStatus === "active";
                return (
                  <button
                    key={ws.id}
                    className={cn(
                      "w-full text-left rounded-lg border p-2.5 transition-all",
                      "hover:border-primary/30 hover:bg-primary/5",
                      "cursor-pointer"
                    )}
                    onClick={() => setActiveWorkspaceId(ws.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant={isActive ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0 h-[18px] shrink-0"
                        >
                          {isActive ? "Active" : wsStatus}
                        </Badge>
                        <span className="text-xs font-medium truncate">
                          {ws.name || "Workspace"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span>{relativeTime(ws.updatedAt || ws.createdAt)}</span>
                      {ws.worktreeBranch && (
                        <span className="flex items-center gap-0.5 truncate max-w-[120px]">
                          <GitBranch className="h-2.5 w-2.5" />
                          {ws.worktreeBranch}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1 text-xs"
                onClick={() => createWorkspaceMutation.mutate()}
                disabled={createWorkspaceMutation.isPending}
              >
                {createWorkspaceMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Monitor className="h-3 w-3 mr-1" />
                )}
                New Workspace
              </Button>
            </div>
          )}
        </div>

        {/* Additional info */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Created {relativeTime(task.createdAt)}
            </span>
            {task.pullRequestUrl && (
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                PR
              </a>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3 text-xs"
            onClick={() => navigate(`/tasks/${task.id}`)}
          >
            <ExternalLink className="h-3 w-3 mr-1.5" />
            View Full Details
          </Button>
        </div>
      </div>
    </div>
  );
}
