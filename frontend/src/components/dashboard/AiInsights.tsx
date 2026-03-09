import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, ScanSearch, AlertTriangle, Clock, X, Lightbulb, ShieldAlert, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { LucideIcon } from "lucide-react";

interface Insight {
  id: string;
  icon: LucideIcon;
  text: string;
  dismissable?: boolean;
}

interface AiInsightsProps {
  tasks: any[];
  repos: any[];
}

const TYPE_ICON_MAP: Record<string, LucideIcon> = {
  scan: ScanSearch,
  warning: AlertTriangle,
  suggestion: Lightbulb,
  security: ShieldAlert,
  performance: TrendingUp,
};

export function AiInsights({ tasks, repos }: AiInsightsProps) {
  const queryClient = useQueryClient();

  const { data: apiInsights = [] } = useQuery({
    queryKey: ["insights"],
    queryFn: api.ai.insights,
    refetchInterval: 60000,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.ai.dismissInsight(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  // Computed (local) insights as fallback
  const computedInsights = useMemo(() => {
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
            text: `Consider scanning ${repo.name} -- last scanned ${days} days ago`,
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

  // Use API insights if available, otherwise fall back to computed
  const hasApiInsights = apiInsights.length > 0;

  const displayInsights: Insight[] = hasApiInsights
    ? apiInsights.map((insight: any) => ({
        id: insight.id,
        icon: TYPE_ICON_MAP[insight.type] || Sparkles,
        text: insight.title || insight.description,
        dismissable: true,
      }))
    : computedInsights;

  return (
    <Card className="border-ai/20 bg-ai/5">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles size={14} className="text-ai" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {displayInsights.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md bg-ai/10 px-3 py-2">
            <Sparkles size={14} className="text-ai shrink-0" />
            <p className="text-sm text-muted-foreground">
              Everything looks good!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayInsights.map((insight) => {
              const Icon = insight.icon;
              return (
                <div
                  key={insight.id}
                  className="flex items-start gap-2 rounded-md bg-ai/10 px-3 py-2"
                >
                  <Icon size={14} className="mt-0.5 shrink-0 text-ai" />
                  <p className="flex-1 text-sm">{insight.text}</p>
                  {insight.dismissable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => dismissMutation.mutate(insight.id)}
                      disabled={dismissMutation.isPending}
                    >
                      <X size={12} />
                      <span className="sr-only">Dismiss</span>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
