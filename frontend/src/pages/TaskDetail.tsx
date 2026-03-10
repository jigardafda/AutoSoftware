import { useState, useEffect, useRef, useMemo } from "react";
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
  Trash2,
  MessageSquare,
  ClipboardList,
  FileCode2,
  BrainCircuit,
  ScanSearch,
  ChevronRight,
  ChevronDown,
  Wrench,
  Zap,
  FileSearch,
  Terminal,
  Globe,
  PenLine,
  RotateCcw,
  Timer,
  DollarSign,
  Activity,
  Ban,
  Play,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PlanningQuestionsCard } from "@/components/tasks/PlanningQuestionsCard";
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
import { cn } from "@/lib/utils";

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

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

// --- Log Entry ---

interface LogEntry {
  id: string;
  phase: string;
  level: string;
  message: string;
  metadata: any;
  createdAt: string;
}

// Tool icons mapping
const TOOL_ICONS: Record<string, React.ElementType> = {
  Read: FileSearch,
  Glob: FileSearch,
  Grep: FileSearch,
  Bash: Terminal,
  Edit: PenLine,
  Write: PenLine,
  WebSearch: Globe,
  WebFetch: Globe,
  Agent: BrainCircuit,
};

// Extract tool name from message like "Using tool: Read"
function extractToolName(message: string): string | null {
  const match = message.match(/Using tool:\s*(\w+)/i);
  return match ? match[1] : null;
}

// Group logs by phase and create structured data
interface LogGroup {
  phase: string;
  phaseLabel: string;
  status: "complete" | "in_progress" | "error";
  logs: LogEntry[];
  tools: string[];
  startTime: string;
  endTime: string;
}

function groupLogsByPhase(logs: LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = [];
  let currentGroup: LogGroup | null = null;

  for (const log of logs) {
    const phaseLabel = log.phase === "plan" ? "Planning" : "Executing";

    if (!currentGroup || currentGroup.phase !== log.phase) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        phase: log.phase,
        phaseLabel,
        status: "in_progress",
        logs: [],
        tools: [],
        startTime: log.createdAt,
        endTime: log.createdAt,
      };
    }

    currentGroup.logs.push(log);
    currentGroup.endTime = log.createdAt;

    // Track tools used
    if (log.level === "tool") {
      const toolName = extractToolName(log.message);
      if (toolName && !currentGroup.tools.includes(toolName)) {
        currentGroup.tools.push(toolName);
      }
    }

    // Update status based on log level
    if (log.level === "success") {
      currentGroup.status = "complete";
    } else if (log.level === "error") {
      currentGroup.status = "error";
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

// Format tool input for display
function formatToolInput(metadata: any): string | null {
  if (!metadata?.input) return null;
  const input = metadata.input;

  // Read/Edit/Write - show file path
  if (input.file_path) return input.file_path;

  // Grep - show pattern and path (more specific, check before pattern-only)
  if (input.pattern && input.path) return `"${input.pattern}" in ${input.path}`;

  // Glob - show pattern only
  if (input.pattern) return input.pattern;

  // Bash - show command (truncated)
  if (input.command) {
    const cmd = input.command.length > 60 ? input.command.slice(0, 60) + "..." : input.command;
    return cmd;
  }

  // Task/Agent - show description or prompt
  if (input.description) return input.description;
  if (input.prompt) {
    const prompt = input.prompt.length > 60 ? input.prompt.slice(0, 60) + "..." : input.prompt;
    return prompt;
  }

  return null;
}

// Render a single log line
function LogMessage({ log, showTime = false }: { log: LogEntry; showTime?: boolean }) {
  const toolName = log.level === "tool" ? extractToolName(log.message) : null;

  let icon: React.ReactNode = null;
  let textClass = "text-muted-foreground";
  let bgClass = "";

  switch (log.level) {
    case "step":
      icon = <ChevronRight className="h-3.5 w-3.5 shrink-0 text-foreground" />;
      textClass = "text-foreground font-medium";
      break;
    case "tool":
      const ToolIcon = toolName ? (TOOL_ICONS[toolName] || Wrench) : Wrench;
      icon = <ToolIcon className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
      textClass = "text-blue-500";
      break;
    case "error":
      icon = <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
      textClass = "text-red-500";
      bgClass = "bg-red-500/5 border-l-2 border-red-500 pl-3 -ml-3";
      break;
    case "success":
      icon = <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />;
      textClass = "text-green-500 font-medium";
      bgClass = "bg-green-500/5 border-l-2 border-green-500 pl-3 -ml-3";
      break;
    case "info":
    default:
      // For thinking/info messages, dim them
      textClass = "text-muted-foreground/70";
      break;
  }

  // Format message based on type
  let displayMessage = log.message;

  // For tool calls, show what the tool is doing
  if (log.level === "tool" && toolName) {
    const toolInput = formatToolInput(log.metadata);
    if (toolInput) {
      displayMessage = `${toolName}: ${toolInput}`;
    } else {
      displayMessage = toolName;
    }
  }

  // Truncate long messages (especially JSON)
  if (displayMessage.length > 200 && log.level === "info") {
    displayMessage = displayMessage.slice(0, 200) + "...";
  }

  return (
    <div className={cn("flex items-start gap-2 py-1.5 text-sm", bgClass)}>
      {icon && <span className="mt-0.5">{icon}</span>}
      <span className={cn(textClass, "break-all")}>{displayMessage}</span>
      {showTime && (
        <span className="text-xs text-muted-foreground/40 ml-auto shrink-0 whitespace-nowrap">
          {formatTimestamp(log.createdAt)}
        </span>
      )}
    </div>
  );
}

// Tool pills component
function ToolPills({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tools.map((tool) => {
        const Icon = TOOL_ICONS[tool] || Wrench;
        return (
          <span
            key={tool}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs"
          >
            <Icon className="h-3 w-3" />
            {tool}
          </span>
        );
      })}
    </div>
  );
}

// Phase section component
function PhaseSection({
  group,
  isExpanded,
  onToggle,
}: {
  group: LogGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusIcon = {
    complete: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    in_progress: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
  }[group.status];

  const statusBg = {
    complete: "bg-green-500/10 border-green-500/20",
    in_progress: "bg-blue-500/10 border-blue-500/20",
    error: "bg-red-500/10 border-red-500/20",
  }[group.status];

  const phaseIcon = group.phase === "plan"
    ? <ClipboardList className="h-4 w-4" />
    : <Zap className="h-4 w-4" />;

  // Get last meaningful message for collapsed preview
  const lastMessage = [...group.logs].reverse().find(l => l.level === "step" || l.level === "success" || l.level === "error");

  // Calculate duration
  const duration = formatDuration(group.startTime, group.endTime);

  return (
    <div className={cn("border rounded-lg", statusBg)}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
      >
        <span className="text-muted-foreground">{phaseIcon}</span>
        <span className="font-medium">{group.phaseLabel}</span>
        {group.tools.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {group.tools.length} tool{group.tools.length > 1 ? "s" : ""} used
          </span>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Timer className="h-3 w-3" />
          {duration}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {statusIcon}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>

      {/* Collapsed preview */}
      {!isExpanded && lastMessage && (
        <div className="px-3 pb-3 -mt-1">
          <p className="text-sm text-muted-foreground truncate pl-7">
            {lastMessage.message}
          </p>
          <ToolPills tools={group.tools} />
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          <ToolPills tools={group.tools} />
          <div className="mt-3 space-y-0.5 pl-2 border-l-2 border-muted ml-1">
            {group.logs.map((log) => (
              <LogMessage key={log.id} log={log} showTime />
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
    icon: <MessageSquare className="h-3 w-3" />,
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

// --- Main Component ---

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.tasks.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
      navigate("/tasks");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const planMutation = useMutation({
    mutationFn: () => api.tasks.startPlanning(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Planning started");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const executeMutation = useMutation({
    mutationFn: () => api.tasks.execute(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Execution started");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const retryMutation = useMutation({
    mutationFn: () => api.tasks.retry(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      setLogs([]); // Clear old logs
      setLastLogTime(null);
      toast.success("Task queued for retry");
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

  const updateBranchMutation = useMutation({
    mutationFn: (targetBranch: string | null) => api.tasks.update(id!, { targetBranch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", id] });
      toast.success("Branch updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return (s === "in_progress" || s === "planning") ? 3000 : false;
    },
  });

  // Fetch branches for branch selector
  const { data: branches } = useQuery({
    queryKey: ["repo-branches", task?.repositoryId],
    queryFn: () => api.repos.branches(task!.repositoryId),
    enabled: !!task?.repositoryId,
    staleTime: 30_000,
  });

  // Live logs state
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastLogTime, setLastLogTime] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());

  // Group logs by phase
  const logGroups = useMemo(() => groupLogsByPhase(logs), [logs]);

  // Auto-expand the last (active) phase
  useEffect(() => {
    if (logGroups.length > 0) {
      setExpandedPhases(new Set([logGroups.length - 1]));
    }
  }, [logGroups.length]);

  const isLive = task?.status === "in_progress" || task?.status === "planning";

  // Initialize logs from task data
  useEffect(() => {
    if (task?.logs && task.logs.length > 0) {
      setLogs(task.logs);
      setLastLogTime(task.logs[task.logs.length - 1].createdAt);
    }
  }, [task?.logs]);

  // Poll for new logs while in_progress or planning
  useEffect(() => {
    if (!isLive || !id) return;

    const interval = setInterval(async () => {
      try {
        const newLogs = await api.tasks.logs(id, lastLogTime || undefined);
        if (newLogs.length > 0) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const uniqueNew = newLogs.filter((l: LogEntry) => !existingIds.has(l.id));
            return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
          });
          setLastLogTime(newLogs[newLogs.length - 1].createdAt);
        }
      } catch {
        // Silently ignore poll failures
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, isLive, lastLogTime]);

  // Auto-scroll log container
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleLogScroll = () => {
    if (!logContainerRef.current) return;
    const el = logContainerRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

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
        </div>
        <div className="flex items-center gap-2">
          {["failed", "cancelled"].includes(task.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Retry
            </Button>
          )}
          {["pending", "planned"].includes(task.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => planMutation.mutate()}
              disabled={planMutation.isPending}
            >
              {planMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {task.status === "planned" ? "Re-plan" : "Start Planning"}
            </Button>
          )}
          {task.status === "planned" && (
            <Button
              variant="default"
              size="sm"
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start Execution
            </Button>
          )}
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
          {/* Branch selector - only editable before planning starts */}
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

      {/* Planning indicator */}
      {task.status === "planning" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 text-sm text-amber-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI is analyzing your task and the repository...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Planning questions form */}
      {task.status === "awaiting_input" && task.planningQuestions && (
        <PlanningQuestionsCard
          taskId={task.id}
          questions={task.planningQuestions.filter((q: any) => q.round === task.planningRound)}
          currentRound={task.planningRound}
          onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["task", id] })}
        />
      )}

      {/* Tabs - default to agent-log when task is active */}
      <Tabs defaultValue={isLive ? "agent-log" : "overview"} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agent-log" className="gap-1.5">
              Agent Log
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pull-request">Pull Request</TabsTrigger>
            <TabsTrigger value="commits">Commits</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
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

        {/* Agent Log Tab */}
        <TabsContent value="agent-log">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Agent Activity
                {isLive && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse">
                    Live
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Progress Timeline */}
              {logGroups.length > 0 && (
                <div className="flex items-center gap-2 mb-4 text-sm">
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full",
                    logGroups.some(g => g.phase === "plan")
                      ? logGroups.find(g => g.phase === "plan")?.status === "complete"
                        ? "bg-green-500/10 text-green-500"
                        : logGroups.find(g => g.phase === "plan")?.status === "error"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-blue-500/10 text-blue-500"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <ClipboardList className="h-3.5 w-3.5" />
                    Planning
                  </div>
                  <div className="h-px w-8 bg-border" />
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full",
                    logGroups.some(g => g.phase === "execute")
                      ? logGroups.find(g => g.phase === "execute")?.status === "complete"
                        ? "bg-green-500/10 text-green-500"
                        : logGroups.find(g => g.phase === "execute")?.status === "error"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-blue-500/10 text-blue-500"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Zap className="h-3.5 w-3.5" />
                    Executing
                  </div>
                  <div className="h-px w-8 bg-border" />
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full",
                    task.pullRequestUrl
                      ? "bg-green-500/10 text-green-500"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <GitCommit className="h-3.5 w-3.5" />
                    PR Created
                  </div>
                </div>
              )}

              <div
                ref={logContainerRef}
                onScroll={handleLogScroll}
                className="max-h-[500px] overflow-y-auto space-y-3"
              >
                {logGroups.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-muted/30">
                    {isLive ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                          <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <BrainCircuit className="h-6 w-6 text-blue-500" />
                          </div>
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500" />
                          </span>
                        </div>
                        <p>Agent is starting...</p>
                      </div>
                    ) : (
                      "No agent activity recorded."
                    )}
                  </div>
                ) : (
                  <>
                    {logGroups.map((group, index) => (
                      <PhaseSection
                        key={`${group.phase}-${index}`}
                        group={group}
                        isExpanded={expandedPhases.has(index)}
                        onToggle={() => {
                          setExpandedPhases((prev) => {
                            const next = new Set(prev);
                            if (next.has(index)) {
                              next.delete(index);
                            } else {
                              next.add(index);
                            }
                            return next;
                          });
                        }}
                      />
                    ))}
                    {isLive && (
                      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Agent is working...</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          {/* Cost Summary */}
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
                  {logs.length > 0
                    ? formatDuration(logs[0].createdAt, logs[logs.length - 1].createdAt)
                    : "--"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Phase Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Phase Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {logGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {logGroups.map((group, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        {group.phase === "plan" ? (
                          <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Zap className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{group.phaseLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.tools.length} tools • {group.logs.length} log entries
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm">{formatDuration(group.startTime, group.endTime)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(group.startTime)} - {formatTimestamp(group.endTime)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
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
