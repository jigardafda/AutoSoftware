import { useQuery } from '@tanstack/react-query';
import {
  PlusCircle,
  CheckCircle,
  XCircle,
  Play,
  Search,
  GitPullRequest,
  FileCode,
  AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: {
    taskId?: string;
    repositoryName?: string;
    status?: string;
  };
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek}w ago`;
}

function getEventIcon(type: string, _status?: string) {
  // Normalize type to handle both underscore and dot notation
  const normalizedType = type.replace(/_/g, '.');

  switch (normalizedType) {
    case 'task.created':
      return { icon: PlusCircle, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
    case 'task.completed':
      return { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10' };
    case 'task.failed':
      return { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' };
    case 'task.started':
      return { icon: Play, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' };
    case 'scan.started':
    case 'scan.completed':
      return { icon: Search, color: 'text-purple-500', bgColor: 'bg-purple-500/10' };
    case 'pr.created':
    case 'pr.merged':
      return { icon: GitPullRequest, color: 'text-primary', bgColor: 'bg-primary/10' };
    case 'code.changed':
      return { icon: FileCode, color: 'text-muted-foreground', bgColor: 'bg-muted' };
    default:
      return { icon: AlertCircle, color: 'text-muted-foreground', bgColor: 'bg-muted' };
  }
}

export function ActivityTimeline() {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['activity', 'recent'],
    queryFn: () => api.activity.list({ limit: '20' }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4 pb-0">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="p-4 pt-4">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const events: ActivityEvent[] = (activities || []).map((a: any) => ({
    id: a.id,
    type: a.type,
    title: a.title || a.description || a.type,
    description: a.metadata?.repositoryName || a.metadata?.repoName,
    timestamp: a.createdAt,
    metadata: a.metadata,
  }));

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Recent Activity</CardTitle>
          <span className="text-xs text-muted-foreground">
            Last 20 events
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {events.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />

              <div className="space-y-1">
                {events.map((event) => {
                  const { icon: Icon, color, bgColor } = getEventIcon(event.type, event.metadata?.status);

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "relative flex items-start gap-3 p-2 rounded-lg transition-colors",
                        "hover:bg-muted/50"
                      )}
                    >
                      {/* Icon */}
                      <div className={cn(
                        "relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        bgColor
                      )}>
                        <Icon size={16} className={color} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-sm truncate">{event.title}</p>
                        {event.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {event.description}
                          </p>
                        )}
                      </div>

                      {/* Time */}
                      <span className="text-xs text-muted-foreground whitespace-nowrap pt-1">
                        {relativeTime(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
