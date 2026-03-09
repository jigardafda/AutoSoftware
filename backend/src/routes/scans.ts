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
      include: { repository: { select: { userId: true } } },
    });
    if (!scan || scan.repository.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Scan not found" } });
    }
    return { data: scan };
  });
};
