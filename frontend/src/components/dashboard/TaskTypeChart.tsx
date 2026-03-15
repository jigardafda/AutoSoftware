import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const TYPE_COLORS: Record<string, string> = {
  improvement: '#06b6d4',
  bugfix: '#ef4444',
  feature: '#10b981',
  refactor: '#f59e0b',
  security: '#8b5cf6',
};

const GENERIC_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'];

interface TaskTypeChartProps {
  tasks: any[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-lg px-4 py-3 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 text-sm">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
        <span className="font-medium capitalize">{d.name}</span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span>{d.value} tasks</span>
        <span className="font-semibold text-foreground">{d.pct}%</span>
      </div>
    </div>
  );
}

export function TaskTypeChart({ tasks }: TaskTypeChartProps) {
  const { chartData, total } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const t = task.type || "improvement";
      counts[t] = (counts[t] || 0) + 1;
    }
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    const chartData = Object.entries(counts).map(([name, value], i) => ({
      name,
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
      fill: TYPE_COLORS[name] || GENERIC_COLORS[i % GENERIC_COLORS.length],
    }));
    return { chartData, total };
  }, [tasks]);

  const hasData = chartData.length > 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-sm font-semibold">Tasks by Type</h3>
      </div>
      <div className="px-3 pb-3 pt-1 flex-1 flex flex-col items-center justify-center">
        {!hasData ? (
          <div className="flex h-full min-h-[240px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No task data yet</p>
          </div>
        ) : (
          <>
            <div className="relative w-full" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={4}
                    animationDuration={800}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-2xl font-bold">{total}</div>
                  <div className="text-[10px] font-medium text-muted-foreground">Tasks</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
              {chartData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-[11px] text-muted-foreground capitalize">{item.name}</span>
                  <span className="text-[11px] font-semibold">{item.pct}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
