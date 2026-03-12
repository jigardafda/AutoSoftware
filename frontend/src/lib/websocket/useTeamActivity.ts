import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './WebSocketProvider';

export interface TeamActivityEvent {
  id: string;
  userId: string;
  userName: string | null;
  userAvatar: string | null;
  activityType: string;
  entityId: string | null;
  entityType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TeamPingEvent {
  id: string;
  fromUserId: string;
  fromUserName: string | null;
  fromUserAvatar: string | null;
  message: string | null;
  createdAt: string;
}

/**
 * Hook to subscribe to team activity updates via WebSocket
 */
export function useTeamActivity() {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const [recentActivities, setRecentActivities] = useState<TeamActivityEvent[]>([]);

  useEffect(() => {
    // Subscribe to team channel
    subscribe('team');

    // Handle incoming team activities
    const removeHandler = addMessageHandler('team:activity', (payload: TeamActivityEvent) => {
      setRecentActivities((prev) => {
        // Keep only the last 50 activities
        const updated = [payload, ...prev].slice(0, 50);
        return updated;
      });
    });

    return () => {
      unsubscribe('team');
      removeHandler();
    };
  }, [subscribe, unsubscribe, addMessageHandler]);

  // Clear activities
  const clearActivities = useCallback(() => {
    setRecentActivities([]);
  }, []);

  return {
    recentActivities,
    clearActivities,
  };
}

/**
 * Hook to subscribe to team ping notifications
 */
export function useTeamPings() {
  const { addMessageHandler } = useWebSocket();
  const [pings, setPings] = useState<TeamPingEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const removeHandler = addMessageHandler('team:ping', (payload: TeamPingEvent) => {
      setPings((prev) => [payload, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      removeHandler();
    };
  }, [addMessageHandler]);

  // Mark all as read
  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Dismiss a single ping
  const dismissPing = useCallback((pingId: string) => {
    setPings((prev) => prev.filter((p) => p.id !== pingId));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Clear all pings
  const clearPings = useCallback(() => {
    setPings([]);
    setUnreadCount(0);
  }, []);

  return {
    pings,
    unreadCount,
    markAllRead,
    dismissPing,
    clearPings,
  };
}

/**
 * Hook to track team member online status changes
 */
export function useTeamPresence() {
  const { addMessageHandler } = useWebSocket();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleOnline = addMessageHandler('presence:online', (payload: { userId: string }) => {
      setOnlineUsers((prev) => new Set([...prev, payload.userId]));
    });

    const handleOffline = addMessageHandler('presence:offline', (payload: { userId: string }) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(payload.userId);
        return newSet;
      });
    });

    return () => {
      handleOnline();
      handleOffline();
    };
  }, [addMessageHandler]);

  return {
    onlineUsers,
    isUserOnline: (userId: string) => onlineUsers.has(userId),
  };
}
