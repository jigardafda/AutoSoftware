import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitBranch, LayoutGrid, List, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RepoTable } from "@/components/repos/RepoTable";
import { RepoCard } from "@/components/repos/RepoCard";
import { ConnectRepoDialog } from "@/components/repos/ConnectRepoDialog";
import { RepoDetailDrawer } from "@/components/repos/RepoDetailDrawer";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

type ViewMode = "table" | "grid";

export function Repos() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [connectOpen, setConnectOpen] = useState(false);
  const [drawerRepo, setDrawerRepo] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: repos = [], isLoading } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
  });

  const scanMutation = useMutation({
    mutationFn: (id: string) => api.repos.scan(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      const repo = repos.find((r: any) => r.id === id);
      toast.success(`Scan triggered for ${repo?.fullName ?? "repository"}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to trigger scan");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.repos.update(id, { isActive }),
    onSuccess: (_data, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      toast.success(`Repository ${isActive ? "activated" : "paused"}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update repository");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.repos.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      setDrawerOpen(false);
      setDrawerRepo(null);
      toast.success("Repository deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete repository");
    },
  });

  // Selection handlers
  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === repos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(repos.map((r: any) => r.id)));
    }
  };

  const handleDeselectAll = () => setSelectedIds(new Set());

  const handleScanSelected = () => {
    for (const id of selectedIds) {
      scanMutation.mutate(id);
    }
    setSelectedIds(new Set());
  };

  const handleRowClick = (repo: any) => {
    setDrawerRepo(repo);
    setDrawerOpen(true);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold">Repositories</h2>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className={cn("h-8 w-8 rounded-r-none")}
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">Table view</span>
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className={cn("h-8 w-8 rounded-l-none")}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="sr-only">Grid view</span>
            </Button>
          </div>

          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Connect Repository</span>
            <span className="sm:hidden">Connect</span>
          </Button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={handleScanSelected}
          >
            Scan Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={handleDeselectAll}
          >
            Deselect All
          </Button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24 ml-auto" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      ) : repos.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No repositories connected"
          description="Connect your first repository to get started"
          action={
            <Button onClick={() => setConnectOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Connect Repository
            </Button>
          }
        />
      ) : viewMode === "table" ? (
        <RepoTable
          repos={repos}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onScan={(id) => scanMutation.mutate(id)}
          onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
          onDelete={(id) => {
            if (confirm("Are you sure you want to delete this repository?")) {
              deleteMutation.mutate(id);
            }
          }}
          onRowClick={handleRowClick}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo: any) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onScan={(id) => scanMutation.mutate(id)}
              onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
              onClick={handleRowClick}
            />
          ))}
        </div>
      )}

      {/* Connect Repository Dialog */}
      <ConnectRepoDialog open={connectOpen} onOpenChange={setConnectOpen} />

      {/* Repo Detail Drawer */}
      <RepoDetailDrawer
        repo={drawerRepo}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onScan={(id) => scanMutation.mutate(id)}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
}
