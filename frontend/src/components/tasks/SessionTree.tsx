import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TaskForkNode } from "@/lib/api";
import { toast } from "sonner";
import {
  GitBranch,
  GitFork,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  Plus,
  ArrowRight,
  MessageSquare,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { icon: React.ElementType; className: string; label: string }> = {
  pending: { icon: Clock, className: "text-muted-foreground", label: "Pending" },
  planning: { icon: Loader2, className: "text-amber-500 animate-spin", label: "Planning" },
  awaiting_input: { icon: MessageSquare, className: "text-amber-600", label: "Awaiting Input" },
  planned: { icon: CheckCircle2, className: "text-cyan-500", label: "Planned" },
  in_progress: { icon: Loader2, className: "text-blue-500 animate-spin", label: "In Progress" },
  completed: { icon: CheckCircle2, className: "text-green-500", label: "Completed" },
  failed: { icon: XCircle, className: "text-red-500", label: "Failed" },
  cancelled: { icon: XCircle, className: "text-muted-foreground", label: "Cancelled" },
};

interface SessionTreeProps {
  taskId: string;
  onTaskSelect?: (taskId: string) => void;
  onCompareSelect?: (taskIds: string[]) => void;
}

interface TreeNodeProps {
  node: TaskForkNode;
  currentTaskId: string;
  depth: number;
  expanded: Set<string>;
  selected: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onTaskSelect?: (taskId: string) => void;
  onFork: (taskId: string) => void;
}

function TreeNode({
  node,
  currentTaskId,
  depth,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
  onTaskSelect,
  onFork,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selected.has(node.id);
  const isCurrent = node.id === currentTaskId;
  const statusConfig = STATUS_CONFIG[node.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <TooltipProvider>
    <div className="relative">
      {/* Connector lines */}
      {depth > 0 && (
        <>
          {/* Horizontal line from parent */}
          <div
            className="absolute border-t border-border"
            style={{
              left: -16,
              top: 20,
              width: 16,
            }}
          />
          {/* Vertical line from parent */}
          <div
            className="absolute border-l border-border"
            style={{
              left: -16,
              top: 0,
              height: 20,
            }}
          />
        </>
      )}

      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer group",
          isCurrent && "bg-primary/10 border border-primary/30",
          isSelected && !isCurrent && "bg-muted/50 border border-muted-foreground/30",
          !isCurrent && !isSelected && "hover:bg-muted/30"
        )}
        onClick={() => onTaskSelect?.(node.id)}
      >
        {/* Expand/Collapse button */}
        <button
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors",
            !hasChildren && "invisible"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Selection checkbox for compare */}
        <button
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            isSelected
              ? "border-primary bg-primary"
              : "border-muted-foreground/30 hover:border-primary/50"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(node.id);
          }}
        >
          {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
        </button>

        {/* Fork icon and depth indicator */}
        <div className="flex items-center gap-1">
          {node.forkDepth > 0 ? (
            <GitFork className="h-4 w-4 text-indigo-500" />
          ) : (
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          )}
          {node.forkDepth > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono">
              L{node.forkDepth}
            </span>
          )}
        </div>

        {/* Status icon */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              <StatusIcon className={cn("h-4 w-4", statusConfig.className)} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{statusConfig.label}</TooltipContent>
        </Tooltip>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium truncate",
            isCurrent && "text-primary"
          )}>
            {node.title}
          </p>
          {node.forkReason && (
            <p className="text-[10px] text-muted-foreground truncate">
              {node.forkReason}
            </p>
          )}
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {node.enhancedPlan && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Planned
            </Badge>
          )}
          {node.pullRequestUrl && (
            <a
              href={node.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onFork(node.id);
                }}
              >
                <GitFork className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fork this task</TooltipContent>
          </Tooltip>
        </div>

        {/* Current indicator */}
        {isCurrent && (
          <Badge variant="secondary" className="text-[10px]">
            Current
          </Badge>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-6 mt-1 relative">
          {/* Vertical connector for children */}
          <div
            className="absolute border-l border-border"
            style={{
              left: -10,
              top: 0,
              height: "calc(100% - 20px)",
            }}
          />
          <div className="space-y-1">
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                currentTaskId={currentTaskId}
                depth={depth + 1}
                expanded={expanded}
                selected={selected}
                onToggleExpand={onToggleExpand}
                onToggleSelect={onToggleSelect}
                onTaskSelect={onTaskSelect}
                onFork={onFork}
              />
            ))}
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

export function SessionTree({ taskId, onTaskSelect, onCompareSelect }: SessionTreeProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set([taskId]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkingTaskId, setForkingTaskId] = useState<string | null>(null);
  const [forkTitle, setForkTitle] = useState("");
  const [forkReason, setForkReason] = useState("");
  const [startPlanning, setStartPlanning] = useState(false);

  const { data: treeData, isLoading } = useQuery({
    queryKey: ["task-fork-tree", taskId],
    queryFn: () => api.tasks.getForkTree(taskId),
  });

  const forkMutation = useMutation({
    mutationFn: (params: { taskId: string; reason?: string; title?: string; startPlanning?: boolean }) =>
      api.tasks.fork(params.taskId, {
        reason: params.reason,
        title: params.title,
        startPlanning: params.startPlanning,
      }),
    onSuccess: (data) => {
      toast.success("Task forked successfully");
      queryClient.invalidateQueries({ queryKey: ["task-fork-tree"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setForkDialogOpen(false);
      setForkTitle("");
      setForkReason("");
      setStartPlanning(false);
      if (onTaskSelect) {
        onTaskSelect(data.id);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to fork task");
    },
  });

  const handleToggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 4) {
          toast.error("Maximum 4 tasks can be compared at once");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleFork = (id: string) => {
    setForkingTaskId(id);
    setForkDialogOpen(true);
  };

  const handleConfirmFork = () => {
    if (forkingTaskId) {
      forkMutation.mutate({
        taskId: forkingTaskId,
        reason: forkReason || undefined,
        title: forkTitle || undefined,
        startPlanning,
      });
    }
  };

  const handleCompare = () => {
    if (selected.size >= 2 && onCompareSelect) {
      onCompareSelect(Array.from(selected));
    }
  };

  // Expand all nodes on the path to current task
  const expandPathToTask = () => {
    if (!treeData?.tree) return;

    const findPath = (node: TaskForkNode, targetId: string, path: string[] = []): string[] | null => {
      if (node.id === targetId) return path;
      for (const child of node.children) {
        const result = findPath(child, targetId, [...path, node.id]);
        if (result) return result;
      }
      return null;
    };

    const path = findPath(treeData.tree, taskId, []);
    if (path) {
      setExpanded(new Set([...expanded, ...path, taskId]));
    }
  };

  // Auto-expand path to current task on load
  useState(() => {
    if (treeData?.tree) {
      expandPathToTask();
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!treeData?.tree) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No fork tree available
        </CardContent>
      </Card>
    );
  }

  const hasMultipleTasks = treeData.tree.children.length > 0 || treeData.tree.forkDepth > 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-indigo-500" />
              <CardTitle className="text-base">Session Tree</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {selected.size >= 2 && (
                <Button size="sm" variant="outline" onClick={handleCompare}>
                  <Eye className="h-4 w-4 mr-1" />
                  Compare ({selected.size})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleFork(taskId)}
              >
                <GitFork className="h-4 w-4 mr-1" />
                Fork Current
              </Button>
            </div>
          </div>
          <CardDescription>
            {hasMultipleTasks
              ? "Explore different approaches by forking tasks. Select multiple to compare."
              : "Fork this task to explore alternative approaches."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <TreeNode
              node={treeData.tree}
              currentTaskId={treeData.currentTaskId}
              depth={0}
              expanded={expanded}
              selected={selected}
              onToggleExpand={handleToggleExpand}
              onToggleSelect={handleToggleSelect}
              onTaskSelect={onTaskSelect}
              onFork={handleFork}
            />
          </div>

          {selected.size > 0 && (
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {selected.size} task{selected.size > 1 ? "s" : ""} selected
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fork Dialog */}
      <Dialog open={forkDialogOpen} onOpenChange={setForkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitFork className="h-5 w-5" />
              Fork Task
            </DialogTitle>
            <DialogDescription>
              Create a new branch to explore an alternative approach. The forked task
              will inherit the current planning state.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fork-title">Title (optional)</Label>
              <Input
                id="fork-title"
                placeholder="Leave empty to auto-generate"
                value={forkTitle}
                onChange={(e) => setForkTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fork-reason">Reason for Fork</Label>
              <Textarea
                id="fork-reason"
                placeholder="What alternative approach are you exploring?"
                value={forkReason}
                onChange={(e) => setForkReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="start-planning"
                checked={startPlanning}
                onCheckedChange={setStartPlanning}
              />
              <Label htmlFor="start-planning" className="cursor-pointer">
                Start planning immediately
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setForkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFork}
              disabled={forkMutation.isPending}
            >
              {forkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Forking...
                </>
              ) : (
                <>
                  <GitFork className="h-4 w-4 mr-2" />
                  Create Fork
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
