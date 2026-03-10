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
        scanResult: task.scanResult,
      },
    };
  });

  app.post<{ Body: CreateTaskInput & { projectId?: string; skipPlanning?: boolean } }>("/", async (request, reply) => {
    const { repositoryId, title, description, type, priority, projectId, skipPlanning } = request.body;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    if (skipPlanning) {
      const task = await prisma.task.create({
        data: {
          repositoryId,
          userId: request.userId,
          title,
          description,
          type,
          priority,
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
};
