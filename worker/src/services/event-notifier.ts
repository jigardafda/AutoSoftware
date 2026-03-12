import { Pool } from 'pg';
import { config } from '../config.js';

let pool: Pool | null = null;

export function initEventNotifier(): void {
  pool = new Pool({
    connectionString: config.databaseUrl,
  });
}

export async function notifyTaskUpdate(data: {
  taskId: string;
  userId?: string;
  status?: string;
  previousStatus?: string;
  repositoryId?: string;
  projectId?: string;
  progress?: number;
  log?: string;
}): Promise<void> {
  if (!pool) {
    console.error('Event notifier not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:task_update',
    JSON.stringify(data),
  ]);
}

export async function notifyScanUpdate(data: {
  scanId: string;
  userId?: string;
  repositoryId?: string;
  projectId?: string;
  status?: string;
  progress?: number;
  log?: string;
}): Promise<void> {
  if (!pool) {
    console.error('Event notifier not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:scan_update',
    JSON.stringify(data),
  ]);
}

export async function notifyPresence(data: {
  userId: string;
  online: boolean;
  currentView?: string;
}): Promise<void> {
  if (!pool) {
    console.error('Event notifier not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:presence',
    JSON.stringify(data),
  ]);
}

export async function closeEventNotifier(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Sequence counter for terminal output ordering
let terminalSequence = 0;

/**
 * Emit terminal output event for live streaming
 */
export async function emitTerminalOutput(
  taskId: string,
  stream: 'stdout' | 'stderr',
  data: string
): Promise<void> {
  if (!pool) {
    console.error('Event notifier not initialized');
    return;
  }

  terminalSequence++;

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:terminal_output',
    JSON.stringify({ taskId, stream, data, sequence: terminalSequence }),
  ]);
}

/**
 * Emit file change event for live preview
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
    console.error('Event notifier not initialized');
    return;
  }

  await pool.query(`SELECT pg_notify($1, $2)`, [
    'autosoftware:file_change',
    JSON.stringify({ taskId, operation, filePath, ...options }),
  ]);
}

/**
 * Reset terminal sequence counter (call at start of new task execution)
 */
export function resetTerminalSequence(): void {
  terminalSequence = 0;
}

/**
 * Emit event to a specific channel (generic)
 */
export async function emitEvent(
  channel: string,
  data: object
): Promise<void> {
  if (!pool) {
    console.error('Event notifier not initialized');
    return;
  }

  // Map generic event names to PG NOTIFY channels
  const channelMap: Record<string, string> = {
    'task:step:update': 'autosoftware:task_step',
    'task:steps': 'autosoftware:task_steps',
    'plan:update': 'autosoftware:plan_update',
    'plan:step:update': 'autosoftware:plan_step_update',
    'blocker:new': 'autosoftware:blocker_new',
    'blocker:resolved': 'autosoftware:blocker_resolved',
    'blocker:retrying': 'autosoftware:blocker_retrying',
    'blocker:progress': 'autosoftware:blocker_progress',
  };

  const pgChannel = channelMap[channel] || `autosoftware:${channel}`;

  await pool.query(`SELECT pg_notify($1, $2)`, [
    pgChannel,
    JSON.stringify(data),
  ]);
}

// AI Transparency types
export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  estimatedSeconds?: number;
  actualSeconds?: number;
  confidence?: number;
  reasoning?: string;
  blockerMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionPlan {
  taskId: string;
  overview: string;
  steps: PlanStep[];
  totalEstimatedSeconds: number;
  confidence: number;
  reasoning?: string;
  createdAt: string;
}

export interface Blocker {
  id: string;
  taskId: string;
  type: 'error' | 'stuck' | 'needs_input' | 'rate_limit' | 'dependency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  context?: string;
  suggestedActions?: string[];
  retryable: boolean;
  createdAt: string;
  resolvedAt?: string;
  retryCount?: number;
  maxRetries?: number;
}

/**
 * Emit execution plan update for AI transparency
 */
export async function emitPlanUpdate(
  taskId: string,
  plan: ExecutionPlan
): Promise<void> {
  await emitEvent('plan:update', { taskId, plan });
}

/**
 * Emit plan step status update
 */
export async function emitPlanStepUpdate(
  taskId: string,
  stepId: string,
  updates: Partial<PlanStep>
): Promise<void> {
  await emitEvent('plan:step:update', { taskId, stepId, updates });
}

/**
 * Emit new blocker event
 */
export async function emitBlockerNew(
  taskId: string,
  blocker: Blocker
): Promise<void> {
  await emitEvent('blocker:new', { taskId, blocker });
}

/**
 * Emit blocker resolved event
 */
export async function emitBlockerResolved(
  taskId: string,
  blockerId: string
): Promise<void> {
  await emitEvent('blocker:resolved', { taskId, blockerId });
}

/**
 * Emit blocker retry in progress
 */
export async function emitBlockerRetrying(
  taskId: string,
  blockerId: string,
  retryCount: number
): Promise<void> {
  await emitEvent('blocker:retrying', { taskId, blockerId, retryCount });
}

/**
 * Emit blocker progress update
 */
export async function emitBlockerProgress(
  taskId: string,
  updates: Partial<Blocker>
): Promise<void> {
  await emitEvent('blocker:progress', { taskId, updates });
}
