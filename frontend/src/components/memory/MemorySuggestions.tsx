/**
 * MemorySuggestions Component
 *
 * Shows relevant memories as suggestions when viewing a task.
 * Automatically finds memories related to the current task context.
 */

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MemoryCard } from "./MemoryCard";
import {
  useRelevantMemories,
  type ProjectMemory,
  getCategoryConfig,
} from "@/hooks/useProjectMemory";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ============================================================================
// Types
// ============================================================================

interface MemorySuggestionsProps {
  projectId?: string;
  repositoryId?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskType?: string;
  affectedFiles?: string[];
  className?: string;
  onNavigateToTask?: (taskId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function MemorySuggestions({
  projectId,
  repositoryId,
  taskTitle,
  taskDescription,
  taskType,
  affectedFiles,
  className,
  onNavigateToTask,
}: MemorySuggestionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: memories, isLoading } = useRelevantMemories(
    {
      projectId,
      repositoryId,
      taskTitle,
      taskDescription,
      taskType,
      affectedFiles,
    },
    {
      limit: 5,
      enabled: !!(projectId || repositoryId) && !!(taskTitle || taskDescription),
    }
  );

  // Filter out dismissed memories
  const visibleMemories = memories?.filter((m) => !dismissedIds.has(m.id)) ?? [];

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  if (isLoading || visibleMemories.length === 0) {
    return null;
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className={cn(
        "border rounded-lg border-purple-500/30 bg-purple-500/5",
        className
      )}
    >
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-purple-500/10 transition-colors">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Lightbulb className="h-4 w-4 text-purple-500" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-purple-500">
                Relevant Memories
              </h4>
              <p className="text-xs text-muted-foreground">
                {visibleMemories.length} suggestion
                {visibleMemories.length !== 1 ? "s" : ""} from past work
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isExpanded && (
              <div className="flex gap-1">
                {visibleMemories.slice(0, 3).map((memory) => (
                  <Badge
                    key={memory.id}
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      `text-${getCategoryConfig(memory.category).color}-500`,
                      `border-${getCategoryConfig(memory.category).color}-500/30`
                    )}
                  >
                    {getCategoryConfig(memory.category).label}
                  </Badge>
                ))}
                {visibleMemories.length > 3 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{visibleMemories.length - 3}
                  </Badge>
                )}
              </div>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-2">
          {visibleMemories.map((memory) => (
            <div key={memory.id} className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-6 w-6 z-10 opacity-50 hover:opacity-100"
                onClick={() => handleDismiss(memory.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              <MemoryCard
                memory={memory}
                onNavigateToTask={onNavigateToTask}
                compact
              />
            </div>
          ))}

          <p className="text-xs text-muted-foreground text-center pt-2">
            These memories may be helpful for this task
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default MemorySuggestions;
