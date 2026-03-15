import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Loader2, Check, FolderOpen, Github } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { GitHubAuthDialog, useGitHubAuth } from "@/components/GitHubAuthDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderBrowserDialog } from "@/components/FolderBrowserDialog";

interface ConnectRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectRepoDialog({ open, onOpenChange }: ConnectRepoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const providers = user?.providers ?? [];

  const {
    isAuthenticated: ghAuthenticated,
    isLoading: ghCheckLoading,
    showAuthDialog,
    setShowAuthDialog,
  } = useGitHubAuth();

  const [selectedTab, setSelectedTab] = useState<string>(providers[0] ?? "local");
  const [search, setSearch] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);

  const { data: availableRepos, isLoading: loadingAvailable } = useQuery({
    queryKey: ["available-repos", selectedTab],
    queryFn: () => api.repos.available(selectedTab),
    enabled: open && !!selectedTab && selectedTab !== "local",
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

  const connectLocalMutation = useMutation({
    mutationFn: (path: string) => api.repos.connectLocal(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] });
      toast.success("Local repository connected successfully");
      setLocalPath("");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to connect local repository");
    },
  });

  const filteredRepos = (availableRepos ?? []).filter((r: any) =>
    r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenChange = (value: boolean) => {
    if (value && providers.length > 0 && !selectedTab) {
      setSelectedTab(providers[0]);
    }
    if (!value) {
      setSearch("");
      setLocalPath("");
    }
    onOpenChange(value);
  };

  const handleConnectLocal = () => {
    if (localPath.trim()) {
      connectLocalMutation.mutate(localPath.trim());
    }
  };

  const isLocalTab = selectedTab === "local";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Connect Repository</DialogTitle>
            <DialogDescription>
              {isLocalTab
                ? "Select a local folder containing a git repository."
                : "Select a provider and choose repositories to connect."}
            </DialogDescription>
          </DialogHeader>

          {/* Tabs: providers + Local Folder */}
          <div className="flex gap-1 border-b pb-2">
            {providers.map((p) => (
              <Button
                key={p}
                variant={selectedTab === p ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs capitalize"
                onClick={() => {
                  setSelectedTab(p);
                  setSearch("");
                }}
              >
                {p}
              </Button>
            ))}
            <Button
              variant={isLocalTab ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSelectedTab("local")}
            >
              Local Folder
            </Button>
          </div>

          {isLocalTab ? (
            /* Local Folder tab */
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="local-repo-path">Folder Path</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="local-repo-path"
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    placeholder="/path/to/git/project"
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleConnectLocal()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setFolderBrowserOpen(true)}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The selected folder must contain a <code>.git</code> directory.
                </p>
              </div>

              <Button
                onClick={handleConnectLocal}
                disabled={!localPath.trim() || connectLocalMutation.isPending}
                className="w-full"
              >
                {connectLocalMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                Connect Local Repository
              </Button>
            </div>
          ) : providers.length === 0 && !ghAuthenticated ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 space-y-3 text-center">
              <Github className="h-8 w-8 text-muted-foreground mx-auto" />
              <div>
                <p className="text-sm font-medium">No providers connected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect your GitHub account to browse and import repositories, or use the Local Folder tab.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowAuthDialog(true)}>
                Connect GitHub
              </Button>
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No providers connected. Link a GitHub or GitLab account in Settings, or use the Local Folder tab.
            </p>
          ) : (
            <>
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
                      `${selectedTab}:${repo.id}`
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
                                provider: selectedTab,
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

      <FolderBrowserDialog
        open={folderBrowserOpen}
        onOpenChange={setFolderBrowserOpen}
        onSelect={(path) => setLocalPath(path)}
        requireGitRepo
      />

      <GitHubAuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        onSuccess={() => {
          // Refresh repos after GitHub auth
          queryClient.invalidateQueries({ queryKey: ["repos"] });
          queryClient.invalidateQueries({ queryKey: ["available-repos"] });
        }}
      />
    </>
  );
}
