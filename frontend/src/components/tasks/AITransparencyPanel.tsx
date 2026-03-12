import { useAITransparency } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { PlanBreakdown, ConfidenceBadge } from "./PlanBreakdown";
import { BlockerIndicator, BlockerBadge, RetryProgress } from "./BlockerIndicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react";

interface AITransparencyPanelProps {
  taskId: string;
  taskStatus: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * AI Transparency Panel - Combined view for plan breakdown and blockers
 * Shows the AI's thinking process, confidence levels, and any issues encountered
 */
export function AITransparencyPanel({
  taskId,
  taskStatus,
  onRetry,
  className,
}: AITransparencyPanelProps) {
  const {
    plan,
    currentBlocker,
    blockerHistory,
    isRetrying,
    isLoading,
    getCurrentStep,
    getProgress,
    getConfidenceLevel,
    hasBlocker,
  } = useAITransparency({ taskId, taskStatus });

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading AI transparency data...</span>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Don't show anything if there's no plan yet and no blockers
  if (!plan && !currentBlocker) {
    return null;
  }

  const progress = getProgress();
  const currentStep = getCurrentStep();
  const confidenceLevel = getConfidenceLevel();
  const blockerCount = blockerHistory.filter((b) => b.resolvedAt).length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary header for quick glance */}
      {plan && taskStatus === "in_progress" && (
        <Card className="border-border">
          <CardContent className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              {/* Current activity */}
              <div className="flex items-center gap-3">
                {currentStep ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm font-medium">{currentStep.title}</span>
                    </div>
                    {currentStep.description && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        - {currentStep.description}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Waiting...</span>
                  </div>
                )}
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-2">
                {/* Progress */}
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {progress.completed}/{progress.total}
                </Badge>

                {/* Confidence */}
                {confidenceLevel && plan && (
                  <ConfidenceBadge confidence={plan.confidence} />
                )}

                {/* Blocker indicator */}
                {hasBlocker() && currentBlocker && (
                  <BlockerBadge blocker={currentBlocker} />
                )}

                {/* Past blockers */}
                {blockerCount > 0 && !hasBlocker() && (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <Info className="h-3 w-3" />
                    {blockerCount} resolved
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocker alert (if present) - shown prominently */}
      {hasBlocker() && (
        <BlockerIndicator
          taskId={taskId}
          taskStatus={taskStatus}
          onRetry={onRetry}
        />
      )}

      {/* Retry progress */}
      {isRetrying && currentBlocker && (
        <RetryProgress
          isRetrying={isRetrying}
          retryCount={currentBlocker.retryCount || 0}
          maxRetries={currentBlocker.maxRetries || 3}
        />
      )}

      {/* Full plan breakdown */}
      {plan && <PlanBreakdown taskId={taskId} taskStatus={taskStatus} />}

      {/* Completed task summary */}
      {taskStatus === "completed" && plan && (
        <CompletionSummary
          plan={plan}
          blockerCount={blockerCount}
        />
      )}
    </div>
  );
}

interface CompletionSummaryProps {
  plan: {
    overview: string;
    confidence: number;
    steps: Array<{ status: string; actualSeconds?: number }>;
    totalEstimatedSeconds: number;
  };
  blockerCount: number;
}

function CompletionSummary({ plan, blockerCount }: CompletionSummaryProps) {
  const completedSteps = plan.steps.filter((s) => s.status === "completed");
  const totalActualSeconds = completedSteps.reduce(
    (sum, s) => sum + (s.actualSeconds || 0),
    0
  );
  const timeDiff = plan.totalEstimatedSeconds - totalActualSeconds;
  const wasEfficient = timeDiff >= 0;

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-green-600 dark:text-green-400">Task Completed</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-muted-foreground">Confidence</p>
            <p className="font-medium">{plan.confidence}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Steps</p>
            <p className="font-medium">{completedSteps.length} completed</p>
          </div>
          <div>
            <p className="text-muted-foreground">Time</p>
            <p className="font-medium">
              {formatTime(totalActualSeconds)}
              {wasEfficient && timeDiff > 60 && (
                <span className="text-green-500 ml-1">
                  (-{formatTime(timeDiff)})
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Blockers</p>
            <p className="font-medium">
              {blockerCount > 0 ? `${blockerCount} resolved` : "None"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
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

// Also export individual components for flexible usage
export { PlanBreakdown, BlockerIndicator, ConfidenceBadge, BlockerBadge, RetryProgress };
