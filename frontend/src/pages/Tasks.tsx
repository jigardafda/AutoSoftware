import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { Plus, CheckCircle, AlertCircle, Clock, Loader2, X } from "lucide-react";

export function Tasks() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ repositoryId: "", title: "", description: "", type: "improvement" as const, priority: "medium" as const });

  const { data: tasks, isLoading } = useQuery({ queryKey: ["tasks", filters], queryFn: () => api.tasks.list(filters) });
  const { data: repos } = useQuery({ queryKey: ["repos"], queryFn: api.repos.list });

  const createMutation = useMutation({
    mutationFn: api.tasks.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowCreate(false);
      setNewTask({ repositoryId: "", title: "", description: "", type: "improvement", priority: "medium" });
    },
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle size={16} className="text-green-400" />;
      case "failed": return <AlertCircle size={16} className="text-red-400" />;
      case "in_progress": return <Loader2 size={16} className="text-purple-400 animate-spin" />;
      default: return <Clock size={16} className="text-yellow-400" />;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Tasks</h2>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"><Plus size={16} /> New Task</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "pending", "in_progress", "completed", "failed"].map((s) => (
          <button key={s} onClick={() => setFilters(s === "all" ? {} : { status: s })} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${(s === "all" && !filters.status) || filters.status === s ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-medium">Create Task</h3>
            <button onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-white"><X size={16} /></button>
          </div>
          <div className="space-y-3">
            <select value={newTask.repositoryId} onChange={(e) => setNewTask({ ...newTask, repositoryId: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Select repository</option>
              {(repos || []).map((r: any) => <option key={r.id} value={r.id}>{r.fullName}</option>)}
            </select>
            <input placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
            <textarea placeholder="Description" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} rows={4} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-3">
              <select value={newTask.type} onChange={(e) => setNewTask({ ...newTask, type: e.target.value as any })} className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm">
                {["improvement", "bugfix", "feature", "refactor", "security"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })} className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm">
                {["low", "medium", "high", "critical"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button onClick={() => createMutation.mutate(newTask)} disabled={!newTask.repositoryId || !newTask.title || !newTask.description} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm">Create & Queue</button>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {isLoading ? <p className="px-4 py-8 text-center text-zinc-500">Loading...</p> : (tasks || []).length === 0 ? <p className="px-4 py-8 text-center text-zinc-500">No tasks found.</p> : (tasks || []).map((task: any) => (
          <Link key={task.id} to={`/tasks/${task.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors">
            {statusIcon(task.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{task.title}</p>
              <div className="flex gap-2 text-xs text-zinc-500 mt-0.5"><span>{task.repositoryName}</span><span>{task.type}</span><span>{task.source === "auto_scan" ? "Auto" : "Manual"}</span></div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${task.priority === "critical" ? "bg-red-500/20 text-red-400" : task.priority === "high" ? "bg-orange-500/20 text-orange-400" : task.priority === "medium" ? "bg-yellow-500/20 text-yellow-400" : "bg-zinc-700 text-zinc-400"}`}>{task.priority}</span>
            {task.pullRequestUrl && <span className="text-xs text-blue-400">PR</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
