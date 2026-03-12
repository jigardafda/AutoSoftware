import { useActivityPulse } from '@/lib/websocket';
import type { ActiveUser } from '@/lib/websocket';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Activity, Eye, Edit, Code, Search, LayoutDashboard, FileText, GitBranch, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

// Map activity types to human-readable descriptions
function getActivityDescription(activity: string | null, meta?: Record<string, unknown>): string {
  if (!activity) return 'Online';

  switch (activity) {
    case 'viewing_task':
      return meta?.taskTitle
        ? `Viewing: ${String(meta.taskTitle).slice(0, 30)}...`
        : 'Viewing a task';
    case 'viewing_scan':
      return meta?.repoName
        ? `Viewing scan: ${meta.repoName}`
        : 'Viewing a scan';
    case 'editing_plan':
      return meta?.taskTitle
        ? `Editing plan: ${String(meta.taskTitle).slice(0, 25)}...`
        : 'Editing a plan';
    case 'viewing_repo':
      return meta?.repoName
        ? `Viewing: ${meta.repoName}`
        : 'Viewing a repository';
    case 'browsing_tasks':
      return 'Browsing tasks';
    case 'browsing_scans':
      return 'Browsing scans';
    case 'browsing_repos':
      return 'Browsing repositories';
    case 'viewing_dashboard':
      return 'On dashboard';
    case 'idle':
      return 'Online';
    default:
      return 'Active';
  }
}

// Get icon for activity type
function getActivityIcon(activity: string | null) {
  switch (activity) {
    case 'viewing_task':
      return CheckCircle2;
    case 'viewing_scan':
      return Search;
    case 'editing_plan':
      return Edit;
    case 'viewing_repo':
      return GitBranch;
    case 'browsing_tasks':
      return FileText;
    case 'browsing_scans':
      return Search;
    case 'browsing_repos':
      return Code;
    case 'viewing_dashboard':
      return LayoutDashboard;
    default:
      return Eye;
  }
}

// Get initials from name or email
function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return '?';
}

interface ActivityPulseIndicatorProps {
  user: ActiveUser;
  size?: 'sm' | 'md';
  showActivity?: boolean;
}

function ActivityPulseIndicator({ user, size = 'sm', showActivity = true }: ActivityPulseIndicatorProps) {
  const initials = getInitials(user.name, user.email);
  const isActive = user.currentActivity && user.currentActivity !== 'idle';
  const ActivityIcon = getActivityIcon(user.currentActivity);

  const sizeClasses = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
  };

  const pulseSizeClasses = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            <Avatar className={cn(sizeClasses[size], 'ring-2 ring-background')}>
              {user.avatarUrl && (
                <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />
              )}
              <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Activity pulse indicator */}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background',
                pulseSizeClasses[size],
                isActive
                  ? 'bg-green-500 animate-pulse'
                  : 'bg-gray-400'
              )}
            />
            {/* Activity icon badge */}
            {showActivity && isActive && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                <ActivityIcon className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <div className="space-y-1">
            <p className="font-medium text-sm">{user.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground">
              {getActivityDescription(user.currentActivity, user.activityMeta)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ActivityPulseProps {
  maxDisplay?: number;
  showDropdown?: boolean;
  className?: string;
}

export function ActivityPulse({ maxDisplay = 4, showDropdown = true, className }: ActivityPulseProps) {
  const { activeUsers, fetchActiveUsers } = useActivityPulse();
  const [isOpen, setIsOpen] = useState(false);

  // Fetch active users on mount
  useEffect(() => {
    fetchActiveUsers();
  }, [fetchActiveUsers]);

  // Filter out current user and sort by activity
  const sortedUsers = [...activeUsers].sort((a, b) => {
    // Active users first
    const aActive = a.currentActivity && a.currentActivity !== 'idle';
    const bActive = b.currentActivity && b.currentActivity !== 'idle';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    // Then by last activity
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  const displayUsers = sortedUsers.slice(0, maxDisplay);
  const overflowCount = Math.max(0, sortedUsers.length - maxDisplay);
  const activeCount = sortedUsers.filter(
    (u) => u.currentActivity && u.currentActivity !== 'idle'
  ).length;

  if (sortedUsers.length === 0) {
    return null;
  }

  const content = (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {displayUsers.map((user, index) => (
          <ActivityPulseIndicator key={user.id ?? `user-${index}`} user={user} showActivity={false} />
        ))}
        {overflowCount > 0 && (
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground ring-2 ring-background">
            +{overflowCount}
          </div>
        )}
      </div>
      {/* Activity count */}
      {activeCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
          <Activity className="w-3 h-3 text-green-500" />
          <span>{activeCount} active</span>
        </div>
      )}
    </div>
  );

  if (!showDropdown) {
    return content;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center hover:bg-accent/50 rounded-md px-2 py-1 transition-colors"
          aria-label="View active team members"
        >
          {content}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2 pt-1">
            <h4 className="text-sm font-semibold">Team Activity</h4>
            <span className="text-xs text-muted-foreground">
              {sortedUsers.length} online
            </span>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {sortedUsers.map((user, index) => (
              <UserActivityRow key={user.id ?? `user-${index}`} user={user} />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserActivityRow({ user }: { user: ActiveUser }) {
  const initials = getInitials(user.name, user.email);
  const isActive = user.currentActivity && user.currentActivity !== 'idle';
  const ActivityIcon = getActivityIcon(user.currentActivity);
  const timeAgo = getTimeAgo(user.lastActivityAt);

  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors">
      <div className="relative flex-shrink-0">
        <Avatar className="h-8 w-8">
          {user.avatarUrl && (
            <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />
          )}
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background',
            isActive ? 'bg-green-500' : 'bg-gray-400'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {user.name ?? user.email?.split('@')[0] ?? 'Unknown'}
        </p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <ActivityIcon className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            {getActivityDescription(user.currentActivity, user.activityMeta)}
          </span>
        </p>
      </div>
      <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
        {timeAgo}
      </span>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default ActivityPulse;
