import { Search, LayoutList, Kanban, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TaskViewMode = "list" | "kanban";

interface TaskViewToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: TaskViewMode;
  onViewModeChange: (mode: TaskViewMode) => void;
}

export function TaskViewToolbar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
}: TaskViewToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks..."
          className="h-8 pl-8 pr-8 text-sm"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* View Toggle */}
      <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 p-0 rounded-sm",
            viewMode === "list" && "bg-background shadow-sm"
          )}
          onClick={() => onViewModeChange("list")}
          title="List view"
        >
          <LayoutList className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 w-7 p-0 rounded-sm",
            viewMode === "kanban" && "bg-background shadow-sm"
          )}
          onClick={() => onViewModeChange("kanban")}
          title="Kanban view"
        >
          <Kanban className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
