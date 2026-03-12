/**
 * AI Metrics Recorder
 *
 * Records task execution outcomes for AI self-improvement metrics.
 * Auto-records success/failure when tasks complete.
 */

import { prisma } from "../db.js";

/**
 * Record task execution outcome for accuracy tracking
 */
export async function recordTaskOutcome(
  userId: string,
  taskId: string,
  outcome: {
    success: boolean;
    taskType: string;
    repositoryId: string;
    planWasAccurate?: boolean;
    executionWasCorrect?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  try {
    // Record overall accuracy metric
    await prisma.aIMetric.create({
      data: {
        userId,
        metricType: "accuracy",
        entityType: "task",
        entityId: taskId,
        value: outcome.success ? 1 : 0,
        metadata: {
          taskType: outcome.taskType,
          repositoryId: outcome.repositoryId,
          planWasAccurate: outcome.planWasAccurate ?? outcome.success,
          executionWasCorrect: outcome.executionWasCorrect ?? outcome.success,
        },
      },
    });

    // Record execution success metric
    await prisma.aIMetric.create({
      data: {
        userId,
        metricType: "execution_success",
        entityType: "task",
        entityId: taskId,
        value: outcome.success ? 1 : 0,
        metadata: {
          taskType: outcome.taskType,
          repositoryId: outcome.repositoryId,
          errorMessage: outcome.errorMessage,
        },
      },
    });

    console.log(`AI metrics recorded for task ${taskId}: success=${outcome.success}`);
  } catch (error) {
    // Don't fail the task if metrics recording fails
    console.error(`Failed to record AI metrics for task ${taskId}:`, error);
  }
}
