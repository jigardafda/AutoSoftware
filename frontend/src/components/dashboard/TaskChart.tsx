import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskChartProps {
  tasks: any[];
}

type ViewMode = 'completed' | 'created' | 'all';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-lg px-4 py-3 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground capitalize">{entry.dataKey}</span>
            <span className="ml-auto font-semibold tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskChart({ tasks }: TaskChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const data = useMemo(() => {
    const now = new Date();
    const days: { date: string; created: number; completed: number; failed: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, created: 0, completed: 0, failed: 0 });
    }

    const dateMap = new Map(days.map((d) => [d.date, d]));

    for (const task of tasks) {
      if (task.createdAt) {
        const key = new Date(task.createdAt).toISOString().slice(0, 10);
        const entry = dateMap.get(key);
        if (entry) entry.created++;
      }
      if (task.status === "completed" && task.updatedAt) {
        const key = new Date(task.updatedAt).toISOString().slice(0, 10);
        const entry = dateMap.get(key);
        if (entry) entry.completed++;
      }
      if (task.status === "failed" && task.updatedAt) {
        const key = new Date(task.updatedAt).toISOString().slice(0, 10);
        const entry = dateMap.get(key);
        if (entry) entry.failed++;
      }
    }

    return days.map((d) => ({ ...d, date: d.date.slice(5) }));
  }, [tasks]);

  const hasData = data.some(d => d.created > 0 || d.completed > 0);
  const views: { value: ViewMode; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'created', label: 'Created' },
    { value: 'completed', label: 'Done' },
  ];

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h3 className="text-sm font-semibold">Task Activity</h3>
        <div className="flex gap-0.5 p-0.5 bg-muted/60 rounded-lg">
          {views.map(v => (
            <button
              key={v.value}
              onClick={() => setViewMode(v.value)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200",
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
      <div className="px-3 pb-3 pt-1 flex-1">
        {!hasData ? (
          <div className="flex h-full min-h-[240px] items-center justify-center">
            <div className="text-center">
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">No task data yet</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="fill-muted-foreground" allowDecimals={false} width={35} />
              <Tooltip content={<CustomTooltip />} />
              {(viewMode === 'all' || viewMode === 'created') && (
                <Area type="monotone" dataKey="created" stroke="#3b82f6" fill="url(#createdGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} animationDuration={800} />
              )}
              {(viewMode === 'all' || viewMode === 'completed') && (
                <Area type="monotone" dataKey="completed" stroke="#10b981" fill="url(#completedGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} animationDuration={1000} />
              )}
              {viewMode === 'all' && (
                <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="url(#failedGrad)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }} animationDuration={1200} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
        {hasData && (
          <div className="flex items-center justify-center gap-5 mt-1">
            {(viewMode === 'all' || viewMode === 'created') && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-full bg-blue-500" />
                <span className="text-[11px] text-muted-foreground">Created</span>
              </div>
            )}
            {(viewMode === 'all' || viewMode === 'completed') && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted-foreground">Completed</span>
              </div>
            )}
            {viewMode === 'all' && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-full bg-red-500" />
                <span className="text-[11px] text-muted-foreground">Failed</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
