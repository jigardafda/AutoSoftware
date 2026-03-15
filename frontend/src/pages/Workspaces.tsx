import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus,
  Monitor,
  Bot,
  Clock,
  Circle,
  GitBranch,
  MoreVertical,
  Trash2,
  GitPullRequestArrow,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshButton } from "@/components/RefreshButton";
import { EmptyState } from "@/components/EmptyState";
import { CreateWorkspaceDialog } from "@/components/workspace/CreateWorkspaceDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Workspace {
  id: string;
  name: string;
  description?: string;
  status: "creating" | "active" | "paused" | "completed" | "error" | "stopped";
  agentId: string;
  agentName?: string;
  repoName?: string;
  worktreeBranch?: string;
  branch?: string;
  taskId?: string;
  prReviewId?: string;
  prReview?: { id: string; title: string; prUrl: string; verdict?: string; status: string } | null;
  updatedAt: string;
  createdAt: string;
}

type StatusFilter = "all" | "active" | "completed" | "stopped";

const STATUS_COLORS: Record<string, { color: string; dot: string; label: string }> = {
  creating: { color: "text-yellow-500", dot: "bg-yellow-500", label: "Creating" },
  active: { color: "text-green-500", dot: "bg-green-500", label: "Active" },
  paused: { color: "text-blue-500", dot: "bg-blue-500", label: "Paused" },
  completed: { color: "text-muted-foreground", dot: "bg-muted-foreground", label: "Completed" },
  stopped: { color: "text-red-500", dot: "bg-red-500", label: "Stopped" },
  error: { color: "text-red-500", dot: "bg-red-500", label: "Error" },
};

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  copilot: "Copilot",
  gemini: "Gemini",
  amp: "Amp",
  aider: "Aider",
};

export function Workspaces() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/workspaces/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to delete workspace");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete workspace");
    },
  });

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to load workspaces");
      return data.data ?? data.workspaces ?? [];
    },
  });

  const filteredWorkspaces = useMemo(() => {
    if (statusFilter === "all") return workspaces;
    if (statusFilter === "stopped") {
      return workspaces.filter((w) => w.status === "stopped" || w.status === "paused");
    }
    return workspaces.filter((w) => w.status === statusFilter);
  }, [workspaces, statusFilter]);

  const handleCardClick = useCallback(
    (workspace: Workspace) => {
      navigate(`/workspaces/${workspace.id}`);
    },
    [navigate]
  );

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "stopped", label: "Stopped" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Workspaces</h2>
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              {filteredWorkspaces.length !== workspaces.length
                ? `${filteredWorkspaces.length}/${workspaces.length}`
                : workspaces.length}
            </Badge>
          )}
          <RefreshButton queryKeys={[["workspaces"]]} />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0">
          <Plus className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Create Workspace</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-1">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === opt.value
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 p-5 space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No workspaces yet"
          description="Create a workspace to start an interactive AI development session."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Workspace
            </Button>
          }
        />
      ) : filteredWorkspaces.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No matching workspaces"
          description={`No ${statusFilter} workspaces found. Try a different filter.`}
          action={
            <Button size="sm" variant="outline" onClick={() => setStatusFilter("all")}>
              Show All
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredWorkspaces.map((workspace) => {
            const status = STATUS_COLORS[workspace.status] || STATUS_COLORS.stopped;
            const branchDisplay = workspace.worktreeBranch || workspace.branch;
            const agentDisplay = workspace.agentName || AGENT_LABELS[workspace.agentId] || workspace.agentId;

            return (
              <div
                key={workspace.id}
                onClick={() => handleCardClick(workspace)}
                className="group rounded-xl border border-border/50 bg-card/50 p-5 text-left transition-all duration-200 hover:border-border hover:bg-card hover:shadow-md cursor-pointer"
              >
                {/* Name + Status + Actions */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                    {workspace.name}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="secondary"
                      className={cn("gap-1.5 text-[10px]", status.color)}
                    >
                      <Circle className={cn("h-1.5 w-1.5 fill-current", status.color)} />
                      {status.label}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <button className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted">
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteMutation.mutate(workspace.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Description */}
                {workspace.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {workspace.description}
                  </p>
                )}

                {/* Agent */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <Bot className="h-3.5 w-3.5" />
                  <span>{agentDisplay}</span>
                </div>

                {/* Branch */}
                {branchDisplay && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-3">
                    <GitBranch className="h-3.5 w-3.5" />
                    <span className="font-mono truncate">{branchDisplay}</span>
                  </div>
                )}

                {/* Linked PR review or task */}
                {workspace.prReview && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-2">
                    <GitPullRequestArrow className="h-3.5 w-3.5" />
                    <span className="truncate">PR Review</span>
                    {workspace.prReview.verdict && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                        {workspace.prReview.verdict.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                )}
                {workspace.taskId && !workspace.prReview && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-2">
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span className="truncate">Linked to Task</span>
                  </div>
                )}

                {/* Last updated */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 pt-2 border-t border-border/30">
                  <Clock className="h-3 w-3" />
                  <span>
                    Updated{" "}
                    {new Date(workspace.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
