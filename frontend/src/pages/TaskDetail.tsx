import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ArrowLeft, CheckCircle, AlertCircle, Clock, Loader2, ExternalLink } from "lucide-react";

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.tasks.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const t = query.state.data;
      return t?.status === "in_progress" ? 3000 : false;
    },
  });

  if (isLoading) return <p className="text-zinc-400">Loading...</p>;
  if (!task) return <p className="text-zinc-400">Task not found.</p>;

  const metadata = task.metadata || {};

  return (
    <div>
      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4"><ArrowLeft size={16} /> Back to Tasks</Link>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{task.title}</h2>
            <div className="flex gap-2 text-sm text-zinc-400"><span>{task.repositoryName}</span><span>|</span><span>{task.type}</span><span>|</span><span>{task.source === "auto_scan" ? "Auto-generated" : "Manual"}</span></div>
          </div>
          <div className="flex items-center gap-2">
            {task.status === "completed" && <CheckCircle className="text-green-400" />}
            {task.status === "failed" && <AlertCircle className="text-red-400" />}
            {task.status === "in_progress" && <Loader2 className="text-purple-400 animate-spin" />}
            {task.status === "pending" && <Clock className="text-yellow-400" />}
            <span className="text-white capitalize">{task.status.replace("_", " ")}</span>
          </div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap mb-4">{task.description}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-zinc-500">Priority</span><p className="text-white capitalize">{task.priority}</p></div>
          <div><span className="text-zinc-500">Created</span><p className="text-white">{new Date(task.createdAt).toLocaleString()}</p></div>
          {task.completedAt && <div><span className="text-zinc-500">Completed</span><p className="text-white">{new Date(task.completedAt).toLocaleString()}</p></div>}
          {task.pullRequestUrl && <div><span className="text-zinc-500">Pull Request</span><a href={task.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1">View PR <ExternalLink size={12} /></a></div>}
        </div>
      </div>

      {metadata.resultSummary && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
          <h3 className="text-white font-medium mb-3">Agent Summary</h3>
          <div className="bg-zinc-950 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap font-mono">{metadata.resultSummary}</div>
        </div>
      )}

      {metadata.commits && metadata.commits.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
          <h3 className="text-white font-medium mb-3">Commits</h3>
          <div className="space-y-2">{metadata.commits.map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-sm"><code className="text-zinc-500 font-mono">{c.hash.slice(0, 7)}</code><span className="text-zinc-300">{c.message}</span></div>
          ))}</div>
        </div>
      )}

      {metadata.error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-6">
          <h3 className="text-red-400 font-medium mb-3">Error</h3>
          <p className="text-red-300 text-sm">{metadata.error}</p>
        </div>
      )}
    </div>
  );
}
