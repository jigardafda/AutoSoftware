import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-lg px-4 py-3 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any) => {
          const name =
            entry.dataKey === 'linesAdded' ? 'Lines Added' :
            entry.dataKey === 'linesDeleted' ? 'Lines Deleted' :
            entry.dataKey === 'hoursSaved' ? 'Hours Saved' : entry.dataKey;
          const val =
            entry.dataKey === 'hoursSaved'
              ? `${Number(entry.value).toFixed(1)} hrs`
              : Number(entry.value).toLocaleString();
          return (
            <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{name}</span>
              <span className="ml-auto font-semibold tabular-nums">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

    for (const item of locData) {
      const existing = dateMap.get(item.date) || {
        date: item.date, linesAdded: 0, linesDeleted: 0, filesChanged: 0, minutesSaved: 0, taskCount: 0,
      };
      existing.linesAdded = item.linesAdded;
      existing.linesDeleted = item.linesDeleted;
      existing.filesChanged = item.filesChanged;
      dateMap.set(item.date, existing);
    }

    for (const item of timeSavedData) {
      const existing = dateMap.get(item.date) || {
        date: item.date, linesAdded: 0, linesDeleted: 0, filesChanged: 0, minutesSaved: 0, taskCount: 0,
      };
      existing.minutesSaved = item.minutesSaved;
      existing.taskCount = item.taskCount;
      dateMap.set(item.date, existing);
    }

    return Array.from(dateMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
        ...item,
        date: item.date.slice(5),
        hoursSaved: Math.round((item.minutesSaved / 60) * 10) / 10,
      }));
  }, [locData, timeSavedData]);

  const hasData = combinedData.length > 0;

  const views: { value: ViewMode; label: string }[] = [
    { value: 'combined', label: 'All' },
    { value: 'loc', label: 'Lines of Code' },
    { value: 'timeSaved', label: 'Time Saved' },
  ];

  const showLOC = viewMode === 'combined' || viewMode === 'loc';
  const showTime = viewMode === 'combined' || viewMode === 'timeSaved';

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex gap-0.5 p-0.5 bg-muted/60 rounded-lg">
          {views.map(v => (
            <button
              key={v.value}
              onClick={() => setViewMode(v.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                viewMode === v.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2">
        {!hasData ? (
          <div className="flex h-[300px] items-center justify-center">
            <div className="text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">No data available yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Data will appear as tasks are completed</p>
            </div>
          </div>
        ) : viewMode === 'timeSaved' ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={combinedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="timeSavedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" width={45} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="hoursSaved"
                stroke="#06b6d4"
                fill="url(#timeSavedGrad)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={combinedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="addedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="deletedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="timeSavedGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" width={45} />
              <Tooltip content={<CustomTooltip />} />
              {showLOC && (
                <>
                  <Area
                    type="monotone"
                    dataKey="linesAdded"
                    stroke="#10b981"
                    fill="url(#addedGrad)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={1000}
                  />
                  <Area
                    type="monotone"
                    dataKey="linesDeleted"
                    stroke="#ef4444"
                    fill="url(#deletedGrad)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={1200}
                  />
                </>
              )}
              {showTime && (
                <Area
                  type="monotone"
                  dataKey="hoursSaved"
                  stroke="#06b6d4"
                  fill="url(#timeSavedGrad2)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1400}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Legend */}
        {hasData && (
          <div className="flex items-center justify-center gap-5 mt-2 pt-2">
            {showLOC && (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-5 rounded-full bg-emerald-500" />
                  <span className="text-[11px] text-muted-foreground">Lines Added</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-5 rounded-full bg-red-500" />
                  <span className="text-[11px] text-muted-foreground">Lines Deleted</span>
                </div>
              </>
            )}
            {showTime && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-5 rounded-full bg-cyan-500" />
                <span className="text-[11px] text-muted-foreground">Hours Saved</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
