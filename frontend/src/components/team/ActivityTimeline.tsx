import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Code,
  CheckCircle,
  XCircle,
  MessageSquare,
  Eye,
  GitPullRequest,
  ScanSearch,
  Play,
  Filter,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface ActivityEntry {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  type: string;
  entityId: string | null;
  entityType: string | null;
  entityTitle: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityTimelineProps {
  activities?: ActivityEntry[];
  limit?: number;
  showFilters?: boolean;
}

const activityIcons: Record<string, typeof Code> = {
  task_start: Play,
  task_complete: CheckCircle,
  task_failed: XCircle,
  comment: MessageSquare,
  review: Eye,
  scan_start: ScanSearch,
  scan_complete: ScanSearch,
  coding: Code,
  pr_created: GitPullRequest,
  pr_merged: GitPullRequest,
  viewing: Eye,
  idle: Clock,
};

const activityColors: Record<string, string> = {
  task_start: "text-blue-500 bg-blue-500/10",
  task_complete: "text-green-500 bg-green-500/10",
  task_failed: "text-red-500 bg-red-500/10",
  comment: "text-purple-500 bg-purple-500/10",
  review: "text-orange-500 bg-orange-500/10",
  scan_start: "text-cyan-500 bg-cyan-500/10",
  scan_complete: "text-cyan-500 bg-cyan-500/10",
  coding: "text-indigo-500 bg-indigo-500/10",
  pr_created: "text-pink-500 bg-pink-500/10",
  pr_merged: "text-green-500 bg-green-500/10",
  viewing: "text-gray-500 bg-gray-500/10",
  idle: "text-gray-400 bg-gray-400/10",
};

const activityLabels: Record<string, string> = {
  task_start: "started a task",
  task_complete: "completed a task",
  task_failed: "task failed",
  comment: "commented",
  review: "reviewed",
  scan_start: "started a scan",
  scan_complete: "completed a scan",
  coding: "is coding",
  pr_created: "created a PR",
  pr_merged: "merged a PR",
  viewing: "is viewing",
  idle: "went idle",
};

function getInitials(name: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return "?";
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityTimeline({
  activities,
  limit = 50,
  showFilters = true,
}: ActivityTimelineProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");

  const { data: activityData, isLoading } = useQuery({
    queryKey: ["team-activity", limit],
    queryFn: () => api.team.getActivity({ limit }),
    refetchInterval: 15000,
    enabled: !activities,
  });

  const { data: membersData } = useQuery({
    queryKey: ["team-members"],
    queryFn: api.team.getMembers,
    enabled: !activities && showFilters,
  });

  const displayActivities = activities || activityData?.data || [];
  const members = membersData?.data || [];

  // Get unique activity types
  const activityTypes = useMemo(() => {
    const types = new Set<string>();
    displayActivities.forEach((a) => types.add(a.type));
    return Array.from(types).sort();
  }, [displayActivities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    return displayActivities.filter((activity) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(activity.type)) {
        return false;
      }
      if (selectedUser !== "all" && activity.userId !== selectedUser) {
        return false;
      }
      return true;
    });
  }, [displayActivities, selectedTypes, selectedUser]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityEntry[]> = {};
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    filteredActivities.forEach((activity) => {
      const activityDate = new Date(activity.createdAt).toDateString();
      let groupKey = activityDate;

      if (activityDate === today) {
        groupKey = "Today";
      } else if (activityDate === yesterday) {
        groupKey = "Yesterday";
      } else {
        groupKey = new Date(activity.createdAt).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(activity);
    });

    return groups;
  }, [filteredActivities]);

  const handleTypeToggle = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
          {showFilters && (
            <div className="flex items-center gap-2">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Filter className="h-3.5 w-3.5 mr-1.5" />
                    {selectedTypes.length > 0 ? (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {selectedTypes.length}
                      </Badge>
                    ) : (
                      "Filter"
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Activity Types</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {activityTypes.map((type) => (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={() => handleTypeToggle(type)}
                    >
                      {activityLabels[type] || type.replace(/_/g, " ")}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {selectedTypes.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center text-xs"
                        onClick={() => setSelectedTypes([])}
                      >
                        Clear filters
                      </Button>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredActivities.length === 0 ? (
          <div className="flex h-32 items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">No activity to show</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] px-4 pb-4">
            {Object.entries(groupedActivities).map(([date, activities]) => (
              <div key={date} className="mb-4">
                <h4 className="sticky top-0 bg-card py-2 text-xs font-medium text-muted-foreground border-b mb-3">
                  {date}
                </h4>
                <div className="space-y-1">
                  {activities.map((activity, idx) => {
                    const Icon = activityIcons[activity.type] || Clock;
                    const colorClass =
                      activityColors[activity.type] || "text-gray-500 bg-gray-500/10";

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {/* User avatar */}
                        <Avatar className="h-8 w-8">
                          {activity.userAvatar && (
                            <AvatarImage src={activity.userAvatar} />
                          )}
                          <AvatarFallback className="text-xs">
                            {getInitials(activity.userName)}
                          </AvatarFallback>
                        </Avatar>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {activity.userName || "Unknown"}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {activityLabels[activity.type] ||
                                activity.type.replace(/_/g, " ")}
                            </span>
                          </div>

                          {/* Entity link */}
                          {activity.entityTitle && activity.entityId && (
                            <Link
                              to={
                                activity.entityType === "task"
                                  ? `/tasks/${activity.entityId}`
                                  : activity.entityType === "scan"
                                    ? `/scans/${activity.entityId}`
                                    : "#"
                              }
                              className="text-sm text-primary hover:underline truncate block mt-0.5"
                            >
                              {activity.entityTitle}
                            </Link>
                          )}
                        </div>

                        {/* Activity type icon and time */}
                        <div className="flex flex-col items-end gap-1">
                          <div
                            className={cn(
                              "p-1.5 rounded-full",
                              colorClass.split(" ")[1]
                            )}
                          >
                            <Icon
                              className={cn("h-3.5 w-3.5", colorClass.split(" ")[0])}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(activity.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
