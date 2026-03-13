import { Fragment, useCallback, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Github,
  GitlabIcon,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  X,
  BrainCircuit,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileBrowser } from "@/components/repos/FileBrowser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, paginate } from "@/components/Pagination";
import { BranchSelect } from "@/components/BranchSelect";
import { RefreshButton } from "@/components/RefreshButton";
import { TaskKanbanBoard } from "@/components/tasks/TaskKanbanBoard";
import { TaskViewToolbar, type TaskViewMode } from "@/components/tasks/TaskViewToolbar";
import { ScanAnalysisDashboard } from "@/components/scan-analysis";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { ProjectMemoryPanel } from "@/components/memory";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return cost > 0 ? "<$0.01" : "$0.00";
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatDuration(startStr: string | null, endStr: string | null): string {
  if (!startStr || !endStr) return "-";
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

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "github":
      return <Github className="h-5 w-5" />;
    case "gitlab":
      return <GitlabIcon className="h-5 w-5 text-orange-400" />;
    default:
      return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "scanning":
      return (
        <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Scanning
        </Badge>
      );
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="secondary">Idle</Badge>;
  }
}

const STATUS_ICON: Record<string, { icon: React.ElementType; className: string }> = {
  pending: { icon: Clock, className: "text-muted-foreground" },
  in_progress: { icon: Loader2, className: "text-blue-500 animate-spin" },
  completed: { icon: CheckCircle2, className: "text-green-500" },
  failed: { icon: XCircle, className: "text-red-500" },
  cancelled: { icon: Ban, className: "text-muted-foreground" },
  planning: { icon: Loader2, className: "text-amber-500 animate-spin" },
  awaiting_input: { icon: MessageSquare, className: "text-amber-600" },
  planned: { icon: CheckCircle2, className: "text-cyan-500" },
};

const TYPE_COLOR: Record<string, string> = {
  improvement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bugfix: "bg-red-500/10 text-red-500 border-red-500/20",
  feature: "bg-green-500/10 text-green-500 border-green-500/20",
  refactor: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  security: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
const BAR_COLORS: Record<string, string> = {
  pending: "#94a3b8",
  in_progress: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

export function RepoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasksPage, setTasksPage] = useState(0);
  const [scansPage, setScansPage] = useState(0);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);
  const [scanLogs, setScanLogs] = useState<Record<string, any[]>>({});
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [repoTaskSearch, setRepoTaskSearch] = useState("");
  const [repoTaskViewMode, setRepoTaskViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("repo-tasks-view-mode") as TaskViewMode) || "list";
  });

  const handleRepoTaskViewModeChange = useCallback((mode: TaskViewMode) => {
    setRepoTaskViewMode(mode);
    localStorage.setItem("repo-tasks-view-mode", mode);
  }, []);

  // Dialog states
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanDialogBranch, setScanDialogBranch] = useState<string | null>(null);
  const [defaultBranchDialogOpen, setDefaultBranchDialogOpen] = useState(false);
  const [newDefaultBranch, setNewDefaultBranch] = useState<string | null>(null);

  const VALID_TABS = ["overview", "analysis", "files", "tasks", "scans", "usage", "memory"] as const;
  const tab = useMemo(() => {
    const t = searchParams.get("tab");
    return VALID_TABS.includes(t as any) ? t! : "overview";
  }, [searchParams]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["repo-stats", id],
    queryFn: () => api.repos.stats(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      // Auto-refresh when repo is scanning or there are queued/in_progress scans
      const isActive = data.repo?.status === "scanning" ||
        data.scans?.some((s: any) => s.status === "in_progress" || s.status === "queued");
      return isActive ? 3000 : false;
    },
  });

  // Fetch branches for scan dropdown
  const { data: branches } = useQuery({
    queryKey: ["repo-branches", id],
    queryFn: () => api.repos.branches(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const scanMutation = useMutation({
    mutationFn: (branch?: string) => api.repos.scan(id!, undefined, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      toast.success("Scan triggered");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => api.repos.update(id!, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      toast.success("Repository updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.repos.delete(id!),
    onSuccess: () => {
      toast.success("Repository deleted");
      navigate("/repos");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkPlanMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkPlan(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      setSelectedTasks(new Set());
      toast.success(`${data.planned} task(s) queued for planning`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkRetryMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkRetry(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      setSelectedTasks(new Set());
      toast.success(`${data.retried} task(s) queued for retry`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkDelete(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      setSelectedTasks(new Set());
      toast.success(`${data.deleted} task(s) deleted`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelScanMutation = useMutation({
    mutationFn: (scanId: string) => api.scans.cancel(scanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      toast.success("Scan cancelled");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateTaskBranchMutation = useMutation({
    mutationFn: ({ taskId, targetBranch }: { taskId: string; targetBranch: string | null }) =>
      api.tasks.update(taskId, { targetBranch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      toast.success("Task branch updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateDefaultBranchMutation = useMutation({
    mutationFn: (defaultBranch: string) =>
      api.repos.update(id!, { defaultBranch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
      setDefaultBranchDialogOpen(false);
      toast.success("Default branch updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleScanExpand = async (scanId: string) => {
    if (expandedScan === scanId) {
      setExpandedScan(null);
    } else {
      setExpandedScan(scanId);
      if (!scanLogs[scanId]) {
        try {
          const logs = await api.scans.logs(scanId);
          setScanLogs((prev) => ({ ...prev, [scanId]: logs }));
        } catch (err) {
          console.error("Failed to fetch scan logs:", err);
        }
      }
    }
  };

  const allTasks = stats?.tasks ?? [];
  const filteredRepoTasks = useMemo(() => {
    if (!repoTaskSearch.trim()) return allTasks;
    const q = repoTaskSearch.toLowerCase();
    return allTasks.filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.type?.toLowerCase().includes(q) ||
      t.targetBranch?.toLowerCase().includes(q)
    );
  }, [allTasks, repoTaskSearch]);

  const pagedTasks = paginate(filteredRepoTasks, tasksPage);
  const pagedScans = paginate(stats?.scans ?? [], scansPage);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Repository not found.</p>
        <Button variant="link" onClick={() => navigate("/repos")}>Back to Repositories</Button>
      </div>
    );
  }

  const { repo, tasks, scans, tasksByStatus, tasksByType, scansByStatus, usage } = stats;

  const totalTasks = tasksByStatus.reduce((s: number, g: any) => s + g.count, 0);
  const totalScans = scansByStatus.reduce((s: number, g: any) => s + g.count, 0);
  const completedScans = scansByStatus.find((g: any) => g.status === "completed")?.count || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/repos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <ProviderIcon provider={repo.provider} />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{repo.fullName}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={repo.status} />
              <button
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setNewDefaultBranch(repo.defaultBranch);
                  setDefaultBranchDialogOpen(true);
                }}
              >
                <GitBranch className="h-3 w-3" />
                {repo.defaultBranch}
                <Settings2 className="h-3 w-3 opacity-60" />
              </button>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs text-muted-foreground">
                Interval: {repo.scanInterval}min
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton queryKeys={[["repo-stats", id], ["repo-branches", id]]} />
          <Button
            size="sm"
            onClick={() => {
              setScanDialogBranch(repo.defaultBranch);
              setScanDialogOpen(true);
            }}
            disabled={scanMutation.isPending || repo.status === "scanning"}
          >
            {repo.status === "scanning" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Scan
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(!repo.isActive)}>
            {repo.isActive ? <><Pause className="h-4 w-4 mr-1" /> Pause</> : <><Play className="h-4 w-4 mr-1" /> Resume</>}
          </Button>
          <ConfirmDeleteDialog
            title="Delete repository"
            description="This will permanently delete this repository and all its data. This action cannot be undone."
            onConfirm={() => deleteMutation.mutate()}
            trigger={
              <Button size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Scan Branch Selection Dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Repository</DialogTitle>
            <DialogDescription>
              Select which branch to scan for improvements and issues.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Branch to scan</label>
            <BranchSelect
              branches={branches}
              value={scanDialogBranch}
              onChange={setScanDialogBranch}
              defaultBranchName={repo.defaultBranch}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tasks created from this scan will target the selected branch.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                scanMutation.mutate(scanDialogBranch || undefined);
                setScanDialogOpen(false);
              }}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Start Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Default Branch Settings Dialog */}
      <Dialog open={defaultBranchDialogOpen} onOpenChange={setDefaultBranchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Default Branch Settings</DialogTitle>
            <DialogDescription>
              Set the default branch for this repository. This branch will be pre-selected for scans and new tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Default branch</label>
            <BranchSelect
              branches={branches}
              value={newDefaultBranch}
              onChange={setNewDefaultBranch}
              defaultBranchName={repo.defaultBranch}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefaultBranchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newDefaultBranch) {
                  updateDefaultBranchMutation.mutate(newDefaultBranch);
                }
              }}
              disabled={updateDefaultBranchMutation.isPending || !newDefaultBranch}
            >
              {updateDefaultBranchMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Tasks</p>
            <p className="text-2xl font-semibold">{totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Scans</p>
            <p className="text-2xl font-semibold">{totalScans}</p>
            <p className="text-[10px] text-muted-foreground">{completedScans} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tokens Used</p>
            <p className="text-2xl font-semibold">{formatTokens(usage.totalInputTokens + usage.totalOutputTokens)}</p>
            <p className="text-[10px] text-muted-foreground">{formatTokens(usage.totalInputTokens)} in / {formatTokens(usage.totalOutputTokens)} out</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Estimated Cost</p>
            <p className="text-2xl font-semibold">{formatCost(usage.totalCost)}</p>
            <p className="text-[10px] text-muted-foreground">{usage.totalRequests} API calls</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analysis" className="gap-1">
            Analysis
            {stats.latestAnalysis?.codeAnalysis && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 bg-blue-500/15 text-blue-500">
                New
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({totalTasks})</TabsTrigger>
          <TabsTrigger value="scans">Scans ({totalScans})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tasks by Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tasks by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {tasksByStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet</p>
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tasksByStatus} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={80} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {tasksByStatus.map((entry: any, i: number) => (
                            <Cell key={i} fill={BAR_COLORS[entry.status] || "#94a3b8"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tasks by Type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tasks by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {tasksByType.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No tasks yet</p>
                ) : (
                  <div className="h-48 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tasksByType}
                          dataKey="count"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          stroke="var(--background)"
                          label={({ x, y, textAnchor, ...rest }: any) => (
                            <text x={x} y={y} textAnchor={textAnchor} fill="var(--foreground)" fontSize={12}>
                              {`${rest.type} (${rest.count})`}
                            </text>
                          )}
                          labelLine={false}
                        >
                          {tasksByType.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Scans</CardTitle>
            </CardHeader>
            <CardContent>
              {scans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No scans yet</p>
              ) : (
                <div className="space-y-2">
                  {scans.slice(0, 5).map((scan: any) => (
                    <div key={scan.id} className="flex items-center gap-3 text-sm">
                      {scan.status === "queued" ? (
                        <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : scan.status === "in_progress" ? (
                        <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />
                      ) : scan.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : scan.status === "cancelled" ? (
                        <Ban className="h-4 w-4 text-gray-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">{scan.summary || (scan.status === "queued" ? "Waiting to start" : scan.status === "in_progress" ? "Scanning..." : "No summary")}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{relativeTime(scan.scannedAt)}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{scan.tasksCreated} tasks</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          {stats.latestAnalysis ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Code Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    From scan completed {stats.latestAnalysis.completedAt ? new Date(stats.latestAnalysis.completedAt).toLocaleDateString() : "recently"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/scans/${stats.latestAnalysis.scanId}`)}
                >
                  View Full Scan
                </Button>
              </div>
              <ScanAnalysisDashboard
                codeAnalysis={stats.latestAnalysis.codeAnalysis}
                languageProfile={stats.latestAnalysis.languageProfile as any}
                primaryLanguage={stats.latestAnalysis.primaryLanguage}
              />
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <BrainCircuit className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Analysis Available</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Run a scan to generate code analysis including architecture patterns,
                    dependencies, dead code detection, duplications, and performance insights.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => scanMutation.mutate()}
                    disabled={scanMutation.isPending || repo?.status === "scanning"}
                  >
                    {scanMutation.isPending || repo?.status === "scanning" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Scan
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files">
          <FileBrowser repoId={id!} initialPath={searchParams.get("path") || undefined} initialLine={searchParams.get("line") ? parseInt(searchParams.get("line")!, 10) : undefined} />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-3">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No tasks found. Run a scan to generate tasks.
              </CardContent>
            </Card>
          ) : (
            <>
              <TaskViewToolbar
                search={repoTaskSearch}
                onSearchChange={setRepoTaskSearch}
                viewMode={repoTaskViewMode}
                onViewModeChange={handleRepoTaskViewModeChange}
              />

              {/* Bulk Action Bar */}
              {selectedTasks.size > 0 && repoTaskViewMode === "list" && (
                <div className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{selectedTasks.size} selected</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setSelectedTasks(new Set())}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const plannableIds = Array.from(selectedTasks).filter((id) => {
                        const task = tasks.find((t: any) => t.id === id);
                        return task && ["pending", "planned"].includes(task.status);
                      });
                      return plannableIds.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => bulkPlanMutation.mutate(plannableIds)}
                          disabled={bulkPlanMutation.isPending}
                        >
                          {bulkPlanMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BrainCircuit className="h-3.5 w-3.5" />
                          )}
                          Start Planning ({plannableIds.length})
                        </Button>
                      ) : null;
                    })()}
                    {(() => {
                      const retryableIds = Array.from(selectedTasks).filter((id) => {
                        const task = tasks.find((t: any) => t.id === id);
                        return task && ["failed", "cancelled"].includes(task.status);
                      });
                      return retryableIds.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => bulkRetryMutation.mutate(retryableIds)}
                          disabled={bulkRetryMutation.isPending}
                        >
                          {bulkRetryMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          Retry ({retryableIds.length})
                        </Button>
                      ) : null;
                    })()}
                    <ConfirmDeleteDialog
                      title="Delete selected tasks"
                      description={`This will permanently delete ${selectedTasks.size} task(s). This action cannot be undone.`}
                      onConfirm={() => bulkDeleteMutation.mutate(Array.from(selectedTasks))}
                      trigger={
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={bulkDeleteMutation.isPending}
                        >
                          {bulkDeleteMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      }
                    />
                  </div>
                </div>
              )}

              {filteredRepoTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No tasks match "{repoTaskSearch}".
                    <button
                      className="ml-1 text-primary underline underline-offset-2 hover:text-primary/80"
                      onClick={() => setRepoTaskSearch("")}
                    >
                      Clear search
                    </button>
                  </CardContent>
                </Card>
              ) : repoTaskViewMode === "kanban" ? (
                <TaskKanbanBoard
                  tasks={filteredRepoTasks}
                  onTaskClick={(task) => navigate(`/tasks/${task.id}`)}
                />
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedTasks.size === filteredRepoTasks.length && filteredRepoTasks.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedTasks(new Set(filteredRepoTasks.map((t: any) => t.id)));
                                } else {
                                  setSelectedTasks(new Set());
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead className="w-8">Status</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead className="w-24">Branch</TableHead>
                          <TableHead className="w-20">Type</TableHead>
                          <TableHead className="w-20">Priority</TableHead>
                          <TableHead className="w-16">Source</TableHead>
                          <TableHead className="w-8">PR</TableHead>
                          <TableHead className="w-20">Duration</TableHead>
                          <TableHead className="w-20 text-right">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedTasks.map((task: any) => {
                          const statusCfg = STATUS_ICON[task.status] || STATUS_ICON.pending;
                          const Icon = statusCfg.icon;
                          const isSelected = selectedTasks.has(task.id);
                          return (
                            <TableRow
                              key={task.id}
                              className={cn("cursor-pointer", isSelected && "bg-muted/50")}
                              onClick={() => navigate(`/tasks/${task.id}`)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    setSelectedTasks((prev) => {
                                      const next = new Set(prev);
                                      if (checked) {
                                        next.add(task.id);
                                      } else {
                                        next.delete(task.id);
                                      }
                                      return next;
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell><Icon className={cn("h-4 w-4", statusCfg.className)} /></TableCell>
                              <TableCell>
                                <p className="text-sm font-medium truncate max-w-[300px]">{task.title}</p>
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {task.status === "pending" ? (
                                  <BranchSelect
                                    branches={branches}
                                    value={task.targetBranch}
                                    onChange={(branch) => updateTaskBranchMutation.mutate({ taskId: task.id, targetBranch: branch })}
                                    defaultBranchName={repo.defaultBranch}
                                    size="sm"
                                    className="h-6 text-xs w-28"
                                  />
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <GitBranch className="h-3 w-3" />
                                    <span className="truncate max-w-[80px]">{task.targetBranch || "default"}</span>
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", TYPE_COLOR[task.type])}>
                                  {task.type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLOR[task.priority])}>
                                  {task.priority}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{task.source === "auto_scan" ? "Auto" : "Manual"}</span>
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                {task.pullRequestUrl ? (
                                  <a href={task.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground/40">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDuration(task.createdAt, task.completedAt)}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{relativeTime(task.createdAt)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={tasksPage} total={filteredRepoTasks.length} onPageChange={setTasksPage} />
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* Scans Tab */}
        <TabsContent value="scans" className="space-y-3">
          {scans.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No scans yet. Trigger a scan to analyze this repository.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28">Branch</TableHead>
                      <TableHead>Scanned At</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead className="hidden lg:table-cell">Summary / Error</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedScans.map((scan: any) => (
                      <Fragment key={scan.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleScanExpand(scan.id)}
                        >
                          <TableCell>
                            {expandedScan === scan.id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            {scan.status === "queued" ? (
                              <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                <Clock className="h-3 w-3 mr-1" />
                                Queued
                              </Badge>
                            ) : scan.status === "completed" ? (
                              <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            ) : scan.status === "in_progress" ? (
                              <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                In Progress
                              </Badge>
                            ) : scan.status === "cancelled" ? (
                              <Badge variant="secondary" className="bg-gray-500/10 text-gray-500 border-gray-500/20">
                                <Ban className="h-3 w-3 mr-1" />
                                Cancelled
                              </Badge>
                            ) : scan.status === "skipped" ? (
                              <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                                <Clock className="h-3 w-3 mr-1" />
                                Skipped
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20">
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <GitBranch className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate max-w-[100px]" title={scan.branch || repo?.defaultBranch || "main"}>
                                {scan.branch || repo?.defaultBranch || "main"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{relativeTime(scan.scannedAt)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDuration(scan.startedAt, scan.completedAt)}</TableCell>
                          <TableCell className="text-sm">{scan.tasksCreated ?? 0}</TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            {scan.estimatedCostUsd > 0 ? formatCost(scan.estimatedCostUsd) : "--"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[300px] hidden lg:table-cell">
                            {scan.status === "failed" ? (
                              <span className="text-red-500 whitespace-pre-wrap break-words">
                                {scan.summary || "Unknown error"}
                              </span>
                            ) : scan.status === "cancelled" ? (
                              <span className="text-yellow-500">
                                {scan.summary || "Scan cancelled by user"}
                              </span>
                            ) : scan.status === "skipped" ? (
                              <span className="text-purple-500">
                                {scan.summary || "Scan skipped (another scan active)"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground truncate block">
                                {scan.summary || "--"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {(scan.status === "in_progress" || scan.status === "queued") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => cancelScanMutation.mutate(scan.id)}
                                disabled={cancelScanMutation.isPending}
                              >
                                {cancelScanMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Ban className="h-3 w-3" />
                                )}
                                <span className="ml-1">{scan.status === "queued" ? "Cancel" : "Stop"}</span>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedScan === scan.id && (
                          <TableRow key={`${scan.id}-logs`}>
                            <TableCell colSpan={9} className="bg-muted/30 p-0">
                              <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Scan Logs</p>
                                {!scanLogs[scan.id] ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Loading logs...
                                  </div>
                                ) : scanLogs[scan.id].length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No logs available</p>
                                ) : (
                                  <div className="space-y-1 font-mono text-xs">
                                    {scanLogs[scan.id].map((log: any) => (
                                      <div
                                        key={log.id}
                                        className={cn(
                                          "flex gap-2 py-0.5",
                                          log.level === "error" && "text-red-500",
                                          log.level === "success" && "text-green-500",
                                          log.level === "step" && "text-blue-500",
                                          log.level === "info" && "text-muted-foreground"
                                        )}
                                      >
                                        <span className="text-muted-foreground/60 w-20 shrink-0">
                                          {new Date(log.createdAt).toLocaleTimeString()}
                                        </span>
                                        <span className="uppercase w-20 shrink-0 text-left">[{log.level}]</span>
                                        <span>{log.message}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={scansPage} total={scans.length} onPageChange={setScansPage} />
            </>
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-semibold">{formatCost(usage.totalCost)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-2xl font-semibold">{formatTokens(usage.totalInputTokens + usage.totalOutputTokens)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">API Requests</p>
                <p className="text-2xl font-semibold">{usage.totalRequests}</p>
              </CardContent>
            </Card>
          </div>

          {usage.daily.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Daily Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={usage.daily}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]} />
                        <Area type="monotone" dataKey="cost" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.1} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Daily Token Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={usage.daily}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
                        <Tooltip
                          formatter={(value, name) => [
                            Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}K` : value,
                            name === "inputTokens" ? "Input" : "Output"
                          ]}
                        />
                        <Legend
                          verticalAlign="top"
                          height={24}
                          formatter={(value) => value === "inputTokens" ? "Input Tokens" : "Output Tokens"}
                        />
                        <Area
                          type="monotone"
                          dataKey="inputTokens"
                          stroke="oklch(0.65 0.18 195)"
                          fill="oklch(0.65 0.18 195)"
                          fillOpacity={0.15}
                          strokeWidth={2}
                          stackId="1"
                        />
                        <Area
                          type="monotone"
                          dataKey="outputTokens"
                          stroke="oklch(0.60 0.18 280)"
                          fill="oklch(0.60 0.18 280)"
                          fillOpacity={0.15}
                          strokeWidth={2}
                          stackId="1"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No usage data tracked yet. Usage is recorded when using API keys from Settings.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Memory Tab */}
        <TabsContent value="memory" className="space-y-4">
          <ProjectMemoryPanel
            repositoryId={id}
            onNavigateToTask={(taskId) => navigate(`/tasks/${taskId}`)}
            defaultCollapsed={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
