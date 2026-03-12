import { Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Scan,
  AlertTriangle,
  AtSign,
  Bell,
  Info,
  ShieldAlert,
  GitPullRequest,
  Trash2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Notification, NotificationType } from "@/hooks/useNotifications";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

// Get icon and color for notification type
function getNotificationMeta(type: NotificationType): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
} {
  switch (type) {
    case "task_complete":
      return {
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
      };
    case "task_failed":
      return {
        icon: <XCircle className="h-4 w-4" />,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
      };
    case "scan_done":
      return {
        icon: <Scan className="h-4 w-4" />,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
      };
    case "scan_failed":
      return {
        icon: <Scan className="h-4 w-4" />,
        color: "text-red-500",
        bgColor: "bg-red-500/10",
      };
    case "mention":
      return {
        icon: <AtSign className="h-4 w-4" />,
        color: "text-purple-500",
        bgColor: "bg-purple-500/10",
      };
    case "alert":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
      };
    case "system":
      return {
        icon: <Info className="h-4 w-4" />,
        color: "text-muted-foreground",
        bgColor: "bg-muted",
      };
    case "dependency_alert":
      return {
        icon: <ShieldAlert className="h-4 w-4" />,
        color: "text-orange-500",
        bgColor: "bg-orange-500/10",
      };
    case "pr_status":
      return {
        icon: <GitPullRequest className="h-4 w-4" />,
        color: "text-cyan-500",
        bgColor: "bg-cyan-500/10",
      };
    default:
      return {
        icon: <Bell className="h-4 w-4" />,
        color: "text-muted-foreground",
        bgColor: "bg-muted",
      };
  }
}

// Get link for notification
function getNotificationLink(notification: Notification): string | null {
  const { data } = notification;
  if (!data) return null;

  if (data.taskId) return `/tasks/${data.taskId}`;
  if (data.scanId) return `/scans/${data.scanId}`;
  if (data.projectId) return `/projects/${data.projectId}`;
  if (data.repoId) return `/repos/${data.repoId}`;

  return null;
}

// Relative time formatting
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  compact = false,
}: NotificationItemProps) {
  const { icon, color, bgColor } = getNotificationMeta(notification.type);
  const link = getNotificationLink(notification);

  const handleClick = () => {
    if (!notification.read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
  };

  const content = (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer",
        !notification.read && "bg-primary/5",
        "hover:bg-accent/50"
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className={cn("rounded-full p-2 shrink-0", bgColor, color)}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-medium truncate",
                !notification.read && "text-foreground",
                notification.read && "text-muted-foreground"
              )}
            >
              {notification.title}
            </p>
            {!compact && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {notification.message}
              </p>
            )}
          </div>

          {/* Unread indicator */}
          {!notification.read && (
            <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>

        {/* Time and actions */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>

          {!compact && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.read && onMarkAsRead && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onMarkAsRead(notification.id);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mark as read</TooltipContent>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDelete(notification.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="block group">
        {content}
      </Link>
    );
  }

  return <div className="group">{content}</div>;
}
