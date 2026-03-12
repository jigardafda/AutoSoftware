import { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';
import { connectionManager } from './connection-manager.js';
import { initEventListener } from './event-emitter.js';
import { getBufferedOutput } from './terminal-stream.js';
import { Pool } from 'pg';
import { prisma } from '../db.js';

interface WebSocketMessage {
  type: string;
  resource?: string;
  payload?: any;
}

interface ActivityPayload {
  activity: string;
  meta?: Record<string, unknown>;
}

// Track activity updates to broadcast periodically
const activityUpdateInterval = 30000; // 30 seconds
let activityBroadcastTimer: NodeJS.Timeout | null = null;

/**
 * Broadcast current active users summary to all connected clients
 */
async function broadcastActivityPulse(): Promise<void> {
  try {
    const onlineUserIds = connectionManager.getOnlineUsers();
    if (onlineUserIds.length === 0) return;

    // Get activity info for all online users
    const activeThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const presenceRecords = await prisma.userPresence.findMany({
      where: {
        userId: { in: onlineUserIds },
        lastActivityAt: { gte: activeThreshold },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    const activeUsers = presenceRecords.map((record) => ({
      id: record.user.id,
      name: record.user.name,
      email: record.user.email,
      avatarUrl: record.user.avatarUrl,
      currentActivity: record.currentActivity,
      activityMeta: record.activityMeta,
      lastActivityAt: record.lastActivityAt.toISOString(),
    }));

    // Broadcast to all connected clients
    connectionManager.broadcastToAll({
      type: 'presence:pulse',
      payload: {
        activeUsers,
        onlineCount: onlineUserIds.length,
        activeCount: activeUsers.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Failed to broadcast activity pulse:', err);
  }
}

/**
 * Start periodic activity pulse broadcasts
 */
function startActivityPulseBroadcast(): void {
  if (activityBroadcastTimer) return;

  activityBroadcastTimer = setInterval(() => {
    broadcastActivityPulse();
  }, activityUpdateInterval);
}

/**
 * Stop periodic activity pulse broadcasts
 */
function stopActivityPulseBroadcast(): void {
  if (activityBroadcastTimer) {
    clearInterval(activityBroadcastTimer);
    activityBroadcastTimer = null;
  }
}

export async function registerWebSocket(
  fastify: FastifyInstance,
  pool: Pool
): Promise<void> {
  await fastify.register(websocket);

  // Initialize PostgreSQL event listener
  initEventListener(pool);

  // Start periodic activity pulse broadcasts
  startActivityPulseBroadcast();

  // Cleanup on server shutdown
  fastify.addHook('onClose', () => {
    stopActivityPulseBroadcast();
  });

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    const connectionId = uuidv4();
    // @ts-ignore - userId added by auth hook
    const userId = request.userId as string;

    if (!userId) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    connectionManager.addConnection(connectionId, socket, userId);

    // Notify others that user is online
    connectionManager.broadcast('presence', {
      type: 'presence:online',
      payload: { userId, online: true },
    });

    socket.on('message', (rawMessage) => {
      try {
        const message: WebSocketMessage = JSON.parse(rawMessage.toString());
        handleMessage(connectionId, userId, message);
      } catch (err) {
        console.error('Invalid WebSocket message:', err);
      }
    });

    socket.on('close', () => {
      connectionManager.removeConnection(connectionId);

      // Check if user has no more connections
      if (!connectionManager.getOnlineUsers().includes(userId)) {
        connectionManager.broadcast('presence', {
          type: 'presence:offline',
          payload: { userId, online: false },
        });
      }
    });

    socket.on('error', (err) => {
      console.error('WebSocket error:', err);
      connectionManager.removeConnection(connectionId);
    });
  });
}

function handleMessage(
  connectionId: string,
  userId: string,
  message: WebSocketMessage
): void {
  switch (message.type) {
    case 'subscribe':
      if (message.resource) {
        connectionManager.subscribe(connectionId, message.resource);

        // Notify others viewing this resource
        const viewers = connectionManager.getResourceViewers(message.resource);
        connectionManager.broadcast(message.resource, {
          type: 'presence:viewing',
          payload: { resource: message.resource, viewers },
        });
      }
      break;

    case 'unsubscribe':
      if (message.resource) {
        connectionManager.unsubscribe(connectionId, message.resource);

        // Notify remaining viewers
        const viewers = connectionManager.getResourceViewers(message.resource);
        connectionManager.broadcast(message.resource, {
          type: 'presence:viewing',
          payload: { resource: message.resource, viewers },
        });
      }
      break;

    case 'heartbeat':
      connectionManager.updateHeartbeat(connectionId);
      break;

    case 'viewing:start':
      if (message.resource) {
        connectionManager.subscribe(connectionId, message.resource);
        connectionManager.broadcast(message.resource, {
          type: 'presence:join',
          payload: { userId, resource: message.resource },
        });
      }
      break;

    case 'viewing:stop':
      if (message.resource) {
        connectionManager.unsubscribe(connectionId, message.resource);
        connectionManager.broadcast(message.resource, {
          type: 'presence:leave',
          payload: { userId, resource: message.resource },
        });
      }
      break;

    case 'activity:update':
      // Handle activity update from client
      handleActivityUpdate(userId, message.payload as ActivityPayload);
      break;

    case 'live:subscribe':
      // Subscribe to live execution view for a task
      if (message.payload?.taskId) {
        const liveResource = `task:${message.payload.taskId}:live`;
        connectionManager.subscribe(connectionId, liveResource);

        // Send buffered output to late joiner
        const bufferedOutput = getBufferedOutput(message.payload.taskId);
        if (bufferedOutput) {
          connectionManager.sendToConnection(connectionId, {
            type: 'live:buffered',
            payload: {
              taskId: message.payload.taskId,
              terminalLines: bufferedOutput.terminalLines,
              fileChanges: bufferedOutput.fileChanges,
              lastSequence: bufferedOutput.lastSequence,
            },
          });
        }
      }
      break;

    case 'live:unsubscribe':
      // Unsubscribe from live execution view
      if (message.payload?.taskId) {
        const liveResource = `task:${message.payload.taskId}:live`;
        connectionManager.unsubscribe(connectionId, liveResource);
      }
      break;
  }
}

/**
 * Handle activity update from client and broadcast to others
 */
async function handleActivityUpdate(
  userId: string,
  payload: ActivityPayload
): Promise<void> {
  if (!payload?.activity) return;

  try {
    const activityMetaJson = payload.meta ? JSON.parse(JSON.stringify(payload.meta)) : {};

    const presence = await prisma.userPresence.upsert({
      where: { userId },
      create: {
        userId,
        lastSeenAt: new Date(),
        lastActivityAt: new Date(),
        isOnline: true,
        currentActivity: payload.activity,
        activityMeta: activityMetaJson,
      },
      update: {
        lastActivityAt: new Date(),
        currentActivity: payload.activity,
        activityMeta: activityMetaJson,
      },
    });

    // Get user info separately
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    // Broadcast activity update to all clients subscribed to presence
    connectionManager.broadcast('presence', {
      type: 'presence:activity',
      payload: {
        userId,
        userName: user?.name ?? null,
        email: user?.email ?? '',
        avatarUrl: user?.avatarUrl ?? null,
        currentActivity: payload.activity,
        activityMeta: payload.meta ?? {},
        lastActivityAt: presence.lastActivityAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('Failed to update activity:', err);
  }
}
