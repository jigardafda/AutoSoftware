/**
 * MemoryCard Component
 *
 * Displays a single project memory with metadata.
 * Supports inline editing, deletion with confirmation, and linking to related tasks.
 */

import { useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Brain,
  Code2,
  FileCode,
  Lightbulb,
  BookOpen,
  MoreVertical,
  Pencil,
  Trash2,
  Link2,
  Check,
  X,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type ProjectMemory,
  type MemoryCategory,
  type UpdateMemoryInput,
  MEMORY_CATEGORIES,
  getCategoryConfig,
} from "@/hooks/useProjectMemory";

// ============================================================================
// Types
// ============================================================================

interface MemoryCardProps {
  memory: ProjectMemory;
  onUpdate?: (id: string, input: UpdateMemoryInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onLinkTask?: (memoryId: string, taskId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
  compact?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

const categoryIcons: Record<MemoryCategory, React.ElementType> = {
  architecture: Brain,
  convention: Code2,
  decision: FileCode,
  learning: Lightbulb,
  context: BookOpen,
};

const categoryColors: Record<MemoryCategory, string> = {
  architecture: "text-purple-500 bg-purple-500/10 border-purple-500/20",
  convention: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  decision: "text-green-500 bg-green-500/10 border-green-500/20",
  learning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  context: "text-gray-500 bg-gray-500/10 border-gray-500/20",
};

function ImportanceStars({ value }: { value: number }) {
  const fullStars = Math.min(Math.floor(value / 2), 5);
  const hasHalf = value % 2 >= 1;

  return (
    <div className="flex items-center gap-0.5" title={`Importance: ${value}/10`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < fullStars
              ? "fill-amber-400 text-amber-400"
              : i === fullStars && hasHalf
                ? "fill-amber-400/50 text-amber-400"
                : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function MemoryCard({
  memory,
  onUpdate,
  onDelete,
  onLinkTask,
  onNavigateToTask,
  isUpdating,
  isDeleting,
  compact = false,
}: MemoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editedTitle, setEditedTitle] = useState(memory.title);
  const [editedContent, setEditedContent] = useState(memory.content);
  const [editedCategory, setEditedCategory] = useState<MemoryCategory>(memory.category);
  const [editedImportance, setEditedImportance] = useState(memory.importance);

  const CategoryIcon = categoryIcons[memory.category];
  const categoryConfig = getCategoryConfig(memory.category);

  const handleStartEdit = useCallback(() => {
    setEditedTitle(memory.title);
    setEditedContent(memory.content);
    setEditedCategory(memory.category);
    setEditedImportance(memory.importance);
    setIsEditing(true);
  }, [memory]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedTitle(memory.title);
    setEditedContent(memory.content);
    setEditedCategory(memory.category);
    setEditedImportance(memory.importance);
  }, [memory]);

  const handleSaveEdit = useCallback(async () => {
    if (!onUpdate) return;

    await onUpdate(memory.id, {
      title: editedTitle,
      content: editedContent,
      category: editedCategory,
      importance: editedImportance,
    });

    setIsEditing(false);
  }, [
    onUpdate,
    memory.id,
    editedTitle,
    editedContent,
    editedCategory,
    editedImportance,
  ]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    await onDelete(memory.id);
    setShowDeleteConfirm(false);
  }, [onDelete, memory.id]);

  // Truncate content for display
  const displayContent =
    memory.content.length > 200 && !isExpanded
      ? memory.content.substring(0, 200) + "..."
      : memory.content;
  const needsTruncation = memory.content.length > 200;

  if (compact) {
    return (
      <div
        className={cn(
          "group flex items-start gap-2 p-2 rounded-md border transition-colors hover:bg-muted/50",
          categoryColors[memory.category]
        )}
      >
        <CategoryIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{memory.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {memory.content}
          </p>
        </div>
        <ImportanceStars value={memory.importance} />
      </div>
    );
  }

  return (
    <>
      <Card
        className={cn(
          "transition-all",
          memory.isConsolidated && "border-dashed"
        )}
      >
        <CardContent className="p-4">
          {isEditing ? (
            // Edit Mode
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder="Memory title"
                  className="flex-1"
                />
                <Select
                  value={editedCategory}
                  onValueChange={(v) => setEditedCategory(v as MemoryCategory)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMORY_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                placeholder="Memory content"
                rows={4}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Importance:
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={editedImportance}
                    onChange={(e) => setEditedImportance(parseInt(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm font-medium w-4">
                    {editedImportance}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={isUpdating || !editedTitle.trim()}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // View Mode
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <div
                    className={cn(
                      "p-1.5 rounded-md",
                      categoryColors[memory.category]
                    )}
                  >
                    <CategoryIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm leading-tight">
                      {memory.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", categoryColors[memory.category])}
                      >
                        {categoryConfig.label}
                      </Badge>
                      {memory.isConsolidated && (
                        <Badge variant="outline" className="text-[10px]">
                          Consolidated
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ImportanceStars value={memory.importance} />

                  {(onUpdate || onDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onUpdate && (
                          <DropdownMenuItem onClick={handleStartEdit}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onLinkTask && (
                          <DropdownMenuItem
                            onClick={() => onLinkTask(memory.id, "")}
                          >
                            <Link2 className="h-4 w-4 mr-2" />
                            Link to Task
                          </DropdownMenuItem>
                        )}
                        {onDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setShowDeleteConfirm(true)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {displayContent}
                {needsTruncation && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-0.5" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-0.5" />
                        Show more
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Tags */}
              {memory.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memory.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Related Tasks */}
              {memory.relatedTaskIds.length > 0 && onNavigateToTask && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Related tasks:
                  </span>
                  {memory.relatedTaskIds.slice(0, 3).map((taskId) => (
                    <Button
                      key={taskId}
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => onNavigateToTask(taskId)}
                    >
                      #{taskId.slice(-6)}
                    </Button>
                  ))}
                  {memory.relatedTaskIds.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{memory.relatedTaskIds.length - 3} more
                    </span>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(memory.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {memory.consolidatedAt && (
                  <span className="text-xs text-muted-foreground">
                    Consolidated from {memory.sourceMemoryIds.length} memories
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{memory.title}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default MemoryCard;
