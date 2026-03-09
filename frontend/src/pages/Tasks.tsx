import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { TaskTable } from "@/components/tasks/TaskTable";
import { CreateTaskSheet } from "@/components/tasks/CreateTaskSheet";

export function Tasks() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const handleCancelSelected = useCallback(() => {
    for (const id of selectedIds) {
      cancelMutation.mutate(id);
    }
  }, [selectedIds, cancelMutation]);

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
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {selectedIds.size} selected
          </span>
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
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Deselect
          </Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TaskTable
          tasks={tasks}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onRowClick={handleRowClick}
        />
      )}

      {/* Create Sheet */}
      <CreateTaskSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
