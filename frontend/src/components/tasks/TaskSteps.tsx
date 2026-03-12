import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TaskStep } from "@/lib/api";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  SkipForward,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface TaskStepsProps {
  taskId: string;
  taskStatus: string;
}

export function TaskSteps({ taskId, taskStatus }: TaskStepsProps) {
  const [isOpen, setIsOpen] = useState(true);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["taskSteps", taskId],
    queryFn: () => api.tasks.steps(taskId),
    refetchInterval: taskStatus === "in_progress" ? 2000 : false,
    enabled: !!taskId,
  });

  // Listen for WebSocket updates
  useEffect(() => {
    if (taskStatus !== "in_progress") return;

    const handleStepUpdate = (event: CustomEvent) => {
      const { taskId: eventTaskId } = event.detail;
      if (eventTaskId === taskId) {
        // React Query will auto-refetch, but we can force it
      }
    };

    window.addEventListener("task:step:update" as any, handleStepUpdate);
    window.addEventListener("task:steps" as any, handleStepUpdate);

    return () => {
      window.removeEventListener("task:step:update" as any, handleStepUpdate);
      window.removeEventListener("task:steps" as any, handleStepUpdate);
    };
  }, [taskId, taskStatus]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading execution steps...</span>
        </div>
      </div>
    );
  }

  if (error || !data?.steps || data.steps.length === 0) {
    return null;
  }

  const { steps, progress } = data;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-4 hover:bg-transparent"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">Execution Progress</span>
              <span className="text-sm text-muted-foreground">
                {progress.completed + progress.failed + progress.skipped} of {progress.total} steps
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {progress.percentage}%
              </span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border px-4 pb-4">
            <div className="mt-4 space-y-1">
              {steps.map((step, index) => (
                <StepItem key={step.id} step={step} index={index} />
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface StepItemProps {
  step: TaskStep;
  index: number;
}

function StepItem({ step, index }: StepItemProps) {
  const getStatusIcon = () => {
    switch (step.status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/50" />;
    }
  };

  const getStatusStyles = () => {
    switch (step.status) {
      case "completed":
        return "text-foreground";
      case "in_progress":
        return "text-foreground font-medium";
      case "failed":
        return "text-red-500";
      case "skipped":
        return "text-muted-foreground line-through";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
        step.status === "in_progress" && "bg-blue-500/10"
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center text-xs text-muted-foreground">
        {index + 1}.
      </span>
      {getStatusIcon()}
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm", getStatusStyles())}>{step.title}</span>
        {step.description && step.status === "in_progress" && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {step.description}
          </p>
        )}
      </div>
      {step.startedAt && step.completedAt && (
        <span className="text-xs text-muted-foreground">
          {formatDuration(
            new Date(step.startedAt),
            new Date(step.completedAt)
          )}
        </span>
      )}
    </div>
  );
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
