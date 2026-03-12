import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type DistributionType = 'type' | 'priority' | 'repository' | 'project';
type ChartType = 'pie' | 'bar';

const TYPE_COLORS: Record<string, string> = {
  improvement: 'oklch(0.65 0.18 195)',
  bugfix: 'oklch(0.60 0.22 25)',
  feature: 'oklch(0.65 0.18 145)',
  refactor: 'oklch(0.70 0.15 85)',
  security: 'oklch(0.60 0.18 290)',
  other: 'oklch(0.55 0.01 250)',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'oklch(0.60 0.22 25)',
  high: 'oklch(0.65 0.15 45)',
  medium: 'oklch(0.70 0.15 85)',
  low: 'oklch(0.65 0.18 145)',
};

const GENERIC_COLORS = [
  'oklch(0.65 0.18 195)',
  'oklch(0.65 0.18 145)',
  'oklch(0.60 0.22 25)',
  'oklch(0.70 0.15 85)',
  'oklch(0.60 0.18 290)',
  'oklch(0.65 0.15 45)',
];

function getColorForItem(type: DistributionType, label: string, index: number): string {
  if (type === 'type') {
    return TYPE_COLORS[label.toLowerCase()] || GENERIC_COLORS[index % GENERIC_COLORS.length];
  }
  if (type === 'priority') {
    return PRIORITY_COLORS[label.toLowerCase()] || GENERIC_COLORS[index % GENERIC_COLORS.length];
  }
  return GENERIC_COLORS[index % GENERIC_COLORS.length];
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
    { value: 'repository', label: 'Repository' },
    { value: 'project', label: 'Project' },
  ];

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: 'pie', label: 'Pie' },
    { value: 'bar', label: 'Bar' },
  ];

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="p-4 pb-0">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="p-4 pt-4">
          <Skeleton className="h-[280px]" />
        </CardContent>
      </Card>
    );
  }

  const items = data?.items || [];
  const hasData = items.length > 0;

  const chartData = items.map((item, index) => ({
    ...item,
    fill: getColorForItem(distributionType, item.label, index),
  }));

  return (
    <Card className="h-full">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm">Task Distribution</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
              {distributionTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setDistributionType(type.value)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                    distributionType === type.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
              {chartTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setChartType(type.value)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                    chartType === type.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-4">
        {!hasData ? (
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No distribution data available</p>
          </div>
        ) : chartType === 'pie' ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                nameKey="label"
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
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
                formatter={(value, name, props) => [
                  `${value} (${(props.payload as any).percentage.toFixed(1)}%)`,
                  String(name)
                ]}
              />
              <Legend
                verticalAlign="bottom"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground capitalize">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.15 0.01 250)",
                  border: "1px solid oklch(0.25 0.015 250)",
                  borderRadius: "10px",
                  fontSize: 12,
                  color: "oklch(0.95 0 0)",
                }}
                formatter={(value, _name, props) => [
                  `${value} (${(props.payload as any).percentage.toFixed(1)}%)`,
                  'Tasks'
                ]}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
