import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { listRemoteRepos } from "../services/git-providers.js";
import { schedulerService } from "../services/scheduler.js";
import type { ConnectRepoInput, UpdateRepoInput, OAuthProvider } from "@autosoftware/shared";

export const repoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  app.get("/", async (request) => {
    const repos = await prisma.repository.findMany({
      where: { userId: request.userId },
      orderBy: { updatedAt: "desc" },
    });
    return { data: repos };
  });

  app.get<{ Params: { provider: string } }>(
    "/available/:provider",
    async (request, reply) => {
      const { provider } = request.params;
      const account = await prisma.account.findFirst({
        where: { userId: request.userId, provider: provider as OAuthProvider },
      });
      if (!account) {
        return reply.code(404).send({ error: { message: "Provider not connected" } });
      }
      const repos = await listRemoteRepos(provider as OAuthProvider, account.accessToken);
      return { data: repos };
    }
  );

  app.post<{ Body: ConnectRepoInput }>("/", async (request, reply) => {
    const { provider, providerRepoId, fullName, cloneUrl, defaultBranch } = request.body;

    const existing = await prisma.repository.findUnique({
      where: { provider_providerRepoId: { provider, providerRepoId } },
    });
    if (existing) {
      return reply.code(409).send({ error: { message: "Repository already connected" } });
    }

    const repo = await prisma.repository.create({
      data: {
        userId: request.userId,
        provider,
        providerRepoId,
        fullName,
        cloneUrl,
        defaultBranch: defaultBranch || "main",
      },
    });

    await schedulerService.triggerScan(repo.id);

    return reply.code(201).send({ data: repo });
  });

  app.patch<{ Params: { id: string }; Body: UpdateRepoInput }>(
    "/:id",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      const updated = await prisma.repository.update({
        where: { id: repo.id },
        data: request.body,
      });

      if (request.body.scanInterval !== undefined || request.body.isActive !== undefined) {
        if (updated.isActive) {
          await schedulerService.scheduleRepoScan(updated.id, updated.scanInterval);
        } else {
          await schedulerService.cancelRepoScan(updated.id);
        }
      }

      return { data: updated };
    }
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    await schedulerService.cancelRepoScan(repo.id);
    await prisma.repository.delete({ where: { id: repo.id } });
    return { data: { success: true } };
  });

  app.post<{ Params: { id: string } }>("/:id/scan", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    await schedulerService.triggerScan(repo.id);
    return { data: { queued: true } };
  });

  app.get<{ Params: { id: string } }>("/:id/scans", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    const scans = await prisma.scanResult.findMany({
      where: { repositoryId: repo.id },
      orderBy: { scannedAt: "desc" },
      take: 20,
    });
    return { data: scans };
  });
};
