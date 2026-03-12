import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './WebSocketProvider';

export function useSubscription(resource: string, queryKey?: string[]) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    subscribe(resource);

    return () => {
      unsubscribe(resource);
    };
  }, [resource, subscribe, unsubscribe]);

  // Auto-invalidate React Query cache on updates
  useEffect(() => {
    if (!queryKey) return;

    const cleanup = addMessageHandler('task:update', (payload) => {
      if (payload.taskId && resource === `task:${payload.taskId}`) {
        queryClient.invalidateQueries({ queryKey });
      }
    });

    const cleanupScan = addMessageHandler('scan:update', (payload) => {
      if (payload.scanId && resource === `scan:${payload.scanId}`) {
        queryClient.invalidateQueries({ queryKey });
      }
    });

    return () => {
      cleanup();
      cleanupScan();
    };
  }, [resource, queryKey, addMessageHandler, queryClient]);
}

export function useTaskSubscription(taskId: string) {
  useSubscription(`task:${taskId}`, ['task', taskId]);
}

export function useScanSubscription(scanId: string) {
  useSubscription(`scan:${scanId}`, ['scan', scanId]);
}

export function useRealtimeUpdates<T>(
  resource: string,
  messageType: string,
  onUpdate: (payload: T) => void
) {
  const { subscribe, unsubscribe, addMessageHandler } = useWebSocket();

  useEffect(() => {
    subscribe(resource);
    const cleanup = addMessageHandler(messageType, onUpdate);

    return () => {
      unsubscribe(resource);
      cleanup();
    };
  }, [resource, messageType, onUpdate, subscribe, unsubscribe, addMessageHandler]);
}
