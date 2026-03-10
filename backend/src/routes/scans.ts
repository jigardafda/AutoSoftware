import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // List all scans for the authenticated user
  app.get("/", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }
    const scans = await prisma.scanResult.findMany({
      where: {
        repository: { userId: request.userId },
      },
      include: { repository: { select: { fullName: true, provider: true } } },
      orderBy: { scannedAt: "desc" },
      take: 50,
    });
    return { data: scans };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const scan = await prisma.scanResult.findUnique({
      where: { id: request.params.id },
      include: {
        repository: { select: { userId: true, fullName: true, provider: true } },
        tasks: {
          select: { id: true, title: true, type: true, priority: true, status: true },
          orderBy: { createdAt: "asc" },
        },
        logs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!scan || scan.repository.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Scan not found" } });
    }
    return { data: scan };
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/:id/logs",
    async (request, reply) => {
      const scan = await prisma.scanResult.findUnique({
        where: { id: request.params.id },
        include: { repository: { select: { userId: true } } },
      });
      if (!scan || scan.repository.userId !== request.userId) {
        return reply.code(404).send({ error: { message: "Scan not found" } });
      }

      const where: any = { scanResultId: scan.id };
      if (request.query.after) {
        const afterLog = await prisma.scanLog.findUnique({
          where: { id: request.query.after },
          select: { createdAt: true },
        });
        if (afterLog) {
          where.createdAt = { gt: afterLog.createdAt };
        }
      }

      const logs = await prisma.scanLog.findMany({
        where,
        orderBy: { createdAt: "asc" },
      });
      return { data: logs };
    }
  );

  // Cancel a scan in progress
  app.post<{ Params: { id: string } }>("/:id/cancel", async (request, reply) => {
    const scan = await prisma.scanResult.findUnique({
      where: { id: request.params.id },
      include: { repository: { select: { id: true, userId: true } } },
    });
    if (!scan || scan.repository.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Scan not found" } });
    }

    if (scan.status !== "in_progress") {
      return reply.code(400).send({ error: { message: "Scan is not in progress" } });
    }

    // Mark the scan as cancelled
    await prisma.scanResult.update({
      where: { id: scan.id },
      data: {
        status: "cancelled",
        summary: "Scan cancelled by user",
      },
    });

    // Reset repository status to idle
    await prisma.repository.update({
      where: { id: scan.repository.id },
      data: { status: "idle" },
    });

    // Log the cancellation
    await prisma.scanLog.create({
      data: {
        scanResultId: scan.id,
        level: "info",
        message: "Scan cancelled by user",
      },
    });

    return { data: { success: true } };
  });
};
