import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';

// Types
export interface TeamCursor {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  x: number;
  y: number;
  viewportSection?: string;
  color: string;
  lastUpdated: number;
}

export interface CollaborationComment {
  id: string;
  taskId: string;
  approachIdx: number;
  content: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  parentId?: string;
  mentions: string[];
  createdAt: string;
}

export interface VoteUpdate {
  taskId: string;
  approachIdx: number;
  voteType: 'upvote' | 'downvote';
  userId: string;
  userName?: string;
  userAvatar?: string;
  counts: {
    upvotes: number;
    downvotes: number;
  };
  timestamp: string;
}

export interface MentionNotification {
  commentId: string;
  taskId: string;
  taskTitle: string;
  mentionedBy: string;
  mentionedByAvatar?: string;
  content: string;
  createdAt: string;
}

// Generate consistent colors for users
const CURSOR_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

/**
 * Hook for collaborative planning features
 * Handles real-time cursor tracking, comments, and votes
 */
export function useCollaboration(taskId: string, currentUserId?: string) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();

  const [cursors, setCursors] = useState<Map<string, TeamCursor>>(new Map());
  const [participants, setParticipants] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<MentionNotification[]>([]);

  const cursorCleanupRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    // Cursor updates
    const cleanupCursor = addMessageHandler('planning:cursor', (payload) => {
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
          lastUpdated: Date.now(),
        });
        return next;
      });
    });

    // User leaving
    const cleanupLeave = addMessageHandler('planning:cursor:leave', (payload) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(payload.userId);
        return next;
      });
      setParticipants((prev) => prev.filter((id) => id !== payload.userId));
    });

    // User joining
    const cleanupJoin = addMessageHandler('planning:user:join', (payload) => {
      if (payload.userId !== currentUserId) {
        setParticipants((prev) => [...new Set([...prev, payload.userId])]);
      }
    });

    // User leaving session
    const cleanupUserLeave = addMessageHandler('planning:user:leave', (payload) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(payload.userId);
        return next;
      });
      setParticipants((prev) => prev.filter((id) => id !== payload.userId));
    });

    // Mention notification
    const cleanupMention = addMessageHandler('notification:mention', (payload) => {
      setNotifications((prev) => [payload, ...prev.slice(0, 9)]);
    });

    // Cleanup stale cursors every 5 seconds
    cursorCleanupRef.current = setInterval(() => {
      const staleThreshold = Date.now() - 30000; // 30 seconds
      setCursors((prev) => {
        const next = new Map(prev);
        for (const [userId, cursor] of prev) {
          if (cursor.lastUpdated < staleThreshold) {
            next.delete(userId);
          }
        }
        return next;
      });
    }, 5000);

    return () => {
      unsubscribe(resource);
      cleanupCursor();
      cleanupLeave();
      cleanupJoin();
      cleanupUserLeave();
      cleanupMention();
      if (cursorCleanupRef.current) {
        clearInterval(cursorCleanupRef.current);
      }
    };
  }, [taskId, currentUserId, subscribe, unsubscribe, addMessageHandler]);

  const clearNotification = useCallback((index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    cursors: Array.from(cursors.values()),
    participants,
    notifications,
    clearNotification,
  };
}

/**
 * Hook for real-time comment updates
 */
export function useCommentUpdates(taskId: string, approachIdx?: number) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const [lastUpdate, setLastUpdate] = useState<{
    type: 'add' | 'update' | 'delete';
    data: any;
  } | null>(null);

  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cleanupAdd = addMessageHandler('planning:comment:add', (payload) => {
      if (approachIdx === undefined || payload.comment.approachIdx === approachIdx) {
        setLastUpdate({ type: 'add', data: payload.comment });
      }
    });

    const cleanupUpdate = addMessageHandler('planning:comment:update', (payload) => {
      setLastUpdate({ type: 'update', data: payload });
    });

    const cleanupDelete = addMessageHandler('planning:comment:delete', (payload) => {
      if (approachIdx === undefined || payload.approachIdx === approachIdx) {
        setLastUpdate({ type: 'delete', data: payload });
      }
    });

    return () => {
      unsubscribe(resource);
      cleanupAdd();
      cleanupUpdate();
      cleanupDelete();
    };
  }, [taskId, approachIdx, subscribe, unsubscribe, addMessageHandler]);

  return lastUpdate;
}

/**
 * Hook for real-time vote updates
 */
export function useVoteUpdates(taskId: string) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const [votes, setVotes] = useState<Map<number, { upvotes: number; downvotes: number }>>(
    new Map()
  );

  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cleanupVote = addMessageHandler('planning:vote', (payload: VoteUpdate) => {
      setVotes((prev) => {
        const next = new Map(prev);
        next.set(payload.approachIdx, payload.counts);
        return next;
      });
    });

    const cleanupRemove = addMessageHandler('planning:vote:remove', (payload: VoteUpdate) => {
      setVotes((prev) => {
        const next = new Map(prev);
        next.set(payload.approachIdx, payload.counts);
        return next;
      });
    });

    return () => {
      unsubscribe(resource);
      cleanupVote();
      cleanupRemove();
    };
  }, [taskId, subscribe, unsubscribe, addMessageHandler]);

  return votes;
}

/**
 * Hook for tracking who is actively planning
 */
export function usePlanningParticipants(taskId: string, currentUserId?: string) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const [participants, setParticipants] = useState<
    Array<{
      userId: string;
      userName: string;
      avatarUrl?: string;
      color: string;
    }>
  >([]);

  useEffect(() => {
    const resource = `task:${taskId}:planning`;
    subscribe(resource);

    const cleanupJoin = addMessageHandler('planning:user:join', (payload) => {
      if (payload.userId === currentUserId) return;

      setParticipants((prev) => {
        if (prev.some((p) => p.userId === payload.userId)) return prev;
        return [
          ...prev,
          {
            userId: payload.userId,
            userName: payload.userName,
            avatarUrl: payload.avatarUrl,
            color: getUserColor(payload.userId),
          },
        ];
      });
    });

    const cleanupLeave = addMessageHandler('planning:user:leave', (payload) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== payload.userId));
    });

    return () => {
      unsubscribe(resource);
      cleanupJoin();
      cleanupLeave();
    };
  }, [taskId, currentUserId, subscribe, unsubscribe, addMessageHandler]);

  return participants;
}
