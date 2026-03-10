import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";
import type { CreateTaskInput, UpdateTaskInput } from "@autosoftware/shared";

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
      include: { repository: { select: { fullName: true } } },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
    return { data: { ...task, repositoryName: task.repository.fullName } };
  });

  app.post<{ Body: CreateTaskInput & { projectId?: string } }>("/", async (request, reply) => {
    const { repositoryId, title, description, type, priority, projectId } = request.body;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

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
