import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

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
