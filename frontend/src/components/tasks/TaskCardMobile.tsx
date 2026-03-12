import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  ExternalLink,
  MessageSquare,
  GitBranch,
  Gauge,
  MoreVertical,
  Play,
  Trash2,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Swipe action thresholds
const SWIPE_THRESHOLD = 80;
const SWIPE_ACTION_THRESHOLD = 120;

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: string;
  priority: string;
  source: string;
  repositoryName?: string;
  repository?: { fullName?: string };
  targetBranch?: string;
  pullRequestUrl?: string;
  confidenceScore?: number | null;
  createdAt: string;
  steps?: Array<{ status: string }>;
}

interface TaskCardMobileProps {
  task: Task;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
  onExecute?: (id: string) => void;
  onClick?: (task: Task) => void;
  showCheckbox?: boolean;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; className: string; label: string }> = {
  pending: { icon: Clock, className: 'text-muted-foreground bg-muted', label: 'Pending' },
  in_progress: { icon: Loader2, className: 'text-blue-500 bg-blue-500/10 animate-spin', label: 'Running' },
  completed: { icon: CheckCircle2, className: 'text-green-500 bg-green-500/10', label: 'Completed' },
  failed: { icon: XCircle, className: 'text-red-500 bg-red-500/10', label: 'Failed' },
  cancelled: { icon: Ban, className: 'text-muted-foreground bg-muted', label: 'Cancelled' },
  planning: { icon: Loader2, className: 'text-amber-500 bg-amber-500/10 animate-spin', label: 'Planning' },
  awaiting_input: { icon: MessageSquare, className: 'text-amber-600 bg-amber-600/10', label: 'Awaiting' },
  planned: { icon: CheckCircle2, className: 'text-cyan-500 bg-cyan-500/10', label: 'Planned' },
};

const TYPE_COLOR: Record<string, string> = {
  improvement: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  bugfix: 'bg-red-500/10 text-red-500 border-red-500/20',
  feature: 'bg-green-500/10 text-green-500 border-green-500/20',
  refactor: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  security: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-yellow-500/10 text-yellow-500',
  high: 'bg-orange-500/10 text-orange-500',
  critical: 'bg-red-500/10 text-red-500',
};

function relativeTime(date: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function TaskProgressBar({ task }: { task: Task }) {
  const steps = task.steps || [];
  if (steps.length === 0) {
    if (task.status === 'completed') return <span className="text-xs text-green-500">100%</span>;
    if (task.status === 'failed' || task.status === 'cancelled') return null;
    if (task.status === 'pending') return <span className="text-xs text-muted-foreground">0%</span>;
    if (task.status === 'in_progress' || task.status === 'planning') {
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse rounded-full w-1/2" />
          </div>
        </div>
      );
    }
    return null;
  }

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const progress = Math.round((completedSteps / steps.length) * 100);

  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            progress === 100 ? 'bg-green-500' : 'bg-blue-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{progress}%</span>
    </div>
  );
}

function ConfidenceScore({ score }: { score?: number | null }) {
  if (score === undefined || score === null) return null;

  const normalizedScore = Math.min(10, Math.max(0, score));
  let color = 'text-red-500';
  if (normalizedScore >= 8) color = 'text-green-500';
  else if (normalizedScore >= 6) color = 'text-yellow-500';
  else if (normalizedScore >= 4) color = 'text-orange-500';

  return (
    <div className={cn('flex items-center gap-1 text-xs', color)}>
      <Gauge className="h-3 w-3" />
      <span>{normalizedScore.toFixed(1)}</span>
    </div>
  );
}

export function TaskCardMobile({
  task,
  selected = false,
  onSelect,
  onComplete,
  onDelete,
  onRetry,
  onExecute,
  onClick,
  showCheckbox = false,
}: TaskCardMobileProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef(false);

  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  // Reset swipe on status change
  useEffect(() => {
    setSwipeOffset(0);
  }, [task.status]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = false;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Determine if this is a horizontal swipe
    if (!isHorizontalSwipe.current && Math.abs(deltaX) > 10) {
      isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
    }

    if (!isHorizontalSwipe.current) return;

    e.preventDefault();

    // Limit swipe range
    const maxSwipe = SWIPE_ACTION_THRESHOLD + 20;
    const newOffset = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));
    setSwipeOffset(newOffset);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);

    // Trigger action if swiped far enough
    if (Math.abs(swipeOffset) > SWIPE_ACTION_THRESHOLD) {
      if (swipeOffset > 0) {
        // Swipe right - complete
        if (task.status === 'planned' && onExecute) {
          onExecute(task.id);
        } else if ((task.status === 'failed' || task.status === 'cancelled') && onRetry) {
          onRetry(task.id);
        }
      } else {
        // Swipe left - delete
        onDelete?.(task.id);
      }
    }

    // Reset position with animation
    setSwipeOffset(0);
  }, [swipeOffset, task.id, task.status, onComplete, onDelete, onRetry, onExecute]);

  const handleCardClick = useCallback(() => {
    if (Math.abs(swipeOffset) < 10) {
      onClick?.(task) ?? navigate(`/tasks/${task.id}`);
    }
  }, [swipeOffset, task, onClick, navigate]);

  // Determine swipe action labels
  const leftAction = task.status === 'planned' ? 'Execute' :
                     ['failed', 'cancelled'].includes(task.status) ? 'Retry' : null;
  const rightAction = 'Delete';

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Swipe action backgrounds */}
      <div className="absolute inset-0 flex">
        {/* Left action (swipe right) */}
        <div
          className={cn(
            'flex items-center justify-start pl-4 flex-1',
            'bg-green-500 text-white transition-opacity',
            swipeOffset > SWIPE_THRESHOLD ? 'opacity-100' : 'opacity-50'
          )}
        >
          {leftAction && (
            <>
              {task.status === 'planned' ? (
                <Play className="h-5 w-5 mr-2" />
              ) : (
                <RotateCcw className="h-5 w-5 mr-2" />
              )}
              <span className="font-medium">{leftAction}</span>
            </>
          )}
        </div>

        {/* Right action (swipe left) */}
        <div
          className={cn(
            'flex items-center justify-end pr-4 flex-1',
            'bg-red-500 text-white transition-opacity',
            swipeOffset < -SWIPE_THRESHOLD ? 'opacity-100' : 'opacity-50'
          )}
        >
          <span className="font-medium mr-2">{rightAction}</span>
          <Trash2 className="h-5 w-5" />
        </div>
      </div>

      {/* Card content */}
      <Card
        ref={cardRef}
        className={cn(
          'relative transition-transform duration-200 ease-out',
          'touch-pan-y cursor-pointer',
          'active:bg-accent/50',
          selected && 'ring-2 ring-primary',
          isDragging && 'transition-none'
        )}
        style={{
          transform: `translateX(${swipeOffset}px)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
      >
        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            {showCheckbox && (
              <div
                className="pt-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(task.id);
                }}
              >
                <Checkbox
                  checked={selected}
                  className="h-5 w-5"
                />
              </div>
            )}

            {/* Status icon */}
            <div className={cn(
              'shrink-0 h-8 w-8 rounded-full flex items-center justify-center',
              statusConfig.className.split(' ').slice(1).join(' ')
            )}>
              <StatusIcon className={cn('h-4 w-4', statusConfig.className.split(' ')[0])} />
            </div>

            {/* Title and repo */}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm leading-tight line-clamp-2">
                {task.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {task.repositoryName || task.repository?.fullName || 'No repository'}
              </p>
            </div>

            {/* Actions menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {task.status === 'planned' && (
                  <DropdownMenuItem onClick={() => onExecute?.(task.id)}>
                    <Play className="h-4 w-4 mr-2" />
                    Execute
                  </DropdownMenuItem>
                )}
                {['failed', 'cancelled'].includes(task.status) && (
                  <DropdownMenuItem onClick={() => onRetry?.(task.id)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry
                  </DropdownMenuItem>
                )}
                {task.pullRequestUrl && (
                  <DropdownMenuItem asChild>
                    <a
                      href={task.pullRequestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View PR
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete?.(task.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {/* Status badge */}
            <Badge variant="secondary" className="text-[10px] h-5">
              {statusConfig.label}
            </Badge>

            {/* Type badge */}
            <Badge
              variant="outline"
              className={cn('text-[10px] h-5', TYPE_COLOR[task.type])}
            >
              {task.type}
            </Badge>

            {/* Priority badge */}
            <Badge
              variant="outline"
              className={cn('text-[10px] h-5', PRIORITY_COLOR[task.priority])}
            >
              {task.priority}
            </Badge>
          </div>

          {/* Footer row */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-3">
              {/* Branch */}
              {task.targetBranch && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate max-w-[80px]">{task.targetBranch}</span>
                </span>
              )}

              {/* Progress */}
              <TaskProgressBar task={task} />
            </div>

            <div className="flex items-center gap-3">
              {/* Confidence */}
              <ConfidenceScore score={task.confidenceScore} />

              {/* Time */}
              <span className="text-xs text-muted-foreground">
                {relativeTime(task.createdAt)}
              </span>

              {/* Navigate arrow */}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Mobile task list component
 */
interface TaskListMobileProps {
  tasks: Task[];
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
  onExecute?: (id: string) => void;
  onClick?: (task: Task) => void;
  showCheckbox?: boolean;
  emptyMessage?: string;
}

export function TaskListMobile({
  tasks,
  selectedIds = new Set(),
  onSelect,
  onDelete,
  onRetry,
  onExecute,
  onClick,
  showCheckbox = false,
  emptyMessage = 'No tasks found',
}: TaskListMobileProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCardMobile
          key={task.id}
          task={task}
          selected={selectedIds.has(task.id)}
          onSelect={onSelect}
          onDelete={onDelete}
          onRetry={onRetry}
          onExecute={onExecute}
          onClick={onClick}
          showCheckbox={showCheckbox}
        />
      ))}
    </div>
  );
}

export default TaskCardMobile;
