import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UsageInfo } from "./types";

interface ContextUsageGaugeProps {
  usage?: UsageInfo | null;
  className?: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
}

export function ContextUsageGauge({ usage, className }: ContextUsageGaugeProps) {
  const { percentage, formattedUsed, formattedTotal, status } = useMemo(() => {
    if (!usage || usage.contextWindow === 0) {
      return {
        percentage: 0,
        formattedUsed: "0",
        formattedTotal: "0",
        status: "empty" as const,
      };
    }

    const pct = Math.min(100, (usage.totalTokens / usage.contextWindow) * 100);

    let statusValue: "low" | "medium" | "high" | "critical" | "empty";
    if (pct < 50) statusValue = "low";
    else if (pct < 75) statusValue = "medium";
    else if (pct < 90) statusValue = "high";
    else statusValue = "critical";

    return {
      percentage: pct,
      formattedUsed: formatTokens(usage.totalTokens),
      formattedTotal: formatTokens(usage.contextWindow),
      status: statusValue,
    };
  }, [usage]);

  const progress = Math.min(Math.max(percentage / 100, 0), 1);

  const tooltip =
    status === "empty"
      ? "No context usage data"
      : `Context: ${Math.round(percentage)}% used (${formattedUsed} of ${formattedTotal} tokens)`;

  const progressColor =
    status === "empty"
      ? "text-muted-foreground/40"
      : status === "critical"
        ? "text-red-500"
        : status === "high"
          ? "text-orange-500"
          : status === "medium"
            ? "text-foreground"
            : "text-muted-foreground";

  const radius = 8;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center justify-center rounded p-1",
            "hover:bg-muted transition-colors cursor-help",
            className
          )}
          role="img"
          aria-label={
            status === "empty"
              ? "Context usage"
              : `Context: ${Math.round(percentage)}% used`
          }
        >
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-border/60"
            />
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset}
              className={cn(progressColor, "transition-all duration-500 ease-out")}
            />
          </svg>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{tooltip}</p>
        {usage && usage.costUsd > 0 && (
          <p className="text-muted-foreground mt-0.5">
            Cost: ${usage.costUsd.toFixed(4)}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
