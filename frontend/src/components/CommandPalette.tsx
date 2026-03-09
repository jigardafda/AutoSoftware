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
  Zap,
  Search,
} from "lucide-react";

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
        placeholder="Type a command or search..."
        value={query}
        onValueChange={setQuery}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            // Allow cmdk to handle if there's a selected item;
            // we only call AI as a fallback via the empty state button
          }
        }}
      />
      <CommandList>
        <CommandEmpty>
          {aiLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          ) : (
            <button
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleAiCommand}
            >
              <Zap className="h-4 w-4" />
              No results found. Press Enter to ask AI.
            </button>
          )}
        </CommandEmpty>

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={handleToggleTheme}>
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle Theme
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/tasks?create=true")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Task
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleNavigate("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/repos")}>
            <GitBranch className="mr-2 h-4 w-4" />
            Repositories
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/tasks")}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Tasks
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/scans")}>
            <Search className="mr-2 h-4 w-4" />
            Scans
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/activity")}>
            <Activity className="mr-2 h-4 w-4" />
            Activity
          </CommandItem>
          <CommandItem onSelect={() => handleNavigate("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        {repos.length > 0 && (
          <CommandGroup heading="Repositories">
            {repos.map((repo: any) => (
              <CommandItem
                key={repo.id}
                value={`repo-${repo.fullName || repo.name}`}
                onSelect={() => handleScanRepo(repo)}
              >
                <Play className="mr-2 h-4 w-4" />
                <span className="flex-1 truncate">{repo.fullName || repo.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">Scan</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tasks.length > 0 && (
          <CommandGroup heading="Recent Tasks">
            {tasks.slice(0, 5).map((task: any) => (
              <CommandItem
                key={task.id}
                value={`task-${task.title}`}
                onSelect={() => handleNavigate(`/tasks/${task.id}`)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                <span className="flex-1 truncate">{task.title}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">
                  {task.status}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
