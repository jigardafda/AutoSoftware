import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/websocket";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  HelpCircle,
  Clock,
  RefreshCw,
  X,
  ChevronRight,
  MessageSquare,
  Lightbulb,
  Loader2,
} from "lucide-react";

// Types for blockers
export interface Blocker {
  id: string;
  taskId: string;
  type: "error" | "stuck" | "needs_input" | "rate_limit" | "dependency";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  context?: string;
  suggestedActions?: string[];
  retryable: boolean;
  createdAt: string;
  resolvedAt?: string;
  retryCount?: number;
  maxRetries?: number;
}

export interface BlockerState {
  hasBlocker: boolean;
  currentBlocker: Blocker | null;
  blockerHistory: Blocker[];
  isRetrying: boolean;
}

interface BlockerIndicatorProps {
  taskId: string;
  taskStatus: string;
  onRetry?: () => void;
  onProvideInput?: (input: string) => void;
  className?: string;
}

export function BlockerIndicator({
  taskId,
  taskStatus,
  onRetry,
  onProvideInput,
  className,
}: BlockerIndicatorProps) {
  const [blockerState, setBlockerState] = useState<BlockerState>({
    hasBlocker: false,
    currentBlocker: null,
    blockerHistory: [],
    isRetrying: false,
  });
  const [isExpanded, setIsExpanded] = useState(true);
  const { addMessageHandler } = useWebSocket();

  // Listen for blocker updates
  useEffect(() => {
    if (!taskId) return;

    const cleanupBlocker = addMessageHandler("blocker:new", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setBlockerState((prev) => ({
        ...prev,
        hasBlocker: true,
        currentBlocker: payload.blocker,
        blockerHistory: [...prev.blockerHistory, payload.blocker],
        isRetrying: false,
      }));
      setIsExpanded(true);
    });

    const cleanupResolved = addMessageHandler("blocker:resolved", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setBlockerState((prev) => ({
        ...prev,
        hasBlocker: false,
        currentBlocker: null,
        blockerHistory: prev.blockerHistory.map((b) =>
          b.id === payload.blockerId ? { ...b, resolvedAt: new Date().toISOString() } : b
        ),
        isRetrying: false,
      }));
    });

    const cleanupRetrying = addMessageHandler("blocker:retrying", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setBlockerState((prev) => ({
        ...prev,
        isRetrying: true,
      }));
    });

    const cleanupProgress = addMessageHandler("blocker:progress", (payload: any) => {
      if (payload.taskId !== taskId) return;
      setBlockerState((prev) => ({
        ...prev,
        currentBlocker: prev.currentBlocker
          ? { ...prev.currentBlocker, ...payload.updates }
          : null,
      }));
    });

    return () => {
      cleanupBlocker();
      cleanupResolved();
      cleanupRetrying();
      cleanupProgress();
    };
  }, [taskId, addMessageHandler]);

  const { hasBlocker, currentBlocker, blockerHistory, isRetrying } = blockerState;

  // Only show when task is in progress and there's a blocker
  if (!hasBlocker || !currentBlocker || taskStatus !== "in_progress") {
    return null;
  }

  const getSeverityColor = () => {
    switch (currentBlocker.severity) {
      case "critical":
        return "border-red-500 bg-red-500/5";
      case "high":
        return "border-orange-500 bg-orange-500/5";
      case "medium":
        return "border-amber-500 bg-amber-500/5";
      default:
        return "border-yellow-500 bg-yellow-500/5";
    }
  };

  const getSeverityIcon = () => {
    switch (currentBlocker.severity) {
      case "critical":
      case "high":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "medium":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <HelpCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getTypeLabel = () => {
    switch (currentBlocker.type) {
      case "error":
        return "Error Encountered";
      case "stuck":
        return "Agent Stuck";
      case "needs_input":
        return "Input Required";
      case "rate_limit":
        return "Rate Limited";
      case "dependency":
        return "Dependency Issue";
      default:
        return "Blocker";
    }
  };

  const getTypeBadgeVariant = () => {
    switch (currentBlocker.type) {
      case "error":
        return "destructive";
      case "needs_input":
        return "warning";
      case "rate_limit":
        return "info";
      default:
        return "secondary";
    }
  };

  const handleRetry = () => {
    setBlockerState((prev) => ({ ...prev, isRetrying: true }));
    onRetry?.();
  };

  return (
    <Card className={cn("border-2", getSeverityColor(), className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {getSeverityIcon()}
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                I'm stuck because...
                <Badge variant={getTypeBadgeVariant() as any} className="text-[10px]">
                  {getTypeLabel()}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatTimestamp(currentBlocker.createdAt)}
                {currentBlocker.retryCount !== undefined && currentBlocker.maxRetries !== undefined && (
                  <span className="ml-2">
                    (Attempt {currentBlocker.retryCount}/{currentBlocker.maxRetries})
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")}
            />
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <>
          <CardContent className="pt-0 pb-3">
            {/* Main blocker message */}
            <div className="rounded-lg bg-muted/50 p-3 mb-3">
              <h4 className="font-medium text-sm text-foreground mb-1">
                {currentBlocker.title}
              </h4>
              <p className="text-sm text-muted-foreground">
                {currentBlocker.description}
              </p>
            </div>

            {/* Context if available */}
            {currentBlocker.context && (
              <div className="mb-3 p-2 rounded bg-muted/30 font-mono text-xs text-muted-foreground overflow-x-auto">
                <pre className="whitespace-pre-wrap">{currentBlocker.context}</pre>
              </div>
            )}

            {/* Suggested actions */}
            {currentBlocker.suggestedActions && currentBlocker.suggestedActions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lightbulb className="h-3 w-3" />
                  <span>What I could try:</span>
                </div>
                <ul className="space-y-1 ml-5">
                  {currentBlocker.suggestedActions.map((action, index) => (
                    <li
                      key={index}
                      className="text-xs text-muted-foreground flex items-start gap-2"
                    >
                      <span className="text-primary">-</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-0 gap-2">
            {currentBlocker.retryable && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isRetrying}
                className="gap-1"
              >
                {isRetrying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {isRetrying ? "Retrying..." : "Retry"}
              </Button>
            )}

            {currentBlocker.type === "needs_input" && onProvideInput && (
              <Button variant="secondary" size="sm" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                Provide Input
              </Button>
            )}

            {currentBlocker.type === "rate_limit" && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Will auto-retry when limit resets</span>
              </div>
            )}
          </CardFooter>
        </>
      )}

      {/* Historical blockers count */}
      {blockerHistory.length > 1 && (
        <div className="px-4 pb-3 pt-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] cursor-help">
                  {blockerHistory.filter((b) => b.resolvedAt).length} blockers resolved
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  This task has encountered {blockerHistory.length} total blockers during execution.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </Card>
  );
}

// Compact version for inline display
interface BlockerBadgeProps {
  blocker: Blocker | null;
  onClick?: () => void;
}

export function BlockerBadge({ blocker, onClick }: BlockerBadgeProps) {
  if (!blocker) return null;

  const getSeverityColor = () => {
    switch (blocker.severity) {
      case "critical":
        return "bg-red-500/15 text-red-500 border-red-500/30";
      case "high":
        return "bg-orange-500/15 text-orange-500 border-orange-500/30";
      case "medium":
        return "bg-amber-500/15 text-amber-500 border-amber-500/30";
      default:
        return "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
    }
  };

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 cursor-pointer hover:opacity-80", getSeverityColor())}
      onClick={onClick}
    >
      <AlertTriangle className="h-3 w-3" />
      <span className="truncate max-w-32">{blocker.title}</span>
    </Badge>
  );
}

// Progress indicator that shows when retrying
interface RetryProgressProps {
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;
}

export function RetryProgress({ isRetrying, retryCount, maxRetries }: RetryProgressProps) {
  if (!isRetrying) return null;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      <span className="text-sm text-blue-500">
        Retrying... (Attempt {retryCount + 1}/{maxRetries})
      </span>
    </div>
  );
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}
