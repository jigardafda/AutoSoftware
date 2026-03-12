import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MousePointer2,
  Hand,
  Link2,
  Group,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Undo2,
  Redo2,
  Download,
  RotateCcw,
  Maximize,
  Palette,
} from "lucide-react";

export type CanvasTool = "select" | "pan" | "connect" | "group";

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  zoom: number;
  gridEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onToolChange: (tool: CanvasTool) => void;
  onZoomChange: (zoom: number) => void;
  onGridToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: (format: "png" | "svg" | "json") => void;
  onResetView: () => void;
  onFitToView: () => void;
  onCreateGroup: (name: string, color: string) => void;
}

const tools: Array<{
  id: CanvasTool;
  icon: typeof MousePointer2;
  label: string;
  shortcut: string;
}> = [
  { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
  { id: "pan", icon: Hand, label: "Pan", shortcut: "H" },
  { id: "connect", icon: Link2, label: "Connect", shortcut: "C" },
  { id: "group", icon: Group, label: "Group", shortcut: "G" },
];

const zoomPresets = [25, 50, 75, 100, 125, 150, 200];

const groupColors = [
  { id: "blue", label: "Blue", class: "bg-blue-500" },
  { id: "green", label: "Green", class: "bg-green-500" },
  { id: "purple", label: "Purple", class: "bg-purple-500" },
  { id: "orange", label: "Orange", class: "bg-orange-500" },
  { id: "pink", label: "Pink", class: "bg-pink-500" },
];

export function CanvasToolbar({
  activeTool,
  zoom,
  gridEnabled,
  canUndo,
  canRedo,
  selectedCount,
  onToolChange,
  onZoomChange,
  onGridToggle,
  onUndo,
  onRedo,
  onExport,
  onResetView,
  onFitToView,
  onCreateGroup,
}: CanvasToolbarProps) {
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState("blue");

  const handleCreateGroup = () => {
    if (groupName.trim()) {
      onCreateGroup(groupName.trim(), groupColor);
      setGroupDialogOpen(false);
      setGroupName("");
      setGroupColor("blue");
    }
  };

  const handleToolClick = (tool: CanvasTool) => {
    if (tool === "group" && selectedCount >= 2) {
      setGroupDialogOpen(true);
    } else {
      onToolChange(tool);
    }
  };

  const zoomPercentage = Math.round(zoom * 100);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1 p-2 bg-card/95 backdrop-blur border rounded-lg shadow-lg">
        {/* Tools */}
        <div className="flex items-center gap-0.5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            const isGroupDisabled = tool.id === "group" && selectedCount < 2;

            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      isActive && "bg-primary/10 text-primary",
                      isGroupDisabled && "opacity-50"
                    )}
                    onClick={() => handleToolClick(tool.id)}
                    disabled={isGroupDisabled}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="flex items-center gap-2">
                    <span>{tool.label}</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted font-mono">
                      {tool.shortcut}
                    </kbd>
                  </div>
                  {tool.id === "group" && selectedCount < 2 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Select 2+ tasks to create a group
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))}
                disabled={zoom <= 0.25}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom out</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-16 text-xs font-mono px-2"
              >
                {zoomPercentage}%
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {zoomPresets.map((preset) => (
                <DropdownMenuItem
                  key={preset}
                  onClick={() => onZoomChange(preset / 100)}
                  className={cn(
                    "justify-center font-mono text-sm",
                    Math.round(zoom * 100) === preset && "bg-accent"
                  )}
                >
                  {preset}%
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onFitToView}>
                <Maximize className="h-4 w-4 mr-2" />
                Fit to view
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onResetView}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}
                disabled={zoom >= 2}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom in</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Grid toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={gridEnabled ? "secondary" : "ghost"}
              size="icon"
              className={cn("h-8 w-8", gridEnabled && "bg-primary/10 text-primary")}
              onClick={onGridToggle}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex items-center gap-2">
              <span>Toggle grid</span>
              <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted font-mono">#</kbd>
            </div>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="flex items-center gap-2">
                <span>Undo</span>
                <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted font-mono">
                  Cmd+Z
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="flex items-center gap-2">
                <span>Redo</span>
                <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-muted font-mono">
                  Cmd+Shift+Z
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Export */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Export canvas</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport("png")}>
              Export as PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("svg")}>
              Export as SVG
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport("json")}>
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Group Creation Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Create a group from the {selectedCount} selected tasks. Groups help
              organize related tasks visually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., Authentication Tasks"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                {groupColors.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      color.class,
                      groupColor === color.id
                        ? "ring-2 ring-offset-2 ring-primary"
                        : "opacity-60 hover:opacity-100"
                    )}
                    onClick={() => setGroupColor(color.id)}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={!groupName.trim()}>
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// Floating toolbar for quick actions on selection
interface SelectionToolbarProps {
  selectedCount: number;
  position: { x: number; y: number };
  onGroup: () => void;
  onConnect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function SelectionToolbar({
  selectedCount,
  position,
  onGroup,
  onConnect,
  onDelete,
  onDuplicate,
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="absolute z-50 flex items-center gap-1 p-1.5 bg-card/95 backdrop-blur border rounded-lg shadow-lg"
      style={{
        left: position.x,
        top: position.y - 50,
        transform: "translateX(-50%)",
      }}
    >
      <TooltipProvider delayDuration={0}>
        <span className="px-2 text-xs text-muted-foreground">
          {selectedCount} selected
        </span>
        <Separator orientation="vertical" className="h-5" />
        {selectedCount >= 2 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onGroup}>
                  <Group className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create group</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onConnect}>
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Connect tasks</TooltipContent>
            </Tooltip>
          </>
        )}
      </TooltipProvider>
    </div>
  );
}
