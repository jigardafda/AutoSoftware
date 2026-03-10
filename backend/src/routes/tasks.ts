import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";
import type { CreateTaskInput, UpdateTaskInput, SubmitAnswersInput } from "@autosoftware/shared";

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  app.get<{
    Querystring: {
      repositoryId?: string;
      status?: string;
      type?: string;
      priority?: string;
    };
  }>("/", async (request) => {
    const { repositoryId, status, type, priority } = request.query;
    const where: any = { userId: request.userId };
    if (repositoryId) where.repositoryId = repositoryId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (priority) where.priority = priority;

    const tasks = await prisma.task.findMany({
      where,
      include: { repository: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: tasks.map((t) => ({
        ...t,
        repositoryName: t.repository.fullName,
        repository: undefined,
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        repository: { select: { fullName: true } },
        planningQuestions: {
          orderBy: [{ round: "desc" }, { sortOrder: "asc" }],
        },
        logs: {
          orderBy: { createdAt: "asc" },
        },
        scanResult: {
          select: {
            id: true,
            scannedAt: true,
            status: true,
            summary: true,
            tasksCreated: true,
          },
        },
        externalLink: {
          include: {
            integrationLink: {
              include: {
                integration: { select: { provider: true, displayName: true } },
              },
            },
          },
        },
      },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
    return {
      data: {
        ...task,
        repositoryName: task.repository.fullName,
        planningRound: task.planningRound,
        enhancedPlan: task.enhancedPlan,
        planningQuestions: task.planningQuestions,
        logs: task.logs,
        scanResult: task.scanResult,
      },
    };
  });

  // GET /:id/logs - Poll for new task logs (for live streaming)
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/:id/logs",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: { id: true },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const { after } = request.query;
      const logs = await prisma.taskLog.findMany({
        where: {
          taskId: task.id,
          ...(after && {
            createdAt: { gt: new Date(after) },
          }),
        },
        orderBy: { createdAt: "asc" },
      });

      return { data: logs };
    }
  );

  app.post<{ Body: CreateTaskInput & { projectId?: string; skipPlanning?: boolean } }>("/", async (request, reply) => {
    const { repositoryId, title, description, type, priority, targetBranch, projectId, skipPlanning } = request.body;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    // Resolve effective branch: explicit targetBranch > projectRepo.branchOverride > project.defaultBranch > (null = uses repo.defaultBranch at runtime)
    let effectiveBranch: string | null = targetBranch || null;

    if (!effectiveBranch && projectId) {
      // Look up project-level branch settings
      const projectRepo = await prisma.projectRepository.findUnique({
        where: { projectId_repositoryId: { projectId, repositoryId } },
        include: { project: { select: { defaultBranch: true } } },
      });

      if (projectRepo) {
        effectiveBranch = projectRepo.branchOverride || projectRepo.project.defaultBranch || null;
      }
    }

    if (skipPlanning) {
      const task = await prisma.task.create({
        data: {
          repositoryId,
          userId: request.userId,
          title,
          description,
          type,
          priority,
          targetBranch: effectiveBranch,
          source: "manual",
          projectId: projectId || null,
        },
      });
      await schedulerService.queueTaskExecution(task.id);
      return reply.code(201).send({ data: task });
    }

    const task = await prisma.task.create({
      data: {
        repositoryId,
        userId: request.userId,
        title,
        description,
        type,
        priority,
        targetBranch: effectiveBranch,
        source: "manual",
        status: "planning",
        projectId: projectId || null,
      },
    });

    await schedulerService.queueTaskPlanning(task.id);

    return reply.code(201).send({ data: task });
  });

  app.patch<{ Params: { id: string }; Body: UpdateTaskInput }>(
    "/:id",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: request.body,
      });
      return { data: updated };
    }
  );

  app.post<{ Params: { id: string }; Body: SubmitAnswersInput }>(
    "/:id/answers",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
      if (task.status !== "awaiting_input") {
        return reply.code(400).send({ error: { message: "Task is not awaiting input" } });
      }

      const { answers } = request.body;
      for (const [questionKey, answer] of Object.entries(answers)) {
        await prisma.planningQuestion.updateMany({
          where: {
            taskId: task.id,
            questionKey,
            round: task.planningRound,
          },
          data: { answer: answer as any },
        });
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { status: "planning" },
      });

      await schedulerService.queueTaskPlanning(task.id);

      return { data: { success: true } };
    }
  );

  app.post<{ Params: { id: string } }>("/:id/plan", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
    if (!["pending", "planned", "failed"].includes(task.status)) {
      return reply.code(400).send({ error: { message: "Task cannot be planned in its current state" } });
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "planning", planningRound: 0, enhancedPlan: null, affectedFiles: "[]" },
    });

    await schedulerService.queueTaskPlanning(task.id);

    return { data: { success: true } };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    // Cancel running jobs by marking cancelled first so workers skip it
    if (["planning", "in_progress"].includes(task.status)) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "cancelled" },
      });
    }

    await prisma.task.delete({ where: { id: task.id } });
    return { data: { success: true } };
  });

  app.post<{ Body: { ids: string[] } }>("/bulk-delete", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user
    const tasks = await prisma.task.findMany({
      where: { id: { in: ids }, userId: request.userId },
      select: { id: true, status: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No matching tasks found" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Cancel any running/planning tasks so workers skip them
    const activeIds = tasks
      .filter((t) => ["planning", "in_progress"].includes(t.status))
      .map((t) => t.id);

    if (activeIds.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: activeIds } },
        data: { status: "cancelled" },
      });
    }

    // Delete all tasks (planning questions cascade)
    await prisma.task.deleteMany({
      where: { id: { in: taskIds } },
    });

    return { data: { deleted: taskIds.length } };
  });

  // Cancel a running task
  app.post<{ Params: { id: string } }>("/:id/cancel", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    if (!["pending", "planning", "in_progress", "awaiting_input", "planned"].includes(task.status)) {
      return reply.code(400).send({ error: { message: "Only active tasks can be cancelled" } });
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "cancelled" },
    });

    return { data: { success: true } };
  });

  // Retry a single failed task
  app.post<{ Params: { id: string } }>("/:id/retry", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    if (!["failed", "cancelled"].includes(task.status)) {
      return reply.code(400).send({ error: { message: "Only failed or cancelled tasks can be retried" } });
    }

    // Clear previous logs for clean retry
    await prisma.taskLog.deleteMany({ where: { taskId: task.id } });

    // Reset task state and re-queue for planning
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
        metadata: {},
      },
    });

    await schedulerService.queueTaskPlanning(task.id);

    return { data: { success: true } };
  });

  // Bulk retry failed/cancelled tasks
  app.post<{ Body: { ids: string[] } }>("/bulk-retry", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user and are retryable
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
        status: { in: ["failed", "cancelled"] },
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No retryable tasks found" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Clear previous logs for clean retry
    await prisma.taskLog.deleteMany({ where: { taskId: { in: taskIds } } });

    // Reset task states
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: {
        status: "planning",
        planningRound: 0,
        enhancedPlan: null,
        affectedFiles: "[]",
        pullRequestUrl: null,
        pullRequestStatus: null,
        completedAt: null,
        metadata: {},
      },
    });

    // Queue each task for planning
    for (const taskId of taskIds) {
      await schedulerService.queueTaskPlanning(taskId);
    }

    return { data: { retried: taskIds.length } };
  });

  // Bulk start planning for pending/planned tasks
  app.post<{ Body: { ids: string[] } }>("/bulk-plan", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user and are plannable
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
        status: { in: ["pending", "planned"] },
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No plannable tasks found (must be pending or planned)" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Reset task states for planning
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: {
        status: "planning",
        planningRound: 0,
        enhancedPlan: null,
        affectedFiles: "[]",
      },
    });

    // Queue each task for planning
    for (const taskId of taskIds) {
      await schedulerService.queueTaskPlanning(taskId);
    }

    return { data: { planned: taskIds.length } };
  });

  // Start execution for a single planned task
  app.post<{ Params: { id: string } }>("/:id/execute", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    if (task.status !== "planned") {
      return reply.code(400).send({ error: { message: "Only planned tasks can be executed" } });
    }

    await schedulerService.queueTaskExecution(task.id);

    return { data: { success: true } };
  });

  // Bulk execute planned tasks
  app.post<{ Body: { ids: string[] } }>("/bulk-execute", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user and are planned
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
        status: "planned",
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No planned tasks found" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Queue each task for execution
    for (const taskId of taskIds) {
      await schedulerService.queueTaskExecution(taskId);
    }

    return { data: { executed: taskIds.length } };
  });
};
