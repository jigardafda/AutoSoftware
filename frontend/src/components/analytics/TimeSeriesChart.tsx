import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LOCData {
  date: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

interface TimeSavedData {
  date: string;
  minutesSaved: number;
  taskCount: number;
}

interface TimeSeriesChartProps {
  locData: LOCData[];
  timeSavedData: TimeSavedData[];
  title: string;
}

type ViewMode = 'loc' | 'timeSaved' | 'combined';

export function TimeSeriesChart({ locData, timeSavedData, title }: TimeSeriesChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('combined');

  const combinedData = useMemo(() => {
    const dateMap = new Map<string, {
      date: string;
      linesAdded: number;
      linesDeleted: number;
      filesChanged: number;
      minutesSaved: number;
      taskCount: number;
    }>();

    // Process LOC data
    for (const item of locData) {
      const existing = dateMap.get(item.date) || {
        date: item.date,
        linesAdded: 0,
        linesDeleted: 0,
        filesChanged: 0,
        minutesSaved: 0,
        taskCount: 0,
      };
      existing.linesAdded = item.linesAdded;
      existing.linesDeleted = item.linesDeleted;
      existing.filesChanged = item.filesChanged;
      dateMap.set(item.date, existing);
    }

    // Process time saved data
    for (const item of timeSavedData) {
      const existing = dateMap.get(item.date) || {
        date: item.date,
        linesAdded: 0,
        linesDeleted: 0,
        filesChanged: 0,
        minutesSaved: 0,
        taskCount: 0,
      };
      existing.minutesSaved = item.minutesSaved;
      existing.taskCount = item.taskCount;
      dateMap.set(item.date, existing);
    }

    return Array.from(dateMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
        ...item,
        date: item.date.slice(5), // "MM-DD" format
        hoursSaved: item.minutesSaved / 60,
      }));
  }, [locData, timeSavedData]);

  const hasData = combinedData.length > 0;

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: 'combined', label: 'All' },
    { value: 'loc', label: 'Lines of Code' },
    { value: 'timeSaved', label: 'Time Saved' },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
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
        {!hasData ? (
          <div className="flex h-[280px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={combinedData}>
              <defs>
                <linearGradient id="linesAddedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.18 145)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.65 0.18 145)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="linesDeletedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hoursSavedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.18 195)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="oklch(0.65 0.18 195)" stopOpacity={0} />
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
                yAxisId="left"
                tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={45}
              />
              {(viewMode === 'combined' || viewMode === 'timeSaved') && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 250)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={45}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.15 0.01 250)",
                  border: "1px solid oklch(0.25 0.015 250)",
                  borderRadius: "10px",
                  fontSize: 12,
                  color: "oklch(0.95 0 0)",
                }}
                formatter={(value, name) => {
                  const numValue = Number(value) || 0;
                  if (name === 'hoursSaved') return [`${numValue.toFixed(1)} hrs`, 'Hours Saved'];
                  if (name === 'linesAdded') return [numValue.toLocaleString(), 'Lines Added'];
                  if (name === 'linesDeleted') return [numValue.toLocaleString(), 'Lines Deleted'];
                  return [numValue.toLocaleString(), String(name)];
                }}
              />
              <Legend
                verticalAlign="bottom"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">
                    {value === 'linesAdded' ? 'Lines Added' :
                     value === 'linesDeleted' ? 'Lines Deleted' :
                     value === 'hoursSaved' ? 'Hours Saved' : value}
                  </span>
                )}
              />

              {(viewMode === 'combined' || viewMode === 'loc') && (
                <>
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="linesAdded"
                    stroke="oklch(0.65 0.18 145)"
                    fill="url(#linesAddedFill)"
                    strokeWidth={2}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="linesDeleted"
                    fill="oklch(0.60 0.22 25)"
                    opacity={0.7}
                    barSize={8}
                  />
                </>
              )}

              {(viewMode === 'combined' || viewMode === 'timeSaved') && (
                <Area
                  yAxisId={viewMode === 'timeSaved' ? 'left' : 'right'}
                  type="monotone"
                  dataKey="hoursSaved"
                  stroke="oklch(0.65 0.18 195)"
                  fill="url(#hoursSavedFill)"
                  strokeWidth={2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
