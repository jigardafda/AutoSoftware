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

export function Dashboard() {
  const { data: repos } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
  });
  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });

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
