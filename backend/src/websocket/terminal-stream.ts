import { Pool } from 'pg';
import { connectionManager } from './connection-manager.js';
import { prisma } from '../db.js';

// Buffer configuration
const OUTPUT_BUFFER_SIZE = 1000; // Keep last 1000 lines per task
const BUFFER_CLEANUP_INTERVAL = 5 * 60 * 1000; // Clean up every 5 minutes
const PERSIST_BATCH_SIZE = 50; // Batch database writes
const PERSIST_INTERVAL = 2000; // Persist every 2 seconds

interface TerminalLine {
  timestamp: number;
  stream: 'stdout' | 'stderr';
  data: string;
  sequence: number;
}

interface FileChange {
  timestamp: number;
  operation: 'create' | 'modify' | 'delete';
  filePath: string;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  language?: string;
}

interface TaskOutputBuffer {
  terminalLines: TerminalLine[];
  fileChanges: FileChange[];
  lastSequence: number;
  lastActivity: number;
}

interface PendingPersist {
  taskId: string;
  type: 'terminal' | 'file_change';
  data: TerminalLine | FileChange;
}

// In-memory buffer for late joiners
const taskOutputBuffers: Map<string, TaskOutputBuffer> = new Map();

// Pending items to persist to database
let pendingPersists: PendingPersist[] = [];
let persistInterval: NodeJS.Timeout | null = null;

let pool: Pool | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Initialize terminal streaming service
 */
export function initTerminalStream(pgPool: Pool): void {
  pool = pgPool;

  // Set up PostgreSQL LISTEN for terminal events
  pool.connect().then((client) => {
    client.on('notification', (msg) => {
      if (!msg.payload) return;

      try {
        const data = JSON.parse(msg.payload);
        handleTerminalNotification(msg.channel, data);
      } catch (err) {
        console.error('Failed to parse terminal notification:', err);
      }
    });

    // Listen for terminal output and file change events
    client.query('LISTEN "autosoftware:terminal_output"');
    client.query('LISTEN "autosoftware:file_change"');

    console.log('Terminal stream LISTEN initialized');
  });

  // Start buffer cleanup interval
  cleanupInterval = setInterval(() => {
    cleanupStaleBuffers();
  }, BUFFER_CLEANUP_INTERVAL);

  // Start persist interval for database writes
  persistInterval = setInterval(() => {
    flushPendingPersists();
  }, PERSIST_INTERVAL);
}

/**
 * Handle incoming terminal notifications from PostgreSQL
 */
function handleTerminalNotification(channel: string, data: any): void {
  const taskId = data.taskId;
  if (!taskId) return;

  const resource = `task:${taskId}:live`;

  switch (channel) {
    case 'autosoftware:terminal_output':
      // Add to buffer
      addTerminalLineToBuffer(taskId, {
        timestamp: Date.now(),
        stream: data.stream || 'stdout',
        data: data.data,
        sequence: data.sequence || 0,
      });

      // Broadcast to subscribers
      connectionManager.broadcast(resource, {
        type: 'terminal:output',
        payload: {
          taskId,
          stream: data.stream || 'stdout',
          data: data.data,
          timestamp: Date.now(),
          sequence: data.sequence,
        },
      });
      break;

    case 'autosoftware:file_change':
      // Add to buffer
      addFileChangeToBuffer(taskId, {
        timestamp: Date.now(),
        operation: data.operation,
        filePath: data.filePath,
        oldContent: data.oldContent,
        newContent: data.newContent,
        diff: data.diff,
        language: detectLanguage(data.filePath),
      });

      // Broadcast to subscribers
      connectionManager.broadcast(resource, {
        type: 'file:change',
        payload: {
          taskId,
          operation: data.operation,
          filePath: data.filePath,
          oldContent: data.oldContent,
          newContent: data.newContent,
          diff: data.diff,
          language: detectLanguage(data.filePath),
          timestamp: Date.now(),
        },
      });
      break;
  }
}

/**
 * Add terminal line to buffer for late joiners and queue for persistence
 */
function addTerminalLineToBuffer(taskId: string, line: TerminalLine): void {
  let buffer = taskOutputBuffers.get(taskId);
  if (!buffer) {
    buffer = {
      terminalLines: [],
      fileChanges: [],
      lastSequence: 0,
      lastActivity: Date.now(),
    };
    taskOutputBuffers.set(taskId, buffer);
  }

  buffer.terminalLines.push(line);
  buffer.lastSequence = line.sequence;
  buffer.lastActivity = Date.now();

  // Trim to max size
  if (buffer.terminalLines.length > OUTPUT_BUFFER_SIZE) {
    buffer.terminalLines = buffer.terminalLines.slice(-OUTPUT_BUFFER_SIZE);
  }

  // Queue for database persistence
  pendingPersists.push({ taskId, type: 'terminal', data: line });

  // Flush immediately if batch is full
  if (pendingPersists.length >= PERSIST_BATCH_SIZE) {
    flushPendingPersists();
  }
}

/**
 * Add file change to buffer and queue for persistence
 */
function addFileChangeToBuffer(taskId: string, change: FileChange): void {
  let buffer = taskOutputBuffers.get(taskId);
  if (!buffer) {
    buffer = {
      terminalLines: [],
      fileChanges: [],
      lastSequence: 0,
      lastActivity: Date.now(),
    };
    taskOutputBuffers.set(taskId, buffer);
  }

  buffer.fileChanges.push(change);
  buffer.lastActivity = Date.now();

  // Keep last 50 file changes
  if (buffer.fileChanges.length > 50) {
    buffer.fileChanges = buffer.fileChanges.slice(-50);
  }

  // Queue for database persistence
  pendingPersists.push({ taskId, type: 'file_change', data: change });

  // Flush immediately if batch is full
  if (pendingPersists.length >= PERSIST_BATCH_SIZE) {
    flushPendingPersists();
  }
}

/**
 * Get buffered output for a task (for late joiners)
 */
export function getBufferedOutput(taskId: string): TaskOutputBuffer | null {
  return taskOutputBuffers.get(taskId) || null;
}

/**
 * Clear buffer for a task
 */
export function clearTaskBuffer(taskId: string): void {
  taskOutputBuffers.delete(taskId);
}

/**
 * Clean up stale buffers (tasks inactive for more than 30 minutes)
 */
function cleanupStaleBuffers(): void {
  const staleThreshold = Date.now() - 30 * 60 * 1000;

  for (const [taskId, buffer] of taskOutputBuffers) {
    if (buffer.lastActivity < staleThreshold) {
      taskOutputBuffers.delete(taskId);
    }
  }
}

/**
 * Detect language from file extension for syntax highlighting
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'md': 'markdown',
    'mdx': 'markdown',
  };

  return languageMap[ext || ''] || 'plaintext';
}

/**
 * Emit terminal output event (called from worker)
 */
export async function emitTerminalOutput(
  taskId: string,
  stream: 'stdout' | 'stderr',
  data: string,
  sequence: number
): Promise<void> {
  if (!pool) {
    console.error('Terminal stream not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:terminal_output',
    JSON.stringify({ taskId, stream, data, sequence }),
  ]);
}

/**
 * Emit file change event (called from worker)
 */
export async function emitFileChange(
  taskId: string,
  operation: 'create' | 'modify' | 'delete',
  filePath: string,
  options?: {
    oldContent?: string;
    newContent?: string;
    diff?: string;
  }
): Promise<void> {
  if (!pool) {
    console.error('Terminal stream not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:file_change',
    JSON.stringify({ taskId, operation, filePath, ...options }),
  ]);
}

/**
 * Flush pending persists to database
 */
async function flushPendingPersists(): Promise<void> {
  if (pendingPersists.length === 0) return;

  const batch = pendingPersists.splice(0, PERSIST_BATCH_SIZE);

  try {
    const records = batch.map((item) => {
      if (item.type === 'terminal') {
        const line = item.data as TerminalLine;
        return {
          taskId: item.taskId,
          type: 'terminal',
          timestamp: new Date(line.timestamp),
          sequence: line.sequence,
          stream: line.stream,
          data: line.data,
          operation: null,
          filePath: null,
          diff: null,
          language: null,
        };
      } else {
        const change = item.data as FileChange;
        return {
          taskId: item.taskId,
          type: 'file_change',
          timestamp: new Date(change.timestamp),
          sequence: 0,
          stream: null,
          data: null,
          operation: change.operation,
          filePath: change.filePath,
          diff: change.diff || null,
          language: change.language || null,
        };
      }
    });

    await prisma.taskExecutionLog.createMany({
      data: records,
      skipDuplicates: true,
    });
  } catch (err) {
    console.error('Failed to persist execution logs:', err);
    // Re-queue failed items for retry (at the end to avoid infinite loop)
    pendingPersists.push(...batch);
  }
}

/**
 * Get persisted execution logs for a task
 */
export async function getPersistedExecutionLogs(taskId: string): Promise<{
  terminalLines: TerminalLine[];
  fileChanges: FileChange[];
}> {
  try {
    const logs = await prisma.taskExecutionLog.findMany({
      where: { taskId },
      orderBy: { timestamp: 'asc' },
    });

    const terminalLines: TerminalLine[] = [];
    const fileChanges: FileChange[] = [];

    for (const log of logs) {
      if (log.type === 'terminal' && log.stream && log.data) {
        terminalLines.push({
          timestamp: log.timestamp.getTime(),
          stream: log.stream as 'stdout' | 'stderr',
          data: log.data,
          sequence: log.sequence,
        });
      } else if (log.type === 'file_change' && log.operation && log.filePath) {
        fileChanges.push({
          timestamp: log.timestamp.getTime(),
          operation: log.operation as 'create' | 'modify' | 'delete',
          filePath: log.filePath,
          diff: log.diff || undefined,
          language: log.language || undefined,
        });
      }
    }

    return { terminalLines, fileChanges };
  } catch (err) {
    console.error('Failed to get persisted execution logs:', err);
    return { terminalLines: [], fileChanges: [] };
  }
}

/**
 * Shutdown terminal streaming service
 */
export async function shutdownTerminalStream(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  if (persistInterval) {
    clearInterval(persistInterval);
    persistInterval = null;
  }

  // Flush any remaining persists
  while (pendingPersists.length > 0) {
    await flushPendingPersists();
  }

  if (pool) {
    await pool.end();
    pool = null;
  }

  taskOutputBuffers.clear();
}
