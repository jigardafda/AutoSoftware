import { TrendingUp, TrendingDown, Clock, CheckCircle, DollarSign, Target, Percent } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';

interface AnalyticsOverview {
  totalTasks: number;
  totalTasksTrend: number;
  hoursSaved: number;
  hoursSavedTrend: number;
  totalCost: number;
  totalCostTrend: number;
  roi: number;
  roiTrend: number;
  successRate: number;
  successRateTrend: number;
  sparklines: {
    tasks: number[];
    hoursSaved: number[];
    cost: number[];
    roi: number[];
    successRate: number[];
  };
}

interface ExecutiveSummaryCardsProps {
  data?: AnalyticsOverview;
  isLoading: boolean;
}

interface SparklineProps {
  data: number[];
  color: string;
  className?: string;
}

function Sparkline({ data, color, className }: SparklineProps) {
  const chartData = data.map((value, index) => ({ value, index }));

  return (
    <div className={cn("h-8 w-20", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkline-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#sparkline-${color})`}
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  trend: number;
  icon: React.ElementType;
  sparklineData?: number[];
  sparklineColor: string;
  format?: 'number' | 'currency' | 'percent' | 'hours';
}

function MetricCard({
  label,
  value,
  trend,
  icon: Icon,
  sparklineData = [],
  sparklineColor,
  format = 'number'
}: MetricCardProps) {
  const isPositiveTrend = trend >= 0;
  const TrendIcon = isPositiveTrend ? TrendingUp : TrendingDown;

  const formatValue = () => {
    if (typeof value === 'string') return value;
    switch (format) {
      case 'currency':
        return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'hours':
        return `${value.toLocaleString()} hrs`;
      default:
        return value.toLocaleString();
    }
  };

  return (
    <Card className="group relative p-3 sm:p-5 transition-all duration-200 hover:shadow-md hover:border-border/80">
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate pr-2">
            {label}
          </span>
          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
            <Icon size={14} className="text-muted-foreground sm:hidden" />
            <Icon size={16} className="text-muted-foreground hidden sm:block" />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="min-w-0">
            <span className="text-lg sm:text-2xl font-semibold tracking-tight">{formatValue()}</span>
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1">
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[10px] sm:text-xs font-medium",
                  isPositiveTrend ? "text-[oklch(0.65_0.18_145)]" : "text-[oklch(0.60_0.22_25)]"
                )}
              >
                <TrendIcon size={10} className="sm:hidden" />
                <TrendIcon size={12} className="hidden sm:block" />
                {Math.abs(trend).toFixed(1)}%
              </span>
              <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">vs last period</span>
            </div>
          </div>

          {sparklineData.length > 0 && (
            <Sparkline data={sparklineData} color={sparklineColor} className="h-6 w-16 sm:h-8 sm:w-20" />
          )}
        </div>
      </div>
    </Card>
  );
}

function MetricCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-24 mb-2" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}

export function ExecutiveSummaryCards({ data, isLoading }: ExecutiveSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const defaultData: AnalyticsOverview = {
    totalTasks: 0,
    totalTasksTrend: 0,
    hoursSaved: 0,
    hoursSavedTrend: 0,
    totalCost: 0,
    totalCostTrend: 0,
    roi: 0,
    roiTrend: 0,
    successRate: 0,
    successRateTrend: 0,
    sparklines: {
      tasks: [],
      hoursSaved: [],
      cost: [],
      roi: [],
      successRate: [],
    },
  };

  const overview = data || defaultData;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      <MetricCard
        label="Total Tasks"
        value={overview.totalTasks}
        trend={overview.totalTasksTrend}
        icon={CheckCircle}
        sparklineData={overview.sparklines.tasks}
        sparklineColor="oklch(0.65 0.18 195)"
      />
      <MetricCard
        label="Hours Saved"
        value={overview.hoursSaved}
        trend={overview.hoursSavedTrend}
        icon={Clock}
        sparklineData={overview.sparklines.hoursSaved}
        sparklineColor="oklch(0.65 0.18 145)"
        format="hours"
      />
      <MetricCard
        label="Total Cost"
        value={overview.totalCost}
        trend={overview.totalCostTrend}
        icon={DollarSign}
        sparklineData={overview.sparklines.cost}
        sparklineColor="oklch(0.70 0.15 85)"
        format="currency"
      />
      <MetricCard
        label="ROI"
        value={overview.roi}
        trend={overview.roiTrend}
        icon={Target}
        sparklineData={overview.sparklines.roi}
        sparklineColor="oklch(0.60 0.18 290)"
        format="percent"
      />
      {/* Last card spans 2 columns on xs to fill the row */}
      <div className="col-span-2 sm:col-span-1">
        <MetricCard
          label="Success Rate"
          value={overview.successRate}
          trend={overview.successRateTrend}
          icon={Percent}
          sparklineData={overview.sparklines.successRate}
          sparklineColor="oklch(0.65 0.18 195)"
          format="percent"
        />
      </div>
    </div>
  );
}
