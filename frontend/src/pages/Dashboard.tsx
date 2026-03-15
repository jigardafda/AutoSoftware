import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  GitFork,
  Clock,
  CheckCircle,
  XCircle,
  ScanSearch,
  Zap,
  DollarSign,
  Target,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { TaskChart } from "@/components/dashboard/TaskChart";
import { TaskTypeChart } from "@/components/dashboard/TaskTypeChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AiInsights } from "@/components/dashboard/AiInsights";
import { RefreshButton } from "@/components/RefreshButton";
import { Skeleton } from "@/components/ui/skeleton";

function getDefaultDateRange() {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const startDate = start.toISOString().slice(0, 10);
  return { startDate, endDate };
}

function DashboardSkeleton() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card/80 p-4">
            <Skeleton className="h-3 w-12 mb-3" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card/80 p-6">
          <Skeleton className="h-[280px]" />
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6">
          <Skeleton className="h-[280px]" />
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data: repos, isLoading: reposLoading } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
  });
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });

  const dateRange = getDefaultDateRange();

  const { data: overview } = useQuery({
    queryKey: ['dashboard', 'overview', dateRange],
    queryFn: () => api.analytics.getOverview(dateRange),
  });

  const isLoading = reposLoading || tasksLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const taskList = tasks || [];
  const repoList = repos || [];

  const totalRepos = repoList.length;
  const pending = taskList.filter((t: any) => t.status === "pending").length;
  const inProgress = taskList.filter((t: any) => t.status === "in_progress").length;
  const completed = taskList.filter((t: any) => t.status === "completed").length;
  const failed = taskList.filter((t: any) => t.status === "failed").length;
  const activeScans = repoList.filter((r: any) => r.status === "scanning").length;
  const successRate = taskList.length > 0 ? (completed / taskList.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 px-4 sm:px-6 lg:px-8 py-4">
      {/* Metrics Grid - 8 cards */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Last 30 days</span>
        <RefreshButton queryKeys={["repos", "tasks", ["dashboard", "overview"]]} size="sm" variant="ghost" className="h-7 w-7 p-0" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        <MetricCard
          label="Repos"
          value={totalRepos}
          icon={GitFork}
          accentColor="#3b82f6"
        />
        <MetricCard
          label="Pending"
          value={pending}
          icon={Clock}
          accentColor="#f59e0b"
        />
        <MetricCard
          label="In Progress"
          value={inProgress}
          icon={Zap}
          accentColor="#06b6d4"
        />
        <MetricCard
          label="Completed"
          value={completed}
          icon={CheckCircle}
          accentColor="#10b981"
          sparkline={overview?.sparklines?.tasks}
        />
        <MetricCard
          label="Failed"
          value={failed}
          icon={XCircle}
          accentColor="#ef4444"
        />
        <MetricCard
          label="Scans"
          value={activeScans}
          icon={ScanSearch}
          accentColor="#8b5cf6"
        />
        <MetricCard
          label="Success"
          value={`${successRate.toFixed(0)}%`}
          icon={Target}
          accentColor="#ec4899"
        />
        <MetricCard
          label="Cost"
          value={overview ? `$${overview.totalCost.toFixed(0)}` : '$0'}
          icon={DollarSign}
          accentColor="#f59e0b"
          sparkline={overview?.sparklines?.cost}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <TaskChart tasks={taskList} />
        </div>
        <TaskTypeChart tasks={taskList} />
      </div>

      {/* Insights + Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AiInsights tasks={taskList} repos={repoList} />
        <div className="lg:col-span-2">
          <ActivityFeed tasks={taskList} repos={repoList} />
        </div>
      </div>
    </div>
  );
}
