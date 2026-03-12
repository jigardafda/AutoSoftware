import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  GitBranch,
  GitPullRequest,
  ExternalLink,
  Play,
  BrainCircuit,
  RotateCcw,
  Trash2,
  MoreVertical,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TaskStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  description?: string;
}

interface MobileTaskViewProps {
  task: {
    id: string;
    title: string;
    description: string;
    status: string;
    type?: string;
    priority?: string;
    source?: string;
    repositoryName?: string;
    targetBranch?: string;
    pullRequestUrl?: string;
    createdAt: string;
    updatedAt?: string;
    completedAt?: string;
    steps?: TaskStep[];
    plan?: string;
    result?: string;
    error?: string;
  };
  onStartPlanning?: () => void;
  onExecute?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  isActionPending?: boolean;
  className?: string;
}

export function MobileTaskView({
  task,
  onStartPlanning,
  onExecute,
  onRetry,
  onCancel,
  onDelete,
  isActionPending = false,
  className,
}: MobileTaskViewProps) {
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    details: true,
    steps: true,
    result: false,
  });
  const { triggerLight } = useHapticFeedback();

  // Toggle section
  const toggleSection = useCallback((section: string) => {
    triggerLight();
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, [triggerLight]);

  // Get status details
  const statusDetails = useMemo(() => {
    switch (task.status) {
      case "completed":
        return {
          color: "text-green-500",
          bgColor: "bg-green-500/10",
          borderColor: "border-green-500/20",
          icon: CheckCircle2,
          label: "Completed",
        };
      case "in_progress":
      case "executing":
        return {
          color: "text-blue-500",
          bgColor: "bg-blue-500/10",
          borderColor: "border-blue-500/20",
          icon: Loader2,
          label: "In Progress",
          animate: true,
        };
      case "planning":
        return {
          color: "text-purple-500",
          bgColor: "bg-purple-500/10",
          borderColor: "border-purple-500/20",
          icon: BrainCircuit,
          label: "Planning",
          animate: true,
        };
      case "failed":
        return {
          color: "text-red-500",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/20",
          icon: XCircle,
          label: "Failed",
        };
      case "cancelled":
        return {
          color: "text-gray-500",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-500/20",
          icon: Ban,
          label: "Cancelled",
        };
      case "planned":
        return {
          color: "text-cyan-500",
          bgColor: "bg-cyan-500/10",
          borderColor: "border-cyan-500/20",
          icon: CheckCircle2,
          label: "Planned",
        };
      default:
        return {
          color: "text-yellow-500",
          bgColor: "bg-yellow-500/10",
          borderColor: "border-yellow-500/20",
          icon: Clock,
          label: "Pending",
        };
    }
  }, [task.status]);

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "high":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "low":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Calculate progress
  const progress = useMemo(() => {
    if (!task.steps || task.steps.length === 0) return null;
    const completed = task.steps.filter((s) => s.status === "completed").length;
    return {
      completed,
      total: task.steps.length,
      percentage: Math.round((completed / task.steps.length) * 100),
    };
  }, [task.steps]);

  // Get step icon
  const getStepIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/50" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
    }
  };

  // Primary action button
  const renderPrimaryAction = () => {
    if (isActionPending) {
      return (
        <Button className="flex-1" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </Button>
      );
    }

    switch (task.status) {
      case "pending":
        return onStartPlanning ? (
          <Button className="flex-1" onClick={onStartPlanning}>
            <BrainCircuit className="mr-2 h-4 w-4" />
            Start Planning
          </Button>
        ) : null;
      case "planned":
        return onExecute ? (
          <Button className="flex-1" onClick={onExecute}>
            <Play className="mr-2 h-4 w-4" />
            Execute
          </Button>
        ) : null;
      case "failed":
      case "cancelled":
        return onRetry ? (
          <Button className="flex-1" onClick={onRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        ) : null;
      case "completed":
        return task.pullRequestUrl ? (
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => window.open(task.pullRequestUrl, "_blank")}
          >
            <GitPullRequest className="mr-2 h-4 w-4" />
            View PR
          </Button>
        ) : null;
      default:
        return null;
    }
  };

  const StatusIcon = statusDetails.icon;

  return (
    <div className={cn("flex flex-col min-h-screen bg-background", className)}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{task.title}</h1>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  statusDetails.bgColor,
                  statusDetails.color,
                  statusDetails.borderColor
                )}
              >
                <StatusIcon
                  className={cn(
                    "mr-1 h-3 w-3",
                    statusDetails.animate && "animate-spin"
                  )}
                />
                {statusDetails.label}
              </Badge>
              {task.type && (
                <Badge variant="outline" className="text-xs bg-muted">
                  {task.type}
                </Badge>
              )}
            </div>
          </div>

          {/* More actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {task.pullRequestUrl && (
                <DropdownMenuItem onClick={() => window.open(task.pullRequestUrl, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Pull Request
                </DropdownMenuItem>
              )}
              {onCancel && !["completed", "cancelled", "failed"].includes(task.status) && (
                <DropdownMenuItem onClick={onCancel} className="text-orange-500">
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel Task
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Task
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>
                {progress.completed}/{progress.total} steps ({progress.percentage}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
        {/* Description */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {task.description}
          </p>
        </div>

        {/* Details Section */}
        <Collapsible
          open={openSections.details}
          onOpenChange={() => toggleSection("details")}
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4">
            <span className="text-sm font-medium">Details</span>
            {openSections.details ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              {task.repositoryName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Repository</span>
                  <span className="text-sm font-medium">{task.repositoryName}</span>
                </div>
              )}
              {task.targetBranch && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Branch</span>
                  <div className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    <span className="text-sm font-medium">{task.targetBranch}</span>
                  </div>
                </div>
              )}
              {task.priority && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Priority</span>
                  <Badge
                    variant="outline"
                    className={cn("text-xs", getPriorityColor(task.priority))}
                  >
                    {task.priority}
                  </Badge>
                </div>
              )}
              {task.source && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Source</span>
                  <span className="text-sm font-medium capitalize">{task.source}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Created</span>
                <span className="text-sm">{formatDate(task.createdAt)}</span>
              </div>
              {task.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="text-sm">{formatDate(task.completedAt)}</span>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Steps Section */}
        {task.steps && task.steps.length > 0 && (
          <Collapsible
            open={openSections.steps}
            onOpenChange={() => toggleSection("steps")}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4">
              <span className="text-sm font-medium">
                Steps ({task.steps.filter((s) => s.status === "completed").length}/
                {task.steps.length})
              </span>
              {openSections.steps ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                {task.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-start gap-3",
                      index < task.steps!.length - 1 && "pb-3 border-b border-border/50"
                    )}
                  >
                    <div className="mt-0.5">{getStepIcon(step.status)}</div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          step.status === "completed" && "text-muted-foreground line-through",
                          step.status === "skipped" && "text-muted-foreground"
                        )}
                      >
                        {step.title}
                      </p>
                      {step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Result/Error Section */}
        {(task.result || task.error) && (
          <Collapsible
            open={openSections.result}
            onOpenChange={() => toggleSection("result")}
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4">
              <span className="text-sm font-medium">
                {task.error ? "Error" : "Result"}
              </span>
              {openSections.result ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div
                className={cn(
                  "rounded-lg border p-4",
                  task.error
                    ? "border-red-500/20 bg-red-500/5"
                    : "border-border bg-card"
                )}
              >
                <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
                  {task.error || task.result}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {renderPrimaryAction()}
          {!renderPrimaryAction() && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
