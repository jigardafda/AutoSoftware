import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number;
  icon?: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
}

export function MetricCard({ label, value, icon: Icon, trend, className }: MetricCardProps) {
  return (
    <Card className={cn(
      "group relative p-4 transition-all duration-200 hover:shadow-md hover:border-border/80",
      className
    )}>
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          {Icon && (
            <div className="h-7 w-7 rounded-lg bg-muted/50 flex items-center justify-center">
              <Icon size={14} className="text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-semibold tracking-tight">{value}</span>
          {trend && (
            <span
              className={cn(
                "mb-0.5 flex items-center gap-0.5 text-xs font-medium",
                trend.positive ? "text-[oklch(0.65_0.18_145)]" : "text-[oklch(0.60_0.22_25)]"
              )}
            >
              {trend.positive ? (
                <TrendingUp size={12} />
              ) : (
                <TrendingDown size={12} />
              )}
              {trend.value}%
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
