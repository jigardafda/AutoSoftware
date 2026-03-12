import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { ArrowRight, Lightbulb } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface WorkloadData {
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  total: number;
  avgCompletionTime: number | null;
}

interface WorkloadChartProps {
  data?: WorkloadData[];
  showSuggestions?: boolean;
}

function getInitials(name: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return "?";
}

// Custom tooltip for the chart
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((entry: any, index: number) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <span className="font-medium">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkloadChart({
  data,
  showSuggestions = true,
}: WorkloadChartProps) {
  const { data: workloadData, isLoading } = useQuery({
    queryKey: ["team-workload"],
    queryFn: api.team.getWorkload,
    enabled: !data,
  });

  const { data: suggestions } = useQuery({
    queryKey: ["team-collaboration"],
    queryFn: api.team.getCollaborationSuggestions,
    enabled: showSuggestions && !data,
  });

  const displayData = data || workloadData?.data || [];

  // Transform data for the chart
  const chartData = useMemo(() => {
    return displayData.map((d) => ({
      name: d.userName || "Unknown",
      pending: d.pending,
      inProgress: d.inProgress,
      completed: d.completed,
      failed: d.failed,
      total: d.total,
    }));
  }, [displayData]);

  // Calculate team averages
  const avgInProgress = useMemo(() => {
    if (displayData.length === 0) return 0;
    return (
      displayData.reduce((sum, d) => sum + d.inProgress, 0) / displayData.length
    );
  }, [displayData]);

  // Find rebalance suggestions
  const rebalanceSuggestions = useMemo(() => {
    const overloaded = displayData.filter(
      (d) => d.inProgress > avgInProgress * 1.5 && d.inProgress >= 3
    );
    const underloaded = displayData.filter(
      (d) => d.inProgress < avgInProgress * 0.5
    );

    const suggestions: Array<{
      from: WorkloadData;
      to: WorkloadData;
      reason: string;
    }> = [];

    for (const over of overloaded) {
      for (const under of underloaded) {
        if (over.userId !== under.userId) {
          suggestions.push({
            from: over,
            to: under,
            reason: `${over.userName || "User"} has ${over.inProgress} tasks, consider moving some to ${under.userName || "User"}`,
          });
        }
      }
    }

    return suggestions.slice(0, 2);
  }, [displayData, avgInProgress]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Workload Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Workload Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {displayData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No workload data available</p>
          </div>
        ) : (
          <>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    iconType="square"
                    iconSize={10}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending"
                    stackId="a"
                    fill="#94a3b8"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="inProgress"
                    name="In Progress"
                    stackId="a"
                    fill="#3b82f6"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    stackId="a"
                    fill="#22c55e"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    name="Failed"
                    stackId="a"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Team stats */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {displayData.reduce((sum, d) => sum + d.inProgress, 0)}
                </p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {displayData.reduce((sum, d) => sum + d.completed, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {Math.round(avgInProgress * 10) / 10}
                </p>
                <p className="text-xs text-muted-foreground">Avg Tasks/Person</p>
              </div>
            </div>

            {/* Rebalance suggestions */}
            {showSuggestions && rebalanceSuggestions.length > 0 && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  <span>Rebalance Suggestions</span>
                </div>
                {rebalanceSuggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <Avatar className="h-8 w-8">
                      {suggestion.from.userAvatar && (
                        <AvatarImage src={suggestion.from.userAvatar} />
                      )}
                      <AvatarFallback className="text-xs">
                        {getInitials(suggestion.from.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {suggestion.from.inProgress} tasks
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <Avatar className="h-8 w-8">
                      {suggestion.to.userAvatar && (
                        <AvatarImage src={suggestion.to.userAvatar} />
                      )}
                      <AvatarFallback className="text-xs">
                        {getInitials(suggestion.to.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <Badge variant="secondary" className="text-xs">
                      {suggestion.to.inProgress} tasks
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
