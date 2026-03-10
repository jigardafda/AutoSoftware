import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Clock,
  Github,
  GitlabIcon,
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

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "github":
      return <Github className="h-4 w-4 text-muted-foreground" />;
    case "gitlab":
      return <GitlabIcon className="h-4 w-4 text-orange-400" />;
    case "bitbucket":
      return (
        <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.31 0 .58-.24.63-.55L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.94L8.81 9.07h6.3l-1.01 5.88z" />
        </svg>
      );
    default:
      return null;
  }
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-500 border-orange-500/20" },
  critical: { label: "Critical", className: "bg-red-500/15 text-red-500 border-red-500/20" },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  improvement: { label: "Improvement", className: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  bugfix: { label: "Bugfix", className: "bg-red-500/15 text-red-500 border-red-500/20" },
  feature: { label: "Feature", className: "bg-green-500/15 text-green-500 border-green-500/20" },
  refactor: { label: "Refactor", className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20" },
  security: { label: "Security", className: "bg-purple-500/15 text-purple-500 border-purple-500/20" },
};

const taskStatusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground", icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: "In Progress", className: "bg-blue-500/15 text-blue-500 border-blue-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: "Completed", className: "bg-green-500/15 text-green-500 border-green-500/20", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-500 border-red-500/20", icon: <XCircle className="h-3 w-3" /> },
  planning: { label: "Planning", className: "bg-amber-500/15 text-amber-500 border-amber-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  awaiting_input: { label: "Awaiting Input", className: "bg-amber-500/15 text-amber-600 border-amber-500/20", icon: <Clock className="h-3 w-3" /> },
  planned: { label: "Planned", className: "bg-cyan-500/15 text-cyan-500 border-cyan-500/20", icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground", icon: <XCircle className="h-3 w-3" /> },
};

// --- Log Entry ---

interface LogEntry {
  id: string;
  level: string;
  message: string;
  metadata: any;
  createdAt: string;
}

function LogLine({ log }: { log: LogEntry }) {
  let icon: React.ReactNode = null;
  let className = "text-muted-foreground";

  switch (log.level) {
    case "step":
      icon = <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />;
      className = "text-foreground font-medium";
      break;
    case "error":
      icon = <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />;
      className = "text-red-500";
      break;
    case "success":
      icon = <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-500" />;
      className = "text-green-500";
      break;
    default:
      icon = <span className="w-3.5 shrink-0" />;
      break;
  }

  return (
    <div className="flex items-start gap-2 py-1 px-3 font-mono text-xs">
      <span className="text-muted-foreground/50 shrink-0 tabular-nums">
        {formatTimestamp(log.createdAt)}
      </span>
      {icon}
      <span className={className}>{log.message}</span>
    </div>
  );
}

// --- Loading Skeleton ---

function ScanDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-full max-w-96" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
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

export function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: scan, isLoading } = useQuery({
    queryKey: ["scan", id],
    queryFn: () => api.scans.get(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "in_progress" ? 3000 : false,
  });

  // Initialize logs from scan data
  useEffect(() => {
    if (scan?.logs && scan.logs.length > 0) {
      setLogs(scan.logs);
      setLastLogId(scan.logs[scan.logs.length - 1].id);
    }
  }, [scan?.logs]);

  // Poll for new logs while in_progress
  useEffect(() => {
    if (scan?.status !== "in_progress") return;

    const interval = setInterval(async () => {
      try {
        const newLogs = await api.scans.logs(id!, lastLogId || undefined);
        if (newLogs.length > 0) {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const uniqueNew = newLogs.filter((l: LogEntry) => !existingIds.has(l.id));
            return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
          });
          setLastLogId(newLogs[newLogs.length - 1].id);
        }
      } catch {
        // Silently ignore poll failures
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, scan?.status, lastLogId]);

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

  const isLive = scan?.status === "in_progress";

  const rawAnalysis = useMemo(() => {
    if (!scan?.analysisData) return null;
    return scan.analysisData.rawAnalysis || null;
  }, [scan?.analysisData]);

  if (isLoading) {
    return <ScanDetailSkeleton />;
  }

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">Scan not found</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => navigate("/scans")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Scans
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-muted-foreground hover:text-foreground -ml-2"
        onClick={() => navigate("/scans")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scans
      </Button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ProviderIcon provider={scan.repository?.provider} />
          <h1 className="text-2xl font-bold tracking-tight">
            {scan.repository?.fullName || "Unknown Repository"}
          </h1>
        </div>

        {/* Status badge */}
        <div className="flex flex-wrap items-center gap-2">
          {scan.status === "in_progress" ? (
            <Badge
              variant="outline"
              className="bg-blue-500/15 text-blue-500 border-blue-500/20 animate-pulse"
            >
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              In Progress
            </Badge>
          ) : scan.status === "completed" ? (
            <Badge
              variant="outline"
              className="bg-green-500/15 text-green-500 border-green-500/20"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-red-500/15 text-red-500 border-red-500/20"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Failed
            </Badge>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Scanned {relativeTime(scan.scannedAt)}
          </span>
          {scan.status !== "in_progress" && (
            <span>
              {scan.tasksCreated} task{scan.tasksCreated !== 1 ? "s" : ""} created
            </span>
          )}
        </div>
      </div>

      {/* Error card for failed scans */}
      {scan.status === "failed" && scan.summary && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-500 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-400">{scan.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="logs" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="logs" className="gap-1.5">
              Logs
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks Created
              {scan.tasks && scan.tasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {scan.tasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="raw-analysis">Raw Analysis</TabsTrigger>
          </TabsList>
        </div>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Scan Logs
                {isLive && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse">
                    Live
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={logContainerRef}
                onScroll={handleLogScroll}
                className="bg-muted/50 rounded-lg max-h-96 overflow-y-auto border"
              >
                {logs.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {isLive ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Waiting for logs...
                      </div>
                    ) : (
                      "No logs available."
                    )}
                  </div>
                ) : (
                  <div className="py-2">
                    {logs.map((log) => (
                      <LogLine key={log.id} log={log} />
                    ))}
                    {isLive && (
                      <div className="flex items-center gap-2 py-1 px-3 font-mono text-xs text-muted-foreground/50">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Scanning...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Created Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tasks Created</CardTitle>
            </CardHeader>
            <CardContent>
              {isLive ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scan in progress — tasks will appear when complete.
                </div>
              ) : !scan.tasks || scan.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No tasks were created by this scan.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-28">Type</TableHead>
                        <TableHead className="w-28">Priority</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scan.tasks.map((task: any) => {
                        const type = typeConfig[task.type] || typeConfig.improvement;
                        const priority = priorityConfig[task.priority] || priorityConfig.low;
                        const status = taskStatusConfig[task.status] || taskStatusConfig.pending;
                        return (
                          <TableRow
                            key={task.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/tasks/${task.id}`)}
                          >
                            <TableCell className="font-medium text-sm">
                              {task.title}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={type.className}>
                                {type.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={priority.className}>
                                {priority.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={status.className}>
                                {status.icon}
                                <span className="ml-1">{status.label}</span>
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Raw Analysis Tab */}
        <TabsContent value="raw-analysis">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Raw Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {scan.status === "in_progress" ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysis will be available when the scan completes.
                </div>
              ) : rawAnalysis ? (
                <pre className="font-mono text-xs bg-muted rounded-lg p-4 max-h-[600px] overflow-y-auto whitespace-pre-wrap">
                  {rawAnalysis}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No analysis data available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
