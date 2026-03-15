import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type DistributionType = 'type' | 'priority' | 'repository' | 'project';
type ChartType = 'pie' | 'bar';

const TYPE_COLORS: Record<string, string> = {
  improvement: '#06b6d4',
  bugfix: '#ef4444',
  feature: '#10b981',
  refactor: '#f59e0b',
  security: '#8b5cf6',
  other: '#64748b',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
};

const GENERIC_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'];

function getColor(type: DistributionType, label: string, index: number): string {
  if (type === 'type') return TYPE_COLORS[label.toLowerCase()] || GENERIC_COLORS[index % GENERIC_COLORS.length];
  if (type === 'priority') return PRIORITY_COLORS[label.toLowerCase()] || GENERIC_COLORS[index % GENERIC_COLORS.length];
  return GENERIC_COLORS[index % GENERIC_COLORS.length];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-lg px-4 py-3 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 text-sm">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
        <span className="font-medium capitalize">{d.label}</span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
        <span>{d.value} tasks</span>
        <span className="font-semibold text-foreground">{d.percentage?.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function TaskDistributionCharts() {
  const [distributionType, setDistributionType] = useState<DistributionType>('type');
  const [chartType, setChartType] = useState<ChartType>('pie');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'distribution', distributionType],
    queryFn: () => api.analytics.getDistribution(distributionType),
  });

  const distributionTypes: { value: DistributionType; label: string }[] = [
    { value: 'type', label: 'Type' },
    { value: 'priority', label: 'Priority' },
    { value: 'repository', label: 'Repo' },
    { value: 'project', label: 'Project' },
  ];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 h-full">
        <Skeleton className="h-5 w-40 mb-6" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  const items = data?.items || [];
  const hasData = items.length > 0;
  const total = items.reduce((s: number, i: any) => s + i.value, 0);

  const chartData = items.map((item: any, index: number) => ({
    ...item,
    fill: getColor(distributionType, item.label, index),
  }));

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full">
      <div className="flex items-center justify-between flex-wrap gap-2 px-6 pt-5 pb-2">
        <h3 className="text-sm font-semibold">Task Distribution</h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 bg-muted/60 rounded-lg">
            {distributionTypes.map(type => (
              <button
                key={type.value}
                onClick={() => setDistributionType(type.value)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                  distributionType === type.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 p-0.5 bg-muted/60 rounded-lg">
            {(['pie', 'bar'] as const).map(t => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 capitalize",
                  chartType === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        {!hasData ? (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No distribution data available</p>
          </div>
        ) : chartType === 'pie' ? (
          <div className="flex flex-col items-center">
            <div className="relative w-full" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={98}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="label"
                    stroke="none"
                    cornerRadius={4}
                    animationDuration={800}
                  >
                    {chartData.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-2xl font-bold">{total}</div>
                  <div className="text-[10px] font-medium text-muted-foreground">Total</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-1">
              {chartData.map((item: any) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-[11px] text-muted-foreground capitalize">{item.label}</span>
                  <span className="text-[11px] font-semibold">{item.percentage?.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={true} vertical={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground capitalize" width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} animationDuration={800}>
                {chartData.map((entry: any, index: number) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
