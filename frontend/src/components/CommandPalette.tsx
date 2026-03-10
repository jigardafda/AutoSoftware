import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Sun,
  Moon,
  Plus,
  LayoutDashboard,
  GitBranch,
  CheckCircle2,
  Activity,
  Settings,
  Loader2,
  Play,
  Sparkles,
  Search,
  FolderKanban,
  Layers,
  ArrowRight,
  Clock,
  XCircle,
} from "lucide-react";

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  planning: Loader2,
  in_progress: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground",
  planning: "text-amber-500",
  in_progress: "text-blue-500",
  completed: "text-green-500",
  failed: "text-red-500",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Listen for custom event to open the palette (from search button click)
  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("open-command-palette", openHandler);
    return () => window.removeEventListener("open-command-palette", openHandler);
  }, []);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setQuery("");
      setAiLoading(false);
    }
  }, [open]);

  const runAndClose = useCallback(
    (fn: () => void) => {
      fn();
      setOpen(false);
    },
    []
  );

  // Read cached data for instant results
  const repos: any[] = queryClient.getQueryData(["repos"]) ?? [];
  const tasks: any[] = queryClient.getQueryData(["tasks"]) ?? [];

  // Toggle theme
  const handleToggleTheme = () => {
    runAndClose(() => {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
      toast.success(`Switched to ${resolvedTheme === "dark" ? "light" : "dark"} mode`);
    });
  };

  // Navigation helper
  const handleNavigate = (path: string) => {
    runAndClose(() => navigate(path));
  };

  // Scan repo
  const handleScanRepo = (repo: any) => {
    runAndClose(() => {
      api.repos.scan(repo.id).then(() => {
        toast.success(`Scan triggered for ${repo.fullName || repo.name}`);
        queryClient.invalidateQueries({ queryKey: ["scans"] });
      }).catch((err: Error) => {
        toast.error(err.message || "Failed to trigger scan");
      });
    });
  };

  // AI fallback when no results match
  const handleAiCommand = async () => {
    if (!query.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const result = await api.ai.command(query.trim());
      setOpen(false);
      if (!result || !result.action) {
        toast.info("AI could not determine an action.");
        return;
      }
      switch (result.action) {
        case "scan":
          if (result.repoId) {
            await api.repos.scan(result.repoId);
            toast.success("AI triggered a scan");
            queryClient.invalidateQueries({ queryKey: ["scans"] });
          }
          break;
        case "navigate":
          if (result.path) {
            navigate(result.path);
            toast.success(`Navigated to ${result.path}`);
          }
          break;
        case "create_task":
          if (result.title || result.repositoryId) {
            await api.tasks.create({
              title: result.title,
              description: result.description || "",
              repositoryId: result.repositoryId,
              type: result.type || "improvement",
              priority: result.priority || "medium",
            });
            toast.success("AI created a task");
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }
          break;
        case "search":
          toast.info(`Found ${result.results?.length ?? 0} results`);
          break;
        default:
          toast.info("Action completed");
      }
    } catch (err: any) {
      toast.error(err.message || "AI command failed");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search or type a command..."
        value={query}
        onValueChange={setQuery}
        onClear={() => setQuery("")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            // Allow cmdk to handle if there's a selected item
          }
        }}
      />
      <CommandList>
        <CommandEmpty>
          {aiLoading ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <Sparkles className="h-8 w-8 text-primary relative" />
              </div>
              <p className="text-sm text-muted-foreground">AI is thinking...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="p-3 rounded-full bg-muted/50">
                <Search className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">No results found</p>
                <button
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  onClick={handleAiCommand}
                >
                  <Sparkles className="h-4 w-4" />
                  Ask AI to help
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </CommandEmpty>

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => handleNavigate("/tasks?create=true")}>
            <Plus className="text-green-500" />
            <span>Create New Task</span>
            <CommandShortcut>Action</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={handleToggleTheme}>
            {resolvedTheme === "dark" ? (
              <Sun className="text-amber-500" />
            ) : (
              <Moon className="text-indigo-500" />
            )}
            <span>Toggle {resolvedTheme === "dark" ? "Light" : "Dark"} Mode</span>
            <CommandShortcut>Theme</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleNavigate("/dashboard")}>
            <LayoutDashboard className="text-blue-500" />
            <span>Dashboard</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/projects")}>
            <FolderKanban className="text-purple-500" />
            <span>Projects</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/repos")}>
            <GitBranch className="text-orange-500" />
            <span>Repositories</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/tasks")}>
            <CheckCircle2 className="text-green-500" />
            <span>Tasks</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/scans")}>
            <Search className="text-cyan-500" />
            <span>Scans</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/activity")}>
            <Activity className="text-pink-500" />
            <span>Activity</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/queues")}>
            <Layers className="text-indigo-500" />
            <span>Queues</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/settings")}>
            <Settings className="text-slate-500" />
            <span>Settings</span>
            <CommandShortcut>Go to</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {repos.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Repositories">
              {repos.slice(0, 5).map((repo: any) => (
                <CommandItem
                  key={repo.id}
                  value={`repo-${repo.fullName || repo.name}`}
                  onSelect={() => handleScanRepo(repo)}
                >
                  <Play className="text-green-500" />
                  <span className="flex-1 truncate">{repo.fullName || repo.name}</span>
                  <CommandShortcut>Scan</CommandShortcut>
                </CommandItem>
              ))}
              {repos.length > 5 && (
                <CommandItem onSelect={() => handleNavigate("/repos")}>
                  <ArrowRight />
                  <span className="text-muted-foreground">View all {repos.length} repositories</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Tasks">
              {tasks.slice(0, 5).map((task: any) => {
                const StatusIcon = STATUS_ICONS[task.status] || Clock;
                const statusColor = STATUS_COLORS[task.status] || "text-muted-foreground";
                const isAnimated = task.status === "planning" || task.status === "in_progress";
                return (
                  <CommandItem
                    key={task.id}
                    value={`task-${task.title}`}
                    onSelect={() => handleNavigate(`/tasks/${task.id}`)}
                  >
                    <StatusIcon className={`${statusColor} ${isAnimated ? "animate-spin" : ""}`} />
                    <span className="flex-1 truncate">{task.title}</span>
                    <span className={`text-[11px] font-medium capitalize ${statusColor}`}>
                      {task.status.replace("_", " ")}
                    </span>
                  </CommandItem>
                );
              })}
              {tasks.length > 5 && (
                <CommandItem onSelect={() => handleNavigate("/tasks")}>
                  <ArrowRight />
                  <span className="text-muted-foreground">View all {tasks.length} tasks</span>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer hint */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50 bg-muted/30 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/50 font-mono">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/50 font-mono">↓</kbd>
            <span className="ml-1">Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border/50 font-mono">↵</kbd>
            <span className="ml-1">Select</span>
          </span>
        </div>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          AI-powered search
        </span>
      </div>
    </CommandDialog>
  );
}
