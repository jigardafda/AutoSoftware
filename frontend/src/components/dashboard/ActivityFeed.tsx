import { useMemo } from "react";
import { PlusCircle, CheckCircle, XCircle, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

interface ActivityEvent {
  id: string;
  icon: LucideIcon;
  iconClass: string;
  title: string;
  detail: string;
  time: string;
  sortDate: string;
}

interface ActivityFeedProps {
  tasks: any[];
  repos: any[];
}

export function ActivityFeed({ tasks, repos }: ActivityFeedProps) {
  const events = useMemo(() => {
    const items: ActivityEvent[] = [];

    for (const task of tasks) {
      // Task created
      if (task.createdAt) {
        items.push({
          id: `created-${task.id}`,
          icon: PlusCircle,
          iconClass: "text-blue-500",
          title: `Task created: ${task.title}`,
          detail: task.repositoryName || "",
          time: relativeTime(task.createdAt),
          sortDate: task.createdAt,
        });
      }

      // Task completed
      if (task.status === "completed" && task.completedAt) {
        items.push({
          id: `completed-${task.id}`,
          icon: CheckCircle,
          iconClass: "text-green-500",
          title: `Task completed: ${task.title}`,
          detail: task.repositoryName || "",
          time: relativeTime(task.completedAt),
          sortDate: task.completedAt,
        });
      }

      // Task failed
      if (task.status === "failed" && task.updatedAt) {
        items.push({
          id: `failed-${task.id}`,
          icon: XCircle,
          iconClass: "text-red-500",
          title: `Task failed: ${task.title}`,
          detail: task.repositoryName || "",
          time: relativeTime(task.updatedAt),
          sortDate: task.updatedAt,
        });
      }
    }

    // Scan completed events from repos
    for (const repo of repos) {
      if (repo.lastScannedAt) {
        items.push({
          id: `scan-${repo.id}`,
          icon: Search,
          iconClass: "text-muted-foreground",
          title: `Scan completed on ${repo.fullName}`,
          detail: repo.provider || "",
          time: relativeTime(repo.lastScannedAt),
          sortDate: repo.lastScannedAt,
        });
      }
    }

    // Sort newest first
    items.sort(
      (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    );

    return items.slice(0, 50);
  }, [tasks, repos]);

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {events.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No activity yet. Connect a repository to get started.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-1">
              {events.map((event) => {
                const Icon = event.icon;
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <Icon size={16} className={`mt-0.5 shrink-0 ${event.iconClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{event.title}</p>
                      {event.detail && (
                        <p className="text-xs text-muted-foreground">{event.detail}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                      {event.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
