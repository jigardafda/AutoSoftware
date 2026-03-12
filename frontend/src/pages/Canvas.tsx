import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SpatialCanvas,
  type CanvasState,
  type CanvasTask,
  type TaskPosition,
  type TaskConnection,
  type TaskGroup,
} from "@/components/canvas/SpatialCanvas";
import { CanvasToolbar, type CanvasTool } from "@/components/canvas/CanvasToolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronRight,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Circle,
  FolderKanban,
  GitBranch,
  Calendar,
} from "lucide-react";

// Default canvas state
const DEFAULT_CANVAS_STATE: CanvasState = {
  taskPositions: {},
  connections: [],
  groups: [],
  zoom: 1,
  viewportX: 0,
  viewportY: 0,
};

// History for undo/redo
interface HistoryState {
  past: CanvasState[];
  present: CanvasState;
  future: CanvasState[];
}

const MAX_HISTORY = 50;

export default function Canvas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || undefined;

  // Canvas state
  const [canvasState, setCanvasState] = useState<CanvasState>(DEFAULT_CANVAS_STATE);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: DEFAULT_CANVAS_STATE,
    future: [],
  });

  // UI state
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [gridEnabled, setGridEnabled] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<CanvasTask | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });

  // Fetch tasks
  const { data: tasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", projectId ? { projectId } : undefined],
    queryFn: () =>
      projectId ? api.tasks.list({ projectId }) : api.tasks.list(),
  });

  // Transform tasks to canvas format
  const tasks: CanvasTask[] = useMemo(() => {
    return tasksData.map((task: any) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      type: task.type,
      priority: task.priority,
      repositoryName: task.repositoryName,
    }));
  }, [tasksData]);

  // Fetch saved canvas state
  const { data: savedCanvasState, isLoading: canvasLoading } = useQuery({
    queryKey: ["canvas", projectId || "global"],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/canvas/${projectId || "global"}`, {
          credentials: "include",
        });
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error("Failed to fetch canvas state");
        }
        return response.json();
      } catch (err) {
        return null;
      }
    },
  });

  // Initialize canvas state from saved data
  useEffect(() => {
    if (savedCanvasState) {
      const state: CanvasState = {
        taskPositions: savedCanvasState.taskPositions || {},
        connections: savedCanvasState.connections || [],
        groups: savedCanvasState.groups || [],
        zoom: savedCanvasState.zoom || 1,
        viewportX: savedCanvasState.viewportX || 0,
        viewportY: savedCanvasState.viewportY || 0,
      };
      setCanvasState(state);
      setHistory({ past: [], present: state, future: [] });
    }
  }, [savedCanvasState]);

  // Auto-save canvas state with debounce
  const saveCanvasState = useCallback(
    async (state: CanvasState) => {
      setIsSaving(true);
      try {
        await fetch(`/api/canvas/${projectId || "global"}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            taskPositions: state.taskPositions,
            connections: state.connections,
            groups: state.groups,
            zoom: state.zoom,
            viewportX: state.viewportX,
            viewportY: state.viewportY,
          }),
        });
      } catch (err) {
        console.error("Failed to save canvas state:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [projectId]
  );

  // Debounced save
  const debouncedSave = useCallback(
    (state: CanvasState) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveCanvasState(state);
      }, 1000);
    },
    [saveCanvasState]
  );

  // Update canvas state with history
  const updateCanvasState = useCallback(
    (updater: (prev: CanvasState) => CanvasState, addToHistory = true) => {
      setCanvasState((prev) => {
        const next = updater(prev);

        if (addToHistory) {
          setHistory((h) => ({
            past: [...h.past.slice(-MAX_HISTORY + 1), h.present],
            present: next,
            future: [],
          }));
        }

        debouncedSave(next);
        return next;
      });
    },
    [debouncedSave]
  );

  // Undo
  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      setCanvasState(previous);
      debouncedSave(previous);
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, [debouncedSave]);

  // Redo
  const handleRedo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      setCanvasState(next);
      debouncedSave(next);
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, [debouncedSave]);

  // Task selection
  const handleTaskSelect = useCallback((taskId: string, addToSelection: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(addToSelection ? prev : []);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // Task move
  const handleTaskMove = useCallback(
    (taskId: string, position: { x: number; y: number }) => {
      updateCanvasState((prev) => ({
        ...prev,
        taskPositions: {
          ...prev.taskPositions,
          [taskId]: {
            ...(prev.taskPositions[taskId] || { width: 280, height: 120 }),
            x: position.x,
            y: position.y,
          },
        },
      }));
    },
    [updateCanvasState]
  );

  // Multi-task move
  const handleMultiTaskMove = useCallback(
    (moves: Array<{ taskId: string; position: { x: number; y: number } }>) => {
      updateCanvasState((prev) => {
        const newPositions = { ...prev.taskPositions };
        moves.forEach(({ taskId, position }) => {
          newPositions[taskId] = {
            ...(newPositions[taskId] || { width: 280, height: 120 }),
            x: position.x,
            y: position.y,
          };
        });
        return { ...prev, taskPositions: newPositions };
      });
    },
    [updateCanvasState]
  );

  // Connection creation
  const handleConnectionCreate = useCallback(
    (sourceId: string, targetId: string) => {
      // Check if connection already exists
      const exists = canvasState.connections.some(
        (c) =>
          (c.sourceId === sourceId && c.targetId === targetId) ||
          (c.sourceId === targetId && c.targetId === sourceId)
      );
      if (exists) {
        toast.error("Connection already exists");
        return;
      }

      const newConnection: TaskConnection = {
        id: `conn-${Date.now()}`,
        sourceId,
        targetId,
      };

      updateCanvasState((prev) => ({
        ...prev,
        connections: [...prev.connections, newConnection],
      }));

      toast.success("Connection created");
    },
    [canvasState.connections, updateCanvasState]
  );

  // Connection deletion
  const handleConnectionDelete = useCallback(
    (connectionId: string) => {
      updateCanvasState((prev) => ({
        ...prev,
        connections: prev.connections.filter((c) => c.id !== connectionId),
      }));
      toast.success("Connection removed");
    },
    [updateCanvasState]
  );

  // Group creation
  const handleGroupCreate = useCallback(
    (name: string, color: string) => {
      if (selectedTaskIds.size < 2) {
        toast.error("Select at least 2 tasks to create a group");
        return;
      }

      const taskIds = Array.from(selectedTaskIds);
      const positions = taskIds
        .map((id) => canvasState.taskPositions[id])
        .filter(Boolean);

      if (positions.length === 0) {
        toast.error("Selected tasks have no positions");
        return;
      }

      const bounds = {
        x: Math.min(...positions.map((p) => p.x)),
        y: Math.min(...positions.map((p) => p.y)),
        width:
          Math.max(...positions.map((p) => p.x + p.width)) -
          Math.min(...positions.map((p) => p.x)),
        height:
          Math.max(...positions.map((p) => p.y + p.height)) -
          Math.min(...positions.map((p) => p.y)),
      };

      const newGroup: TaskGroup = {
        id: `group-${Date.now()}`,
        name,
        taskIds,
        color,
        bounds,
      };

      updateCanvasState((prev) => ({
        ...prev,
        groups: [...prev.groups, newGroup],
      }));

      setSelectedTaskIds(new Set());
      toast.success(`Group "${name}" created`);
    },
    [selectedTaskIds, canvasState.taskPositions, updateCanvasState]
  );

  // Viewport change
  const handleViewportChange = useCallback(
    (viewport: { zoom: number; x: number; y: number }) => {
      updateCanvasState(
        (prev) => ({
          ...prev,
          zoom: viewport.zoom,
          viewportX: viewport.x,
          viewportY: viewport.y,
        }),
        false // Don't add viewport changes to history
      );
    },
    [updateCanvasState]
  );

  // Task click for details
  const handleTaskClick = useCallback((task: CanvasTask) => {
    setSelectedTaskForDetail(task);
    setDetailSheetOpen(true);
  }, []);

  // Grid toggle
  const handleGridToggle = useCallback(() => {
    setGridEnabled((prev) => !prev);
  }, []);

  // Export canvas
  const handleExport = useCallback(
    (format: "png" | "svg" | "json") => {
      if (format === "json") {
        const data = JSON.stringify(
          {
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              position: canvasState.taskPositions[t.id],
            })),
            connections: canvasState.connections,
            groups: canvasState.groups,
          },
          null,
          2
        );
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `canvas-${projectId || "global"}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Canvas exported as JSON");
      } else {
        toast.info(`${format.toUpperCase()} export coming soon`);
      }
    },
    [tasks, canvasState, projectId]
  );

  // Reset view
  const handleResetView = useCallback(() => {
    updateCanvasState(
      (prev) => ({
        ...prev,
        zoom: 1,
        viewportX: 0,
        viewportY: 0,
      }),
      false
    );
  }, [updateCanvasState]);

  // Fit to view
  const handleFitToView = useCallback(() => {
    const positions = Object.values(canvasState.taskPositions);
    if (positions.length === 0) return;

    const bounds = {
      minX: Math.min(...positions.map((p) => p.x)),
      minY: Math.min(...positions.map((p) => p.y)),
      maxX: Math.max(...positions.map((p) => p.x + p.width)),
      maxY: Math.max(...positions.map((p) => p.y + p.height)),
    };

    const padding = 100;
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;

    // Assume canvas container is full screen minus some padding
    const containerWidth = window.innerWidth - 300;
    const containerHeight = window.innerHeight - 200;

    const zoom = Math.min(
      1,
      Math.min(containerWidth / contentWidth, containerHeight / contentHeight)
    );

    const viewportX = -bounds.minX * zoom + padding;
    const viewportY = -bounds.minY * zoom + padding;

    updateCanvasState(
      (prev) => ({
        ...prev,
        zoom,
        viewportX,
        viewportY,
      }),
      false
    );
  }, [canvasState.taskPositions, updateCanvasState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "v":
          setActiveTool("select");
          break;
        case "h":
          setActiveTool("pan");
          break;
        case "c":
          setActiveTool("connect");
          break;
        case "g":
          if (selectedTaskIds.size >= 2) {
            // Trigger group creation
          }
          break;
        case "#":
          handleGridToggle();
          break;
        case "z":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case "escape":
          setSelectedTaskIds(new Set());
          break;
        case "delete":
        case "backspace":
          // Could delete selected connections
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTaskIds.size, handleGridToggle, handleUndo, handleRedo]);

  const isLoading = tasksLoading || canvasLoading;

  // Get full task details for the detail sheet
  const selectedFullTask = useMemo(() => {
    if (!selectedTaskForDetail) return null;
    return tasksData.find((t: any) => t.id === selectedTaskForDetail.id);
  }, [selectedTaskForDetail, tasksData]);

  const statusConfig: Record<string, { icon: typeof Circle; color: string; label: string }> = {
    pending: { icon: Circle, color: "text-muted-foreground", label: "Pending" },
    planning: { icon: Clock, color: "text-blue-500", label: "Planning" },
    planned: { icon: Clock, color: "text-blue-500", label: "Planned" },
    in_progress: { icon: Clock, color: "text-yellow-500", label: "In Progress" },
    completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
    failed: { icon: AlertCircle, color: "text-red-500", label: "Failed" },
    cancelled: { icon: X, color: "text-muted-foreground", label: "Cancelled" },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Spatial Canvas</h1>
          <Badge variant="outline" className="text-xs">
            {tasks.length} tasks
          </Badge>
          {isSaving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={projectId || "all"}
            onValueChange={(value) => {
              if (value === "all") {
                setSearchParams({});
              } else {
                setSearchParams({ projectId: value });
              }
            }}
          >
            <SelectTrigger className="w-[200px]">
              <FolderKanban className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((project: any) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderKanban className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No tasks to display</h2>
            <p className="text-muted-foreground mb-4">
              {projectId
                ? "This project has no tasks yet."
                : "Create some tasks to organize them on the canvas."}
            </p>
            <Button onClick={() => navigate("/tasks")}>Go to Tasks</Button>
          </div>
        ) : (
          <>
            {/* Canvas */}
            <SpatialCanvas
              tasks={tasks}
              canvasState={canvasState}
              selectedTaskIds={selectedTaskIds}
              activeTool={activeTool}
              gridEnabled={gridEnabled}
              onTaskSelect={handleTaskSelect}
              onTaskMove={handleTaskMove}
              onMultiTaskMove={handleMultiTaskMove}
              onConnectionCreate={handleConnectionCreate}
              onConnectionDelete={handleConnectionDelete}
              onGroupCreate={handleGroupCreate}
              onViewportChange={handleViewportChange}
              onTaskClick={handleTaskClick}
            />

            {/* Floating toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <CanvasToolbar
                activeTool={activeTool}
                zoom={canvasState.zoom}
                gridEnabled={gridEnabled}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                selectedCount={selectedTaskIds.size}
                onToolChange={setActiveTool}
                onZoomChange={(zoom) =>
                  handleViewportChange({
                    zoom,
                    x: canvasState.viewportX,
                    y: canvasState.viewportY,
                  })
                }
                onGridToggle={handleGridToggle}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onExport={handleExport}
                onResetView={handleResetView}
                onFitToView={handleFitToView}
                onCreateGroup={(name, color) => handleGroupCreate(name, color)}
              />
            </div>
          </>
        )}
      </div>

      {/* Task Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          {selectedFullTask && (
            <>
              <SheetHeader className="space-y-1">
                <div className="flex items-start justify-between">
                  <SheetTitle className="text-lg pr-8">
                    {selectedFullTask.title}
                  </SheetTitle>
                </div>
                <SheetDescription className="flex items-center gap-2">
                  {(() => {
                    const config = statusConfig[selectedFullTask.status];
                    const StatusIcon = config?.icon || Circle;
                    return (
                      <>
                        <StatusIcon className={cn("h-4 w-4", config?.color)} />
                        <span>{config?.label || selectedFullTask.status}</span>
                      </>
                    );
                  })()}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Meta info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Type</p>
                    <Badge variant="secondary" className="capitalize">
                      {selectedFullTask.type}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        selectedFullTask.priority === "critical" &&
                          "border-red-500 text-red-500",
                        selectedFullTask.priority === "high" &&
                          "border-orange-500 text-orange-500",
                        selectedFullTask.priority === "medium" &&
                          "border-yellow-500 text-yellow-500",
                        selectedFullTask.priority === "low" &&
                          "border-green-500 text-green-500"
                      )}
                    >
                      {selectedFullTask.priority}
                    </Badge>
                  </div>
                </div>

                {/* Repository */}
                {selectedFullTask.repositoryName && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Repository</p>
                    <div className="flex items-center gap-2 text-sm">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedFullTask.repositoryName}</span>
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedFullTask.description && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm">{selectedFullTask.description}</p>
                  </div>
                )}

                {/* Created at */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {new Date(selectedFullTask.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4">
                  <Button
                    onClick={() => {
                      setDetailSheetOpen(false);
                      navigate(`/tasks/${selectedFullTask.id}`);
                    }}
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
