import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  app.get<{ Querystring: { type?: string; limit?: string } }>(
    "/",
    async (request) => {
      const { type, limit } = request.query;
      const take = Math.min(parseInt(limit || "50"), 100);

      // First try ActivityEvent table
      const events = await prisma.activityEvent.findMany({
        where: {
          userId: request.userId,
          ...(type ? { type } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
      });

      // If no events in table, derive from tasks
      if (events.length === 0) {
        const tasks = await prisma.task.findMany({
          where: { userId: request.userId },
          include: { repository: { select: { fullName: true } } },
          orderBy: { updatedAt: "desc" },
          take,
        });

        const derived = tasks.map((t) => ({
          id: t.id,
          userId: t.userId,
          type: `task_${t.status === "in_progress" ? "started" : t.status === "completed" ? "completed" : t.status === "failed" ? "failed" : "created"}`,
          entityId: t.id,
          entityType: "task" as const,
          title: `${t.status === "completed" ? "Completed" : t.status === "failed" ? "Failed" : t.status === "in_progress" ? "Started" : "Created"}: ${t.title}`,
          metadata: { repoName: t.repository.fullName },
          createdAt: t.updatedAt,
        }));

        return { data: derived };
      }

      return { data: events };
    }
  );
};
