import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NotificationItem } from "./NotificationItem";
import { EmptyState } from "@/components/EmptyState";
import { useNotifications, useUnreadCount } from "@/hooks/useNotifications";

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const unreadCount = useUnreadCount();

  const {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    isMarkingAllRead,
    refetch,
  } = useNotifications({
    page: 1,
    limit: 10,
    unreadOnly: false,
  });

  // Refetch when popover opens
  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("relative h-9 w-9", className)}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
              >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span
                    className={cn(
                      "absolute top-1 right-1 flex items-center justify-center",
                      "min-w-[16px] h-4 px-1 text-[10px] font-medium",
                      "bg-primary text-primary-foreground rounded-full",
                      "animate-in zoom-in-50 duration-200"
                    )}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Notifications{unreadCount > 0 && ` (${unreadCount})`}</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          align="end"
          className="w-[380px] p-0"
          sideOffset={8}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-semibold text-sm">Notifications</h4>
              {unreadCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({unreadCount} unread)
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAllRead || unreadCount === 0}
              >
                {isMarkingAllRead ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3 mr-1" />
                )}
                Mark all read
              </Button>
            )}
          </div>

          {/* Notifications list */}
          <ScrollArea className="max-h-[400px]">
            <div className="p-2">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 p-3">
                      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    icon={Bell}
                    title="No notifications"
                    description="You're all caught up!"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={handleMarkAsRead}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <Separator />
          <div className="p-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View all notifications
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
