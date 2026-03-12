import { useState, useEffect } from 'react';
import { useActivityPulse } from '@/lib/websocket';
import type { ActiveUser } from '@/lib/websocket';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  Users,
  Activity,
  Eye,
  Edit,
  Code,
  Search,
  LayoutDashboard,
  FileText,
  GitBranch,
  CheckCircle2,
  Clock,
  RefreshCw,
} from 'lucide-react';

// Map activity types to human-readable descriptions
function getActivityDescription(activity: string | null, meta?: Record<string, unknown>): string {
  if (!activity || activity === 'idle') return 'Online - idle';

  const metaTyped = meta as {
    taskTitle?: string;
    repoName?: string;
    projectName?: string;
  } | undefined;

  switch (activity) {
    case 'viewing_task':
      return metaTyped?.taskTitle
        ? `Viewing task: ${String(metaTyped.taskTitle).slice(0, 40)}${String(metaTyped.taskTitle).length > 40 ? '...' : ''}`
        : 'Viewing a task';
    case 'viewing_scan':
      return metaTyped?.repoName
        ? `Viewing scan for ${metaTyped.repoName}`
        : 'Viewing a scan';
    case 'editing_plan':
      return metaTyped?.taskTitle
        ? `Editing plan: ${String(metaTyped.taskTitle).slice(0, 35)}${String(metaTyped.taskTitle).length > 35 ? '...' : ''}`
        : 'Editing a task plan';
    case 'viewing_repo':
      return metaTyped?.repoName
        ? `Viewing repository: ${metaTyped.repoName}`
        : 'Viewing a repository';
    case 'browsing_tasks':
      return 'Browsing tasks list';
    case 'browsing_scans':
      return 'Browsing scans';
    case 'browsing_repos':
      return 'Browsing repositories';
    case 'viewing_dashboard':
      return 'On the dashboard';
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
function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
}

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} day ago`;
}

interface ActiveUsersPanelProps {
  trigger?: React.ReactNode;
  className?: string;
}

export function ActiveUsersPanel({ trigger, className }: ActiveUsersPanelProps) {
  const { activeUsers, fetchActiveUsers, pulse } = useActivityPulse();
  const [isOpen, setIsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch on mount and when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchActiveUsers();
    }
  }, [isOpen, fetchActiveUsers]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchActiveUsers();
    setIsRefreshing(false);
  };

  // Group users by activity status
  const activeNow = activeUsers.filter(
    (u) => u.currentActivity && u.currentActivity !== 'idle'
  );
  const idleUsers = activeUsers.filter(
    (u) => !u.currentActivity || u.currentActivity === 'idle'
  );

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="gap-2">
      <Users className="h-4 w-4" />
      <span>{activeUsers.length} online</span>
      {activeNow.length > 0 && (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-green-500/10 text-green-600">
          {activeNow.length} active
        </Badge>
      )}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger ?? defaultTrigger}
      </SheetTrigger>
      <SheetContent className={cn('w-80 sm:w-96 p-0', className)}>
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Team Activity
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {activeUsers.length} online
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-green-500" />
              {activeNow.length} active
            </span>
            {pulse?.timestamp && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getTimeAgo(pulse.timestamp)}
              </span>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-4 space-y-4">
            {/* Active Users Section */}
            {activeNow.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  Currently Active
                </h3>
                <div className="space-y-1">
                  {activeNow.map((user) => (
                    <UserActivityCard key={user.id} user={user} />
                  ))}
                </div>
              </div>
            )}

            {activeNow.length > 0 && idleUsers.length > 0 && (
              <Separator />
            )}

            {/* Idle/Online Users Section */}
            {idleUsers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                  Online
                </h3>
                <div className="space-y-1">
                  {idleUsers.map((user) => (
                    <UserActivityCard key={user.id} user={user} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {activeUsers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">No team members online</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Activity will appear here when others join
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function UserActivityCard({ user }: { user: ActiveUser }) {
  const initials = getInitials(user.name, user.email);
  const isActive = user.currentActivity && user.currentActivity !== 'idle';
  const ActivityIcon = getActivityIcon(user.currentActivity);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10 ring-2 ring-background">
          {user.avatarUrl && (
            <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />
          )}
          <AvatarFallback className="text-sm bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background',
            isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">
            {user.name ?? user.email.split('@')[0]}
          </p>
          <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
            {getTimeAgo(user.lastActivityAt)}
          </span>
        </div>
        {user.name && (
          <p className="text-xs text-muted-foreground/70 truncate">
            {user.email}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <ActivityIcon className={cn(
            'w-3.5 h-3.5 flex-shrink-0',
            isActive ? 'text-green-500' : 'text-muted-foreground/50'
          )} />
          <p className="text-xs text-muted-foreground truncate">
            {getActivityDescription(user.currentActivity, user.activityMeta)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ActiveUsersPanel;
