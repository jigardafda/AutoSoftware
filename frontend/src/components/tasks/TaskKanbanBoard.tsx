import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  ExternalLink,
  MessageSquare,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const STATUS_COLUMNS = [
  { key: "pending", label: "Pending", icon: Clock, color: "text-muted-foreground", accent: "border-t-slate-400" },
  { key: "planning", label: "Planning", icon: Loader2, color: "text-amber-500", accent: "border-t-amber-500", spin: true },
  { key: "awaiting_input", label: "Awaiting Input", icon: MessageSquare, color: "text-amber-600", accent: "border-t-amber-600" },
  { key: "planned", label: "Planned", icon: CheckCircle2, color: "text-cyan-500", accent: "border-t-cyan-500" },
  { key: "in_progress", label: "In Progress", icon: Loader2, color: "text-blue-500", accent: "border-t-blue-500", spin: true },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-green-500", accent: "border-t-green-500" },
  { key: "failed", label: "Failed", icon: XCircle, color: "text-red-500", accent: "border-t-red-500" },
  { key: "cancelled", label: "Cancelled", icon: Ban, color: "text-muted-foreground", accent: "border-t-gray-400" },
] as const;

const TYPE_COLOR: Record<string, string> = {
  improvement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bugfix: "bg-red-500/10 text-red-500 border-red-500/20",
  feature: "bg-green-500/10 text-green-500 border-green-500/20",
  refactor: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  security: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const PRIORITY_CONFIG: Record<string, { color: string; dot: string }> = {
  critical: { color: "text-red-500", dot: "bg-red-500" },
  high: { color: "text-orange-500", dot: "bg-orange-500" },
  medium: { color: "text-yellow-500", dot: "bg-yellow-500" },
  low: { color: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function relativeTime(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

interface TaskKanbanBoardProps {
  tasks: any[];
  onTaskClick?: (task: any) => void;
}

function KanbanCard({ task, onClick }: { task: any; onClick?: () => void }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card p-3 shadow-sm cursor-pointer",
        "hover:shadow-md hover:border-foreground/20 transition-all duration-200",
        "active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      {/* Priority indicator line */}
      <div className={cn("absolute top-0 left-3 right-3 h-0.5 rounded-b", priority.dot, "opacity-60")} />

      <div className="space-y-2.5">
        {/* Title */}
        <p className="text-sm font-medium leading-snug line-clamp-2 pr-1">
          {task.title}
        </p>

        {/* Repo name */}
        {(task.repositoryName || task.repository?.fullName) && (
          <p className="text-[11px] text-muted-foreground truncate">
            {task.repositoryName || task.repository?.fullName}
          </p>
        )}

        {/* Tags row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0 h-[18px]", TYPE_COLOR[task.type])}
          >
            {task.type}
          </Badge>
          <div className="flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
            <span className={cn("text-[10px] capitalize", priority.color)}>
              {task.priority}
            </span>
          </div>
        </div>

        {/* Bottom row: branch, PR, time */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
          <div className="flex items-center gap-2">
            {task.targetBranch && (
              <span className="flex items-center gap-0.5 truncate max-w-[100px]">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.targetBranch}</span>
              </span>
            )}
            {task.pullRequestUrl && (
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <span className="shrink-0">{relativeTime(task.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function TaskKanbanBoard({ tasks, onTaskClick }: TaskKanbanBoardProps) {
  const navigate = useNavigate();

  const columns = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const col of STATUS_COLUMNS) {
      grouped[col.key] = [];
    }
    for (const task of tasks) {
      const status = task.status || "pending";
      if (grouped[status]) {
        grouped[status].push(task);
      } else {
        grouped.pending.push(task);
      }
    }
    return grouped;
  }, [tasks]);

  const handleClick = (task: any) => {
    if (onTaskClick) {
      onTaskClick(task);
    } else {
      navigate(`/tasks/${task.id}`);
    }
  };

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-3 pb-4 min-w-max">
        {STATUS_COLUMNS.map((col) => {
          const Icon = col.icon;
          const columnTasks = columns[col.key];
          const isEmpty = columnTasks.length === 0;

          return (
            <div
              key={col.key}
              className={cn(
                "flex flex-col w-[280px] shrink-0 rounded-xl border border-border/60 bg-muted/30",
                "border-t-2",
                col.accent
              )}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    col.color,
                    col.spin && "animate-spin"
                  )}
                />
                <span className="text-sm font-medium truncate">{col.label}</span>
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] h-5 min-w-[20px] justify-center px-1.5 tabular-nums"
                >
                  {columnTasks.length}
                </Badge>
              </div>

              {/* Column body */}
              <div className={cn(
                "flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] min-h-[120px]",
                isEmpty && "flex items-center justify-center"
              )}>
                {isEmpty ? (
                  <p className="text-xs text-muted-foreground/50 select-none">
                    No tasks
                  </p>
                ) : (
                  columnTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onClick={() => handleClick(task)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
