import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  GitFork,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  ScanSearch,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { TaskChart } from "@/components/dashboard/TaskChart";
import { TaskTypeChart } from "@/components/dashboard/TaskTypeChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AiInsights } from "@/components/dashboard/AiInsights";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-7 w-12" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <Skeleton className="h-[250px]" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-[250px]" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-[250px]" />
        </Card>
      </div>
      <Card className="p-6">
        <Skeleton className="h-4 w-24 mb-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </Card>
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

  const isLoading = reposLoading || tasksLoading;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const taskList = tasks || [];
  const repoList = repos || [];

  const totalRepos = repoList.length;
  const pending = taskList.filter((t: any) => t.status === "pending").length;
  const inProgress = taskList.filter(
    (t: any) => t.status === "in_progress"
  ).length;
  const completed = taskList.filter(
    (t: any) => t.status === "completed"
  ).length;
  const failed = taskList.filter((t: any) => t.status === "failed").length;
  const activeScans = repoList.filter(
    (r: any) => r.status === "scanning"
  ).length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Dashboard</h2>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Total Repos" value={totalRepos} icon={GitFork} />
        <MetricCard label="Pending" value={pending} icon={Clock} />
        <MetricCard label="In Progress" value={inProgress} icon={Loader2} />
        <MetricCard
          label="Completed"
          value={completed}
          icon={CheckCircle}
        />
        <MetricCard label="Failed" value={failed} icon={XCircle} />
        <MetricCard
          label="Active Scans"
          value={activeScans}
          icon={ScanSearch}
        />
      </div>

      {/* Charts + AI Insights row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <TaskChart tasks={taskList} />
        <TaskTypeChart tasks={taskList} />
        <AiInsights tasks={taskList} repos={repoList} />
      </div>

      {/* Activity Feed */}
      <ActivityFeed tasks={taskList} repos={repoList} />
    </div>
  );
}
