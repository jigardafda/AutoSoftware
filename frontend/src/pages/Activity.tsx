import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  PlusCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Activity as ActivityIcon,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type FilterType = "all" | "created" | "completed" | "failed" | "in_progress";

interface ActivityEvent {
  id: string;
  taskId: string;
  title: string;
  description: string;
  status: string;
  timestamp: string;
  type: FilterType;
}

function timeAgo(date: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getEventIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "in_progress":
      return <Loader2 className="h-5 w-5 text-blue-500" />;
    default:
      return <PlusCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

function getEventTitle(status: string, taskTitle: string) {
  switch (status) {
    case "completed":
      return `Completed: ${taskTitle}`;
    case "failed":
      return `Failed: ${taskTitle}`;
    case "in_progress":
      return `Started: ${taskTitle}`;
    default:
      return `New task: ${taskTitle}`;
  }
}

function getEventType(status: string): FilterType {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "in_progress":
      return "in_progress";
    default:
      return "created";
  }
}

const filterOptions: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "in_progress", label: "In Progress" },
];

export function Activity() {
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.tasks.list(),
  });

  const events: ActivityEvent[] = useMemo(() => {
    return tasks
      .map((task: any) => ({
        id: task.id,
        taskId: task.id,
        title: task.title,
        description: task.description || "",
        status: task.status,
        timestamp: task.updatedAt,
        type: getEventType(task.status),
      }))
      .sort(
        (a: ActivityEvent, b: ActivityEvent) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
  }, [tasks]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => e.type === filter);
  }, [events, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Activity</h2>
        {!isLoading && (
          <Badge variant="secondary" className="text-xs">
            {filteredEvents.length}
          </Badge>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {filterOptions.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(option.value)}
            className="text-xs h-7"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ActivityIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-sm">
            {filter === "all"
              ? "No activity yet. Create tasks to see activity here."
              : `No ${filter.replace("_", " ")} events found.`}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-3 pr-4">
            {filteredEvents.map((event) => (
              <Link
                key={`${event.id}-${event.status}`}
                to={`/tasks/${event.taskId}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-start gap-4 p-4">
                    <div className="mt-0.5">{getEventIcon(event.status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none mb-1">
                        {getEventTitle(event.status, event.title)}
                      </p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(event.timestamp)}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
