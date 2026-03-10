import type { FastifyPluginAsync } from "fastify";
import fs from "fs/promises";
import { prisma } from "../db.js";
import { listRemoteRepos, listRemoteBranches } from "../services/git-providers.js";
import { schedulerService } from "../services/scheduler.js";
import { listDirectory, readFile, safePath, getCurrentBranch, checkoutBranch, RepoFsError } from "../services/repo-fs.js";
import type { ConnectRepoInput, UpdateRepoInput, OAuthProvider } from "@autosoftware/shared";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  pdf: "application/pdf",
};

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

  // GET /:id/branches — list branches for a repository
  app.get<{ Params: { id: string } }>(
    "/:id/branches",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      const account = await prisma.account.findFirst({
        where: { userId: request.userId, provider: repo.provider },
      });
      if (!account) {
        return reply.code(400).send({ error: { message: "Provider not connected" } });
      }

      try {
        const branches = await listRemoteBranches(
          repo.provider,
          account.accessToken,
          repo.fullName,
          repo.defaultBranch
        );
        return { data: branches };
      } catch (err: any) {
        if (err.message?.includes("Rate limited")) {
          return reply.code(429).send({ error: { message: err.message } });
        }
        throw err;
      }
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
        data: request.body as any,
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

  app.post<{ Params: { id: string }; Body: { projectId?: string; branch?: string } }>("/:id/scan", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    await schedulerService.triggerScan(repo.id, request.body?.projectId, request.body?.branch);
    return { data: { queued: true } };
  });

  // GET /:id/stats — aggregated stats for repo detail page
  app.get<{ Params: { id: string } }>("/:id/stats", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    const [tasks, scans, tasksByStatus, tasksByType, scansByStatus] = await Promise.all([
      prisma.task.findMany({
        where: { repositoryId: repo.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.scanResult.findMany({
        where: { repositoryId: repo.id },
        orderBy: { scannedAt: "desc" },
        take: 30,
      }),
      prisma.task.groupBy({
        by: ["status"],
        where: { repositoryId: repo.id },
        _count: { id: true },
      }),
      prisma.task.groupBy({
        by: ["type"],
        where: { repositoryId: repo.id },
        _count: { id: true },
      }),
      prisma.scanResult.groupBy({
        by: ["status"],
        where: { repositoryId: repo.id },
        _count: { id: true },
      }),
    ]);

    // Aggregate usage directly from tasks (always recorded regardless of API key source)
    const totalInputTokens = tasks.reduce((s, t) => s + t.inputTokens, 0);
    const totalOutputTokens = tasks.reduce((s, t) => s + t.outputTokens, 0);
    const totalCost = tasks.reduce((s, t) => s + t.estimatedCostUsd, 0);
    const totalRequests = tasks.filter((t) => t.inputTokens > 0 || t.outputTokens > 0).length;

    // Daily cost aggregation from tasks
    const dailyCost = new Map<string, number>();
    for (const t of tasks) {
      if (t.estimatedCostUsd > 0) {
        const day = t.createdAt.toISOString().slice(0, 10);
        dailyCost.set(day, (dailyCost.get(day) || 0) + t.estimatedCostUsd);
      }
    }

    return {
      data: {
        repo,
        tasks,
        scans,
        tasksByStatus: tasksByStatus.map((g) => ({ status: g.status, count: g._count.id })),
        tasksByType: tasksByType.map((g) => ({ type: g.type, count: g._count.id })),
        scansByStatus: scansByStatus.map((g) => ({ status: g.status, count: g._count.id })),
        usage: {
          totalInputTokens,
          totalOutputTokens,
          totalCost,
          totalRequests,
          daily: Array.from(dailyCost.entries()).map(([date, cost]) => ({ date, cost })),
        },
      },
    };
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

  // GET /:id/tree — list directory contents for file browser
  app.get<{ Params: { id: string }; Querystring: { path?: string; branch?: string } }>(
    "/:id/tree",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      try {
        const requestedPath = request.query.path || "";
        const requestedBranch = request.query.branch;

        // If a branch is specified, checkout that branch first
        if (requestedBranch) {
          await checkoutBranch(repo.id, requestedBranch);
        }

        const [entries, branch] = await Promise.all([
          listDirectory(repo.id, requestedPath),
          !requestedPath ? getCurrentBranch(repo.id) : Promise.resolve(undefined),
        ]);
        return { data: entries, ...(branch !== undefined && { branch }) };
      } catch (err: any) {
        if (err instanceof RepoFsError && err.code === "PATH_TRAVERSAL") {
          return reply.code(400).send({ error: { message: "Invalid path" } });
        }
        if (err instanceof RepoFsError && err.code === "INVALID_BRANCH") {
          return reply.code(400).send({ error: { message: "Invalid branch name" } });
        }
        if (err.code === "ENOENT" || err.code === "ENOTDIR") {
          return reply.code(404).send({
            error: { message: "Repository files not available. Trigger a scan to clone it." },
          });
        }
        throw err;
      }
    },
  );

  // GET /:id/raw — serve raw file bytes (images, PDFs)
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/:id/raw",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      const filePath = request.query.path;
      if (!filePath) {
        return reply.code(400).send({ error: { message: "Query parameter 'path' is required" } });
      }

      try {
        const resolved = safePath(repo.id, filePath);
        const stat = await fs.lstat(resolved);
        if (!stat.isFile()) {
          return reply.code(400).send({ error: { message: "Not a file" } });
        }

        // 10MB limit for raw serving
        if (stat.size > 10 * 1024 * 1024) {
          return reply.code(413).send({ error: { message: "File too large" } });
        }

        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        const mime = MIME_TYPES[ext] || "application/octet-stream";

        const buffer = await fs.readFile(resolved);
        return reply
          .header("Content-Type", mime)
          .header("Content-Length", stat.size)
          .header("Cache-Control", "private, max-age=300")
          .send(buffer);
      } catch (err: any) {
        if (err instanceof RepoFsError && err.code === "PATH_TRAVERSAL") {
          return reply.code(400).send({ error: { message: "Invalid path" } });
        }
        if (err.code === "ENOENT") {
          return reply.code(404).send({ error: { message: "File not found" } });
        }
        throw err;
      }
    },
  );

  // GET /:id/file — read file content for file browser
  app.get<{ Params: { id: string }; Querystring: { path?: string; branch?: string } }>(
    "/:id/file",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      const filePath = request.query.path;
      if (!filePath) {
        return reply.code(400).send({ error: { message: "Query parameter 'path' is required" } });
      }

      try {
        // If a branch is specified, checkout that branch first
        const requestedBranch = request.query.branch;
        if (requestedBranch) {
          await checkoutBranch(repo.id, requestedBranch);
        }

        const result = await readFile(repo.id, filePath);
        return { data: result };
      } catch (err: any) {
        if (err instanceof RepoFsError && err.code === "PATH_TRAVERSAL") {
          return reply.code(400).send({ error: { message: "Invalid path" } });
        }
        if (err instanceof RepoFsError && err.code === "INVALID_BRANCH") {
          return reply.code(400).send({ error: { message: "Invalid branch name" } });
        }
        if (err.code === "ENOENT") {
          return reply.code(404).send({ error: { message: "File not found" } });
        }
        if (err.code === "EISDIR") {
          return reply.code(400).send({ error: { message: "Path is a directory, not a file" } });
        }
        throw err;
      }
    },
  );
};
