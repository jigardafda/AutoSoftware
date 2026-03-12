import { useEffect, useState } from 'react';
import { useWebSocket } from './WebSocketProvider';

export function usePresence(resource: string) {
  const { startViewing, stopViewing, addMessageHandler } = useWebSocket();
  const [viewers, setViewers] = useState<string[]>([]);

  useEffect(() => {
    startViewing(resource);

    const cleanupViewing = addMessageHandler('presence:viewing', (payload) => {
      if (payload.resource === resource) {
        setViewers(payload.viewers || []);
      }
    });

    const cleanupJoin = addMessageHandler('presence:join', (payload) => {
      if (payload.resource === resource) {
        setViewers((prev) => [...new Set([...prev, payload.userId])]);
      }
    });

    const cleanupLeave = addMessageHandler('presence:leave', (payload) => {
      if (payload.resource === resource) {
        setViewers((prev) => prev.filter((id) => id !== payload.userId));
      }
    });

    return () => {
      stopViewing(resource);
      cleanupViewing();
      cleanupJoin();
      cleanupLeave();
    };
  }, [resource, startViewing, stopViewing, addMessageHandler]);

  return viewers;
}

export function useOnlineUsers() {
  const { addMessageHandler } = useWebSocket();
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    const cleanupOnline = addMessageHandler('presence:online', (payload) => {
      if (payload.online) {
        setOnlineUsers((prev) => [...new Set([...prev, payload.userId])]);
      }
    });

    const cleanupOffline = addMessageHandler('presence:offline', (payload) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== payload.userId));
    });

    return () => {
      cleanupOnline();
      cleanupOffline();
    };
  }, [addMessageHandler]);

  return onlineUsers;
}
