import { useEffect, useState, useCallback, useRef } from "react";
import { useWebSocket } from "@/lib/websocket";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TeamCursor {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  x: number;
  y: number;
  viewportSection?: string;
  color: string;
}

interface TeamCursorsProps {
  taskId: string;
  currentUserId?: string;
  containerRef: React.RefObject<HTMLDivElement>;
  onCursorMove?: (x: number, y: number) => void;
}

// Generate consistent colors for users
const CURSOR_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function TeamCursors({
  taskId,
  currentUserId,
  containerRef,
  onCursorMove,
}: TeamCursorsProps) {
  const { addMessageHandler, subscribe, unsubscribe } = useWebSocket();
  const [cursors, setCursors] = useState<Map<string, TeamCursor>>(new Map());
  const throttleRef = useRef<number | null>(null);

  // Subscribe to planning session updates
  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cleanupCursor = addMessageHandler("planning:cursor", (payload) => {
      if (payload.userId === currentUserId) return;

      setCursors((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, {
          userId: payload.userId,
          userName: payload.userName,
          avatarUrl: payload.avatarUrl,
          x: payload.x,
          y: payload.y,
          viewportSection: payload.viewportSection,
          color: getUserColor(payload.userId),
        });
        return next;
      });
    });

    const cleanupLeave = addMessageHandler("planning:cursor:leave", (payload) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(payload.userId);
        return next;
      });
    });

    const cleanupUserLeave = addMessageHandler("planning:user:leave", (payload) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(payload.userId);
        return next;
      });
    });

    const cleanupUserJoin = addMessageHandler("planning:user:join", (payload) => {
      if (payload.userId === currentUserId) return;

      setCursors((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, {
          userId: payload.userId,
          userName: payload.userName,
          avatarUrl: payload.avatarUrl,
          x: 0,
          y: 0,
          color: getUserColor(payload.userId),
        });
        return next;
      });
    });

    return () => {
      unsubscribe(resource);
      cleanupCursor();
      cleanupLeave();
      cleanupUserLeave();
      cleanupUserJoin();
    };
  }, [taskId, currentUserId, subscribe, unsubscribe, addMessageHandler]);

  // Track local mouse movement and send to server
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Throttle cursor updates to 60fps max
      if (throttleRef.current) return;

      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null;
        onCursorMove?.(x, y);
      }, 16);
    },
    [containerRef, onCursorMove]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mousemove", handleMouseMove);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
    };
  }, [containerRef, handleMouseMove]);

  // Clean up stale cursors (not updated in 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      // This is handled by the backend via lastUpdatedAt
      // We could also implement client-side cleanup if needed
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from(cursors.values()).map((cursor) => (
        <CursorIndicator key={cursor.userId} cursor={cursor} />
      ))}
    </div>
  );
}

function CursorIndicator({ cursor }: { cursor: TeamCursor }) {
  return (
    <div
      className="absolute transition-all duration-75 ease-out"
      style={{
        left: cursor.x,
        top: cursor.y,
        transform: "translate(-2px, -2px)",
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        className="drop-shadow-lg"
      >
        <path
          d="M5.5 3.21V20.8C5.5 21.5 6.32 21.91 6.87 21.47L11 18.25L14.3 21.55C14.69 21.94 15.32 21.94 15.71 21.55L17.55 19.71C17.94 19.32 17.94 18.69 17.55 18.3L14.25 15L17.47 10.87C17.91 10.32 17.5 9.5 16.79 9.5H6.5C5.95 9.5 5.5 9.95 5.5 10.5V3.21Z"
          fill={cursor.color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* User label */}
      <div
        className="ml-4 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white shadow-lg"
        style={{ backgroundColor: cursor.color }}
      >
        <Avatar className="h-4 w-4 border border-white/30">
          {cursor.avatarUrl ? (
            <AvatarImage src={cursor.avatarUrl} alt={cursor.userName} />
          ) : null}
          <AvatarFallback
            className="text-[8px]"
            style={{ backgroundColor: cursor.color }}
          >
            {getInitials(cursor.userName)}
          </AvatarFallback>
        </Avatar>
        <span className="max-w-[80px] truncate">{cursor.userName}</span>
      </div>
    </div>
  );
}

// Hook for using team cursors with a simple API
export function useTeamCursors(taskId: string, currentUserId?: string) {
  const [activeCursors, setActiveCursors] = useState<TeamCursor[]>([]);
  const { addMessageHandler, subscribe, unsubscribe } = useWebSocket();

  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cursorsMap = new Map<string, TeamCursor>();

    const cleanupCursor = addMessageHandler("planning:cursor", (payload) => {
      if (payload.userId === currentUserId) return;

      cursorsMap.set(payload.userId, {
        userId: payload.userId,
        userName: payload.userName,
        avatarUrl: payload.avatarUrl,
        x: payload.x,
        y: payload.y,
        viewportSection: payload.viewportSection,
        color: getUserColor(payload.userId),
      });
      setActiveCursors(Array.from(cursorsMap.values()));
    });

    const cleanupLeave = addMessageHandler("planning:cursor:leave", (payload) => {
      cursorsMap.delete(payload.userId);
      setActiveCursors(Array.from(cursorsMap.values()));
    });

    return () => {
      unsubscribe(resource);
      cleanupCursor();
      cleanupLeave();
    };
  }, [taskId, currentUserId, subscribe, unsubscribe, addMessageHandler]);

  return activeCursors;
}

// Active participants display (for sidebar/header)
export function ActiveParticipants({
  taskId,
  currentUserId,
  maxVisible = 4,
}: {
  taskId: string;
  currentUserId?: string;
  maxVisible?: number;
}) {
  const cursors = useTeamCursors(taskId, currentUserId);

  if (cursors.length === 0) {
    return null;
  }

  const visible = cursors.slice(0, maxVisible);
  const remaining = cursors.length - maxVisible;

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Planning:</span>
      <div className="flex -space-x-2">
        {visible.map((cursor) => (
          <Avatar
            key={cursor.userId}
            className="h-6 w-6 border-2 border-background"
            style={{ borderColor: cursor.color }}
          >
            {cursor.avatarUrl && (
              <AvatarImage src={cursor.avatarUrl} alt={cursor.userName} />
            )}
            <AvatarFallback
              className="text-xs text-white"
              style={{ backgroundColor: cursor.color }}
            >
              {getInitials(cursor.userName)}
            </AvatarFallback>
          </Avatar>
        ))}
        {remaining > 0 && (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
}
