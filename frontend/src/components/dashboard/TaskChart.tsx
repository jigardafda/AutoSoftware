import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface TaskChartProps {
  tasks: any[];
}

export function TaskChart({ tasks }: TaskChartProps) {
  const data = useMemo(() => {
    const now = new Date();
    const days: { date: string; count: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: 0 });
    }

    const dateMap = new Map(days.map((d) => [d.date, d]));

    for (const task of tasks) {
      if (task.status === "completed" && task.completedAt) {
        const key = new Date(task.completedAt).toISOString().slice(0, 10);
        const entry = dateMap.get(key);
        if (entry) entry.count++;
      }
    }

    return days.map((d) => ({
      date: d.date.slice(5), // "MM-DD"
      count: d.count,
    }));
  }, [tasks]);

  const hasData = tasks.length > 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">Task Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-1">
        {!hasData ? (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No task data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="taskFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.18 265)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.65 0.18 265)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 286)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "oklch(0.556 0.016 286)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(0.556 0.016 286)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.17 0.005 286)",
                  border: "1px solid oklch(0.275 0.015 286)",
                  borderRadius: "8px",
                  fontSize: 12,
                  color: "oklch(0.985 0 0)",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="oklch(0.65 0.18 265)"
                fill="url(#taskFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
