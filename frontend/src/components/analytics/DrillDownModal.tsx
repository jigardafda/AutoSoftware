import { useQuery } from '@tanstack/react-query';
import { ChevronRight, User, FolderKanban, CheckSquare, Clock, Code, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface DrillDownModalProps {
  type: string;
  id: string;
  onClose: () => void;
  onNavigate: (type: string, id: string) => void;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'user':
      return User;
    case 'project':
      return FolderKanban;
    case 'task':
      return CheckSquare;
    default:
      return FolderKanban;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'user':
      return 'User Details';
    case 'project':
      return 'Project Details';
    case 'task':
      return 'Task Details';
    default:
      return 'Details';
  }
}

export function DrillDownModal({ type, id, onClose, onNavigate }: DrillDownModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'drill-down', type, id],
    queryFn: () => api.analytics.getDrillDown(type as 'user' | 'project' | 'task', id),
    enabled: !!type && !!id,
  });

  const Icon = getTypeIcon(type);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon size={20} className="text-muted-foreground" />
            {getTypeLabel(type)}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg bg-muted/30">
                  <Skeleton className="h-6 w-16 mb-1" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ) : !data ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-semibold">{data.summary.totalTasks}</p>
                <p className="text-xs text-muted-foreground">Total Tasks</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-semibold">{data.summary.totalHoursSaved.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Hours Saved</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-semibold">{data.summary.totalLinesChanged.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Lines Changed</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-semibold">{data.summary.successRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
            </div>

            {/* Separator */}
            <div className="h-px bg-border" />

            {/* Items List */}
            <div>
              <h4 className="text-sm font-medium mb-3">
                {type === 'user' ? 'Tasks' : type === 'project' ? 'Contributors' : 'Related Items'}
              </h4>
              <ScrollArea className="h-[300px]">
                <div className="space-y-1">
                  {data.items.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg transition-colors",
                        "hover:bg-muted/50 group"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckSquare size={12} />
                            {item.taskCount} tasks
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock size={12} />
                            {item.hoursSaved.toFixed(1)} hrs
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Code size={12} />
                            {item.linesChanged.toLocaleString()} lines
                          </span>
                        </div>
                      </div>

                      {/* Navigate to task detail */}
                      {type === 'user' && (
                        <Link
                          to={`/tasks/${item.id}`}
                          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <ExternalLink size={16} />
                        </Link>
                      )}

                      {/* Drill down to user */}
                      {type === 'project' && (
                        <button
                          onClick={() => onNavigate('user', item.id)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <ChevronRight size={16} />
                        </button>
                      )}
                    </div>
                  ))}

                  {data.items.length === 0 && (
                    <div className="flex h-24 items-center justify-center">
                      <p className="text-sm text-muted-foreground">No items found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
