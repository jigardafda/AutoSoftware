import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Loader2, Layers, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface CreateBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBatchDialog({ open, onOpenChange }: CreateBatchDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskType, setTaskType] = useState("improvement");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [executionMode, setExecutionMode] = useState<"parallel" | "sequential">("parallel");
  const [skipPlanning, setSkipPlanning] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ["repos"],
    queryFn: () => api.repos.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.batch.create({
        name,
        description,
        repositoryIds: Array.from(selectedRepos),
        taskTemplate: {
          title: taskTitle,
          description: taskDescription,
          type: taskType,
          priority: taskPriority,
        },
        executionMode,
        skipPlanning,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["batch"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Batch operation created with ${data.tasks?.length || 0} tasks`);
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create batch operation");
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setTaskTitle("");
    setTaskDescription("");
    setTaskType("improvement");
    setTaskPriority("medium");
    setExecutionMode("parallel");
    setSkipPlanning(false);
    setSelectedRepos(new Set());
  };

  const handleRepoToggle = (repoId: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedRepos.size === repos.length) {
      setSelectedRepos(new Set());
    } else {
      setSelectedRepos(new Set(repos.map((r: any) => r.id)));
    }
  };

  const canSubmit =
    name.trim() &&
    taskTitle.trim() &&
    taskDescription.trim() &&
    selectedRepos.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Create Batch Operation
          </DialogTitle>
          <DialogDescription>
            Create the same task across multiple repositories. Perfect for
            "fix this in all microservices" type operations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Batch Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-name">Batch Name</Label>
              <Input
                id="batch-name"
                placeholder="e.g., Update dependencies across all services"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch-description">Description (optional)</Label>
              <Textarea
                id="batch-description"
                placeholder="Describe what this batch operation does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Repository Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Select Repositories ({selectedRepos.size} selected)</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                {selectedRepos.size === repos.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {reposLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : repos.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No repositories connected
                </div>
              ) : (
                <div className="divide-y">
                  {repos.map((repo: any) => (
                    <label
                      key={repo.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedRepos.has(repo.id)}
                        onCheckedChange={() => handleRepoToggle(repo.id)}
                      />
                      <span className="text-sm">{repo.fullName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Task Template */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Task Template</Label>
            <p className="text-sm text-muted-foreground -mt-2">
              This template will be applied to each selected repository.
              Use {"{{repo}}"} to include the repository name.
            </p>

            <div className="space-y-2">
              <Label htmlFor="task-title">Task Title</Label>
              <Input
                id="task-title"
                placeholder="e.g., Update logging library in {{repo}}"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Task Description</Label>
              <Textarea
                id="task-description"
                placeholder="Detailed description of what the agent should do..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={taskType} onValueChange={setTaskType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="improvement">Improvement</SelectItem>
                    <SelectItem value="bugfix">Bug Fix</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="refactor">Refactor</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={taskPriority} onValueChange={setTaskPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                Advanced Options
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Execution Mode</Label>
                <Select
                  value={executionMode}
                  onValueChange={(v) => setExecutionMode(v as "parallel" | "sequential")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parallel">
                      Parallel - Run all tasks simultaneously
                    </SelectItem>
                    <SelectItem value="sequential">
                      Sequential - Run tasks one at a time
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sequential mode is useful when changes in one repo depend on another.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip-planning"
                  checked={skipPlanning}
                  onCheckedChange={(checked) => setSkipPlanning(checked === true)}
                />
                <Label htmlFor="skip-planning" className="cursor-pointer">
                  Skip planning phase (execute immediately)
                </Label>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>Create Batch ({selectedRepos.size} repos)</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
