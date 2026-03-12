/**
 * ProjectMemoryPanel Component
 *
 * Panel for viewing, adding, and managing repository memories.
 * Displayed on the Repository Detail page to track repository-level
 * architectural decisions, conventions, and learnings.
 *
 * Features:
 * - List of remembered decisions
 * - Add new memory form
 * - Search memories
 * - Memory categories (architecture, conventions, decisions, learnings)
 * - Memory importance indicator
 */

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Brain,
  Plus,
  Search,
  SlidersHorizontal,
  RefreshCw,
  Layers,
  BarChart3,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MemoryCard } from "./MemoryCard";
import {
  useProjectMemories,
  useRepositoryMemories,
  useCreateMemory,
  useUpdateMemory,
  useDeleteMemory,
  useSearchMemories,
  useMemoryStats,
  useAutoConsolidate,
  type MemoryCategory,
  type CreateMemoryInput,
  type UpdateMemoryInput,
  MEMORY_CATEGORIES,
} from "@/hooks/useProjectMemory";

// ============================================================================
// Types
// ============================================================================

interface ProjectMemoryPanelProps {
  projectId?: string;
  repositoryId?: string;
  onNavigateToTask?: (taskId: string) => void;
  className?: string;
  defaultCollapsed?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ProjectMemoryPanel({
  projectId,
  repositoryId,
  onNavigateToTask,
  className,
  defaultCollapsed = false,
}: ProjectMemoryPanelProps) {
  // State
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | "all">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("decision");
  const [newImportance, setNewImportance] = useState(5);
  const [newTags, setNewTags] = useState("");

  // Queries
  const {
    data: projectMemories,
    isLoading: isLoadingProject,
    refetch: refetchProject,
  } = useProjectMemories(projectId || "", {
    category: selectedCategory === "all" ? undefined : selectedCategory,
    enabled: !!projectId,
  });

  const {
    data: repoMemories,
    isLoading: isLoadingRepo,
    refetch: refetchRepo,
  } = useRepositoryMemories(repositoryId || "", {
    category: selectedCategory === "all" ? undefined : selectedCategory,
    enabled: !!repositoryId && !projectId,
  });

  const { data: searchResults, isLoading: isSearching } = useSearchMemories(
    searchQuery,
    {
      projectId,
      repositoryId,
      category: selectedCategory === "all" ? undefined : selectedCategory,
      enabled: searchQuery.length >= 2,
    }
  );

  const { data: stats } = useMemoryStats({
    projectId,
    repositoryId,
    enabled: !isCollapsed,
  });

  // Mutations
  const createMemory = useCreateMemory();
  const updateMemory = useUpdateMemory();
  const deleteMemory = useDeleteMemory();
  const autoConsolidate = useAutoConsolidate();

  // Computed
  const memories = useMemo(() => {
    if (searchQuery.length >= 2) {
      return searchResults || [];
    }
    return projectId ? projectMemories : repoMemories;
  }, [searchQuery, searchResults, projectId, projectMemories, repoMemories]);

  const isLoading = projectId ? isLoadingProject : isLoadingRepo;

  // Handlers
  const handleRefresh = useCallback(() => {
    if (projectId) {
      refetchProject();
    } else {
      refetchRepo();
    }
  }, [projectId, refetchProject, refetchRepo]);

  const handleCreateMemory = useCallback(async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Title and content are required");
      return;
    }

    const input: CreateMemoryInput = {
      projectId,
      repositoryId,
      category: newCategory,
      title: newTitle.trim(),
      content: newContent.trim(),
      importance: newImportance,
      tags: newTags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    };

    try {
      await createMemory.mutateAsync(input);
      toast.success("Memory created");

      // Reset form
      setNewTitle("");
      setNewContent("");
      setNewCategory("decision");
      setNewImportance(5);
      setNewTags("");
      setShowAddForm(false);
    } catch (error) {
      toast.error("Failed to create memory");
    }
  }, [
    projectId,
    repositoryId,
    newTitle,
    newContent,
    newCategory,
    newImportance,
    newTags,
    createMemory,
  ]);

  const handleUpdateMemory = useCallback(
    async (id: string, input: UpdateMemoryInput) => {
      try {
        await updateMemory.mutateAsync({ id, input });
        toast.success("Memory updated");
      } catch (error) {
        toast.error("Failed to update memory");
      }
    },
    [updateMemory]
  );

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      try {
        await deleteMemory.mutateAsync(id);
        toast.success("Memory deleted");
      } catch (error) {
        toast.error("Failed to delete memory");
      }
    },
    [deleteMemory]
  );

  const handleAutoConsolidate = useCallback(async () => {
    try {
      const result = await autoConsolidate.mutateAsync({
        projectId,
        repositoryId,
      });
      if (result.consolidationCount > 0) {
        toast.success(
          `Consolidated ${result.consolidationCount} memory groups`
        );
      } else {
        toast.info("No memories to consolidate");
      }
    } catch (error) {
      toast.error("Failed to consolidate memories");
    }
  }, [projectId, repositoryId, autoConsolidate]);

  // Render
  return (
    <Card className={cn("overflow-hidden", className)}>
      <Collapsible open={!isCollapsed} onOpenChange={(o) => setIsCollapsed(!o)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />
                <span>Memory</span>
                {stats && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {stats.total}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-1">
                {!isCollapsed && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefresh();
                      }}
                    >
                      <RefreshCw
                        className={cn("h-3 w-3", isLoading && "animate-spin")}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAddForm(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </>
                )}
                {isCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {/* Search and Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <Select
                value={selectedCategory}
                onValueChange={(v) =>
                  setSelectedCategory(v as MemoryCategory | "all")
                }
              >
                <SelectTrigger className="w-28 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {MEMORY_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover open={showFilters} onOpenChange={setShowFilters}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60" align="end">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Actions</h4>
                    <div className="grid gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start"
                        onClick={handleAutoConsolidate}
                        disabled={autoConsolidate.isPending}
                      >
                        <Layers className="h-3.5 w-3.5 mr-2" />
                        Auto-Consolidate Old
                      </Button>
                      {stats && (
                        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                          <div className="flex justify-between">
                            <span>Total memories:</span>
                            <span>{stats.total}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Avg importance:</span>
                            <span>{stats.avgImportance}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Consolidated:</span>
                            <span>{stats.consolidated}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Recent (7d):</span>
                            <span>{stats.recentCount}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Add Memory Form */}
            {showAddForm && (
              <Card className="border-dashed border-primary/50 bg-primary/5">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">New Memory</h4>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowAddForm(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <Input
                    placeholder="Title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="h-8"
                  />

                  <Textarea
                    placeholder="What do you want to remember?"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={3}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newCategory}
                      onValueChange={(v) => setNewCategory(v as MemoryCategory)}
                    >
                      <SelectTrigger className="h-8">
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

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Importance:
                      </span>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={newImportance}
                        onChange={(e) =>
                          setNewImportance(parseInt(e.target.value))
                        }
                        className="flex-1 h-1"
                      />
                      <span className="text-xs font-medium w-3">
                        {newImportance}
                      </span>
                    </div>
                  </div>

                  <Input
                    placeholder="Tags (comma-separated)"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="h-8"
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateMemory}
                      disabled={createMemory.isPending}
                    >
                      {createMemory.isPending ? "Saving..." : "Save Memory"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Memory List */}
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-3">
                {isLoading || isSearching ? (
                  <>
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                  </>
                ) : memories && memories.length > 0 ? (
                  memories.map((memory) => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      onUpdate={handleUpdateMemory}
                      onDelete={handleDeleteMemory}
                      onNavigateToTask={onNavigateToTask}
                      isUpdating={updateMemory.isPending}
                      isDeleting={deleteMemory.isPending}
                    />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Brain className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery
                        ? "No memories match your search"
                        : "No memories yet"}
                    </p>
                    {!searchQuery && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setShowAddForm(true)}
                        className="mt-1"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add your first memory
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Category Stats */}
            {stats && stats.total > 0 && (
              <div className="flex gap-1 pt-2 border-t overflow-x-auto">
                {MEMORY_CATEGORIES.map((cat) => {
                  const count = stats.byCategory[cat.value] || 0;
                  if (count === 0) return null;
                  return (
                    <Badge
                      key={cat.value}
                      variant={selectedCategory === cat.value ? "default" : "outline"}
                      className="cursor-pointer text-[10px] flex-shrink-0"
                      onClick={() =>
                        setSelectedCategory(
                          selectedCategory === cat.value ? "all" : cat.value
                        )
                      }
                    >
                      {cat.label}: {count}
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default ProjectMemoryPanel;
