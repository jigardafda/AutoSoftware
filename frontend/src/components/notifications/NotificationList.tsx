import { useState } from "react";
import { Bell, CheckCheck, Filter, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationItem } from "./NotificationItem";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import {
  useNotifications,
  type NotificationType,
} from "@/hooks/useNotifications";

interface NotificationListProps {
  className?: string;
  maxHeight?: string;
  showPagination?: boolean;
  showFilters?: boolean;
  onNotificationClick?: () => void;
}

const NOTIFICATION_TYPES: { value: NotificationType | "all"; label: string }[] = [
  { value: "all", label: "All Notifications" },
  { value: "task_complete", label: "Task Complete" },
  { value: "task_failed", label: "Task Failed" },
  { value: "scan_done", label: "Scan Done" },
  { value: "scan_failed", label: "Scan Failed" },
  { value: "mention", label: "Mentions" },
  { value: "alert", label: "Alerts" },
  { value: "system", label: "System" },
  { value: "dependency_alert", label: "Dependency Alerts" },
  { value: "pr_status", label: "PR Status" },
];

export function NotificationList({
  className,
  maxHeight = "400px",
  showPagination = true,
  showFilters = true,
  onNotificationClick,
}: NotificationListProps) {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const {
    notifications,
    pagination,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    isMarkingAllRead,
  } = useNotifications({
    page,
    limit: 20,
    unreadOnly,
    type: typeFilter === "all" ? undefined : typeFilter,
  });

  const handleMarkAsRead = async (id: string) => {
    await markAsRead(id);
    onNotificationClick?.();
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  if (error) {
    return (
      <div className={cn("p-4 text-center text-muted-foreground", className)}>
        Failed to load notifications
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn("flex flex-col", className)}>
        {/* Header with filters */}
        {showFilters && (
          <div className="flex items-center justify-between gap-2 p-3 border-b">
            <div className="flex items-center gap-2">
              <Select
                value={typeFilter}
                onValueChange={(v) => {
                  setTypeFilter(v as NotificationType | "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[160px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={unreadOnly ? "secondary" : "ghost"}
                size="sm"
                className="h-8"
                onClick={() => {
                  setUnreadOnly(!unreadOnly);
                  setPage(1);
                }}
              >
                Unread only
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAllRead || notifications.length === 0}
            >
              {isMarkingAllRead ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              )}
              Mark all read
            </Button>
          </div>
        )}

        {/* Notifications list */}
        <ScrollArea style={{ maxHeight }}>
          <div className="p-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No notifications"
                description={
                  unreadOnly
                    ? "You're all caught up!"
                    : "You don't have any notifications yet"
                }
              />
            ) : (
              <div className="space-y-1">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onDelete={deleteNotification}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Pagination */}
        {showPagination && pagination.totalPages > 1 && (
          <div className="border-t p-2">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
