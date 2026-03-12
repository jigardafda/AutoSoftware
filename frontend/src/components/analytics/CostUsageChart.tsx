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
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CostUsageChartProps {
  dateRange: { startDate: string; endDate: string };
}

type ViewMode = 'timeline' | 'byModel' | 'byTokenType' | 'bySource';

const MODEL_COLORS = [
  'oklch(0.65 0.18 195)', // Primary teal
  'oklch(0.65 0.18 145)', // Green
  'oklch(0.60 0.22 25)',  // Red
  'oklch(0.70 0.15 85)',  // Yellow
  'oklch(0.60 0.18 290)', // Purple
  'oklch(0.65 0.15 45)',  // Orange
];

export function CostUsageChart({ dateRange }: CostUsageChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  const { data: costData, isLoading } = useQuery({
    queryKey: ['analytics', 'costs', dateRange],
    queryFn: () => api.analytics.getCosts({
      ...dateRange,
      groupBy: 'day',
    }),
  });

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: 'timeline', label: 'Timeline' },
    { value: 'byModel', label: 'By Model' },
    { value: 'byTokenType', label: 'Token Usage' },
    { value: 'bySource', label: 'By Source' },
  ];

  if (isLoading) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="p-4 pb-0">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="p-4 pt-4 flex-1">
          <Skeleton className="h-[280px]" />
        </CardContent>
      </Card>
    );
  }

  const timelineData = (costData?.timeline || []).map(item => ({
    ...item,
    date: item.date.slice(5), // "MM-DD" format
  }));

  const modelData = costData?.byModel || [];
  const tokenData = costData?.byTokenType || [];
  const sourceData = costData?.bySource || [];
  const timelineByToken = (costData?.timelineByToken || []).map(item => ({
    ...item,
    date: item.date.slice(5), // "MM-DD" format
  }));
  const timelineBySource = (costData?.timelineBySource || []).map(item => ({
    ...item,
    date: item.date.slice(5), // "MM-DD" format
  }));
  const sourceLabels = costData?.sourceLabels || {};
  const sources = costData?.sources || [];

  const renderChart = () => {
    switch (viewMode) {
      case 'timeline':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={timelineData}>
              <defs>
                <linearGradient id="costBarFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.18 195)" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="oklch(0.65 0.18 195)" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.15 0.01 250)",
                  border: "1px solid oklch(0.25 0.015 250)",
                  borderRadius: "10px",
                  fontSize: 12,
                  color: "oklch(0.95 0 0)",
                }}
                formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cost']}
              />
              <Bar
                dataKey="cost"
                fill="url(#costBarFill)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'byModel':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={modelData}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="cost"
                nameKey="model"
                stroke="none"
              >
                {modelData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={MODEL_COLORS[index % MODEL_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.15 0.01 250)",
                  border: "1px solid oklch(0.25 0.015 250)",
                  borderRadius: "10px",
                  fontSize: 12,
                  color: "oklch(0.95 0 0)",
                }}
                formatter={(value, name) => [
                  `$${Number(value).toFixed(4)} (${modelData.find(m => m.model === name)?.percentage.toFixed(1)}%)`,
                  String(name)
                ]}
              />
              <Legend
                verticalAlign="bottom"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'byTokenType':
        // Daily stacked bar chart for token usage
        const totalTokens = tokenData.reduce((sum, t) => sum + t.tokens, 0);

        if (timelineByToken.length === 0) {
          return (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No token data available</p>
            </div>
          );
        }

        return (
          <div className="h-[280px] flex flex-col">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timelineByToken}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.15 0.01 250)",
                    border: "1px solid oklch(0.25 0.015 250)",
                    borderRadius: "10px",
                    fontSize: 12,
                    color: "oklch(0.95 0 0)",
                  }}
                  formatter={(value: number, name: string) => [
                    value >= 1000000 ? `${(value / 1000000).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value,
                    `${name} tokens`
                  ]}
                />
                <Bar dataKey="input" stackId="tokens" fill={MODEL_COLORS[0]} name="Input" radius={[0, 0, 0, 0]} />
                <Bar dataKey="output" stackId="tokens" fill={MODEL_COLORS[4]} name="Output" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MODEL_COLORS[0] }} />
                <span className="text-xs text-muted-foreground">Input: {(tokenData[0]?.tokens / 1000000 || 0).toFixed(2)}M</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MODEL_COLORS[4] }} />
                <span className="text-xs text-muted-foreground">Output: {(tokenData[1]?.tokens / 1000000 || 0).toFixed(2)}M</span>
              </div>
              <span className="text-xs font-semibold">Total: {(totalTokens / 1000000).toFixed(2)}M</span>
            </div>
          </div>
        );

      case 'bySource':
        // Daily stacked bar chart for cost by source
        const totalSourceCost = sourceData.reduce((sum, s) => sum + (s.cost || 0), 0);

        if (timelineBySource.length === 0) {
          return (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No source data available</p>
            </div>
          );
        }

        return (
          <div className="h-[280px] flex flex-col">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timelineBySource}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.15 0.01 250)",
                    border: "1px solid oklch(0.25 0.015 250)",
                    borderRadius: "10px",
                    fontSize: 12,
                    color: "oklch(0.95 0 0)",
                  }}
                  formatter={(value: number, name: string) => [
                    `$${value.toFixed(4)}`,
                    sourceLabels[name] || name
                  ]}
                />
                {sources.map((source, index) => (
                  <Bar
                    key={source}
                    dataKey={source}
                    stackId="cost"
                    fill={MODEL_COLORS[index % MODEL_COLORS.length]}
                    name={sourceLabels[source] || source}
                    radius={index === sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-2 px-2">
              {sources.map((source, index) => (
                <div key={source} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length] }} />
                  <span className="text-xs text-muted-foreground">{sourceLabels[source] || source}</span>
                </div>
              ))}
              <span className="text-xs font-semibold">Total: ${totalSourceCost.toFixed(2)}</span>
            </div>
          </div>
        );
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Cost & Token Usage</CardTitle>
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
            {viewModes.map(mode => (
              <button
                key={mode.value}
                onClick={() => setViewMode(mode.value)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
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
      </CardHeader>
      <CardContent className="p-4 pt-4 flex-1">
        {timelineData.length === 0 && modelData.length === 0 && sourceData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No cost data available</p>
          </div>
        ) : (
          renderChart()
        )}
      </CardContent>
    </Card>
  );
}
