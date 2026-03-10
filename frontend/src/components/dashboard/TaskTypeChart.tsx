import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const TYPE_COLORS: Record<string, string> = {
  improvement: "oklch(0.65 0.18 195)",  // Teal - primary
  bugfix: "oklch(0.60 0.22 25)",        // Red
  feature: "oklch(0.65 0.18 145)",      // Green
  refactor: "oklch(0.70 0.15 85)",      // Yellow
  security: "oklch(0.60 0.18 290)",     // Purple
};

interface TaskTypeChartProps {
  tasks: any[];
}

export function TaskTypeChart({ tasks }: TaskTypeChartProps) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const t = task.type || "improvement";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const hasData = data.length > 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">Tasks by Type</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-1">
        {!hasData ? (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No task data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={TYPE_COLORS[entry.name] || "oklch(0.5 0 0)"}
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
              />
              <Legend
                verticalAlign="bottom"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground capitalize">
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
