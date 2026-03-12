import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, Loader2, Check, ChevronsUpDown, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BranchSelect } from "@/components/BranchSelect";

interface CreateTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INITIAL_FORM = {
  repositoryId: "",
  targetBranch: "",
  title: "",
  description: "",
  type: "improvement" as string,
  priority: "medium" as string,
  skipPlanning: false,
};

export function CreateTaskSheet({ open, onOpenChange }: CreateTaskSheetProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL_FORM);
  const [repoOpen, setRepoOpen] = useState(false);

  const { data: repos = [] } = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos.list,
  });

  // Fetch branches when a repository is selected
  const {
    data: branches = [],
    isLoading: branchesLoading,
    refetch: refetchBranches,
    isFetching: branchesFetching,
  } = useQuery({
    queryKey: ["repo-branches", form.repositoryId],
    queryFn: () => api.repos.branches(form.repositoryId),
    enabled: !!form.repositoryId,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Auto-select default branch when branches load
  useEffect(() => {
    if (branches.length > 0 && !form.targetBranch) {
      const defaultBranch = branches.find((b) => b.isDefault);
      if (defaultBranch) {
        setForm((prev) => ({ ...prev, targetBranch: defaultBranch.name }));
      }
    }
  }, [branches, form.targetBranch]);

  const createMutation = useMutation({
    mutationFn: api.tasks.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created successfully");
      setForm(INITIAL_FORM);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create task");
    },
  });

  const canSubmit =
    form.repositoryId && form.title.trim() && form.description.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Send undefined for targetBranch if empty (server will use repo default)
    createMutation.mutate({
      ...form,
      targetBranch: form.targetBranch || undefined,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto safe-area-bottom"
      >
        <SheetHeader>
          <SheetTitle>Create Task</SheetTitle>
          <SheetDescription>
            Create a manual task for a repository.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="repository">Repository</Label>
            <Popover open={repoOpen} onOpenChange={setRepoOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={repoOpen}
                  className="w-full justify-between font-normal"
                >
                  {form.repositoryId ? (
                    <span className="flex items-center gap-2 truncate">
                      <Github className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {repos.find((r: any) => r.id === form.repositoryId)?.fullName}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select repository...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search repositories..." />
                  <CommandList>
                    <CommandEmpty>No repository found.</CommandEmpty>
                    <CommandGroup>
                      {repos.map((r: any) => (
                        <CommandItem
                          key={r.id}
                          value={r.fullName}
                          onSelect={() => {
                            setForm({ ...form, repositoryId: r.id, targetBranch: "" });
                            setRepoOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.repositoryId === r.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <Github className="mr-2 h-4 w-4" />
                          <span className="truncate">{r.fullName}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {form.repositoryId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="branch">Target Branch</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => refetchBranches()}
                  disabled={branchesFetching}
                >
                  <RefreshCw className={`h-3 w-3 ${branchesFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {branchesLoading ? (
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md text-sm">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-muted-foreground">Loading branches...</span>
                </div>
              ) : (
                <BranchSelect
                  branches={branches}
                  value={form.targetBranch || null}
                  onChange={(branch) => setForm({ ...form, targetBranch: branch || "" })}
                  disabled={branchesLoading}
                  className="w-full"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Changes will be committed to a new branch and a PR will target this branch
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe the task..."
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          {/* Stack on very small screens, side-by-side otherwise */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["improvement", "bugfix", "feature", "refactor", "security"].map(
                    (t) => (
                      <SelectItem key={t} value={t} className="min-h-[44px]">
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v })}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "critical"].map((p) => (
                    <SelectItem key={p} value={p} className="min-h-[44px]">
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skip-planning" className="text-sm">Skip planning</Label>
              <p className="text-xs text-muted-foreground">Execute immediately without AI planning</p>
            </div>
            <Switch
              id="skip-planning"
              checked={form.skipPlanning}
              onCheckedChange={(checked) => setForm({ ...form, skipPlanning: checked as boolean })}
            />
          </div>

          <Button
            type="submit"
            className="w-full min-h-[44px] text-base"
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Task"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
