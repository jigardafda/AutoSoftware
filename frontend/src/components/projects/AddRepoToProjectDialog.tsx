import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Check, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  existingRepoIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRepoToProjectDialog({ projectId, existingRepoIds, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: repos = [] } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!search) return repos;
    const q = search.toLowerCase();
    return repos.filter((r: any) => r.fullName.toLowerCase().includes(q));
  }, [repos, search]);

  const addMutation = useMutation({
    mutationFn: (repoId: string) => api.projects.addRepo(projectId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Repository added to project");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add repository");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (repoId: string) => api.projects.removeRepo(projectId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Repository removed from project");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove repository");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Repositories</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="pl-9"
          />
        </div>
        <ScrollArea className="h-72">
          <div className="space-y-1">
            {filtered.map((repo: any) => {
              const isAdded = existingRepoIds.has(repo.id);
              return (
                <button
                  key={repo.id}
                  onClick={() => {
                    if (isAdded) {
                      removeMutation.mutate(repo.id);
                    } else {
                      addMutation.mutate(repo.id);
                    }
                  }}
                  disabled={addMutation.isPending || removeMutation.isPending}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors text-left",
                    isAdded
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{repo.fullName}</p>
                    <p className="text-xs text-muted-foreground">{repo.provider}</p>
                  </div>
                  {isAdded && <Check className="h-4 w-4 text-green-500 shrink-0" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {repos.length === 0 ? "No repositories connected" : "No matching repositories"}
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
