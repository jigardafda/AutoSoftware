import { useMemo } from "react";
import { Sparkles, ScanSearch, AlertTriangle, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface Insight {
  id: string;
  icon: LucideIcon;
  text: string;
}

interface AiInsightsProps {
  tasks: any[];
  repos: any[];
}

export function AiInsights({ tasks, repos }: AiInsightsProps) {
  const insights = useMemo(() => {
    const items: Insight[] = [];
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    // Repos not scanned in 7+ days
    for (const repo of repos) {
      if (repo.lastScannedAt) {
        const diff = now - new Date(repo.lastScannedAt).getTime();
        if (diff > sevenDays) {
          const days = Math.floor(diff / (24 * 60 * 60 * 1000));
          items.push({
            id: `scan-${repo.id}`,
            icon: ScanSearch,
            text: `Consider scanning ${repo.name} \u2014 last scanned ${days} days ago`,
          });
        }
      } else if (repo.status !== "scanning") {
        items.push({
          id: `never-scanned-${repo.id}`,
          icon: ScanSearch,
          text: `${repo.name} has never been scanned`,
        });
      }
    }

    // Failed tasks
    const failedCount = tasks.filter((t: any) => t.status === "failed").length;
    if (failedCount > 0) {
      items.push({
        id: "failed-tasks",
        icon: AlertTriangle,
        text: `${failedCount} failed task${failedCount > 1 ? "s" : ""} need${failedCount === 1 ? "s" : ""} attention`,
      });
    }

    // Pending tasks older than 3 days
    const stalePending = tasks.filter((t: any) => {
      if (t.status !== "pending" || !t.createdAt) return false;
      return now - new Date(t.createdAt).getTime() > threeDays;
    }).length;
    if (stalePending > 0) {
      items.push({
        id: "stale-pending",
        icon: Clock,
        text: `${stalePending} task${stalePending > 1 ? "s have" : " has"} been pending for 3+ days`,
      });
    }

    return items;
  }, [tasks, repos]);

  return (
    <Card className="border-ai/20 bg-ai/5">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles size={14} className="text-ai" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {insights.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-ai/10 px-3 py-2">
            <Sparkles size={14} className="text-ai shrink-0" />
            <p className="text-sm text-muted-foreground">
              Everything looks good!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map((insight) => {
              const Icon = insight.icon;
              return (
                <div
                  key={insight.id}
                  className="flex items-start gap-2 rounded-md bg-ai/10 px-3 py-2"
                >
                  <Icon size={14} className="mt-0.5 shrink-0 text-ai" />
                  <p className="text-sm">{insight.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
