import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Bell,
  MoreVertical,
  CheckCircle,
  Clock,
  Code,
  Eye,
  Coffee,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface TeamMemberCardProps {
  member: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    isOnline: boolean;
    currentActivity: string | null;
    currentEntityId: string | null;
    currentEntityType: string | null;
    lastActivityAt: string | null;
    taskCount: number;
    completedToday: number;
  };
  onViewDetails?: (memberId: string) => void;
}

const activityIcons: Record<string, typeof Code> = {
  coding: Code,
  viewing: Eye,
  task_start: Clock,
  task_complete: CheckCircle,
  idle: Coffee,
};

const activityLabels: Record<string, string> = {
  coding: "Coding",
  viewing: "Viewing",
  task_start: "Working on task",
  task_complete: "Just completed a task",
  idle: "Idle",
  scan_start: "Running scan",
  scan_complete: "Scan completed",
  review: "Reviewing code",
  comment: "Commenting",
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
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

export function TeamMemberCard({ member, onViewDetails }: TeamMemberCardProps) {
  const [pingDialogOpen, setPingDialogOpen] = useState(false);
  const [pingMessage, setPingMessage] = useState("");
  const queryClient = useQueryClient();

  const pingMutation = useMutation({
    mutationFn: (message?: string) => api.team.pingUser(member.id, message),
    onSuccess: () => {
      toast.success(`Ping sent to ${member.name || member.email}`);
      setPingDialogOpen(false);
      setPingMessage("");
    },
    onError: () => {
      toast.error("Failed to send ping");
    },
  });

  const ActivityIcon = member.currentActivity
    ? activityIcons[member.currentActivity] || Clock
    : Coffee;

  const activityLabel = member.currentActivity
    ? activityLabels[member.currentActivity] || member.currentActivity
    : "Offline";

  return (
    <>
      <Card
        className={cn(
          "transition-all duration-200 hover:shadow-md",
          member.isOnline && "ring-1 ring-green-500/20"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar with online indicator */}
            <div className="relative">
              <Avatar className="h-12 w-12">
                {member.avatarUrl && (
                  <AvatarImage src={member.avatarUrl} alt={member.name || ""} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(member.name, member.email)}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                  member.isOnline ? "bg-green-500" : "bg-gray-400"
                )}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium truncate">
                  {member.name || member.email}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPingDialogOpen(true)}>
                      <Bell className="h-4 w-4 mr-2" />
                      Ping
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onViewDetails?.(member.id)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Current activity */}
              <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                <ActivityIcon className="h-3.5 w-3.5" />
                <span className="truncate">{activityLabel}</span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {member.taskCount} active
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs text-green-600 border-green-200"
                >
                  {member.completedToday} done today
                </Badge>
              </div>

              {/* Last activity */}
              <p className="text-xs text-muted-foreground mt-2">
                Last seen: {relativeTime(member.lastActivityAt)}
              </p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setPingDialogOpen(true)}
            >
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Ping
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Message
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ping Dialog */}
      <Dialog open={pingDialogOpen} onOpenChange={setPingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ping {member.name || member.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ping-message">Message (optional)</Label>
              <Input
                id="ping-message"
                placeholder="Quick question about..."
                value={pingMessage}
                onChange={(e) => setPingMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPingDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => pingMutation.mutate(pingMessage || undefined)}
              disabled={pingMutation.isPending}
            >
              {pingMutation.isPending ? "Sending..." : "Send Ping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
