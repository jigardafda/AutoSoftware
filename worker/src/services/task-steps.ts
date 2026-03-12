/**
 * Task Steps Service
 *
 * Manages execution steps for tasks, providing progress tracking
 * that users can see in real-time.
 */

import { prisma } from "../db.js";
import { emitEvent } from "./event-notifier.js";

export interface TaskStepInput {
  title: string;
  description?: string;
}

export interface TaskStepData {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  order: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Create steps for a task from a list of step definitions
 */
export async function createTaskSteps(
  taskId: string,
  steps: TaskStepInput[]
): Promise<TaskStepData[]> {
  // Delete any existing steps first
  await prisma.taskStep.deleteMany({ where: { taskId } });

  // Create new steps
  const createdSteps = await Promise.all(
    steps.map((step, index) =>
      prisma.taskStep.create({
        data: {
          taskId,
          title: step.title,
          description: step.description,
          order: index,
          status: "pending",
        },
      })
    )
  );

  // Emit event for real-time updates
  await emitStepsUpdate(taskId, createdSteps as TaskStepData[]);

  return createdSteps as TaskStepData[];
}

/**
 * Get all steps for a task
 */
export async function getTaskSteps(taskId: string): Promise<TaskStepData[]> {
  const steps = await prisma.taskStep.findMany({
    where: { taskId },
    orderBy: { order: "asc" },
  });
  return steps as TaskStepData[];
}

/**
 * Start a step (mark as in_progress)
 */
export async function startStep(
  taskId: string,
  stepIdOrOrder: string | number
): Promise<TaskStepData | null> {
  const where =
    typeof stepIdOrOrder === "string"
      ? { id: stepIdOrOrder }
      : { taskId_order: { taskId, order: stepIdOrOrder } };

  // Find by order if number
  let step;
  if (typeof stepIdOrOrder === "number") {
    step = await prisma.taskStep.findFirst({
      where: { taskId, order: stepIdOrOrder },
    });
    if (!step) return null;
  }

  const updated = await prisma.taskStep.update({
    where: typeof stepIdOrOrder === "string" ? { id: stepIdOrOrder } : { id: step!.id },
    data: {
      status: "in_progress",
      startedAt: new Date(),
    },
  });

  await emitStepUpdate(taskId, updated as TaskStepData);
  return updated as TaskStepData;
}

/**
 * Complete a step
 */
export async function completeStep(
  taskId: string,
  stepIdOrOrder: string | number
): Promise<TaskStepData | null> {
  let step;
  if (typeof stepIdOrOrder === "number") {
    step = await prisma.taskStep.findFirst({
      where: { taskId, order: stepIdOrOrder },
    });
    if (!step) return null;
  }

  const updated = await prisma.taskStep.update({
    where: typeof stepIdOrOrder === "string" ? { id: stepIdOrOrder } : { id: step!.id },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });

  await emitStepUpdate(taskId, updated as TaskStepData);
  return updated as TaskStepData;
}

/**
 * Fail a step
 */
export async function failStep(
  taskId: string,
  stepIdOrOrder: string | number,
  error?: string
): Promise<TaskStepData | null> {
  let step;
  if (typeof stepIdOrOrder === "number") {
    step = await prisma.taskStep.findFirst({
      where: { taskId, order: stepIdOrOrder },
    });
    if (!step) return null;
  }

  const updated = await prisma.taskStep.update({
    where: typeof stepIdOrOrder === "string" ? { id: stepIdOrOrder } : { id: step!.id },
    data: {
      status: "failed",
      completedAt: new Date(),
      metadata: error ? { error } : {},
    },
  });

  await emitStepUpdate(taskId, updated as TaskStepData);
  return updated as TaskStepData;
}

/**
 * Skip a step
 */
export async function skipStep(
  taskId: string,
  stepIdOrOrder: string | number,
  reason?: string
): Promise<TaskStepData | null> {
  let step;
  if (typeof stepIdOrOrder === "number") {
    step = await prisma.taskStep.findFirst({
      where: { taskId, order: stepIdOrOrder },
    });
    if (!step) return null;
  }

  const updated = await prisma.taskStep.update({
    where: typeof stepIdOrOrder === "string" ? { id: stepIdOrOrder } : { id: step!.id },
    data: {
      status: "skipped",
      completedAt: new Date(),
      metadata: reason ? { reason } : {},
    },
  });

  await emitStepUpdate(taskId, updated as TaskStepData);
  return updated as TaskStepData;
}

/**
 * Get progress summary for a task
 */
export async function getTaskProgress(taskId: string): Promise<{
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  inProgress: number;
  pending: number;
  percentage: number;
  currentStep: TaskStepData | null;
}> {
  const steps = await getTaskSteps(taskId);
  const total = steps.length;
  const completed = steps.filter((s) => s.status === "completed").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const inProgress = steps.filter((s) => s.status === "in_progress").length;
  const pending = steps.filter((s) => s.status === "pending").length;
  const currentStep = steps.find((s) => s.status === "in_progress") || null;

  const doneCount = completed + failed + skipped;
  const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return {
    total,
    completed,
    failed,
    skipped,
    inProgress,
    pending,
    percentage,
    currentStep,
  };
}

/**
 * Generate default execution steps based on task type and context
 */
export function generateDefaultSteps(
  taskType: string,
  hasTests: boolean = false,
  hasDryRun: boolean = false
): TaskStepInput[] {
  const steps: TaskStepInput[] = [
    { title: "Analyzing codebase", description: "Reading files and understanding context" },
    { title: "Planning changes", description: "Determining what modifications to make" },
    { title: "Implementing changes", description: "Writing and modifying code" },
  ];

  if (hasTests) {
    steps.push({ title: "Generating tests", description: "Creating test cases for changes" });
  }

  steps.push({ title: "Validating build", description: "Ensuring code compiles without errors" });

  if (hasDryRun) {
    steps.push({ title: "Preparing preview", description: "Generating diff preview for review" });
  } else {
    steps.push(
      { title: "Committing changes", description: "Creating git commits" },
      { title: "Creating pull request", description: "Opening PR for review" }
    );
  }

  return steps;
}

/**
 * Parse steps from Claude's response (looking for checklist patterns)
 */
export function parseStepsFromPlan(plan: string): TaskStepInput[] {
  const steps: TaskStepInput[] = [];

  // Look for markdown checkbox patterns: - [ ] Step or * [ ] Step
  const checkboxPattern = /^[\s]*[-*]\s*\[[ x]\]\s*(.+)$/gim;
  let match;
  while ((match = checkboxPattern.exec(plan)) !== null) {
    steps.push({ title: match[1].trim() });
  }

  // If no checkboxes found, look for numbered lists: 1. Step or 1) Step
  if (steps.length === 0) {
    const numberedPattern = /^\s*\d+[.)]\s*(.+)$/gim;
    while ((match = numberedPattern.exec(plan)) !== null) {
      const title = match[1].trim();
      // Skip items that look like file paths or code
      if (!title.includes("/") && !title.includes("```") && title.length < 100) {
        steps.push({ title });
      }
    }
  }

  // If still no steps, look for "Step N:" patterns
  if (steps.length === 0) {
    const stepPattern = /step\s*\d+[:.]\s*(.+)/gi;
    while ((match = stepPattern.exec(plan)) !== null) {
      steps.push({ title: match[1].trim() });
    }
  }

  return steps;
}

// Helper to emit step update via WebSocket
async function emitStepUpdate(taskId: string, step: TaskStepData): Promise<void> {
  await emitEvent("task:step:update", {
    taskId,
    step,
  });
}

// Helper to emit all steps via WebSocket
async function emitStepsUpdate(taskId: string, steps: TaskStepData[]): Promise<void> {
  const progress = await getTaskProgress(taskId);
  await emitEvent("task:steps", {
    taskId,
    steps,
    progress,
  });
}
