import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Pagination, paginate } from "@/components/Pagination";
import { useSort, type SortConfig } from "@/hooks/useSort";
import { Plus, Loader2, CheckCircle2, BrainCircuit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { TaskTable } from "@/components/tasks/TaskTable";
import { CreateTaskSheet } from "@/components/tasks/CreateTaskSheet";
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
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [page, setPage] = useState(0);

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

  const { sort, onSort, sorted } = useSort(tasks, TASK_SORT_CONFIG, {
    key: "createdAt",
    direction: "desc",
  });

  // Reset page when filters or sort change
  useEffect(() => { setPage(0); }, [filters, sort]);

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
      navigate(`/tasks/${task.id}`);
    },
    [navigate]
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Tasks</h2>
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              {tasks.length}
            </Badge>
          )}
          <RefreshButton queryKeys={[["tasks", queryParams]]} />
        </div>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Task
        </Button>
      </div>

      {/* Filters */}
      <TaskFilters
        filters={filters}
        onChange={handleFilterChange}
        onClear={handleFilterClear}
      />

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlanSelected}
              disabled={planMutation.isPending}
            >
              {planMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <BrainCircuit className="h-3 w-3 mr-1" />
              )}
              Plan Selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelSelected}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Cancel Selected
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-3 w-3 mr-1" />
              )}
              Delete Selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Deselect
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {/* Skeleton filter bar */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-28" />
          </div>
          {/* Skeleton table rows */}
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
      ) : (
        <>
          <TaskTable
            tasks={pagedTasks}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectAll={handleSelectAll}
            onRowClick={handleRowClick}
            sort={sort}
            onSort={onSort}
          />
          <Pagination page={page} total={tasks.length} onPageChange={setPage} />
        </>
      )}

      {/* Create Sheet */}
      <CreateTaskSheet open={sheetOpen} onOpenChange={setSheetOpen} />

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
