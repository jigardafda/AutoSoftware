import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, ScanSearch, AlertTriangle, Clock, X, Lightbulb, ShieldAlert, TrendingUp, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { LucideIcon } from "lucide-react";

interface Insight {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  text: string;
  dismissable?: boolean;
  link?: string;
}

interface AiInsightsProps {
  tasks: any[];
  repos: any[];
}

const TYPE_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  scan: { icon: ScanSearch, color: '#06b6d4' },
  warning: { icon: AlertTriangle, color: '#f59e0b' },
  suggestion: { icon: Lightbulb, color: '#10b981' },
  security: { icon: ShieldAlert, color: '#ef4444' },
  performance: { icon: TrendingUp, color: '#8b5cf6' },
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insights"] }),
  });

  const computedInsights = useMemo(() => {
    const items: Insight[] = [];
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    for (const repo of repos) {
      if (repo.lastScannedAt) {
        const diff = now - new Date(repo.lastScannedAt).getTime();
        if (diff > sevenDays) {
          const days = Math.floor(diff / (24 * 60 * 60 * 1000));
          items.push({ id: `scan-${repo.id}`, icon: ScanSearch, iconColor: '#06b6d4', text: `${repo.fullName} — last scanned ${days}d ago`, link: `/repos/${repo.id}` });
        }
      } else if (repo.status !== "scanning") {
        items.push({ id: `never-scanned-${repo.id}`, icon: ScanSearch, iconColor: '#06b6d4', text: `${repo.fullName} has never been scanned`, link: `/repos/${repo.id}` });
      }
    }

    const failedCount = tasks.filter((t: any) => t.status === "failed").length;
    if (failedCount > 0) {
      items.push({ id: "failed-tasks", icon: AlertTriangle, iconColor: '#ef4444', text: `${failedCount} failed task${failedCount > 1 ? "s" : ""} need attention`, link: `/tasks?status=failed` });
    }

    const stalePending = tasks.filter((t: any) => {
      if (t.status !== "pending" || !t.createdAt) return false;
      return now - new Date(t.createdAt).getTime() > threeDays;
    }).length;
    if (stalePending > 0) {
      items.push({ id: "stale-pending", icon: Clock, iconColor: '#f59e0b', text: `${stalePending} task${stalePending > 1 ? "s" : ""} pending for 3+ days`, link: `/tasks?status=pending` });
    }

    return items;
  }, [tasks, repos]);

  const hasApiInsights = apiInsights.length > 0;
  const displayInsights: Insight[] = hasApiInsights
    ? apiInsights.map((insight: any) => {
        const mapped = TYPE_ICON_MAP[insight.type] || { icon: Sparkles, color: '#8b5cf6' };
        return { id: insight.id, icon: mapped.icon, iconColor: mapped.color, text: insight.title || insight.description, dismissable: true };
      })
    : computedInsights;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <div className="h-6 w-6 rounded-lg bg-violet-500/15 flex items-center justify-center">
          <Sparkles size={12} className="text-violet-500" />
        </div>
        <h3 className="text-sm font-semibold">AI Insights</h3>
        <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
          {displayInsights.length}
        </span>
      </div>
      <div className="px-3 pb-3 flex-1 overflow-y-auto">
        {displayInsights.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-4 py-3 mt-1">
            <Sparkles size={14} className="text-emerald-500 shrink-0" />
            <p className="text-sm text-muted-foreground">Everything looks good!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {displayInsights.map((insight) => {
              const Icon = insight.icon;
              const content = (
                <>
                  <div
                    className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `color-mix(in oklch, ${insight.iconColor} 15%, transparent)` }}
                  >
                    <Icon size={12} style={{ color: insight.iconColor }} />
                  </div>
                  <p className="flex-1 text-sm leading-snug">{insight.text}</p>
                  {insight.dismissable ? (
                    <button
                      className="shrink-0 opacity-0 group-hover/item:opacity-100 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissMutation.mutate(insight.id); }}
                      disabled={dismissMutation.isPending}
                    >
                      <X size={12} />
                    </button>
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground/40 mt-0.5 group-hover/item:text-foreground/60 transition-colors" />
                  )}
                </>
              );

              if (insight.link) {
                return (
                  <Link
                    key={insight.id}
                    to={insight.link}
                    className="group/item flex items-start gap-2.5 rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div
                  key={insight.id}
                  className="group/item flex items-start gap-2.5 rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-default"
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
