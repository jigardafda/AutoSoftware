import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { GitFork, Plus, Scan, Trash2, ToggleLeft, ToggleRight, Loader2, Check } from "lucide-react";

export function Repos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const { data: repos, isLoading } = useQuery({ queryKey: ["repos"], queryFn: api.repos.list });
  const { data: availableRepos, isLoading: loadingAvailable } = useQuery({
    queryKey: ["available-repos", selectedProvider],
    queryFn: () => api.repos.available(selectedProvider),
    enabled: !!selectedProvider,
  });

  const connectMutation = useMutation({
    mutationFn: api.repos.connect,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });
  const scanMutation = useMutation({
    mutationFn: (id: string) => api.repos.scan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.repos.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: api.repos.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos"] }),
  });

  const connectedIds = new Set((repos || []).map((r: any) => `${r.provider}:${r.providerRepoId}`));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Repositories</h2>
        <button onClick={() => setShowConnect(!showConnect)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
          <Plus size={16} /> Connect Repository
        </button>
      </div>

      {showConnect && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex gap-2 mb-4">
            {(user?.providers || []).map((p: string) => (
              <button key={p} onClick={() => setSelectedProvider(p)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedProvider === p ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>
                {p}
              </button>
            ))}
          </div>
          {loadingAvailable && <p className="text-zinc-400 text-sm">Loading repositories...</p>}
          {availableRepos && (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {availableRepos.map((repo: any) => {
                const isConnected = connectedIds.has(`${selectedProvider}:${repo.id}`);
                return (
                  <div key={repo.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800">
                    <div>
                      <p className="text-sm text-white">{repo.fullName}</p>
                      <p className="text-xs text-zinc-500">{repo.description || "No description"}</p>
                    </div>
                    {isConnected ? (
                      <span className="text-xs text-green-400 flex items-center gap-1"><Check size={14} /> Connected</span>
                    ) : (
                      <button onClick={() => connectMutation.mutate({ provider: selectedProvider as any, providerRepoId: repo.id, fullName: repo.fullName, cloneUrl: repo.cloneUrl, defaultBranch: repo.defaultBranch })} className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">Connect</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isLoading ? <p className="text-zinc-400">Loading...</p> : (repos || []).length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <GitFork size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-400">No repositories connected yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(repos || []).map((repo: any) => (
            <div key={repo.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
              <GitFork size={20} className="text-zinc-400" />
              <div className="flex-1">
                <p className="text-white font-medium">{repo.fullName}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                  <span>{repo.provider}</span>
                  <span>Scan every {repo.scanInterval}m</span>
                  {repo.lastScannedAt && <span>Last: {new Date(repo.lastScannedAt).toLocaleString()}</span>}
                  {repo.status === "scanning" && <span className="text-purple-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Scanning</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => scanMutation.mutate(repo.id)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg" title="Trigger scan"><Scan size={16} /></button>
                <button onClick={() => toggleMutation.mutate({ id: repo.id, isActive: !repo.isActive })} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg" title={repo.isActive ? "Pause" : "Resume"}>
                  {repo.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => { if (confirm("Disconnect this repository?")) deleteMutation.mutate(repo.id); }} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg" title="Disconnect"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
