import { useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Github,
  GitlabIcon,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  DollarSign,
  Activity,
  BarChart3,
  ExternalLink,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination, paginate } from "@/components/Pagination";
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
} from "recharts";

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

const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
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

  const VALID_TABS = ["overview", "tasks", "scans", "usage"] as const;
  const tab = useMemo(() => {
    const t = searchParams.get("tab");
    return VALID_TABS.includes(t as any) ? t! : "overview";
  }, [searchParams]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["repo-stats", id],
    queryFn: () => api.repos.stats(id!),
    enabled: !!id,
  });

  const scanMutation = useMutation({
    mutationFn: () => api.repos.scan(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repo-stats", id] });
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
  const pagedTasks = paginate(tasks, tasksPage);
  const pagedScans = paginate(scans, scansPage);

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
              <span className="text-xs text-muted-foreground">
                Branch: {repo.defaultBranch} | Interval: {repo.scanInterval}min
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending || repo.status === "scanning"}>
            {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Scan
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate(!repo.isActive)}>
            {repo.isActive ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { if (confirm("Delete this repository and all its data?")) deleteMutation.mutate(); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
          <TabsTrigger value="tasks">Tasks ({totalTasks})</TabsTrigger>
          <TabsTrigger value="scans">Scans ({totalScans})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
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
                          label={({ type, count }) => `${type} (${count})`}
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
                      {scan.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">{scan.summary || "No summary"}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{relativeTime(scan.scannedAt)}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{scan.tasksCreated} tasks</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Status</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="w-20">Type</TableHead>
                      <TableHead className="w-20">Priority</TableHead>
                      <TableHead className="w-16">Source</TableHead>
                      <TableHead className="w-8">PR</TableHead>
                      <TableHead className="w-20 text-right">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedTasks.map((task: any) => {
                      const statusCfg = STATUS_ICON[task.status] || STATUS_ICON.pending;
                      const Icon = statusCfg.icon;
                      return (
                        <TableRow key={task.id} className="cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
                          <TableCell><Icon className={cn("h-4 w-4", statusCfg.className)} /></TableCell>
                          <TableCell>
                            <p className="text-sm font-medium truncate max-w-[300px]">{task.title}</p>
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
                          <TableCell className="text-right text-xs text-muted-foreground">{relativeTime(task.createdAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={tasksPage} total={tasks.length} onPageChange={setTasksPage} />
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
                      <TableHead>Status</TableHead>
                      <TableHead>Scanned At</TableHead>
                      <TableHead>Tasks Created</TableHead>
                      <TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedScans.map((scan: any) => (
                      <TableRow key={scan.id}>
                        <TableCell>
                          {scan.status === "completed" ? (
                            <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{relativeTime(scan.scannedAt)}</TableCell>
                        <TableCell className="text-sm">{scan.tasksCreated ?? 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {scan.summary || "--"}
                        </TableCell>
                      </TableRow>
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
                      <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No usage data tracked yet. Usage is recorded when using API keys from Settings.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
