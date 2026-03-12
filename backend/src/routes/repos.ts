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

    const scanResult = await schedulerService.triggerScan(repo.id, request.body?.projectId, request.body?.branch);
    return { data: { queued: true, scan: scanResult } };
  });

  // GET /:id/stats — aggregated stats for repo detail page
  app.get<{ Params: { id: string } }>("/:id/stats", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    const [tasks, scans, tasksByStatus, tasksByType, scansByStatus, latestCompletedScan] = await Promise.all([
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
      // Fetch latest completed scan with full code analysis data
      prisma.scanResult.findFirst({
        where: { repositoryId: repo.id, status: "completed" },
        orderBy: { completedAt: "desc" },
        include: {
          codeAnalysis: true,
        },
      }),
    ]);

    // Aggregate usage from both tasks AND scans
    const taskInputTokens = tasks.reduce((s, t) => s + t.inputTokens, 0);
    const taskOutputTokens = tasks.reduce((s, t) => s + t.outputTokens, 0);
    const taskCost = tasks.reduce((s, t) => s + t.estimatedCostUsd, 0);
    const taskRequests = tasks.filter((t) => t.inputTokens > 0 || t.outputTokens > 0).length;

    const scanInputTokens = scans.reduce((s, sc) => s + sc.inputTokens, 0);
    const scanOutputTokens = scans.reduce((s, sc) => s + sc.outputTokens, 0);
    const scanCost = scans.reduce((s, sc) => s + sc.estimatedCostUsd, 0);
    const scanRequests = scans.filter((sc) => sc.inputTokens > 0 || sc.outputTokens > 0).length;

    const totalInputTokens = taskInputTokens + scanInputTokens;
    const totalOutputTokens = taskOutputTokens + scanOutputTokens;
    const totalCost = taskCost + scanCost;
    const totalRequests = taskRequests + scanRequests;

    // Daily aggregation from tasks and scans (cost + tokens)
    const dailyData = new Map<string, { cost: number; inputTokens: number; outputTokens: number }>();
    for (const t of tasks) {
      if (t.estimatedCostUsd > 0 || t.inputTokens > 0 || t.outputTokens > 0) {
        const day = t.createdAt.toISOString().slice(0, 10);
        const existing = dailyData.get(day) || { cost: 0, inputTokens: 0, outputTokens: 0 };
        dailyData.set(day, {
          cost: existing.cost + t.estimatedCostUsd,
          inputTokens: existing.inputTokens + t.inputTokens,
          outputTokens: existing.outputTokens + t.outputTokens,
        });
      }
    }
    for (const sc of scans) {
      if (sc.estimatedCostUsd > 0 || sc.inputTokens > 0 || sc.outputTokens > 0) {
        const day = sc.scannedAt.toISOString().slice(0, 10);
        const existing = dailyData.get(day) || { cost: 0, inputTokens: 0, outputTokens: 0 };
        dailyData.set(day, {
          cost: existing.cost + sc.estimatedCostUsd,
          inputTokens: existing.inputTokens + sc.inputTokens,
          outputTokens: existing.outputTokens + sc.outputTokens,
        });
      }
    }

    // Sort by date
    const dailySorted = Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

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
          daily: dailySorted,
        },
        // Latest completed scan with code analysis for the Analysis tab
        latestAnalysis: latestCompletedScan ? {
          scanId: latestCompletedScan.id,
          completedAt: latestCompletedScan.completedAt,
          primaryLanguage: latestCompletedScan.primaryLanguage,
          languageProfile: latestCompletedScan.languageProfile,
          codeAnalysis: latestCompletedScan.codeAnalysis,
        } : null,
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
