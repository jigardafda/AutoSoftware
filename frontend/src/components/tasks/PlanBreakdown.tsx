import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Brain,
  Lightbulb,
  AlertTriangle,
  Gauge,
} from "lucide-react";

// Types for AI transparency
export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  estimatedSeconds?: number;
  actualSeconds?: number;
  confidence?: number; // 0-100
  reasoning?: string;
  blockerMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionPlan {
  taskId: string;
  overview: string;
  steps: PlanStep[];
  totalEstimatedSeconds: number;
  confidence: number; // Overall confidence 0-100
  reasoning?: string;
  createdAt: string;
}

interface PlanBreakdownProps {
  taskId: string;
  taskStatus: string;
  className?: string;
}

export function PlanBreakdown({ taskId, taskStatus, className }: PlanBreakdownProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const { addMessageHandler } = useWebSocket();

  // Fetch initial plan
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["taskPlan", taskId],
    queryFn: () => api.tasks.getPlan(taskId),
    enabled: !!taskId,
    refetchInterval: taskStatus === "in_progress" ? 3000 : false,
  });

  // Update plan from query data
  useEffect(() => {
    if (data?.plan) {
      setPlan(data.plan);
    }
  }, [data]);

  // Listen for real-time plan updates
  useEffect(() => {
    if (!taskId) return;

    const cleanupPlan = addMessageHandler("plan:update", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setPlan(payload.plan);
    });

    const cleanupStep = addMessageHandler("plan:step:update", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((step) =>
            step.id === payload.stepId ? { ...step, ...payload.updates } : step
          ),
        };
      });
    });

    return () => {
      cleanupPlan();
      cleanupStep();
    };
  }, [taskId, addMessageHandler]);

  if (isLoading) {
    return (
      <Card className={cn("border-border", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading execution plan...</span>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (!plan) {
    return null;
  }

  const completedSteps = plan.steps.filter((s) => s.status === "completed").length;
  const totalSteps = plan.steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const currentStep = plan.steps.find((s) => s.status === "in_progress");
  const hasBlocker = plan.steps.some((s) => s.blockerMessage);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn("border-border", hasBlocker && "border-amber-500/50", className)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-medium">
                    Here's My Plan
                  </CardTitle>
                </div>
                <ConfidenceBadge confidence={plan.confidence} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {completedSteps} of {totalSteps} steps
                  </span>
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </div>
            {plan.overview && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {plan.overview}
              </p>
            )}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Overall reasoning if available */}
            {plan.reasoning && (
              <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">{plan.reasoning}</p>
                </div>
              </div>
            )}

            {/* Steps list */}
            <div className="space-y-1">
              {plan.steps.map((step, index) => (
                <PlanStepItem
                  key={step.id}
                  step={step}
                  index={index}
                  isCurrentStep={step.status === "in_progress"}
                />
              ))}
            </div>

            {/* Time estimate */}
            {plan.totalEstimatedSeconds > 0 && (
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    Estimated: {formatTime(plan.totalEstimatedSeconds)}
                  </span>
                </div>
                {currentStep && (
                  <span className="text-primary">
                    Currently: {currentStep.title}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface PlanStepItemProps {
  step: PlanStep;
  index: number;
  isCurrentStep: boolean;
}

function PlanStepItem({ step, index, isCurrentStep }: PlanStepItemProps) {
  const getStatusIcon = () => {
    switch (step.status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <Circle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/40" />;
    }
  };

  const hasBlocker = !!step.blockerMessage;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md px-3 py-2 transition-colors",
        isCurrentStep && "bg-blue-500/10 border border-blue-500/20",
        hasBlocker && "bg-amber-500/10 border border-amber-500/20",
        step.status === "failed" && "bg-red-500/5"
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-5 w-5 items-center justify-center text-xs text-muted-foreground font-mono">
          {index + 1}.
        </span>
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm",
                step.status === "completed" && "text-foreground",
                step.status === "in_progress" && "text-foreground font-medium",
                step.status === "failed" && "text-red-500",
                step.status === "skipped" && "text-muted-foreground line-through",
                step.status === "pending" && "text-muted-foreground"
              )}
            >
              {step.title}
            </span>
            {step.confidence !== undefined && (
              <ConfidenceBadge confidence={step.confidence} size="sm" />
            )}
          </div>
          {step.description && isCurrentStep && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {step.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {step.estimatedSeconds && step.status === "pending" && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{formatTime(step.estimatedSeconds)}
            </span>
          )}
          {step.actualSeconds !== undefined && step.status === "completed" && (
            <span>{formatTime(step.actualSeconds)}</span>
          )}
        </div>
      </div>

      {/* Reasoning for current step */}
      {step.reasoning && isCurrentStep && (
        <div className="ml-11 mt-1 p-2 rounded bg-muted/50">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">{step.reasoning}</p>
          </div>
        </div>
      )}

      {/* Blocker message */}
      {hasBlocker && (
        <div className="ml-11 mt-1 p-2 rounded bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {step.blockerMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConfidenceBadgeProps {
  confidence: number;
  size?: "sm" | "md";
}

function ConfidenceBadge({ confidence, size = "md" }: ConfidenceBadgeProps) {
  const getConfidenceColor = () => {
    if (confidence >= 80) return "text-green-500";
    if (confidence >= 60) return "text-blue-500";
    if (confidence >= 40) return "text-amber-500";
    return "text-red-500";
  };

  const getConfidenceLabel = () => {
    if (confidence >= 80) return "High";
    if (confidence >= 60) return "Medium";
    if (confidence >= 40) return "Low";
    return "Very Low";
  };

  const getBgColor = () => {
    if (confidence >= 80) return "bg-green-500/10";
    if (confidence >= 60) return "bg-blue-500/10";
    if (confidence >= 40) return "bg-amber-500/10";
    return "bg-red-500/10";
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={cn(
              "gap-1 cursor-help",
              getBgColor(),
              getConfidenceColor(),
              size === "sm" && "text-[10px] px-1.5 py-0"
            )}
          >
            <Gauge className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
            {size === "md" && <span>{confidence}%</span>}
            {size === "sm" && <span>{confidence}%</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            Confidence: {getConfidenceLabel()} ({confidence}%)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export { ConfidenceBadge };
