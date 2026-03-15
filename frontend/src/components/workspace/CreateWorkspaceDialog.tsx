import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, FolderOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentSelector } from "./AgentSelector";
import { BranchSelect } from "@/components/BranchSelect";
import { FolderBrowserDialog } from "@/components/FolderBrowserDialog";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<"repo" | "local">("repo");
  const [repoId, setRepoId] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [debouncedLocalPath, setDebouncedLocalPath] = useState("");

  // Debounce local path so branch listing doesn't fire on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLocalPath(localPath);
    }, 500);
    return () => clearTimeout(timer);
  }, [localPath]);

  // Fetch default agent from user settings
  const { data: userSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 60_000,
  });

  // Set default agent from settings when dialog opens
  useEffect(() => {
    if (open && userSettings?.defaultAgent && !agentId) {
      setAgentId(userSettings.defaultAgent);
    }
  }, [open, userSettings?.defaultAgent, agentId]);

  const { data: repos = [] } = useQuery({
    queryKey: ["repos"],
    queryFn: () => api.repos.list(),
    enabled: open,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
    enabled: open,
  });

  // Fetch branches for the selected repo
  const { data: repoBranches, error: repoBranchError } = useQuery({
    queryKey: ["repo-branches", repoId],
    queryFn: () => api.repos.branches(repoId),
    enabled: open && sourceType === "repo" && !!repoId,
    retry: false,
  });

  // Fetch branches for the local path (debounced)
  const { data: localBranches, error: localBranchError } = useQuery({
    queryKey: ["local-branches", debouncedLocalPath],
    queryFn: () => api.filesystem.branches(debouncedLocalPath),
    enabled: open && sourceType === "local" && !!debouncedLocalPath.trim(),
    retry: false,
  });

  // Show branch listing errors as toasts
  useEffect(() => {
    if (repoBranchError) {
      toast.error(`Failed to list branches: ${repoBranchError.message}`);
    }
  }, [repoBranchError]);

  useEffect(() => {
    if (localBranchError) {
      toast.error(`Failed to list branches: ${localBranchError.message}`);
    }
  }, [localBranchError]);

  const branches = sourceType === "repo" ? repoBranches : localBranches;

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create workspace");
      return data.workspace;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace created");
      onOpenChange(false);
      resetForm();
      navigate(`/workspaces/${data.id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create workspace");
    },
  });

  const resetForm = () => {
    setName("");
    setSourceType("repo");
    setRepoId("");
    setLocalPath("");
    setDebouncedLocalPath("");
    setBaseBranch(null);
    setAgentId(userSettings?.defaultAgent || "claude-code");
    setTaskId("");
  };

  const handleCreate = () => {
    const body: Record<string, unknown> = {
      name,
      agentId,
    };

    if (sourceType === "repo" && repoId) {
      body.repositoryId = repoId;
    } else if (sourceType === "local" && localPath) {
      body.localPath = localPath;
    }

    if (baseBranch) {
      body.baseBranch = baseBranch;
    }

    if (taskId && taskId !== "none") {
      body.taskId = taskId;
    }

    createMutation.mutate(body);
  };

  const isValid = name.trim() && agentId && (
    (sourceType === "repo" && repoId) || (sourceType === "local" && localPath.trim())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Set up a new workspace for an AI agent to work in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Fix authentication bug"
              />
            </div>

            {/* Source Type */}
            <div className="space-y-2">
              <Label>Source</Label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSourceType("repo"); setBaseBranch(null); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    sourceType === "repo"
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  Repository
                </button>
                <button
                  onClick={() => { setSourceType("local"); setBaseBranch(null); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    sourceType === "local"
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  }`}
                >
                  Local Folder
                </button>
              </div>
            </div>

            {/* Repo / Local input */}
            {sourceType === "repo" ? (
              <div className="space-y-2">
                <Label>Repository</Label>
                <Select value={repoId} onValueChange={(v) => { setRepoId(v); setBaseBranch(null); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a repository..." />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((repo: any) => (
                      <SelectItem key={repo.id} value={repo.id}>
                        {repo.fullName || repo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="local-path">Folder Path</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="local-path"
                    value={localPath}
                    onChange={(e) => { setLocalPath(e.target.value); setBaseBranch(null); }}
                    placeholder="/path/to/project"
                    className="flex-1"
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
              </div>
            )}

            {/* Branch selection — shown when a repo or local path is selected */}
            {((sourceType === "repo" && repoId) || (sourceType === "local" && localPath.trim())) && (
              <div className="space-y-2">
                <Label>
                  Base Branch{" "}
                  <span className="text-muted-foreground font-normal">(worktree will be created from this)</span>
                </Label>
                <BranchSelect
                  branches={branches}
                  value={baseBranch}
                  onChange={setBaseBranch}
                  className="w-full"
                />
              </div>
            )}

            {/* Agent */}
            <div className="space-y-2">
              <Label>Agent</Label>
              <AgentSelector value={agentId} onChange={setAgentId} />
            </div>

            {/* Optional: Link to task */}
            <div className="space-y-2">
              <Label>
                Link to Task{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a task..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tasks.map((task: any) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!isValid || createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              )}
              Create Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FolderBrowserDialog
        open={folderBrowserOpen}
        onOpenChange={setFolderBrowserOpen}
        onSelect={(path) => { setLocalPath(path); setBaseBranch(null); }}
        requireGitRepo
      />
    </>
  );
}
