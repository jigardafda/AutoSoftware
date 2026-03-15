import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Pagination, paginate } from "@/components/Pagination";
import { useSort, type SortConfig } from "@/hooks/useSort";
import { Plus, Loader2, CheckCircle2, BrainCircuit, Trash2, Layers, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { TaskTable } from "@/components/tasks/TaskTable";
import { TaskKanbanBoard } from "@/components/tasks/TaskKanbanBoard";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { TaskViewToolbar, type TaskViewMode } from "@/components/tasks/TaskViewToolbar";
import { CreateTaskSheet } from "@/components/tasks/CreateTaskSheet";
import { CreateBatchDialog } from "@/components/tasks/CreateBatchDialog";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TASK_SORT_CONFIG: SortConfig = {
  status: "taskStatus",
  title: "string",
  type: "string",
  priority: "priority",
  source: "string",
  createdAt: "date",
};

export function Tasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("tasks-view-mode") as TaskViewMode) || "list";
  });
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

  // Handle navigation state for opening create sheet from mobile FAB
  useEffect(() => {
    const state = location.state as { openCreateSheet?: boolean; description?: string } | null;
    if (state?.openCreateSheet) {
      setSheetOpen(true);
      // Clear the state to prevent reopening on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Build query params — only include non-"all" filters
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== "all") {
        params[key] = value;
      }
    }
    return params;
  }, [filters]);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", queryParams],
    queryFn: () => api.tasks.list(Object.keys(queryParams).length ? queryParams : undefined),
  });

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t: any) =>
      t.title?.toLowerCase().includes(q) ||
      t.repositoryName?.toLowerCase().includes(q) ||
      t.repository?.fullName?.toLowerCase().includes(q) ||
      t.type?.toLowerCase().includes(q) ||
      t.targetBranch?.toLowerCase().includes(q)
    );
  }, [tasks, search]);

  const { sort, onSort, sorted } = useSort(filteredTasks, TASK_SORT_CONFIG, {
    key: "createdAt",
    direction: "desc",
  });

  const handleViewModeChange = useCallback((mode: TaskViewMode) => {
    setViewMode(mode);
    localStorage.setItem("tasks-view-mode", mode);
  }, []);

  // Reset page when filters, sort, or search change
  useEffect(() => { setPage(0); }, [filters, sort, search]);

  const pagedTasks = useMemo(() => paginate(sorted, page), [sorted, page]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.tasks.update(id, { status: "cancelled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedIds(new Set());
      toast.success("Task cancelled");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel task");
    },
  });

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFilterClear = useCallback(() => {
    setFilters({});
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === tasks.length) {
        return new Set();
      }
      return new Set(tasks.map((t: any) => t.id));
    });
  }, [tasks]);

  const handleRowClick = useCallback(
    (task: any) => {
      setSelectedTask((prev: any) => prev?.id === task.id ? null : task);
    },
    []
  );

  const planMutation = useMutation({
    mutationFn: (id: string) => api.tasks.startPlanning(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Planning started");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleCancelSelected = useCallback(() => {
    for (const id of selectedIds) {
      cancelMutation.mutate(id);
    }
  }, [selectedIds, cancelMutation]);

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkDelete(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedIds(new Set());
      toast.success(`${data.deleted} task${data.deleted === 1 ? "" : "s"} deleted`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete tasks");
    },
  });

  const handlePlanSelected = useCallback(() => {
    const plannable = tasks.filter(
      (t: any) => selectedIds.has(t.id) && ["pending", "planned", "failed"].includes(t.status)
    );
    for (const t of plannable) {
      planMutation.mutate(t.id);
    }
    setSelectedIds(new Set());
  }, [selectedIds, tasks, planMutation]);

  const handleDeleteSelected = useCallback(() => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
    setDeleteDialogOpen(false);
  }, [selectedIds, bulkDeleteMutation]);

  const bulkExecuteMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkExecute(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedIds(new Set());
      toast.success(`${data.executed} task${data.executed === 1 ? "" : "s"} queued for execution`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to execute tasks");
    },
  });

  const bulkRetryMutation = useMutation({
    mutationFn: (ids: string[]) => api.tasks.bulkRetry(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedIds(new Set());
      toast.success(`${data.retried} task${data.retried === 1 ? "" : "s"} queued for retry`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to retry tasks");
    },
  });

  const handleExecuteSelected = useCallback(() => {
    const executable = tasks.filter(
      (t: any) => selectedIds.has(t.id) && t.status === "planned"
    );
    bulkExecuteMutation.mutate(executable.map((t: any) => t.id));
  }, [selectedIds, tasks, bulkExecuteMutation]);

  const handleRetrySelected = useCallback(() => {
    const retryable = tasks.filter(
      (t: any) => selectedIds.has(t.id) && ["failed", "cancelled"].includes(t.status)
    );
    bulkRetryMutation.mutate(retryable.map((t: any) => t.id));
  }, [selectedIds, tasks, bulkRetryMutation]);

  // Count tasks in different states for bulk action buttons
  const selectedTaskStates = useMemo(() => {
    const selected = tasks.filter((t: any) => selectedIds.has(t.id));
    return {
      planned: selected.filter((t: any) => t.status === "planned").length,
      failed: selected.filter((t: any) => ["failed", "cancelled"].includes(t.status)).length,
      plannable: selected.filter((t: any) => ["pending", "planned", "failed"].includes(t.status)).length,
    };
  }, [tasks, selectedIds]);

  return (
    <div className="space-y-4">
      {/* Header - responsive layout */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Tasks</h2>
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              {search && filteredTasks.length !== tasks.length
                ? `${filteredTasks.length}/${tasks.length}`
                : tasks.length}
            </Badge>
          )}
          <RefreshButton queryKeys={[["tasks", queryParams]]} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatchDialogOpen(true)}
            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
          >
            <Layers className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Batch Operation</span>
            <span className="sm:hidden">Batch</span>
          </Button>
          <Button size="sm" onClick={() => setSheetOpen(true)} className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">New Task</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Filters + Search + View Toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <TaskFilters
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleFilterClear}
        />
        <TaskViewToolbar
          search={search}
          onSearchChange={setSearch}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
      </div>

      {/* Bulk actions bar - scrollable on mobile */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
            {selectedTaskStates.plannable > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlanSelected}
                disabled={planMutation.isPending}
                className="shrink-0"
              >
                {planMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <BrainCircuit className="h-3 w-3 mr-1" />
                )}
                Plan ({selectedTaskStates.plannable})
              </Button>
            )}
            {selectedTaskStates.planned > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExecuteSelected}
                disabled={bulkExecuteMutation.isPending}
                className="shrink-0"
              >
                {bulkExecuteMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                Execute ({selectedTaskStates.planned})
              </Button>
            )}
            {selectedTaskStates.failed > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetrySelected}
                disabled={bulkRetryMutation.isPending}
                className="shrink-0"
              >
                {bulkRetryMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-1" />
                )}
                Retry ({selectedTaskStates.failed})
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelSelected}
              disabled={cancelMutation.isPending}
              className="shrink-0"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={bulkDeleteMutation.isPending}
              className="shrink-0"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-3 w-3 mr-1" />
              )}
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="shrink-0"
            >
              Deselect
            </Button>
          </div>
        </div>
      )}

      {/* Task List / Kanban */}
      {isLoading ? (
        <div className="space-y-3">
          {viewMode === "kanban" ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-[280px] shrink-0 rounded-xl border p-3 space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="border-b px-4 py-3">
                <Skeleton className="h-4 w-full max-w-lg" />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-24 ml-auto" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No tasks yet"
          description="Tasks will appear when you scan repositories or create them manually"
          action={
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Task
            </Button>
          }
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No matching tasks"
          description={`No tasks match "${search}". Try a different search term.`}
          action={
            <Button size="sm" variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      ) : viewMode === "kanban" ? (
        <TaskKanbanBoard tasks={sorted} onTaskClick={handleRowClick} />
      ) : (
        <div className="flex gap-0">
          <div className={`flex-1 min-w-0 transition-all duration-300 ${selectedTask ? "max-w-[calc(100%-380px)]" : ""}`}>
            <TaskTable
              tasks={pagedTasks}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectAll={handleSelectAll}
              onRowClick={handleRowClick}
              sort={sort}
              onSort={onSort}
              onDelete={(id) => bulkDeleteMutation.mutate([id])}
              onRetry={(id) => bulkRetryMutation.mutate([id])}
              onExecute={(id) => bulkExecuteMutation.mutate([id])}
            />
            <Pagination page={page} total={filteredTasks.length} onPageChange={setPage} />
          </div>
          {selectedTask && (
            <div className="w-[380px] shrink-0 border-l bg-background flex flex-col animate-in slide-in-from-right-5 duration-200 rounded-lg border h-[calc(100vh-280px)]">
              <TaskDetailPanel
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* Create Sheet */}
      <CreateTaskSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Batch Operation Dialog */}
      <CreateBatchDialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen} />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} task{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected tasks and cancel any running jobs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
