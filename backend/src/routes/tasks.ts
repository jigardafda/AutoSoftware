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

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "cancelled" },
    });
    return { data: { success: true } };
  });
};
