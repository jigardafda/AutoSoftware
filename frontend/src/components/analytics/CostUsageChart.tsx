import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CostUsageChartProps {
  dateRange: { startDate: string; endDate: string };
}

type ViewMode = 'timeline' | 'byModel' | 'byTokenType' | 'bySource';

const CHART_COLORS = [
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#3b82f6', // blue
];

function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-lg px-4 py-3 shadow-2xl shadow-black/20">
      {label && <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>}
      <div className="space-y-1.5">
        {payload.map((entry: any, i: number) => {
          const [val, name] = formatter ? formatter(entry.value, entry.name) : [entry.value, entry.name];
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto font-semibold tabular-nums">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CostUsageChart({ dateRange }: CostUsageChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  const { data: costData, isLoading } = useQuery({
    queryKey: ['analytics', 'costs', dateRange],
    queryFn: () => api.analytics.getCosts({ ...dateRange, groupBy: 'day' }),
  });

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: 'timeline', label: 'Timeline' },
    { value: 'byModel', label: 'By Model' },
    { value: 'byTokenType', label: 'Tokens' },
    { value: 'bySource', label: 'By Source' },
  ];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6">
        <Skeleton className="h-5 w-36 mb-6" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  const timelineData = (costData?.timeline || []).map((item: any) => ({
    ...item, date: item.date.slice(5),
  }));
  const modelData = costData?.byModel || [];
  const tokenData = costData?.byTokenType || [];
  const timelineByToken = (costData?.timelineByToken || []).map((item: any) => ({
    ...item, date: item.date.slice(5),
  }));
  const timelineBySource = (costData?.timelineBySource || []).map((item: any) => ({
    ...item, date: item.date.slice(5),
  }));
  const sourceLabels = costData?.sourceLabels || {};
  const sources = costData?.sources || [];

  const totalModelCost = modelData.reduce((s: number, m: any) => s + (m.cost || 0), 0);
  const totalTokens = tokenData.reduce((s: number, t: any) => s + t.tokens, 0);
  const noData = timelineData.length === 0 && modelData.length === 0 && sources.length === 0;

  const renderChart = () => {
    if (noData) {
      return (
        <div className="flex h-[300px] items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">No cost data available</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Usage data will appear here</p>
          </div>
        </div>
      );
    }

    switch (viewMode) {
      case 'timeline':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="costBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} width={50} />
              <Tooltip content={<CustomTooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />} />
              <Bar dataKey="cost" fill="url(#costBarGrad)" radius={[6, 6, 0, 0]} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'byModel':
        return (
          <div className="flex flex-col items-center">
            <div className="relative w-full" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={modelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="cost"
                    nameKey="model"
                    stroke="none"
                    cornerRadius={4}
                    animationDuration={800}
                    label={false}
                  >
                    {modelData.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip formatter={(v: number, name: string) => {
                    const pct = modelData.find((m: any) => m.model === name)?.percentage || 0;
                    return [`$${v.toFixed(4)} (${pct.toFixed(1)}%)`, name];
                  }} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-xl font-bold">${totalModelCost.toFixed(2)}</div>
                  <div className="text-[10px] font-medium text-muted-foreground">Total Cost</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-2">
              {modelData.map((m: any, i: number) => (
                <div key={m.model} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-[11px] text-muted-foreground">{m.model}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'byTokenType': {
        if (timelineByToken.length === 0) {
          return (
            <div className="flex h-[300px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No token data available</p>
            </div>
          );
        }
        const formatTokens = (v: number) =>
          v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v);
        return (
          <div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={timelineByToken} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" tickFormatter={formatTokens} width={50} />
                <Tooltip content={<CustomTooltip formatter={(v: number, name: string) => [formatTokens(v), `${name} tokens`]} />} />
                <Bar dataKey="input" stackId="tokens" fill="#06b6d4" name="Input" radius={[0, 0, 0, 0]} animationDuration={800} />
                <Bar dataKey="output" stackId="tokens" fill="#8b5cf6" name="Output" radius={[6, 6, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-5 rounded-full bg-cyan-500" />
                <span className="text-[11px] text-muted-foreground">Input: {formatTokens(tokenData[0]?.tokens || 0)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-5 rounded-full bg-violet-500" />
                <span className="text-[11px] text-muted-foreground">Output: {formatTokens(tokenData[1]?.tokens || 0)}</span>
              </div>
              <span className="text-[11px] font-semibold">Total: {formatTokens(totalTokens)}</span>
            </div>
          </div>
        );
      }

      case 'bySource': {
        if (timelineBySource.length === 0) {
          return (
            <div className="flex h-[300px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No source data available</p>
            </div>
          );
        }
        return (
          <div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={timelineBySource} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} width={50} />
                <Tooltip content={<CustomTooltip formatter={(v: number, name: string) => [`$${v.toFixed(4)}`, sourceLabels[name] || name]} />} />
                {sources.map((source: string, i: number) => (
                  <Bar
                    key={source}
                    dataKey={source}
                    stackId="cost"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    name={sourceLabels[source] || source}
                    radius={i === sources.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    animationDuration={800 + i * 100}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-3">
              {sources.map((source: string, i: number) => (
                <div key={source} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-[11px] text-muted-foreground">{sourceLabels[source] || source}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <h3 className="text-sm font-semibold">Cost & Token Usage</h3>
        <div className="flex gap-0.5 p-0.5 bg-muted/60 rounded-lg">
          {viewModes.map(mode => (
            <button
              key={mode.value}
              onClick={() => setViewMode(mode.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                viewMode === mode.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        {renderChart()}
      </div>
    </div>
  );
}
