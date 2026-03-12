/**
 * Priority Queue Service for Dependent Tasks
 *
 * Manages task prioritization and dependency resolution for the worker.
 * Ensures dependent tasks are executed in the correct order.
 */

import { prisma } from "../db.js";
import { getBoss } from "../boss.js";
import { JOB_NAMES } from "@autosoftware/shared";

export type TaskPriorityLevel = "critical" | "high" | "medium" | "low";

export interface QueuedTask {
  taskId: string;
  repositoryId: string;
  priority: TaskPriorityLevel;
  batchOperationId?: string;
  order?: number;
  dependencies?: string[]; // Task IDs that must complete first
  createdAt: Date;
}

// Priority weights (higher = more urgent)
const PRIORITY_WEIGHTS: Record<TaskPriorityLevel, number> = {
  critical: 1000,
  high: 100,
  medium: 10,
  low: 1,
};

// In-memory dependency graph
const dependencyGraph = new Map<string, Set<string>>(); // taskId -> dependent task IDs
const reverseDependencyGraph = new Map<string, Set<string>>(); // taskId -> tasks it depends on

/**
 * Calculate effective priority score for a task
 */
function calculatePriorityScore(task: QueuedTask): number {
  let score = PRIORITY_WEIGHTS[task.priority] || PRIORITY_WEIGHTS.medium;

  // Boost priority for batch operations with specific ordering
  if (task.batchOperationId && task.order !== undefined) {
    // Earlier tasks in sequence get slight priority boost
    score += Math.max(0, 10 - task.order);
  }

  // Age factor: tasks waiting longer get priority boost
  const ageMinutes = (Date.now() - task.createdAt.getTime()) / (1000 * 60);
  score += Math.min(ageMinutes * 0.1, 50); // Max 50 points for age

  return score;
}

/**
 * Register task dependencies
 */
export function registerDependencies(
  taskId: string,
  dependsOn: string[]
): void {
  // Update reverse dependency graph
  const deps = new Set(dependsOn);
  reverseDependencyGraph.set(taskId, deps);

  // Update forward dependency graph
  for (const depId of dependsOn) {
    if (!dependencyGraph.has(depId)) {
      dependencyGraph.set(depId, new Set());
    }
    dependencyGraph.get(depId)!.add(taskId);
  }
}

/**
 * Mark a task as completed and check for unlocked dependents
 */
export async function onTaskCompleted(taskId: string): Promise<string[]> {
  const unlockedTasks: string[] = [];

  // Get tasks that depend on this one
  const dependents = dependencyGraph.get(taskId);
  if (!dependents) {
    return unlockedTasks;
  }

  for (const dependentId of dependents) {
    // Remove this task from the dependent's requirements
    const requirements = reverseDependencyGraph.get(dependentId);
    if (requirements) {
      requirements.delete(taskId);

      // If all requirements are met, task can be queued
      if (requirements.size === 0) {
        unlockedTasks.push(dependentId);
        reverseDependencyGraph.delete(dependentId);
      }
    }
  }

  // Clean up completed task from dependency graph
  dependencyGraph.delete(taskId);

  return unlockedTasks;
}

/**
 * Check if a task can be executed (all dependencies met)
 */
export function canExecute(taskId: string): boolean {
  const requirements = reverseDependencyGraph.get(taskId);
  return !requirements || requirements.size === 0;
}

/**
 * Get pending dependencies for a task
 */
export function getPendingDependencies(taskId: string): string[] {
  const requirements = reverseDependencyGraph.get(taskId);
  return requirements ? [...requirements] : [];
}

/**
 * Queue a task with priority handling
 */
export async function queueTaskWithPriority(
  taskId: string,
  options: {
    priority?: TaskPriorityLevel;
    batchOperationId?: string;
    order?: number;
    dependencies?: string[];
    jobType: "plan" | "execute";
  }
): Promise<void> {
  const boss = getBoss();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      repositoryId: true,
      priority: true,
      createdAt: true,
    },
  });

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  // Register dependencies if any
  if (options.dependencies && options.dependencies.length > 0) {
    registerDependencies(taskId, options.dependencies);

    // Check if task can be queued immediately
    if (!canExecute(taskId)) {
      console.log(
        `Task ${taskId} waiting for dependencies: ${options.dependencies.join(", ")}`
      );
      return;
    }
  }

  const queuedTask: QueuedTask = {
    taskId: task.id,
    repositoryId: task.repositoryId,
    priority: (options.priority || task.priority) as TaskPriorityLevel,
    batchOperationId: options.batchOperationId,
    order: options.order,
    dependencies: options.dependencies,
    createdAt: task.createdAt,
  };

  const priorityScore = calculatePriorityScore(queuedTask);

  // Queue job with priority
  const jobName =
    options.jobType === "plan" ? JOB_NAMES.TASK_PLAN : JOB_NAMES.TASK_EXECUTE;

  await boss.send(
    jobName,
    { taskId },
    {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 60 * 60,
      priority: Math.round(priorityScore),
    }
  );

  console.log(
    `Queued task ${taskId} with priority score ${priorityScore.toFixed(1)}`
  );
}

/**
 * Get next task from batch operation (sequential mode)
 */
export async function getNextBatchTask(
  batchOperationId: string
): Promise<string | null> {
  // Find the next pending task in order
  const nextTask = await prisma.batchOperationTask.findFirst({
    where: {
      batchOperationId,
      task: {
        status: { in: ["pending", "planned"] },
      },
    },
    orderBy: { order: "asc" },
    select: { taskId: true },
  });

  return nextTask?.taskId || null;
}

/**
 * Handle sequential batch progression
 */
export async function progressSequentialBatch(
  batchOperationId: string,
  completedTaskId: string,
  jobType: "plan" | "execute"
): Promise<void> {
  // Get batch operation details
  const batch = await prisma.batchOperation.findUnique({
    where: { id: batchOperationId },
    select: { executionMode: true, status: true },
  });

  if (!batch || batch.executionMode !== "sequential" || batch.status !== "in_progress") {
    return;
  }

  // Find and queue the next task
  const nextTaskId = await getNextBatchTask(batchOperationId);

  if (nextTaskId) {
    await queueTaskWithPriority(nextTaskId, {
      batchOperationId,
      jobType,
    });
    console.log(`Sequential batch ${batchOperationId}: queued next task ${nextTaskId}`);
  } else {
    // No more tasks, check if batch is complete
    await checkBatchCompletion(batchOperationId);
  }
}

/**
 * Check and update batch operation completion status
 */
export async function checkBatchCompletion(
  batchOperationId: string
): Promise<void> {
  const batchTasks = await prisma.batchOperationTask.findMany({
    where: { batchOperationId },
    include: {
      task: {
        select: { status: true },
      },
    },
  });

  const completedCount = batchTasks.filter(
    (t) => t.task.status === "completed"
  ).length;
  const failedCount = batchTasks.filter(
    (t) => t.task.status === "failed"
  ).length;
  const pendingCount = batchTasks.filter(
    (t) =>
      !["completed", "failed", "cancelled"].includes(t.task.status)
  ).length;

  let newStatus: string | undefined;

  if (pendingCount === 0) {
    if (failedCount === 0) {
      newStatus = "completed";
    } else if (completedCount === 0) {
      newStatus = "failed";
    } else {
      // Mix of completed and failed
      newStatus = "completed"; // Consider it completed with partial success
    }
  }

  if (newStatus) {
    await prisma.batchOperation.update({
      where: { id: batchOperationId },
      data: {
        status: newStatus as any,
        completedAt: new Date(),
      },
    });
    console.log(`Batch operation ${batchOperationId} marked as ${newStatus}`);
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pendingByPriority: Record<string, number>;
  totalPending: number;
  blockedByDependencies: number;
}> {
  const pendingTasks = await prisma.task.findMany({
    where: {
      status: { in: ["pending", "planned", "planning"] },
    },
    select: { id: true, priority: true },
  });

  const pendingByPriority: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  let blockedByDependencies = 0;

  for (const task of pendingTasks) {
    pendingByPriority[task.priority]++;

    if (!canExecute(task.id)) {
      blockedByDependencies++;
    }
  }

  return {
    pendingByPriority,
    totalPending: pendingTasks.length,
    blockedByDependencies,
  };
}

/**
 * Reorder tasks within a batch operation
 */
export async function reorderBatchTasks(
  batchOperationId: string,
  taskOrder: string[]
): Promise<void> {
  await prisma.$transaction(
    taskOrder.map((taskId, index) =>
      prisma.batchOperationTask.updateMany({
        where: {
          batchOperationId,
          taskId,
        },
        data: { order: index },
      })
    )
  );
}

/**
 * Cancel all pending tasks in a batch
 */
export async function cancelBatchPendingTasks(
  batchOperationId: string
): Promise<number> {
  const result = await prisma.task.updateMany({
    where: {
      batchOperationTask: { batchOperationId },
      status: { in: ["pending", "planned", "planning", "awaiting_input"] },
    },
    data: { status: "cancelled" },
  });

  return result.count;
}
