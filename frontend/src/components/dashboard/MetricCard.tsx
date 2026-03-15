import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";

interface MetricCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  trend?: { value: number; positive: boolean };
  sparkline?: number[];
  accentColor?: string;
  format?: 'number' | 'percent';
  className?: string;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ v, i }));
  const id = `spark-${color.replace('#', '')}`;
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} fill={`url(#${id})`} strokeWidth={1.5} dot={false} animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricCard({ label, value, icon: Icon, trend, sparkline, accentColor = '#06b6d4', format = 'number', className }: MetricCardProps) {
  const isPositive = trend ? trend.positive : true;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  const formatValue = () => {
    if (typeof value === 'string') return value;
    if (format === 'percent') return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 flex flex-col justify-between",
        className
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-px rounded-t-2xl opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />

      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
            style={{ backgroundColor: `color-mix(in oklch, ${accentColor} 15%, transparent)` }}
          >
            <Icon size={14} style={{ color: accentColor }} />
          </div>
        )}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xl font-bold tracking-tight block">{formatValue()}</span>
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                  isPositive
                    ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
                    : "text-red-600 bg-red-500/10 dark:text-red-400"
                )}
              >
                <TrendIcon size={10} />
                {Math.abs(trend.value).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        {sparkline && sparkline.length > 1 && sparkline.some(v => v > 0) && (
          <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
            <MiniSparkline data={sparkline} color={accentColor} />
          </div>
        )}
      </div>
    </div>
  );
}
