import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket";
import { TeamCursors, ActiveParticipants } from "./TeamCursors";
import { ApproachVoting, ApproachVoteSummary } from "./ApproachVoting";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Send,
  Reply,
  MoreHorizontal,
  Trash2,
  CheckCircle,
  AtSign,
  Users,
  Bell,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const BASE = "/api";

// Types
interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  taskId: string;
  approachIdx: number;
  userId: string;
  content: string;
  mentions: string[];
  parentId: string | null;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
  replies?: Comment[];
}

interface Notification {
  id: string;
  userId: string;
  mentionedBy: string;
  taskId: string;
  commentId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface CollaborativePlanningProps {
  taskId: string;
  currentUserId: string;
  approaches?: Array<{
    name: string;
    description: string;
  }>;
}

// API functions
async function fetchComments(
  taskId: string,
  approachIdx?: number
): Promise<Comment[]> {
  const params = approachIdx !== undefined ? `?approachIdx=${approachIdx}` : "";
  const res = await fetch(
    `${BASE}/collaboration/tasks/${taskId}/comments${params}`,
    { credentials: "include" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch comments");
  return data.data;
}

async function createComment(
  taskId: string,
  content: string,
  approachIdx: number,
  parentId?: string
): Promise<Comment> {
  const res = await fetch(`${BASE}/collaboration/tasks/${taskId}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, approachIdx, parentId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to create comment");
  return data.data;
}

async function deleteComment(commentId: string): Promise<void> {
  const res = await fetch(`${BASE}/collaboration/comments/${commentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to delete comment");
  }
}

async function resolveComment(
  commentId: string,
  isResolved: boolean
): Promise<void> {
  const res = await fetch(`${BASE}/collaboration/comments/${commentId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isResolved }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to update comment");
  }
}

async function fetchTeamMembers(search: string): Promise<TeamMember[]> {
  const res = await fetch(
    `${BASE}/collaboration/team-members?search=${encodeURIComponent(search)}&limit=5`,
    { credentials: "include" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch team members");
  return data.data;
}

async function joinPlanningSession(taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/collaboration/tasks/${taskId}/join`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to join session");
  }
}

async function leavePlanningSession(taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/collaboration/tasks/${taskId}/leave`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    console.error("Failed to leave planning session");
  }
}

async function updateCursorPosition(
  taskId: string,
  x: number,
  y: number,
  viewportSection?: string
): Promise<void> {
  const res = await fetch(`${BASE}/collaboration/tasks/${taskId}/cursor`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, viewportSection }),
  });
  if (!res.ok) {
    console.error("Failed to update cursor");
  }
}

async function fetchNotifications(): Promise<{
  data: Notification[];
  unreadCount: number;
}> {
  const res = await fetch(`${BASE}/collaboration/notifications?limit=10`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Failed to fetch notifications");
  return data;
}

async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await fetch(
    `${BASE}/collaboration/notifications/${notificationId}/read`,
    {
      method: "POST",
      credentials: "include",
    }
  );
  if (!res.ok) {
    console.error("Failed to mark notification as read");
  }
}

// Main component
export function CollaborativePlanning({
  taskId,
  currentUserId,
  approaches = [],
}: CollaborativePlanningProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { addMessageHandler, subscribe, unsubscribe } = useWebSocket();

  const [selectedApproachIdx, setSelectedApproachIdx] = useState<number | null>(
    null
  );

  // Join session on mount, leave on unmount
  useEffect(() => {
    joinPlanningSession(taskId).catch(console.error);

    return () => {
      leavePlanningSession(taskId).catch(console.error);
    };
  }, [taskId]);

  // Subscribe to real-time updates
  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cleanupComment = addMessageHandler("planning:comment:add", () => {
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
    });

    const cleanupDelete = addMessageHandler("planning:comment:delete", () => {
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
    });

    const cleanupUpdate = addMessageHandler("planning:comment:update", () => {
      queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
    });

    return () => {
      unsubscribe(resource);
      cleanupComment();
      cleanupDelete();
      cleanupUpdate();
    };
  }, [taskId, subscribe, unsubscribe, addMessageHandler, queryClient]);

  // Handle cursor movement
  const handleCursorMove = useCallback(
    (x: number, y: number) => {
      updateCursorPosition(taskId, x, y).catch(console.error);
    },
    [taskId]
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Real-time cursors overlay */}
      <TeamCursors
        taskId={taskId}
        currentUserId={currentUserId}
        containerRef={containerRef as React.RefObject<HTMLDivElement>}
        onCursorMove={handleCursorMove}
      />

      {/* Header with active participants and notifications */}
      <div className="mb-4 flex items-center justify-between">
        <ActiveParticipants taskId={taskId} currentUserId={currentUserId} />
        <div className="flex items-center gap-2">
          <ApproachVoteSummary taskId={taskId} />
          <NotificationBell />
        </div>
      </div>

      {/* Approaches with voting and comments */}
      {approaches.length > 0 && (
        <div className="space-y-4">
          {approaches.map((approach, idx) => (
            <ApproachCard
              key={idx}
              taskId={taskId}
              currentUserId={currentUserId}
              approachIdx={idx}
              approach={approach}
              isExpanded={selectedApproachIdx === idx}
              onToggle={() =>
                setSelectedApproachIdx(selectedApproachIdx === idx ? null : idx)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Approach card with voting and comments
function ApproachCard({
  taskId,
  currentUserId,
  approachIdx,
  approach,
  isExpanded,
  onToggle,
}: {
  taskId: string;
  currentUserId: string;
  approachIdx: number;
  approach: { name: string; description: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ["comments", taskId, approachIdx],
    queryFn: () => fetchComments(taskId, approachIdx),
    enabled: isExpanded,
    staleTime: 30000,
  });

  const commentCount = comments.reduce(
    (acc, c) => acc + 1 + (c.replies?.length || 0),
    0
  );

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-base">{approach.name}</CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {approach.description}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <ApproachVoting taskId={taskId} approachIdx={approachIdx} compact />

            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={onToggle}
            >
              <MessageSquare className="h-4 w-4" />
              {commentCount > 0 && <span>{commentCount}</span>}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-2">
          <Separator className="mb-4" />

          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4" />
              Team Discussion
            </h4>

            {loadingComments ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : (
              <>
                <CommentList
                  comments={comments}
                  currentUserId={currentUserId}
                  taskId={taskId}
                  approachIdx={approachIdx}
                  onRefresh={() =>
                    queryClient.invalidateQueries({
                      queryKey: ["comments", taskId, approachIdx],
                    })
                  }
                />

                <CommentInput
                  taskId={taskId}
                  approachIdx={approachIdx}
                  onSuccess={() =>
                    queryClient.invalidateQueries({
                      queryKey: ["comments", taskId, approachIdx],
                    })
                  }
                />
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Comment list with replies
function CommentList({
  comments,
  currentUserId,
  taskId,
  approachIdx,
  onRefresh,
  parentId,
  depth = 0,
}: {
  comments: Comment[];
  currentUserId: string;
  taskId: string;
  approachIdx: number;
  onRefresh: () => void;
  parentId?: string;
  depth?: number;
}) {
  if (comments.length === 0 && !parentId) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No comments yet. Be the first to share your thoughts!
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", depth > 0 && "ml-6 border-l-2 pl-4")}>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          taskId={taskId}
          approachIdx={approachIdx}
          onRefresh={onRefresh}
          depth={depth}
        />
      ))}
    </div>
  );
}

// Single comment with actions
function CommentItem({
  comment,
  currentUserId,
  taskId,
  approachIdx,
  onRefresh,
  depth,
}: {
  comment: Comment;
  currentUserId: string;
  taskId: string;
  approachIdx: number;
  onRefresh: () => void;
  depth: number;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const isOwner = comment.userId === currentUserId;

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: () => {
      toast.success("Comment deleted");
      onRefresh();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveComment(comment.id, !comment.isResolved),
    onSuccess: () => {
      toast.success(comment.isResolved ? "Comment reopened" : "Comment resolved");
      onRefresh();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const initials = comment.user.name
    ? comment.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : comment.user.email.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        comment.isResolved && "bg-muted/50 opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          {comment.user.avatarUrl && (
            <AvatarImage src={comment.user.avatarUrl} />
          )}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {comment.user.name || comment.user.email}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.createdAt), {
                  addSuffix: true,
                })}
              </span>
              {comment.isResolved && (
                <Badge variant="secondary" className="text-xs">
                  Resolved
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              {depth < 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsReplying(!isReplying)}
                >
                  <Reply className="h-3 w-3" />
                </Button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-1" align="end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => resolveMutation.mutate()}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {comment.isResolved ? "Reopen" : "Resolve"}
                  </Button>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate()}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <p className="mt-1 text-sm whitespace-pre-wrap">
            <HighlightMentions content={comment.content} />
          </p>
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3">
          <CommentList
            comments={comment.replies}
            currentUserId={currentUserId}
            taskId={taskId}
            approachIdx={approachIdx}
            onRefresh={onRefresh}
            parentId={comment.id}
            depth={depth + 1}
          />
        </div>
      )}

      {/* Reply input */}
      {isReplying && (
        <div className="mt-3 ml-11">
          <CommentInput
            taskId={taskId}
            approachIdx={approachIdx}
            parentId={comment.id}
            onSuccess={() => {
              setIsReplying(false);
              onRefresh();
            }}
            onCancel={() => setIsReplying(false)}
            placeholder="Write a reply..."
          />
        </div>
      )}
    </div>
  );
}

// Comment input with @mention support
function CommentInput({
  taskId,
  approachIdx,
  parentId,
  onSuccess,
  onCancel,
  placeholder = "Add a comment... Use @name to mention teammates",
}: {
  taskId: string;
  approachIdx: number;
  parentId?: string;
  onSuccess: () => void;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members", mentionSearch],
    queryFn: () => fetchTeamMembers(mentionSearch),
    enabled: showMentions && mentionSearch.length > 0,
  });

  const mutation = useMutation({
    mutationFn: () => createComment(taskId, content, approachIdx, parentId),
    onSuccess: () => {
      setContent("");
      toast.success(parentId ? "Reply added" : "Comment added");
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (content.trim()) {
        mutation.mutate();
      }
    }

    if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart;
    setContent(value);
    setCursorPosition(position);

    // Check for @mention
    const textBeforeCursor = value.slice(0, position);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setShowMentions(true);
      setMentionSearch(mentionMatch[1]);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (member: TeamMember) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const startPos = cursorPosition - mentionMatch[0].length;
      const newContent =
        content.slice(0, startPos) +
        `@${member.name || member.email} ` +
        textAfterCursor;
      setContent(newContent);
      setShowMentions(false);

      // Focus back on textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[80px] resize-none pr-10"
          rows={2}
        />

        <Button
          size="icon"
          className="absolute bottom-2 right-2 h-7 w-7"
          onClick={() => mutation.mutate()}
          disabled={!content.trim() || mutation.isPending}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Mention suggestions */}
      {showMentions && teamMembers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border bg-popover p-1 shadow-lg">
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <AtSign className="h-3 w-3" />
            Mention a teammate
          </div>
          <Separator className="my-1" />
          {teamMembers.map((member) => (
            <button
              key={member.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => insertMention(member)}
            >
              <Avatar className="h-5 w-5">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                <AvatarFallback className="text-[10px]">
                  {member.name?.slice(0, 2).toUpperCase() ||
                    member.email.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{member.name || member.email}</span>
            </button>
          ))}
        </div>
      )}

      {onCancel && (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        Press Cmd/Ctrl + Enter to submit
      </p>
    </div>
  );
}

// Highlight @mentions in content
function HighlightMentions({ content }: { content: string }) {
  const parts = content.split(/(@\w+)/g);

  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="font-medium text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// Notification bell with dropdown
function NotificationBell() {
  const queryClient = useQueryClient();
  const { addMessageHandler } = useWebSocket();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 30000,
  });

  // Listen for new notifications
  useEffect(() => {
    const cleanup = addMessageHandler("notification:mention", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    return cleanup;
  }, [addMessageHandler, queryClient]);

  const unreadCount = data?.unreadCount || 0;

  const handleMarkRead = (notificationId: string) => {
    markNotificationRead(notificationId);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h4 className="font-medium">Notifications</h4>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} new
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : data?.data.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="divide-y">
              {data?.data.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3 p-3",
                    !notification.isRead && "bg-accent/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      Someone {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMarkRead(notification.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// Export components for individual use
export { TeamCursors, ActiveParticipants } from "./TeamCursors";
export { ApproachVoting, ApproachVoteSummary } from "./ApproachVoting";
