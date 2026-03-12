import { Pool } from 'pg';
import { connectionManager } from './connection-manager.js';
import { zoneTriggerService } from '../services/zone-triggers.js';

let pool: Pool | null = null;

export function initEventListener(pgPool: Pool): void {
  pool = pgPool;

  pool.connect().then((client) => {
    client.on('notification', (msg) => {
      if (!msg.payload) return;

      try {
        const data = JSON.parse(msg.payload);
        handleNotification(msg.channel, data);
      } catch (err) {
        console.error('Failed to parse notification:', err);
      }
    });

    client.query('LISTEN "autosoftware:task_update"');
    client.query('LISTEN "autosoftware:scan_update"');
    client.query('LISTEN "autosoftware:presence"');
    client.query('LISTEN "autosoftware:task_step"');
    client.query('LISTEN "autosoftware:task_steps"');
    client.query('LISTEN "autosoftware:terminal_output"');
    client.query('LISTEN "autosoftware:file_change"');

    console.log('PostgreSQL LISTEN initialized (7 channels)');
  });
}

function handleNotification(channel: string, data: any): void {
  switch (channel) {
    case 'autosoftware:task_update':
      connectionManager.broadcast(`task:${data.taskId}`, {
        type: 'task:update',
        payload: data,
      });
      if (data.userId) {
        connectionManager.broadcastToUser(data.userId, {
          type: 'task:update',
          payload: data,
        });
      }
      // Emit trigger for task status changes (completed, failed, etc.)
      if (data.status && data.userId) {
        zoneTriggerService.emitTaskStatusChange(
          data.taskId,
          data.previousStatus || 'unknown',
          data.status,
          data.userId,
          data.repositoryId,
          data.projectId
        ).catch((err) => console.error('Failed to emit task trigger:', err));
      }
      break;

    case 'autosoftware:scan_update':
      connectionManager.broadcast(`scan:${data.scanId}`, {
        type: 'scan:update',
        payload: data,
      });
      // Emit trigger for scan completion
      if (data.status === 'completed' && data.userId && data.repositoryId) {
        zoneTriggerService.emitScanComplete(
          data.scanId,
          data.userId,
          data.repositoryId,
          data.projectId
        ).catch((err) => console.error('Failed to emit scan trigger:', err));
      }
      break;

    case 'autosoftware:presence':
      connectionManager.broadcast('presence', {
        type: 'presence:update',
        payload: data,
      });
      break;

    case 'autosoftware:task_step':
      // Single step update
      connectionManager.broadcast(`task:${data.taskId}`, {
        type: 'task:step:update',
        payload: data,
      });
      break;

    case 'autosoftware:task_steps':
      // All steps update (with progress)
      connectionManager.broadcast(`task:${data.taskId}`, {
        type: 'task:steps',
        payload: data,
      });
      break;

    case 'autosoftware:terminal_output':
      // Live terminal output from agent execution
      connectionManager.broadcast(`task:${data.taskId}:live`, {
        type: 'terminal:output',
        payload: data,
      });
      break;

    case 'autosoftware:file_change':
      // Live file changes from agent execution
      connectionManager.broadcast(`task:${data.taskId}:live`, {
        type: 'file:change',
        payload: data,
      });
      break;
  }
}

export async function emitEvent(channel: string, data: object): Promise<void> {
  if (!pool) {
    console.error('Event emitter not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    channel,
    JSON.stringify(data),
  ]);
}
