import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Zap, Clock, DollarSign, TrendingUp, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface EfficiencyMetricsProps {
  dateRange: { startDate: string; endDate: string };
  projectId?: string;
  repositoryId?: string;
}

interface MetricItem {
  label: string;
  value: string;
  subValue?: string;
  trend?: number;
  icon: typeof Zap;
  color: string;
  bg: string;
}

export function EfficiencyMetrics({ dateRange, projectId, repositoryId }: EfficiencyMetricsProps) {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview', dateRange, projectId, repositoryId],
    queryFn: () => api.analytics.getOverview({
      ...dateRange,
      projectId,
      repositoryId,
    }),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['analytics', 'pipeline'],
    queryFn: () => api.analytics.getPipeline(),
  });

  const { data: savedSettings } = useQuery({
    queryKey: ['analytics', 'settings'],
    queryFn: api.analytics.getSettings,
    staleTime: Infinity,
  });

  const { data: roi } = useQuery({
    queryKey: ['analytics', 'roi', dateRange],
    queryFn: () => api.analytics.getROI(dateRange),
  });

  if (overviewLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const totalTasks = overview?.totalTasks || 0;
  const totalCost = overview?.totalCost || 0;
  const hoursSaved = overview?.hoursSaved || 0;
  const successRate = overview?.successRate || 0;
  const avgTimeToComplete = pipeline?.avgTimeToComplete || 0;
  const hourlyRate = savedSettings?.hourlyRate ?? roi?.hourlyRate ?? 75;
  const costPerTask = totalTasks > 0 ? totalCost / totalTasks : 0;
  const costPerHourSaved = hoursSaved > 0 ? totalCost / hoursSaved : 0;
  const netSavings = roi?.netSavings || (hoursSaved * hourlyRate - totalCost);

  const metrics: MetricItem[] = [
    {
      label: 'Cost per Task',
      value: `$${costPerTask.toFixed(2)}`,
      subValue: `${totalTasks} tasks total`,
      trend: overview?.totalCostTrend,
      icon: DollarSign,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.1)',
    },
    {
      label: 'Avg Completion Time',
      value: avgTimeToComplete > 60
        ? `${(avgTimeToComplete / 60).toFixed(1)}h`
        : `${Math.round(avgTimeToComplete)}m`,
      subValue: 'per task',
      icon: Clock,
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.1)',
    },
    {
      label: 'Cost per Hour Saved',
      value: `$${costPerHourSaved.toFixed(2)}`,
      subValue: `${hoursSaved.toFixed(1)}h saved`,
      icon: Zap,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.1)',
    },
    {
      label: 'Success Rate',
      value: `${successRate.toFixed(1)}%`,
      subValue: `${Math.round(totalTasks * successRate / 100)} succeeded`,
      trend: overview?.successRateTrend,
      icon: Target,
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.1)',
    },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <div className="h-6 w-6 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <TrendingUp size={12} className="text-amber-500" />
        </div>
        <h3 className="text-sm font-semibold">Efficiency Metrics</h3>
        {netSavings > 0 && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
            ${netSavings.toFixed(0)} saved
          </span>
        )}
      </div>

      <div className="px-4 pb-4 flex-1 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="rounded-xl border border-border/40 p-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-5 w-5 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: metric.bg }}
                  >
                    <Icon size={11} style={{ color: metric.color }} />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {metric.label}
                  </span>
                </div>
                <div className="flex items-end gap-1.5">
                  <span className="text-lg font-bold tabular-nums">{metric.value}</span>
                  {metric.trend !== undefined && metric.trend !== 0 && (
                    <span className={`flex items-center text-[10px] font-medium mb-0.5 ${metric.trend > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {metric.trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                      {Math.abs(metric.trend).toFixed(0)}%
                    </span>
                  )}
                </div>
                {metric.subValue && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{metric.subValue}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* ROI summary bar */}
        <div className="rounded-xl bg-gradient-to-r from-emerald-500/5 to-blue-500/5 border border-emerald-500/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Return on Investment</p>
              <p className="text-xl font-bold text-emerald-500 tabular-nums mt-0.5">
                {(overview?.roi || 0).toFixed(0)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Engineer rate</p>
              <p className="text-sm font-semibold tabular-nums">${hourlyRate}/hr</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
