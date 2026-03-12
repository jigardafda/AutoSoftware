import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  GitMerge,
  GitFork,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  FileText,
  Files,
  Lightbulb,
  ArrowRight,
  Check,
  X,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { icon: React.ElementType; className: string; label: string }> = {
  pending: { icon: Clock, className: "text-muted-foreground", label: "Pending" },
  planning: { icon: Loader2, className: "text-amber-500 animate-spin", label: "Planning" },
  awaiting_input: { icon: Clock, className: "text-amber-600", label: "Awaiting Input" },
  planned: { icon: CheckCircle2, className: "text-cyan-500", label: "Planned" },
  in_progress: { icon: Loader2, className: "text-blue-500 animate-spin", label: "In Progress" },
  completed: { icon: CheckCircle2, className: "text-green-500", label: "Completed" },
  failed: { icon: XCircle, className: "text-red-500", label: "Failed" },
  cancelled: { icon: XCircle, className: "text-muted-foreground", label: "Cancelled" },
};

interface PlanComparisonProps {
  taskIds: string[];
  onClose?: () => void;
  onTaskSelect?: (taskId: string) => void;
}

interface ApproachData {
  name: string;
  description: string;
  complexity: string;
  estimatedTime: string;
  isRecommended: boolean;
  tradeoffs?: {
    pros?: string[];
    cons?: string[];
  };
}

function ComparisonColumn({
  task,
  expandedSections,
  onToggleSection,
  onSelectForMerge,
  isSourceForMerge,
}: {
  task: any;
  expandedSections: Set<string>;
  onToggleSection: (section: string) => void;
  onSelectForMerge: (taskId: string) => void;
  isSourceForMerge: boolean;
}) {
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const approaches = (task.approaches as ApproachData[]) || [];
  const affectedFiles = (task.affectedFiles as string[]) || [];
  const selectedApproach = task.selectedApproach !== null && approaches[task.selectedApproach];

  return (
    <div className="flex-1 min-w-[280px] border rounded-lg overflow-hidden">
      {/* Header */}
      <div className={cn(
        "p-4 border-b",
        isSourceForMerge && "bg-indigo-500/10 border-indigo-500/30"
      )}>
        <div className="flex items-center gap-2 mb-2">
          <StatusIcon className={cn("h-4 w-4", statusConfig.className)} />
          <Badge variant="outline" className="text-xs">
            {statusConfig.label}
          </Badge>
          {task.forkDepth > 0 && (
            <Badge variant="secondary" className="text-xs">
              <GitFork className="h-3 w-3 mr-1" />
              Fork L{task.forkDepth}
            </Badge>
          )}
        </div>
        <h3 className="font-medium text-sm truncate" title={task.title}>
          {task.title}
        </h3>
        <p className="text-xs text-muted-foreground truncate">
          {task.repositoryName}
        </p>
        {task.forkReason && (
          <p className="text-xs text-indigo-500 mt-1 italic">
            "{task.forkReason}"
          </p>
        )}

        {/* Merge source selector */}
        <Button
          variant={isSourceForMerge ? "default" : "outline"}
          size="sm"
          className="mt-3 w-full"
          onClick={() => onSelectForMerge(task.id)}
        >
          {isSourceForMerge ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Selected as Source
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1" />
              Use as Merge Source
            </>
          )}
        </Button>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="p-4 space-y-4">
          {/* Description */}
          <Collapsible
            open={expandedSections.has(`${task.id}-description`)}
            onOpenChange={() => onToggleSection(`${task.id}-description`)}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description
                </span>
                {expandedSections.has(`${task.id}-description`) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                {task.description || "No description"}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Enhanced Plan */}
          <Collapsible
            open={expandedSections.has(`${task.id}-plan`)}
            onOpenChange={() => onToggleSection(`${task.id}-plan`)}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Enhanced Plan
                  {task.enhancedPlan && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      Available
                    </Badge>
                  )}
                </span>
                {expandedSections.has(`${task.id}-plan`) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {task.enhancedPlan ? (
                <div className="text-sm bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none">
                  <Markdown>{task.enhancedPlan}</Markdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-3">
                  No enhanced plan yet
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Selected Approach */}
          <Collapsible
            open={expandedSections.has(`${task.id}-approach`)}
            onOpenChange={() => onToggleSection(`${task.id}-approach`)}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Approach
                  {selectedApproach && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      Selected
                    </Badge>
                  )}
                </span>
                {expandedSections.has(`${task.id}-approach`) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {selectedApproach ? (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">{selectedApproach.name}</h4>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedApproach.complexity}
                    </Badge>
                    {selectedApproach.isRecommended && (
                      <Badge className="text-[10px] bg-green-500/10 text-green-500 border-green-500/20">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedApproach.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Est. time: {selectedApproach.estimatedTime}
                  </p>

                  {selectedApproach.tradeoffs && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {selectedApproach.tradeoffs.pros && selectedApproach.tradeoffs.pros.length > 0 && (
                        <div className="bg-green-500/5 border border-green-500/20 rounded p-2">
                          <p className="text-[10px] font-medium text-green-500 mb-1">Pros</p>
                          <ul className="space-y-0.5">
                            {selectedApproach.tradeoffs.pros.map((pro, i) => (
                              <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                                <span className="text-green-500">+</span>
                                {pro}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedApproach.tradeoffs.cons && selectedApproach.tradeoffs.cons.length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
                          <p className="text-[10px] font-medium text-red-500 mb-1">Cons</p>
                          <ul className="space-y-0.5">
                            {selectedApproach.tradeoffs.cons.map((con, i) => (
                              <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                                <span className="text-red-500">-</span>
                                {con}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : approaches.length > 0 ? (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-2">
                    {approaches.length} approaches available (none selected)
                  </p>
                  <ul className="space-y-1">
                    {approaches.map((a, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px]">
                          {i + 1}
                        </span>
                        {a.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-3">
                  No approaches generated
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Affected Files */}
          <Collapsible
            open={expandedSections.has(`${task.id}-files`)}
            onOpenChange={() => onToggleSection(`${task.id}-files`)}
          >
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Files className="h-4 w-4" />
                  Affected Files
                  {affectedFiles.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      {affectedFiles.length}
                    </Badge>
                  )}
                </span>
                {expandedSections.has(`${task.id}-files`) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {affectedFiles.length > 0 ? (
                <div className="bg-muted/50 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                  <ul className="space-y-1">
                    {affectedFiles.map((file, i) => (
                      <li key={i} className="text-xs font-mono text-muted-foreground truncate">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-3">
                  No affected files identified
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* PR Link */}
          {task.pullRequestUrl && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-green-500 hover:text-green-400"
              >
                <ExternalLink className="h-4 w-4" />
                View Pull Request
              </a>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function PlanComparison({ taskIds, onClose, onTaskSelect }: PlanComparisonProps) {
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeParts, setMergeParts] = useState({
    enhancedPlan: false,
    approaches: false,
    selectedApproach: false,
    affectedFiles: false,
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["task-comparison", taskIds],
    queryFn: () => api.tasks.compareTasks(taskIds),
    enabled: taskIds.length >= 2,
  });

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!mergeSourceId || !mergeTargetId) {
        throw new Error("Source and target must be selected");
      }
      return api.tasks.mergeParts({
        sourceTaskId: mergeSourceId,
        targetTaskId: mergeTargetId,
        parts: mergeParts,
      });
    },
    onSuccess: (data) => {
      toast.success(`Merged ${data.mergedParts.length} parts successfully`);
      queryClient.invalidateQueries({ queryKey: ["task-comparison"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setMergeDialogOpen(false);
      setMergeParts({
        enhancedPlan: false,
        approaches: false,
        selectedApproach: false,
        affectedFiles: false,
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to merge parts");
    },
  });

  const handleToggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleSelectForMerge = (taskId: string) => {
    if (mergeSourceId === taskId) {
      setMergeSourceId(null);
    } else {
      setMergeSourceId(taskId);
    }
  };

  const handleOpenMergeDialog = (targetId: string) => {
    if (!mergeSourceId) {
      toast.error("Select a source task first");
      return;
    }
    if (mergeSourceId === targetId) {
      toast.error("Source and target must be different tasks");
      return;
    }
    setMergeTargetId(targetId);
    setMergeDialogOpen(true);
  };

  const expandAll = () => {
    if (!tasks) return;
    const allSections: string[] = [];
    tasks.forEach((task) => {
      allSections.push(`${task.id}-description`);
      allSections.push(`${task.id}-plan`);
      allSections.push(`${task.id}-approach`);
      allSections.push(`${task.id}-files`);
    });
    setExpandedSections(new Set(allSections));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!tasks || tasks.length < 2) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Select at least 2 tasks to compare
        </CardContent>
      </Card>
    );
  }

  const sourceTask = tasks.find((t) => t.id === mergeSourceId);
  const targetTask = tasks.find((t) => t.id === mergeTargetId);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-indigo-500" />
              <CardTitle className="text-base">Plan Comparison</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
              {onClose && (
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            Compare {tasks.length} task variations side by side.
            {mergeSourceId && (
              <span className="text-indigo-500 ml-2">
                Source selected - click "Merge into" on a target task
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {tasks.map((task) => (
              <div key={task.id} className="flex flex-col min-w-[280px]">
                <ComparisonColumn
                  task={task}
                  expandedSections={expandedSections}
                  onToggleSection={handleToggleSection}
                  onSelectForMerge={handleSelectForMerge}
                  isSourceForMerge={mergeSourceId === task.id}
                />

                {/* Merge into button */}
                {mergeSourceId && mergeSourceId !== task.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => handleOpenMergeDialog(task.id)}
                  >
                    <GitMerge className="h-4 w-4 mr-1" />
                    Merge into this
                  </Button>
                )}

                {/* View task button */}
                {onTaskSelect && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => onTaskSelect(task.id)}
                  >
                    <ArrowRight className="h-4 w-4 mr-1" />
                    View Task
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge Task Parts
            </DialogTitle>
            <DialogDescription>
              Select which parts to copy from "{sourceTask?.title}" to "{targetTask?.title}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-1 text-sm">
                <p className="font-medium truncate">{sourceTask?.title}</p>
                <p className="text-muted-foreground text-xs">Source</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                <p className="font-medium truncate">{targetTask?.title}</p>
                <p className="text-muted-foreground text-xs">Target</p>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-muted-foreground">Parts to merge:</Label>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="merge-plan"
                    checked={mergeParts.enhancedPlan}
                    onCheckedChange={(checked) =>
                      setMergeParts((p) => ({ ...p, enhancedPlan: !!checked }))
                    }
                    disabled={!sourceTask?.enhancedPlan}
                  />
                  <Label
                    htmlFor="merge-plan"
                    className={cn(
                      "cursor-pointer",
                      !sourceTask?.enhancedPlan && "text-muted-foreground"
                    )}
                  >
                    Enhanced Plan
                    {!sourceTask?.enhancedPlan && (
                      <span className="text-xs ml-1">(not available)</span>
                    )}
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="merge-approaches"
                    checked={mergeParts.approaches}
                    onCheckedChange={(checked) =>
                      setMergeParts((p) => ({ ...p, approaches: !!checked }))
                    }
                    disabled={!sourceTask?.approaches || (sourceTask.approaches as any[]).length === 0}
                  />
                  <Label
                    htmlFor="merge-approaches"
                    className={cn(
                      "cursor-pointer",
                      (!sourceTask?.approaches || (sourceTask.approaches as any[]).length === 0) &&
                        "text-muted-foreground"
                    )}
                  >
                    Approaches
                    {sourceTask?.approaches && (
                      <span className="text-xs ml-1">
                        ({(sourceTask.approaches as any[]).length} available)
                      </span>
                    )}
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="merge-selected"
                    checked={mergeParts.selectedApproach}
                    onCheckedChange={(checked) =>
                      setMergeParts((p) => ({ ...p, selectedApproach: !!checked }))
                    }
                    disabled={sourceTask?.selectedApproach === null}
                  />
                  <Label
                    htmlFor="merge-selected"
                    className={cn(
                      "cursor-pointer",
                      sourceTask?.selectedApproach === null && "text-muted-foreground"
                    )}
                  >
                    Selected Approach
                    {sourceTask?.selectedApproach === null && (
                      <span className="text-xs ml-1">(none selected)</span>
                    )}
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="merge-files"
                    checked={mergeParts.affectedFiles}
                    onCheckedChange={(checked) =>
                      setMergeParts((p) => ({ ...p, affectedFiles: !!checked }))
                    }
                    disabled={
                      !sourceTask?.affectedFiles ||
                      (sourceTask.affectedFiles as any[]).length === 0
                    }
                  />
                  <Label
                    htmlFor="merge-files"
                    className={cn(
                      "cursor-pointer",
                      (!sourceTask?.affectedFiles ||
                        (sourceTask.affectedFiles as any[]).length === 0) &&
                        "text-muted-foreground"
                    )}
                  >
                    Affected Files
                    {sourceTask?.affectedFiles && (
                      <span className="text-xs ml-1">
                        ({(sourceTask.affectedFiles as any[]).length} files)
                      </span>
                    )}
                  </Label>
                </div>
              </div>
            </div>

            {["in_progress", "completed"].includes(targetTask?.status || "") && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-600">
                  Warning: Target task is {targetTask?.status}. Merge may not be allowed.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mergeMutation.mutate()}
              disabled={
                mergeMutation.isPending ||
                !Object.values(mergeParts).some(Boolean)
              }
            >
              {mergeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="h-4 w-4 mr-2" />
                  Merge Selected Parts
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
