import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Loader2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ConnectRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectRepoDialog({ open, onOpenChange }: ConnectRepoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const providers = user?.providers ?? [];

  const [selectedProvider, setSelectedProvider] = useState<string>(providers[0] ?? "");
  const [search, setSearch] = useState("");

  const { data: availableRepos, isLoading: loadingAvailable } = useQuery({
    queryKey: ["available-repos", selectedProvider],
    queryFn: () => api.repos.available(selectedProvider),
    enabled: open && !!selectedProvider,
  });

  const { data: connectedRepos } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
    enabled: open,
  });

  const connectedIds = new Set(
    (connectedRepos ?? []).map((r: any) => `${r.provider}:${r.providerRepoId}`)
  );

  const connectMutation = useMutation({
    mutationFn: api.repos.connect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      queryClient.invalidateQueries({ queryKey: ["available-repos"] });
      toast.success("Repository connected successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to connect repository");
    },
  });

  const filteredRepos = (availableRepos ?? []).filter((r: any) =>
    r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  // Reset state when dialog opens with a provider
  const handleOpenChange = (value: boolean) => {
    if (value && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
    if (!value) {
      setSearch("");
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect Repository</DialogTitle>
          <DialogDescription>
            Select a provider and choose repositories to connect.
          </DialogDescription>
        </DialogHeader>

        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No providers connected. Link a GitHub or GitLab account in Settings first.
          </p>
        ) : (
          <>
            {/* Provider tabs */}
            <div className="flex gap-1 border-b pb-2">
              {providers.map((p) => (
                <Button
                  key={p}
                  variant={selectedProvider === p ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs capitalize"
                  onClick={() => {
                    setSelectedProvider(p);
                    setSearch("");
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Repo list */}
            {loadingAvailable ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading repositories...
                </span>
              </div>
            ) : filteredRepos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {search ? "No matching repositories found." : "No repositories available."}
              </p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-1">
                {filteredRepos.map((repo: any) => {
                  const isConnected = connectedIds.has(
                    `${selectedProvider}:${repo.id}`
                  );
                  return (
                    <div
                      key={repo.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {repo.fullName}
                        </p>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-xs text-green-500 shrink-0">
                          <Check className="h-3.5 w-3.5" />
                          Connected
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          disabled={connectMutation.isPending}
                          onClick={() =>
                            connectMutation.mutate({
                              provider: selectedProvider,
                              providerRepoId: repo.id,
                              fullName: repo.fullName,
                              cloneUrl: repo.cloneUrl,
                              defaultBranch: repo.defaultBranch,
                            })
                          }
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
