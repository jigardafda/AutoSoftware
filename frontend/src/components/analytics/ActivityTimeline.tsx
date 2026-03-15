import { useQuery } from '@tanstack/react-query';
import {
  PlusCircle,
  CheckCircle,
  XCircle,
  Play,
  Search,
  GitPullRequest,
  FileCode,
  AlertCircle,
  Activity,
} from 'lucide-react';
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
  return `${Math.floor(diffDay / 7)}w ago`;
}

function getEventStyle(type: string) {
  const t = type.replace(/_/g, '.');
  switch (t) {
    case 'task.created': return { icon: PlusCircle, color: '#3b82f6', bg: 'bg-blue-500/10' };
    case 'task.completed': return { icon: CheckCircle, color: '#10b981', bg: 'bg-emerald-500/10' };
    case 'task.failed': return { icon: XCircle, color: '#ef4444', bg: 'bg-red-500/10' };
    case 'task.started': return { icon: Play, color: '#f59e0b', bg: 'bg-amber-500/10' };
    case 'scan.started': case 'scan.completed': return { icon: Search, color: '#8b5cf6', bg: 'bg-violet-500/10' };
    case 'pr.created': case 'pr.merged': return { icon: GitPullRequest, color: '#06b6d4', bg: 'bg-cyan-500/10' };
    case 'code.changed': return { icon: FileCode, color: '#64748b', bg: 'bg-slate-500/10' };
    default: return { icon: AlertCircle, color: '#64748b', bg: 'bg-slate-500/10' };
  }
}

export function ActivityTimeline() {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['activity', 'recent'],
    queryFn: () => api.activity.list({ limit: '20' }),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
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
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity size={15} className="text-muted-foreground" />
          Recent Activity
        </h3>
        <span className="text-[11px] text-muted-foreground/70 font-medium">Last 20 events</span>
      </div>
      <div className="px-4 pb-4">
        {events.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="relative pl-2">
              {/* Timeline rail */}
              <div className="absolute left-[17px] top-3 bottom-3 w-px bg-gradient-to-b from-border via-border/60 to-transparent" />

              <div className="space-y-0.5">
                {events.map((event) => {
                  const { icon: Icon, color, bg } = getEventStyle(event.type);
                  return (
                    <div
                      key={event.id}
                      className="relative flex items-start gap-3 p-2.5 rounded-xl transition-colors hover:bg-muted/40 group"
                    >
                      <div className={cn("relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ring-2 ring-background", bg)}>
                        <Icon size={15} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-sm truncate group-hover:text-foreground transition-colors">{event.title}</p>
                        {event.description && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{event.description}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap pt-1 font-medium tabular-nums">
                        {relativeTime(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
