import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type GenealogyNode, type GenealogyNodeMetadata } from "@/lib/api";
import {
  GitBranch,
  GitFork,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  Search,
  Scan,
  ListTree,
  Filter,
  ChevronUp,
  AlertCircle,
  Activity,
  Target,
  ArrowUpRight,
  Layers,
  Users,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Response type for genealogy tree
interface GenealogyTreeResponse {
  roots: GenealogyNode[];
  stats: {
    totalScans: number;
    totalTasks: number;
    totalSubtasks: number;
    maxDepth: number;
  };
}

// Status configuration
const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; className: string; label: string }
> = {
  // Scan statuses
  queued: { icon: Clock, className: "text-muted-foreground", label: "Queued" },
  in_progress: {
    icon: Loader2,
    className: "text-blue-500 animate-spin",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle2,
    className: "text-green-500",
    label: "Completed",
  },
  failed: { icon: XCircle, className: "text-red-500", label: "Failed" },
  cancelled: {
    icon: XCircle,
    className: "text-muted-foreground",
    label: "Cancelled",
  },
  skipped: {
    icon: AlertCircle,
    className: "text-yellow-500",
    label: "Skipped",
  },
  // Task statuses
  pending: { icon: Clock, className: "text-muted-foreground", label: "Pending" },
  planning: {
    icon: Loader2,
    className: "text-amber-500 animate-spin",
    label: "Planning",
  },
  awaiting_input: {
    icon: AlertCircle,
    className: "text-amber-600",
    label: "Awaiting Input",
  },
  planned: {
    icon: CheckCircle2,
    className: "text-cyan-500",
    label: "Planned",
  },
  partial_success: {
    icon: AlertCircle,
    className: "text-yellow-500",
    label: "Partial Success",
  },
};

const TYPE_COLOR: Record<string, string> = {
  improvement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bugfix: "bg-red-500/10 text-red-500 border-red-500/20",
  feature: "bg-green-500/10 text-green-500 border-green-500/20",
  refactor: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  security: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-muted",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

interface TreeNodeComponentProps {
  node: GenealogyNode;
  depth: number;
  expanded: Set<string>;
  selectedLineage: string | null;
  onToggleExpand: (id: string) => void;
  onNodeClick: (node: GenealogyNode) => void;
  onFilterByLineage: (id: string) => void;
  isInSelectedLineage: boolean;
}

function TreeNodeComponent({
  node,
  depth,
  expanded,
  selectedLineage,
  onToggleExpand,
  onNodeClick,
  onFilterByLineage,
  isInSelectedLineage,
}: TreeNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const statusConfig = STATUS_CONFIG[node.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const isScan = node.type === "scan";
  const isFork = (node.metadata.forkDepth || 0) > 0;

  // Calculate indentation
  const paddingLeft = depth * 24;

  return (
    <div className="relative">
      {/* Visual connector lines */}
      {depth > 0 && (
        <>
          {/* Horizontal connector */}
          <div
            className="absolute border-t-2 border-border/50"
            style={{
              left: paddingLeft - 20,
              top: 18,
              width: 16,
            }}
          />
          {/* Vertical connector */}
          <div
            className="absolute border-l-2 border-border/50"
            style={{
              left: paddingLeft - 20,
              top: 0,
              height: 18,
            }}
          />
        </>
      )}

      {/* Node content */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer group",
          "hover:bg-accent/50",
          selectedLineage === node.id && "bg-primary/10 border border-primary/30",
          isInSelectedLineage && selectedLineage !== node.id && "bg-accent/30"
        )}
        style={{ marginLeft: paddingLeft }}
        onClick={() => onNodeClick(node)}
      >
        {/* Expand/collapse button */}
        <button
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded hover:bg-accent transition-colors shrink-0",
            !hasChildren && "invisible"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Node type icon */}
        <div className="shrink-0">
          {isScan ? (
            <div className="p-1 rounded bg-indigo-500/10">
              <Scan className="h-4 w-4 text-indigo-500" />
            </div>
          ) : isFork ? (
            <div className="p-1 rounded bg-violet-500/10">
              <GitFork className="h-4 w-4 text-violet-500" />
            </div>
          ) : (
            <div className="p-1 rounded bg-blue-500/10">
              <Target className="h-4 w-4 text-blue-500" />
            </div>
          )}
        </div>

        {/* Status indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="shrink-0">
              <StatusIcon className={cn("h-4 w-4", statusConfig.className)} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">{statusConfig.label}</TooltipContent>
        </Tooltip>

        {/* Title and metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{node.title}</p>
            {isFork && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                Fork L{node.metadata.forkDepth}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {node.metadata.repositoryName && (
              <span className="truncate max-w-[150px]">
                {node.metadata.repositoryName}
              </span>
            )}
            {node.metadata.branch && (
              <>
                <span>-</span>
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {node.metadata.branch}
                </span>
              </>
            )}
            {isScan && node.metadata.tasksCreated !== undefined && (
              <span>- {node.metadata.tasksCreated} tasks</span>
            )}
            {node.metadata.forkReason && (
              <span className="italic truncate max-w-[200px]">
                "{node.metadata.forkReason}"
              </span>
            )}
          </div>
        </div>

        {/* Type and priority badges for tasks */}
        {node.type === "task" && (
          <div className="flex items-center gap-1.5 shrink-0">
            {node.metadata.taskType && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  TYPE_COLOR[node.metadata.taskType]
                )}
              >
                {node.metadata.taskType}
              </Badge>
            )}
            {node.metadata.priority && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  PRIORITY_COLOR[node.metadata.priority]
                )}
              >
                {node.metadata.priority}
              </Badge>
            )}
          </div>
        )}

        {/* Action buttons (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {node.metadata.pullRequestUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={node.metadata.pullRequestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>View Pull Request</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterByLineage(node.id);
                }}
              >
                <Filter className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Filter by this lineage</TooltipContent>
          </Tooltip>
        </div>

        {/* Spawned from indicator */}
        {depth === 0 && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {isScan ? "Root Scan" : node.metadata.source === "manual" ? "Manual" : "Auto"}
          </Badge>
        )}

        {/* Children count badge */}
        {hasChildren && !isExpanded && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            +{countAllChildren(node)} nested
          </Badge>
        )}
      </div>

      {/* Children (animated expand/collapse) */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          {hasChildren && (
            <div className="relative">
              {/* Continuous vertical line for children */}
              {node.children.length > 0 && (
                <div
                  className="absolute border-l-2 border-border/50"
                  style={{
                    left: paddingLeft + 4,
                    top: 0,
                    height: `calc(100% - 20px)`,
                  }}
                />
              )}
              {node.children.map((child, index) => (
                <TreeNodeComponent
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  selectedLineage={selectedLineage}
                  onToggleExpand={onToggleExpand}
                  onNodeClick={onNodeClick}
                  onFilterByLineage={onFilterByLineage}
                  isInSelectedLineage={isInSelectedLineage || selectedLineage === node.id}
                />
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Helper to count all nested children
function countAllChildren(node: GenealogyNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countAllChildren(child);
  }
  return count;
}

// Stats display component
function StatsBar({
  stats,
}: {
  stats: { totalScans: number; totalTasks: number; totalSubtasks: number; maxDepth: number };
}) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Scan className="h-4 w-4 text-indigo-500" />
        <span className="font-medium text-foreground">{stats.totalScans}</span>
        <span>scans</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Target className="h-4 w-4 text-blue-500" />
        <span className="font-medium text-foreground">{stats.totalTasks}</span>
        <span>tasks</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <GitFork className="h-4 w-4 text-violet-500" />
        <span className="font-medium text-foreground">{stats.totalSubtasks}</span>
        <span>forks</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Layers className="h-4 w-4" />
        <span className="font-medium text-foreground">{stats.maxDepth}</span>
        <span>depth</span>
      </div>
    </div>
  );
}

export interface TaskGenealogyProps {
  repositoryId?: string;
  projectId?: string;
  onTaskSelect?: (taskId: string) => void;
  onScanSelect?: (scanId: string) => void;
  className?: string;
  maxHeight?: string;
}

export function TaskGenealogy({
  repositoryId,
  projectId,
  onTaskSelect,
  onScanSelect,
  className,
  maxHeight = "600px",
}: TaskGenealogyProps) {
  // State
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLineage, setSelectedLineage] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);

  // Fetch genealogy data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["task-genealogy", repositoryId, projectId, showCompleted],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (repositoryId) params.set("repositoryId", repositoryId);
      if (projectId) params.set("projectId", projectId);
      params.set("includeCompleted", String(showCompleted));

      const response = await fetch(`/api/tasks/genealogy?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Failed to fetch genealogy");
      }
      const result = await response.json();
      return result.data as GenealogyTreeResponse;
    },
  });

  // Filter nodes based on search and status
  const filteredRoots = useMemo(() => {
    if (!data?.roots) return [];

    const filterNode = (node: GenealogyNode): GenealogyNode | null => {
      // Check if this node matches filters
      const matchesSearch =
        !searchQuery ||
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.metadata.repositoryName?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || node.status === statusFilter;

      // Recursively filter children
      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is GenealogyNode => n !== null);

      // Include node if it matches or has matching descendants
      if ((matchesSearch && matchesStatus) || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }

      return null;
    };

    return data.roots.map(filterNode).filter((n): n is GenealogyNode => n !== null);
  }, [data?.roots, searchQuery, statusFilter]);

  // Handlers
  const handleToggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!data?.roots) return;
    const allIds = new Set<string>();
    const collectIds = (node: GenealogyNode) => {
      allIds.add(node.id);
      node.children.forEach(collectIds);
    };
    data.roots.forEach(collectIds);
    setExpanded(allIds);
  }, [data?.roots]);

  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const handleNodeClick = useCallback(
    (node: GenealogyNode) => {
      if (node.type === "scan") {
        onScanSelect?.(node.id);
      } else {
        onTaskSelect?.(node.id);
      }
    },
    [onTaskSelect, onScanSelect]
  );

  const handleFilterByLineage = useCallback((id: string) => {
    setSelectedLineage((prev) => (prev === id ? null : id));
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-muted-foreground">{(error as Error).message}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!data?.roots || data.roots.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-8 text-center">
          <ListTree className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-medium mb-1">No Genealogy Data</h3>
          <p className="text-sm text-muted-foreground">
            Scans and tasks will appear here once created.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTree className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-base">Task Genealogy</CardTitle>
          </div>
          <StatsBar stats={data.stats} />
        </div>
        <CardDescription>
          Visual hierarchy of scans, tasks, and their forked subtasks
        </CardDescription>
      </CardHeader>

      {/* Filters and controls */}
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks and scans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          {/* Toggle completed */}
          <Button
            variant={showCompleted ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            {showCompleted ? "Hide Completed" : "Show Completed"}
          </Button>
        </div>

        {/* Expand/collapse and lineage filter */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleExpandAll}>
              <ChevronDown className="h-4 w-4 mr-1" />
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCollapseAll}>
              <ChevronUp className="h-4 w-4 mr-1" />
              Collapse All
            </Button>
          </div>

          {selectedLineage && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Filtering by lineage
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLineage(null)}
              >
                Clear Filter
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tree view */}
      <CardContent className="p-0 flex-1">
        <ScrollArea style={{ maxHeight }} className="p-3">
          <div className="space-y-1">
            {filteredRoots.map((root) => (
              <TreeNodeComponent
                key={root.id}
                node={root}
                depth={0}
                expanded={expanded}
                selectedLineage={selectedLineage}
                onToggleExpand={handleToggleExpand}
                onNodeClick={handleNodeClick}
                onFilterByLineage={handleFilterByLineage}
                isInSelectedLineage={false}
              />
            ))}
          </div>

          {filteredRoots.length === 0 && (searchQuery || statusFilter !== "all") && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No results match your filters</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Legend */}
      <div className="p-3 border-t bg-muted/30">
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded bg-indigo-500/10">
              <Scan className="h-3 w-3 text-indigo-500" />
            </div>
            <span>Scan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded bg-blue-500/10">
              <Target className="h-3 w-3 text-blue-500" />
            </div>
            <span>Task</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded bg-violet-500/10">
              <GitFork className="h-3 w-3 text-violet-500" />
            </div>
            <span>Fork</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 border-t-2 border-border/50" />
            <span>Spawned from</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default TaskGenealogy;
