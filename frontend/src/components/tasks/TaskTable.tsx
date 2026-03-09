import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  ExternalLink,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TaskTableProps {
  tasks: any[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onRowClick: (task: any) => void;
}

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

const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; className: string }
> = {
  pending: { icon: Clock, className: "text-muted-foreground" },
  in_progress: { icon: Loader2, className: "text-blue-500 animate-spin" },
  completed: { icon: CheckCircle2, className: "text-green-500" },
  failed: { icon: XCircle, className: "text-red-500" },
  cancelled: { icon: Ban, className: "text-muted-foreground" },
};

const TYPE_COLOR: Record<string, string> = {
  improvement:
    "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/10",
  bugfix: "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/10",
  feature:
    "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10",
  refactor:
    "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/10",
  security:
    "bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/10",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-muted hover:bg-muted",
  medium:
    "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/10",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/10",
  critical:
    "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/10",
};

function StatusIcon({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return <Icon className={cn("h-4 w-4", config.className)} />;
}

export function TaskTable({
  tasks,
  selectedIds,
  onSelect,
  onSelectAll,
  onRowClick,
}: TaskTableProps) {
  const allSelected = tasks.length > 0 && selectedIds.size === tasks.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                ref={(el) => {
                  if (el)
                    (el as unknown as HTMLInputElement).indeterminate =
                      someSelected;
                }}
                onCheckedChange={onSelectAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead className="w-10">Status</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-24">Priority</TableHead>
            <TableHead className="w-16">Source</TableHead>
            <TableHead className="w-10">PR</TableHead>
            <TableHead className="w-20 text-right">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="h-24 text-center text-muted-foreground"
              >
                No tasks found.
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => (
              <TableRow
                key={task.id}
                data-state={selectedIds.has(task.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => onRowClick(task)}
              >
                <TableCell
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Checkbox
                    checked={selectedIds.has(task.id)}
                    onCheckedChange={() => onSelect(task.id)}
                    aria-label={`Select ${task.title}`}
                  />
                </TableCell>
                <TableCell>
                  <StatusIcon status={task.status} />
                </TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {task.repositoryName || task.repository?.fullName || ""}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      TYPE_COLOR[task.type]
                    )}
                  >
                    {task.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0",
                      PRIORITY_COLOR[task.priority]
                    )}
                  >
                    {task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {task.source === "auto_scan" ? "Auto" : "Manual"}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {task.pullRequestUrl ? (
                    <a
                      href={task.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <Minus className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(task.createdAt)}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
