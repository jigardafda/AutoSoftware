/**
 * Batch Operations API Routes
 *
 * Endpoints for creating and managing batch operations across multiple repositories.
 * Supports "fix this in all microservices" type workflows.
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";
import type { TaskType, TaskPriority } from "@autosoftware/shared";

export interface CreateBatchInput {
  name: string;
  description: string;
  repositoryIds: string[];
  taskTemplate: {
    title: string;
    description: string;
    type: TaskType;
    priority: TaskPriority;
    targetBranch?: string;
  };
  executionMode?: "parallel" | "sequential";
  skipPlanning?: boolean;
  projectId?: string;
}

export interface BatchOperationDTO {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  executionMode: "parallel" | "sequential";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  tasks: {
    id: string;
    repositoryId: string;
    repositoryName: string;
    status: string;
    pullRequestUrl: string | null;
  }[];
}

export const batchRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // Create a new batch operation
  app.post<{ Body: CreateBatchInput }>("/tasks", async (request, reply) => {
    const {
      name,
      description,
      repositoryIds,
      taskTemplate,
      executionMode = "parallel",
      skipPlanning = false,
      projectId,
    } = request.body;

    // Validate input
    if (!repositoryIds || repositoryIds.length === 0) {
      return reply
        .code(400)
        .send({ error: { message: "At least one repository is required" } });
    }

    if (!taskTemplate?.title || !taskTemplate?.description) {
      return reply
        .code(400)
        .send({ error: { message: "Task template with title and description is required" } });
    }

    // Verify all repositories belong to the user
    const repos = await prisma.repository.findMany({
      where: {
        id: { in: repositoryIds },
        userId: request.userId,
      },
      select: { id: true, fullName: true, defaultBranch: true },
    });

    if (repos.length !== repositoryIds.length) {
      return reply
        .code(400)
        .send({ error: { message: "Some repositories were not found or don't belong to you" } });
    }

    // Create batch operation
    const batch = await prisma.batchOperation.create({
      data: {
        userId: request.userId,
        name,
        description,
        status: "pending",
        totalTasks: repos.length,
        executionMode,
        metadata: {
          taskTemplate,
          projectId,
          skipPlanning,
        },
      },
    });

    // Create tasks for each repository
    const tasks = await Promise.all(
      repos.map(async (repo) => {
        const task = await prisma.task.create({
          data: {
            repositoryId: repo.id,
            userId: request.userId,
            title: taskTemplate.title.replace("{{repo}}", repo.fullName),
            description: taskTemplate.description.replace("{{repo}}", repo.fullName),
            type: taskTemplate.type || "improvement",
            priority: taskTemplate.priority || "medium",
            targetBranch: taskTemplate.targetBranch || repo.defaultBranch,
            source: "manual",
            status: skipPlanning ? "pending" : "planning",
            projectId: projectId || null,
            metadata: { batchOperationId: batch.id },
          },
        });

        // Link task to batch
        await prisma.batchOperationTask.create({
          data: {
            batchOperationId: batch.id,
            taskId: task.id,
            repositoryId: repo.id,
            order: repos.indexOf(repo),
          },
        });

        return { task, repo };
      })
    );

    // Update batch status to in_progress
    await prisma.batchOperation.update({
      where: { id: batch.id },
      data: { status: "in_progress", startedAt: new Date() },
    });

    // Queue tasks based on execution mode
    if (executionMode === "parallel") {
      // Queue all tasks at once
      for (const { task } of tasks) {
        if (skipPlanning) {
          await schedulerService.queueTaskExecution(task.id);
        } else {
          await schedulerService.queueTaskPlanning(task.id);
        }
      }
    } else {
      // Queue only the first task (sequential mode)
      const firstTask = tasks[0];
      if (firstTask) {
        if (skipPlanning) {
          await schedulerService.queueTaskExecution(firstTask.task.id);
        } else {
          await schedulerService.queueTaskPlanning(firstTask.task.id);
        }
      }
    }

    return reply.code(201).send({
      data: {
        id: batch.id,
        name: batch.name,
        description: batch.description,
        status: batch.status,
        totalTasks: batch.totalTasks,
        completedTasks: 0,
        failedTasks: 0,
        executionMode: batch.executionMode,
        createdAt: batch.createdAt.toISOString(),
        startedAt: batch.startedAt?.toISOString() || null,
        completedAt: null,
        tasks: tasks.map(({ task, repo }) => ({
          id: task.id,
          repositoryId: repo.id,
          repositoryName: repo.fullName,
          status: task.status,
          pullRequestUrl: null,
        })),
      },
    });
  });

  // Get all batch operations for the user
  app.get("/", async (request) => {
    const batches = await prisma.batchOperation.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: "desc" },
      include: {
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                status: true,
                pullRequestUrl: true,
              },
            },
            repository: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    return {
      data: batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        description: batch.description,
        status: batch.status,
        totalTasks: batch.totalTasks,
        completedTasks: batch.tasks.filter((t) => t.task.status === "completed")
          .length,
        failedTasks: batch.tasks.filter((t) => t.task.status === "failed")
          .length,
        executionMode: batch.executionMode,
        createdAt: batch.createdAt.toISOString(),
        startedAt: batch.startedAt?.toISOString() || null,
        completedAt: batch.completedAt?.toISOString() || null,
        taskCount: batch.tasks.length,
      })),
    };
  });

  // Get a specific batch operation
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const batch = await prisma.batchOperation.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        tasks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                pullRequestUrl: true,
                createdAt: true,
                completedAt: true,
              },
            },
            repository: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!batch) {
      return reply.code(404).send({ error: { message: "Batch operation not found" } });
    }

    const completedTasks = batch.tasks.filter(
      (t) => t.task.status === "completed"
    ).length;
    const failedTasks = batch.tasks.filter(
      (t) => t.task.status === "failed"
    ).length;

    return {
      data: {
        id: batch.id,
        name: batch.name,
        description: batch.description,
        status: batch.status,
        totalTasks: batch.totalTasks,
        completedTasks,
        failedTasks,
        executionMode: batch.executionMode,
        createdAt: batch.createdAt.toISOString(),
        startedAt: batch.startedAt?.toISOString() || null,
        completedAt: batch.completedAt?.toISOString() || null,
        metadata: batch.metadata,
        tasks: batch.tasks.map((t) => ({
          id: t.task.id,
          title: t.task.title,
          repositoryId: t.repository.id,
          repositoryName: t.repository.fullName,
          status: t.task.status,
          pullRequestUrl: t.task.pullRequestUrl,
          createdAt: t.task.createdAt.toISOString(),
          completedAt: t.task.completedAt?.toISOString() || null,
          order: t.order,
        })),
      },
    };
  });

  // Cancel a batch operation
  app.post<{ Params: { id: string } }>("/:id/cancel", async (request, reply) => {
    const batch = await prisma.batchOperation.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        tasks: {
          include: {
            task: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!batch) {
      return reply.code(404).send({ error: { message: "Batch operation not found" } });
    }

    if (batch.status === "completed" || batch.status === "cancelled") {
      return reply.code(400).send({
        error: { message: "Batch operation is already completed or cancelled" },
      });
    }

    // Cancel all pending/in-progress tasks
    const activeTasks = batch.tasks.filter((t) =>
      ["pending", "planning", "in_progress", "awaiting_input", "planned"].includes(
        t.task.status
      )
    );

    await prisma.task.updateMany({
      where: {
        id: { in: activeTasks.map((t) => t.task.id) },
      },
      data: { status: "cancelled" },
    });

    // Update batch status
    await prisma.batchOperation.update({
      where: { id: batch.id },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    return { data: { success: true, cancelledTasks: activeTasks.length } };
  });

  // Retry failed tasks in a batch
  app.post<{ Params: { id: string } }>("/:id/retry", async (request, reply) => {
    const batch = await prisma.batchOperation.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        tasks: {
          include: {
            task: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!batch) {
      return reply.code(404).send({ error: { message: "Batch operation not found" } });
    }

    // Find failed tasks
    const failedTasks = batch.tasks.filter(
      (t) => t.task.status === "failed" || t.task.status === "cancelled"
    );

    if (failedTasks.length === 0) {
      return reply.code(400).send({ error: { message: "No failed tasks to retry" } });
    }

    // Clear logs and reset tasks
    for (const { task } of failedTasks) {
      await prisma.taskLog.deleteMany({ where: { taskId: task.id } });

      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: "planning",
          planningRound: 0,
          enhancedPlan: null,
          affectedFiles: "[]",
          pullRequestUrl: null,
          pullRequestStatus: null,
          completedAt: null,
          retryCount: 0,
        },
      });

      await schedulerService.queueTaskPlanning(task.id);
    }

    // Update batch status back to in_progress
    await prisma.batchOperation.update({
      where: { id: batch.id },
      data: {
        status: "in_progress",
        completedAt: null,
      },
    });

    return { data: { success: true, retriedTasks: failedTasks.length } };
  });

  // Delete a batch operation
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const batch = await prisma.batchOperation.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        tasks: {
          include: {
            task: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!batch) {
      return reply.code(404).send({ error: { message: "Batch operation not found" } });
    }

    // Cancel any active tasks first
    const activeTasks = batch.tasks.filter((t) =>
      ["pending", "planning", "in_progress", "awaiting_input"].includes(
        t.task.status
      )
    );

    if (activeTasks.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: activeTasks.map((t) => t.task.id) } },
        data: { status: "cancelled" },
      });
    }

    // Delete tasks (cascade will handle batch operation tasks)
    await prisma.task.deleteMany({
      where: { id: { in: batch.tasks.map((t) => t.task.id) } },
    });

    // Delete batch operation
    await prisma.batchOperation.delete({
      where: { id: batch.id },
    });

    return { data: { success: true } };
  });

  // Get batch operation statistics
  app.get("/stats", async (request) => {
    const [total, inProgress, completed, failed] = await Promise.all([
      prisma.batchOperation.count({
        where: { userId: request.userId },
      }),
      prisma.batchOperation.count({
        where: { userId: request.userId, status: "in_progress" },
      }),
      prisma.batchOperation.count({
        where: { userId: request.userId, status: "completed" },
      }),
      prisma.batchOperation.count({
        where: { userId: request.userId, status: "failed" },
      }),
    ]);

    return {
      data: {
        total,
        inProgress,
        completed,
        failed,
        successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    };
  });
};
