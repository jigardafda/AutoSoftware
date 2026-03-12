import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  payload?: any;
  resource?: string;
}

interface WebSocketContextType {
  isConnected: boolean;
  isReconnecting: boolean;
  subscribe: (resource: string) => void;
  unsubscribe: (resource: string) => void;
  addMessageHandler: (type: string, handler: (payload: any) => void) => () => void;
  startViewing: (resource: string) => void;
  stopViewing: (resource: string) => void;
  sendActivityUpdate: (activity: string, meta?: Record<string, unknown>) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      socketRef.current = new WebSocket(wsUrl);

      socketRef.current.onopen = () => {
        setIsConnected(true);
        setIsReconnecting(false);
        console.log('WebSocket connected');

        // Re-subscribe to all previous subscriptions
        for (const resource of subscriptionsRef.current) {
          socketRef.current?.send(JSON.stringify({ type: 'subscribe', resource }));
        }

        // Start heartbeat
        heartbeatIntervalRef.current = window.setInterval(() => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 30000);
      };

      socketRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const handlers = messageHandlersRef.current.get(message.type);
          if (handlers) {
            for (const handler of handlers) {
              handler(message.payload);
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      socketRef.current.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        // Attempt reconnection
        setIsReconnecting(true);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };

      socketRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setIsReconnecting(true);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      socketRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((resource: string) => {
    subscriptionsRef.current.add(resource);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'subscribe', resource }));
    }
  }, []);

  const unsubscribe = useCallback((resource: string) => {
    subscriptionsRef.current.delete(resource);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'unsubscribe', resource }));
    }
  }, []);

  const addMessageHandler = useCallback((type: string, handler: (payload: any) => void) => {
    if (!messageHandlersRef.current.has(type)) {
      messageHandlersRef.current.set(type, new Set());
    }
    messageHandlersRef.current.get(type)!.add(handler);

    return () => {
      messageHandlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const startViewing = useCallback((resource: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'viewing:start', resource }));
    }
  }, []);

  const stopViewing = useCallback((resource: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'viewing:stop', resource }));
    }
  }, []);

  const sendActivityUpdate = useCallback((activity: string, meta?: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'activity:update',
        payload: { activity, meta },
      }));
    }
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        isReconnecting,
        subscribe,
        unsubscribe,
        addMessageHandler,
        startViewing,
        stopViewing,
        sendActivityUpdate,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
