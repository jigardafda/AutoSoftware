import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketProvider';
import { useAuth } from '@/lib/auth';

export interface ActiveUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  currentActivity: string | null;
  activityMeta: Record<string, unknown>;
  lastActivityAt: string;
}

export interface ActivityPulse {
  activeUsers: ActiveUser[];
  onlineCount: number;
  activeCount: number;
  timestamp: string;
}

export type ActivityType =
  | 'viewing_task'
  | 'viewing_scan'
  | 'editing_plan'
  | 'viewing_repo'
  | 'browsing_tasks'
  | 'browsing_scans'
  | 'browsing_repos'
  | 'viewing_dashboard'
  | 'idle';

interface ActivityMeta {
  taskId?: string;
  scanId?: string;
  repoId?: string;
  repoName?: string;
  projectId?: string;
  pageName?: string;
  taskTitle?: string;
  scanStatus?: string;
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const API_BASE = '/api/presence';

export function useActivityPulse() {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const [pulse, setPulse] = useState<ActivityPulse | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const { user } = useAuth();
  const heartbeatRef = useRef<number | null>(null);
  const currentActivityRef = useRef<ActivityType>('idle');
  const currentMetaRef = useRef<ActivityMeta>({});

  // Subscribe to presence updates
  useEffect(() => {
    subscribe('presence');

    // Handle periodic pulse updates from server
    const cleanupPulse = addMessageHandler('presence:pulse', (payload: ActivityPulse) => {
      setPulse(payload);
      setActiveUsers(payload.activeUsers);
    });

    // Handle individual activity updates
    const cleanupActivity = addMessageHandler('presence:activity', (payload: ActiveUser) => {
      setActiveUsers((prev) => {
        const existing = prev.find((u) => u.id === payload.id);
        if (existing) {
          return prev.map((u) =>
            u.id === payload.id ? { ...u, ...payload } : u
          );
        }
        return [...prev, payload];
      });
    });

    // Handle user going offline
    const cleanupOffline = addMessageHandler('presence:offline', (payload: { userId: string }) => {
      setActiveUsers((prev) => prev.filter((u) => u.id !== payload.userId));
    });

    return () => {
      unsubscribe('presence');
      cleanupPulse();
      cleanupActivity();
      cleanupOffline();
    };
  }, [subscribe, unsubscribe, addMessageHandler]);

  // Send heartbeat to server
  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentActivity: currentActivityRef.current,
          activityMeta: currentMetaRef.current,
        }),
      });
    } catch (err) {
      console.error('Failed to send heartbeat:', err);
    }
  }, []);

  // Start heartbeat when component mounts
  useEffect(() => {
    if (!user) return;

    // Send initial heartbeat
    sendHeartbeat();

    // Set up periodic heartbeat
    heartbeatRef.current = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [user, sendHeartbeat]);

  // Update current activity
  const setActivity = useCallback(
    async (activity: ActivityType, meta?: ActivityMeta) => {
      currentActivityRef.current = activity;
      currentMetaRef.current = meta ?? {};

      // Send immediate update
      try {
        await fetch(`${API_BASE}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            activity,
            meta,
          }),
        });
      } catch (err) {
        console.error('Failed to update activity:', err);
      }
    },
    []
  );

  // Fetch current active users
  const fetchActiveUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/active`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setActiveUsers(data.data);
        return data;
      }
    } catch (err) {
      console.error('Failed to fetch active users:', err);
    }
    return null;
  }, []);

  return {
    pulse,
    activeUsers,
    setActivity,
    fetchActiveUsers,
    currentActivity: currentActivityRef.current,
  };
}

/**
 * Hook to track activity on a specific page/resource
 */
export function useTrackActivity(
  activity: ActivityType,
  meta?: ActivityMeta
) {
  const { setActivity } = useActivityPulse();

  useEffect(() => {
    // Set activity when component mounts
    setActivity(activity, meta);

    // Reset to idle when component unmounts
    return () => {
      setActivity('idle', {});
    };
  }, [activity, JSON.stringify(meta), setActivity]);
}
