import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, CheckCircle, XCircle, Search, Activity, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

interface ActivityEvent {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  detail: string;
  time: string;
  sortDate: string;
  link: string;
}

interface ActivityFeedProps {
  tasks: any[];
  repos: any[];
}

export function ActivityFeed({ tasks, repos }: ActivityFeedProps) {
  const events = useMemo(() => {
    const items: ActivityEvent[] = [];

    for (const task of tasks) {
      const link = `/tasks/${task.id}`;
      if (task.createdAt) {
        items.push({
          id: `created-${task.id}`,
          icon: PlusCircle,
          iconColor: '#3b82f6',
          iconBg: 'rgba(59, 130, 246, 0.1)',
          title: `Task created: ${task.title}`,
          detail: task.repositoryName || "",
          time: relativeTime(task.createdAt),
          sortDate: task.createdAt,
          link,
        });
      }
      if (task.status === "completed" && (task.completedAt || task.updatedAt)) {
        items.push({
          id: `completed-${task.id}`,
          icon: CheckCircle,
          iconColor: '#10b981',
          iconBg: 'rgba(16, 185, 129, 0.1)',
          title: `Task completed: ${task.title}`,
          detail: task.repositoryName || "",
          time: relativeTime(task.completedAt || task.updatedAt),
          sortDate: task.completedAt || task.updatedAt,
          link,
        });
      }
      if (task.status === "failed" && task.updatedAt) {
        items.push({
          id: `failed-${task.id}`,
          icon: XCircle,
          iconColor: '#ef4444',
          iconBg: 'rgba(239, 68, 68, 0.1)',
          title: `Task failed: ${task.title}`,
          detail: task.repositoryName || "",
          time: relativeTime(task.updatedAt),
          sortDate: task.updatedAt,
          link,
        });
      }
    }

    for (const repo of repos) {
      if (repo.lastScannedAt) {
        items.push({
          id: `scan-${repo.id}`,
          icon: Search,
          iconColor: '#8b5cf6',
          iconBg: 'rgba(139, 92, 246, 0.1)',
          title: `Scan completed: ${repo.fullName}`,
          detail: repo.provider || "",
          time: relativeTime(repo.lastScannedAt),
          sortDate: repo.lastScannedAt,
          link: `/repos/${repo.id}`,
        });
      }
    }

    items.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
    return items.slice(0, 8);
  }, [tasks, repos]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <div className="h-6 w-6 rounded-lg bg-blue-500/15 flex items-center justify-center">
          <Activity size={12} className="text-blue-500" />
        </div>
        <h3 className="text-sm font-semibold">Recent Activity</h3>
        <Link
          to="/activity"
          className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View all <ArrowRight size={10} />
        </Link>
      </div>
      <div className="px-3 pb-3 flex-1">
        {events.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No activity yet. Connect a repository to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {events.map((event) => {
              const Icon = event.icon;
              return (
                <Link
                  key={event.id}
                  to={event.link}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: event.iconBg }}
                  >
                    <Icon size={12} style={{ color: event.iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate leading-tight group-hover:text-foreground">{event.title}</p>
                    {event.detail && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{event.detail}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                    {event.time}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
