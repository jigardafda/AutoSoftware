import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { GitFork, CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";

export function Dashboard() {
  const { data: repos } = useQuery({ queryKey: ["repos"], queryFn: api.repos.list });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: () => api.tasks.list() });

  const stats = {
    totalRepos: repos?.length || 0,
    activeScans: repos?.filter((r: any) => r.status === "scanning").length || 0,
    pendingTasks: tasks?.filter((t: any) => t.status === "pending").length || 0,
    inProgress: tasks?.filter((t: any) => t.status === "in_progress").length || 0,
    completed: tasks?.filter((t: any) => t.status === "completed").length || 0,
    failed: tasks?.filter((t: any) => t.status === "failed").length || 0,
  };

  const recentTasks = (tasks || []).slice(0, 10);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Repositories", value: stats.totalRepos, icon: GitFork, color: "text-blue-400" },
          { label: "Pending Tasks", value: stats.pendingTasks, icon: Clock, color: "text-yellow-400" },
          { label: "In Progress", value: stats.inProgress, icon: Loader2, color: "text-purple-400" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <span className="text-sm text-zinc-400">{label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-white font-medium">Recent Tasks</h3>
          <Link to="/tasks" className="text-sm text-blue-400 hover:text-blue-300">View all</Link>
        </div>
        <div className="divide-y divide-zinc-800">
          {recentTasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-zinc-500">No tasks yet. Connect a repository to get started.</p>
          ) : (
            recentTasks.map((task: any) => (
              <Link key={task.id} to={`/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors">
                {task.status === "completed" ? <CheckCircle size={16} className="text-green-400" /> :
                 task.status === "failed" ? <AlertCircle size={16} className="text-red-400" /> :
                 task.status === "in_progress" ? <Loader2 size={16} className="text-purple-400 animate-spin" /> :
                 <Clock size={16} className="text-yellow-400" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{task.title}</p>
                  <p className="text-xs text-zinc-500">{task.repositoryName}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  task.priority === "critical" ? "bg-red-500/20 text-red-400" :
                  task.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                  task.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-zinc-700 text-zinc-400"
                }`}>{task.priority}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
