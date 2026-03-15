import { TrendingUp, TrendingDown, Clock, CheckCircle, DollarSign, Target, Percent, Hash } from 'lucide-react';
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
  totalTokens: number;
  totalTokensTrend: number;
  roi: number;
  roiTrend: number;
  successRate: number;
  successRateTrend: number;
  sparklines: {
    tasks: number[];
    hoursSaved: number[];
    cost: number[];
    tokens: number[];
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
  gradientId: string;
}

function Sparkline({ data, color, gradientId }: SparklineProps) {
  const chartData = data.map((value, index) => ({ value, index }));

  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            animationDuration={1200}
            animationEasing="ease-out"
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
  accentColor: string;
  format?: 'number' | 'currency' | 'percent' | 'hours' | 'tokens';
  index: number;
}

function MetricCard({
  label,
  value,
  trend,
  icon: Icon,
  sparklineData = [],
  sparklineColor,
  accentColor,
  format = 'number',
  index,
}: MetricCardProps) {
  const isPositiveTrend = trend >= 0;
  const TrendIcon = isPositiveTrend ? TrendingUp : TrendingDown;
  const gradientId = `sparkline-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const formatValue = () => {
    if (typeof value === 'string') return value;
    switch (format) {
      case 'currency':
        return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'hours':
        return `${value.toLocaleString()}h`;
      case 'tokens': {
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
        return value.toLocaleString();
      }
      default:
        return value.toLocaleString();
    }
  };

  return (
    <div
      className="group relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 transition-all duration-300 hover:border-border hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 flex flex-col justify-between"
      style={{
        animationDelay: `${index * 60}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Subtle accent gradient at top */}
      <div
        className="absolute inset-x-0 top-0 h-px rounded-t-2xl opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />

      <div className="flex items-center gap-2 mb-2">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: `color-mix(in oklch, ${accentColor} 15%, transparent)` }}
        >
          <Icon size={14} style={{ color: accentColor }} />
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-xl font-bold tracking-tight block">{formatValue()}</span>
          <div className="flex items-center gap-1 mt-1">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                isPositiveTrend
                  ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
                  : "text-red-600 bg-red-500/10 dark:text-red-400"
              )}
            >
              <TrendIcon size={10} />
              {Math.abs(trend).toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground/70 hidden lg:inline truncate">vs prior</span>
          </div>
        </div>

        {sparklineData.length > 1 && sparklineData.some(v => v > 0) && (
          <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity duration-300">
            <Sparkline data={sparklineData} color={sparklineColor} gradientId={gradientId} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 p-5">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-28 mb-2" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-14 rounded-md" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function ExecutiveSummaryCards({ data, isLoading }: ExecutiveSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
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
    totalTokens: 0,
    totalTokensTrend: 0,
    roi: 0,
    roiTrend: 0,
    successRate: 0,
    successRateTrend: 0,
    sparklines: {
      tasks: [],
      hoursSaved: [],
      cost: [],
      tokens: [],
      roi: [],
      successRate: [],
    },
  };

  const overview = data || defaultData;

  const cards = [
    {
      label: 'Tasks',
      value: overview.totalTasks,
      trend: overview.totalTasksTrend,
      icon: CheckCircle,
      sparklineData: overview.sparklines.tasks,
      sparklineColor: '#10b981',
      accentColor: '#10b981',
    },
    {
      label: 'Saved',
      value: overview.hoursSaved,
      trend: overview.hoursSavedTrend,
      icon: Clock,
      sparklineData: overview.sparklines.hoursSaved,
      sparklineColor: '#06b6d4',
      accentColor: '#06b6d4',
      format: 'hours' as const,
    },
    {
      label: 'Cost',
      value: overview.totalCost,
      trend: overview.totalCostTrend,
      icon: DollarSign,
      sparklineData: overview.sparklines.cost,
      sparklineColor: '#f59e0b',
      accentColor: '#f59e0b',
      format: 'currency' as const,
    },
    {
      label: 'Tokens',
      value: overview.totalTokens,
      trend: overview.totalTokensTrend,
      icon: Hash,
      sparklineData: overview.sparklines.tokens,
      sparklineColor: '#8b5cf6',
      accentColor: '#8b5cf6',
      format: 'tokens' as const,
    },
    {
      label: 'ROI',
      value: overview.roi,
      trend: overview.roiTrend,
      icon: Target,
      sparklineData: overview.sparklines.roi,
      sparklineColor: '#ec4899',
      accentColor: '#ec4899',
      format: 'percent' as const,
    },
    {
      label: 'Success',
      value: overview.successRate,
      trend: overview.successRateTrend,
      icon: Percent,
      sparklineData: overview.sparklines.successRate,
      sparklineColor: '#3b82f6',
      accentColor: '#3b82f6',
      format: 'percent' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card, i) => (
        <MetricCard key={card.label} {...card} index={i} />
      ))}
    </div>
  );
}
