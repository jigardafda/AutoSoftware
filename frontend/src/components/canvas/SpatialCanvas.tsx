import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Circle,
  Bug,
  Lightbulb,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";

// Types
export interface CanvasTask {
  id: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  repositoryName?: string;
}

export interface TaskPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TaskConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface TaskGroup {
  id: string;
  name: string;
  taskIds: string[];
  color: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface CanvasState {
  taskPositions: Record<string, TaskPosition>;
  connections: TaskConnection[];
  groups: TaskGroup[];
  zoom: number;
  viewportX: number;
  viewportY: number;
}

interface SpatialCanvasProps {
  tasks: CanvasTask[];
  canvasState: CanvasState;
  selectedTaskIds: Set<string>;
  activeTool: "select" | "pan" | "connect" | "group";
  gridEnabled: boolean;
  gridSize?: number;
  onTaskSelect: (taskId: string, addToSelection: boolean) => void;
  onTaskMove: (taskId: string, position: { x: number; y: number }) => void;
  onMultiTaskMove: (moves: Array<{ taskId: string; position: { x: number; y: number } }>) => void;
  onConnectionCreate: (sourceId: string, targetId: string) => void;
  onConnectionDelete: (connectionId: string) => void;
  onGroupCreate: (taskIds: string[], name: string, color: string) => void;
  onViewportChange: (viewport: { zoom: number; x: number; y: number }) => void;
  onTaskClick: (task: CanvasTask) => void;
}

const GRID_SIZE = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const DEFAULT_CARD_WIDTH = 280;
const DEFAULT_CARD_HEIGHT = 120;

const statusIcons: Record<string, typeof Circle> = {
  pending: Circle,
  planning: Clock,
  planned: Clock,
  in_progress: Clock,
  completed: CheckCircle2,
  failed: AlertCircle,
  cancelled: AlertCircle,
};

const statusColors: Record<string, string> = {
  pending: "text-muted-foreground",
  planning: "text-blue-500",
  planned: "text-blue-500",
  in_progress: "text-yellow-500",
  completed: "text-green-500",
  failed: "text-red-500",
  cancelled: "text-muted-foreground",
};

const typeIcons: Record<string, typeof Sparkles> = {
  feature: Sparkles,
  bugfix: Bug,
  improvement: Lightbulb,
  refactor: RefreshCw,
  security: Shield,
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-500 border-red-500/30",
  high: "bg-orange-500/20 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  low: "bg-green-500/20 text-green-500 border-green-500/30",
};

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

interface TaskCardProps {
  task: CanvasTask;
  position: TaskPosition;
  isSelected: boolean;
  isInGroup: boolean;
  zoom: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function TaskCard({
  task,
  position,
  isSelected,
  isInGroup,
  zoom,
  onMouseDown,
  onClick,
}: TaskCardProps) {
  const StatusIcon = statusIcons[task.status] || Circle;
  const TypeIcon = typeIcons[task.type] || Sparkles;

  return (
    <div
      className={cn(
        "absolute rounded-lg border bg-card shadow-md cursor-grab active:cursor-grabbing transition-shadow",
        isSelected && "ring-2 ring-primary shadow-lg",
        isInGroup && "ring-1 ring-blue-400/50"
      )}
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      }}
      onMouseDown={onMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <div className="p-3 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon className={cn("h-4 w-4 shrink-0", statusColors[task.status])} />
            <span className="text-sm font-medium truncate">{task.title}</span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-auto">
          <Badge variant="outline" className={cn("text-[10px]", priorityColors[task.priority])}>
            {task.priority}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TypeIcon className="h-3 w-3" />
            <span>{task.type}</span>
          </div>
        </div>

        {/* Repository */}
        {task.repositoryName && (
          <div className="text-[10px] text-muted-foreground mt-1 truncate">
            {task.repositoryName}
          </div>
        )}
      </div>

      {/* Connection handles */}
      <div
        className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
        data-handle="left"
      />
      <div
        className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
        data-handle="right"
      />
    </div>
  );
}

interface ConnectionLineProps {
  connection: TaskConnection;
  sourcePos: TaskPosition;
  targetPos: TaskPosition;
  zoom: number;
  onDelete: () => void;
}

function ConnectionLine({ connection, sourcePos, targetPos, zoom, onDelete }: ConnectionLineProps) {
  const sourceX = sourcePos.x + sourcePos.width;
  const sourceY = sourcePos.y + sourcePos.height / 2;
  const targetX = targetPos.x;
  const targetY = targetPos.y + targetPos.height / 2;

  // Calculate control points for a smooth bezier curve
  const midX = (sourceX + targetX) / 2;
  const path = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

  return (
    <g className="group cursor-pointer" onClick={onDelete}>
      {/* Invisible wider path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20 / zoom}
        className="pointer-events-auto"
      />
      {/* Visible path */}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2 / zoom}
        className="text-primary/50 group-hover:text-primary transition-colors"
        markerEnd="url(#arrowhead)"
      />
      {/* Label */}
      {connection.label && (
        <text
          x={midX}
          y={(sourceY + targetY) / 2 - 8}
          textAnchor="middle"
          className="text-xs fill-muted-foreground"
          style={{ fontSize: 12 / zoom }}
        >
          {connection.label}
        </text>
      )}
    </g>
  );
}

interface GroupOverlayProps {
  group: TaskGroup;
  zoom: number;
  isSelected: boolean;
}

function GroupOverlay({ group, zoom, isSelected }: GroupOverlayProps) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-500/10 border-blue-500/30",
    green: "bg-green-500/10 border-green-500/30",
    purple: "bg-purple-500/10 border-purple-500/30",
    orange: "bg-orange-500/10 border-orange-500/30",
    pink: "bg-pink-500/10 border-pink-500/30",
  };

  return (
    <div
      className={cn(
        "absolute rounded-xl border-2 border-dashed pointer-events-none",
        colorClasses[group.color] || colorClasses.blue,
        isSelected && "ring-2 ring-primary"
      )}
      style={{
        left: group.bounds.x - 16,
        top: group.bounds.y - 32,
        width: group.bounds.width + 32,
        height: group.bounds.height + 48,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      }}
    >
      <div
        className="absolute -top-6 left-2 px-2 py-0.5 text-xs font-medium rounded bg-background"
        style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top left" }}
      >
        {group.name}
      </div>
    </div>
  );
}

interface MiniMapProps {
  tasks: CanvasTask[];
  taskPositions: Record<string, TaskPosition>;
  viewport: { x: number; y: number; zoom: number };
  canvasSize: { width: number; height: number };
  onViewportChange: (x: number, y: number) => void;
}

function MiniMap({ tasks, taskPositions, viewport, canvasSize, onViewportChange }: MiniMapProps) {
  const miniMapRef = useRef<HTMLDivElement>(null);
  const scale = 0.05;
  const miniMapWidth = 200;
  const miniMapHeight = 150;

  // Calculate bounds of all tasks
  const bounds = useMemo(() => {
    const positions = Object.values(taskPositions);
    if (positions.length === 0) {
      return { minX: 0, minY: 0, maxX: 5000, maxY: 3000 };
    }
    return {
      minX: Math.min(...positions.map((p) => p.x)),
      minY: Math.min(...positions.map((p) => p.y)),
      maxX: Math.max(...positions.map((p) => p.x + p.width)),
      maxY: Math.max(...positions.map((p) => p.y + p.height)),
    };
  }, [taskPositions]);

  const handleClick = (e: React.MouseEvent) => {
    if (!miniMapRef.current) return;
    const rect = miniMapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale - canvasSize.width / 2 / viewport.zoom;
    const y = (e.clientY - rect.top) / scale - canvasSize.height / 2 / viewport.zoom;
    onViewportChange(-x, -y);
  };

  return (
    <div
      ref={miniMapRef}
      className="absolute bottom-4 right-4 rounded-lg border bg-card/90 backdrop-blur shadow-lg overflow-hidden cursor-pointer"
      style={{ width: miniMapWidth, height: miniMapHeight }}
      onClick={handleClick}
    >
      <div
        className="relative w-full h-full"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {/* Task dots */}
        {tasks.map((task) => {
          const pos = taskPositions[task.id];
          if (!pos) return null;
          return (
            <div
              key={task.id}
              className={cn(
                "absolute rounded-sm",
                task.status === "completed"
                  ? "bg-green-500"
                  : task.status === "in_progress"
                  ? "bg-yellow-500"
                  : "bg-muted-foreground"
              )}
              style={{
                left: pos.x,
                top: pos.y,
                width: pos.width,
                height: pos.height,
              }}
            />
          );
        })}

        {/* Viewport indicator */}
        <div
          className="absolute border-2 border-primary bg-primary/10"
          style={{
            left: -viewport.x,
            top: -viewport.y,
            width: canvasSize.width / viewport.zoom,
            height: canvasSize.height / viewport.zoom,
          }}
        />
      </div>
    </div>
  );
}

export function SpatialCanvas({
  tasks,
  canvasState,
  selectedTaskIds,
  activeTool,
  gridEnabled,
  gridSize = GRID_SIZE,
  onTaskSelect,
  onTaskMove,
  onMultiTaskMove,
  onConnectionCreate,
  onConnectionDelete,
  onGroupCreate,
  onViewportChange,
  onTaskClick,
}: SpatialCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [connectionEnd, setConnectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const { taskPositions, connections, groups, zoom, viewportX, viewportY } = canvasState;

  // Track canvas size
  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        setCanvasSize({
          width: canvasRef.current.clientWidth,
          height: canvasRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Initialize positions for tasks without positions
  useEffect(() => {
    const unpositionedTasks = tasks.filter((t) => !taskPositions[t.id]);
    if (unpositionedTasks.length > 0) {
      const cols = Math.ceil(Math.sqrt(unpositionedTasks.length));
      unpositionedTasks.forEach((task, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 100 + col * (DEFAULT_CARD_WIDTH + 40);
        const y = 100 + row * (DEFAULT_CARD_HEIGHT + 40);
        onTaskMove(task.id, { x, y });
      });
    }
  }, [tasks, taskPositions, onTaskMove]);

  // Get task position with defaults
  const getTaskPosition = useCallback(
    (taskId: string): TaskPosition => {
      return (
        taskPositions[taskId] || {
          x: 100,
          y: 100,
          width: DEFAULT_CARD_WIDTH,
          height: DEFAULT_CARD_HEIGHT,
        }
      );
    },
    [taskPositions]
  );

  // Handle mouse down on canvas
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== canvasRef.current) return;

      const rect = canvasRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left - viewportX) / zoom;
      const y = (e.clientY - rect.top - viewportY) / zoom;

      if (activeTool === "pan" || e.button === 1) {
        setIsPanning(true);
        setDragStart({ x: e.clientX - viewportX, y: e.clientY - viewportY });
      } else if (activeTool === "select") {
        // Start selection box
        setIsSelecting(true);
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
        // Deselect all if not holding shift
        if (!e.shiftKey) {
          selectedTaskIds.forEach((id) => onTaskSelect(id, false));
        }
      }
    },
    [activeTool, viewportX, viewportY, zoom, selectedTaskIds, onTaskSelect]
  );

  // Handle mouse down on task
  const handleTaskMouseDown = useCallback(
    (taskId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      if (activeTool === "connect") {
        setIsConnecting(true);
        setConnectionStart(taskId);
        return;
      }

      if (activeTool === "select" || activeTool === "pan") {
        // Select task if not selected
        if (!selectedTaskIds.has(taskId)) {
          onTaskSelect(taskId, e.shiftKey || e.metaKey);
        }

        // Start dragging
        setIsDragging(true);
        const pos = getTaskPosition(taskId);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragOffset({ x: pos.x, y: pos.y });
      }
    },
    [activeTool, selectedTaskIds, onTaskSelect, getTaskPosition]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (isPanning && dragStart) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        onViewportChange({ zoom, x: newX, y: newY });
      } else if (isDragging && dragStart) {
        const dx = (e.clientX - dragStart.x) / zoom;
        const dy = (e.clientY - dragStart.y) / zoom;
        let newX = dragOffset.x + dx;
        let newY = dragOffset.y + dy;

        if (gridEnabled) {
          newX = snapToGrid(newX, gridSize);
          newY = snapToGrid(newY, gridSize);
        }

        // Move all selected tasks
        const moves = Array.from(selectedTaskIds).map((id) => {
          const currentPos = getTaskPosition(id);
          const firstSelectedPos = getTaskPosition(Array.from(selectedTaskIds)[0]);
          const offsetX = currentPos.x - firstSelectedPos.x;
          const offsetY = currentPos.y - firstSelectedPos.y;
          return {
            taskId: id,
            position: {
              x: newX + offsetX,
              y: newY + offsetY,
            },
          };
        });
        onMultiTaskMove(moves);
      } else if (isConnecting && connectionStart) {
        const x = (e.clientX - rect.left - viewportX) / zoom;
        const y = (e.clientY - rect.top - viewportY) / zoom;
        setConnectionEnd({ x, y });
      } else if (isSelecting && selectionBox) {
        const x = (e.clientX - rect.left - viewportX) / zoom;
        const y = (e.clientY - rect.top - viewportY) / zoom;
        setSelectionBox((prev) => (prev ? { ...prev, endX: x, endY: y } : null));
      }
    },
    [
      isPanning,
      isDragging,
      isConnecting,
      isSelecting,
      dragStart,
      dragOffset,
      connectionStart,
      selectionBox,
      zoom,
      viewportX,
      viewportY,
      gridEnabled,
      gridSize,
      selectedTaskIds,
      getTaskPosition,
      onViewportChange,
      onMultiTaskMove,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (isConnecting && connectionStart) {
        // Find task under mouse
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left - viewportX) / zoom;
          const y = (e.clientY - rect.top - viewportY) / zoom;

          // Check if mouse is over a task
          for (const task of tasks) {
            const pos = getTaskPosition(task.id);
            if (
              task.id !== connectionStart &&
              x >= pos.x &&
              x <= pos.x + pos.width &&
              y >= pos.y &&
              y <= pos.y + pos.height
            ) {
              onConnectionCreate(connectionStart, task.id);
              break;
            }
          }
        }
      }

      if (isSelecting && selectionBox) {
        // Select all tasks within selection box
        const minX = Math.min(selectionBox.startX, selectionBox.endX);
        const maxX = Math.max(selectionBox.startX, selectionBox.endX);
        const minY = Math.min(selectionBox.startY, selectionBox.endY);
        const maxY = Math.max(selectionBox.startY, selectionBox.endY);

        tasks.forEach((task) => {
          const pos = getTaskPosition(task.id);
          const taskCenterX = pos.x + pos.width / 2;
          const taskCenterY = pos.y + pos.height / 2;

          if (
            taskCenterX >= minX &&
            taskCenterX <= maxX &&
            taskCenterY >= minY &&
            taskCenterY <= maxY
          ) {
            onTaskSelect(task.id, true);
          }
        });
      }

      setIsPanning(false);
      setIsDragging(false);
      setIsConnecting(false);
      setIsSelecting(false);
      setDragStart(null);
      setConnectionStart(null);
      setConnectionEnd(null);
      setSelectionBox(null);
    },
    [
      isConnecting,
      isSelecting,
      connectionStart,
      selectionBox,
      tasks,
      viewportX,
      viewportY,
      zoom,
      getTaskPosition,
      onConnectionCreate,
      onTaskSelect,
    ]
  );

  // Handle wheel for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));

      // Zoom towards mouse position
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newViewportX = mouseX - ((mouseX - viewportX) * newZoom) / zoom;
        const newViewportY = mouseY - ((mouseY - viewportY) * newZoom) / zoom;
        onViewportChange({ zoom: newZoom, x: newViewportX, y: newViewportY });
      }
    },
    [zoom, viewportX, viewportY, onViewportChange]
  );

  // Check if a task is in any group
  const isTaskInGroup = useCallback(
    (taskId: string) => {
      return groups.some((g) => g.taskIds.includes(taskId));
    },
    [groups]
  );

  // Render grid
  const gridPattern = useMemo(() => {
    if (!gridEnabled) return null;
    return (
      <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
        <defs>
          <pattern
            id="grid"
            width={gridSize * zoom}
            height={gridSize * zoom}
            patternUnits="userSpaceOnUse"
            x={viewportX % (gridSize * zoom)}
            y={viewportY % (gridSize * zoom)}
          >
            <circle
              cx={gridSize * zoom / 2}
              cy={gridSize * zoom / 2}
              r={1}
              fill="currentColor"
              className="text-border"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    );
  }, [gridEnabled, gridSize, zoom, viewportX, viewportY]);

  return (
    <div
      ref={canvasRef}
      className={cn(
        "relative w-full h-full overflow-hidden bg-background",
        isPanning && "cursor-grabbing",
        activeTool === "pan" && !isPanning && "cursor-grab",
        activeTool === "connect" && "cursor-crosshair"
      )}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Grid */}
      {gridPattern}

      {/* Canvas content */}
      <div
        className="absolute"
        style={{
          transform: `translate(${viewportX}px, ${viewportY}px)`,
        }}
      >
        {/* SVG for connections */}
        <svg
          className="absolute pointer-events-none"
          style={{
            width: 10000,
            height: 10000,
            left: 0,
            top: 0,
            overflow: "visible",
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth={10}
              markerHeight={7}
              refX={9}
              refY={3.5}
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="currentColor"
                className="text-primary/50"
              />
            </marker>
          </defs>

          {/* Existing connections */}
          {connections.map((conn) => {
            const sourcePos = getTaskPosition(conn.sourceId);
            const targetPos = getTaskPosition(conn.targetId);
            return (
              <ConnectionLine
                key={conn.id}
                connection={conn}
                sourcePos={sourcePos}
                targetPos={targetPos}
                zoom={zoom}
                onDelete={() => onConnectionDelete(conn.id)}
              />
            );
          })}

          {/* Connection being drawn */}
          {isConnecting && connectionStart && connectionEnd && (
            <line
              x1={getTaskPosition(connectionStart).x + getTaskPosition(connectionStart).width}
              y1={
                getTaskPosition(connectionStart).y + getTaskPosition(connectionStart).height / 2
              }
              x2={connectionEnd.x}
              y2={connectionEnd.y}
              stroke="currentColor"
              strokeWidth={2 / zoom}
              strokeDasharray={`${5 / zoom} ${5 / zoom}`}
              className="text-primary"
            />
          )}
        </svg>

        {/* Groups */}
        {groups.map((group) => (
          <GroupOverlay
            key={group.id}
            group={group}
            zoom={zoom}
            isSelected={group.taskIds.every((id) => selectedTaskIds.has(id))}
          />
        ))}

        {/* Task cards */}
        {tasks.map((task) => {
          const position = getTaskPosition(task.id);
          return (
            <TaskCard
              key={task.id}
              task={task}
              position={position}
              isSelected={selectedTaskIds.has(task.id)}
              isInGroup={isTaskInGroup(task.id)}
              zoom={zoom}
              onMouseDown={(e) => handleTaskMouseDown(task.id, e)}
              onClick={() => onTaskClick(task)}
            />
          );
        })}
      </div>

      {/* Selection box */}
      {isSelecting && selectionBox && (
        <div
          className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX) * zoom + viewportX,
            top: Math.min(selectionBox.startY, selectionBox.endY) * zoom + viewportY,
            width: Math.abs(selectionBox.endX - selectionBox.startX) * zoom,
            height: Math.abs(selectionBox.endY - selectionBox.startY) * zoom,
          }}
        />
      )}

      {/* Mini-map */}
      <MiniMap
        tasks={tasks}
        taskPositions={taskPositions}
        viewport={{ x: viewportX, y: viewportY, zoom }}
        canvasSize={canvasSize}
        onViewportChange={(x, y) => onViewportChange({ zoom, x, y })}
      />
    </div>
  );
}
