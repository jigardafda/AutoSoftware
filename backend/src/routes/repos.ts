import type { FastifyPluginAsync } from "fastify";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "../db.js";
import { listRemoteRepos, listRemoteBranches, listPullRequests } from "../services/git-providers.js";
import { schedulerService } from "../services/scheduler.js";
import { listDirectory, readFile, safePath, getCurrentBranch, checkoutBranch, RepoFsError } from "../services/repo-fs.js";
import { config } from "../config.js";
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

      // For local repos, list branches directly from the git repo on disk
      if (repo.provider === "local") {
        try {
          const { simpleGit } = await import("simple-git");
          const git = simpleGit(repo.cloneUrl);
          const branchSummary = await git.branch();
          const branches = branchSummary.all
            .filter((name) => !name.startsWith("remotes/"))
            .map((name) => ({
              name,
              isDefault: name === repo.defaultBranch,
            }))
            .sort((a, b) => {
              if (a.isDefault) return -1;
              if (b.isDefault) return 1;
              return a.name.localeCompare(b.name);
            });
          return { data: branches };
        } catch (err: any) {
          return reply.code(500).send({ error: { message: `Failed to list branches: ${err.message}` } });
        }
      }

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

  // GET /:id/pull-requests — list open PRs for a repository
  app.get<{ Params: { id: string }; Querystring: { state?: string } }>(
    "/:id/pull-requests",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

      if (repo.provider === "local") {
        return reply.code(400).send({ error: { message: "Pull requests not available for local repos" } });
      }

      const account = await prisma.account.findFirst({
        where: { userId: request.userId, provider: repo.provider },
      });

      // accessToken can be empty — listPullRequests → resolveGitHubToken will try gh CLI
      const accessToken = account?.accessToken || "";
      const state = (request.query.state as "open" | "closed" | "all") || "open";

      try {
        const prs = await listPullRequests(repo.provider, accessToken, repo.fullName, state);
        return { data: prs };
      } catch (err: any) {
        if (err.message?.includes("Rate limited")) {
          return reply.code(429).send({ error: { message: err.message } });
        }
        return reply.code(500).send({ error: { message: err.message } });
      }
    }
  );

  // Connect a local folder as a repository
  app.post<{ Body: { path: string } }>("/connect-local", async (request, reply) => {
    const { path: localPath } = request.body;
    if (!localPath) {
      return reply.code(400).send({ error: { message: "Path is required" } });
    }

    const { resolve, join, basename } = await import("path");
    const { access: fsAccess } = await import("fs/promises");
    const resolved = resolve(localPath);

    // Validate it exists
    try {
      await fsAccess(resolved);
    } catch {
      return reply.code(400).send({ error: { message: "Path does not exist" } });
    }

    // Validate it's a git repo
    try {
      await fsAccess(join(resolved, ".git"));
    } catch {
      return reply.code(400).send({ error: { message: "Not a git repository. The selected folder must contain a .git directory." } });
    }

    const name = basename(resolved);

    // Detect the current branch as default
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(resolved);
    let defaultBranch = "main";
    try {
      const branchSummary = await git.branch();
      defaultBranch = branchSummary.current || "main";
    } catch {}

    // Check if already connected
    const existing = await prisma.repository.findFirst({
      where: { userId: request.userId, cloneUrl: resolved, provider: "local" },
    });
    if (existing) {
      return reply.code(409).send({ error: { message: "This folder is already connected" } });
    }

    const repo = await prisma.repository.create({
      data: {
        userId: request.userId,
        provider: "local",
        providerRepoId: resolved,
        fullName: name,
        cloneUrl: resolved,
        defaultBranch,
      },
    });

    return reply.code(201).send({ data: repo });
  });

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

  // Get single repo
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const repo = await prisma.repository.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });
    return { data: repo };
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
        // For local repos, use the local path directly instead of the cloned repo dir
        const rootOverride = repo.provider === "local" ? repo.cloneUrl : undefined;

        // If a branch is specified, checkout that branch first
        if (requestedBranch) {
          await checkoutBranch(repo.id, requestedBranch, rootOverride);
        }

        const [entries, branch] = await Promise.all([
          listDirectory(repo.id, requestedPath, rootOverride),
          !requestedPath ? getCurrentBranch(repo.id, rootOverride) : Promise.resolve(undefined),
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
          const message = repo.provider === "local"
            ? "Directory not found. The local path may have been moved or deleted."
            : "Repository files not available. Trigger a scan to clone it.";
          return reply.code(404).send({ error: { message } });
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
        const rootOverride = repo.provider === "local" ? repo.cloneUrl : undefined;
        const resolved = safePath(repo.id, filePath, rootOverride);
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
        const rootOverride = repo.provider === "local" ? repo.cloneUrl : undefined;
        // If a branch is specified, checkout that branch first
        const requestedBranch = request.query.branch;
        if (requestedBranch) {
          await checkoutBranch(repo.id, requestedBranch, rootOverride);
        }

        const result = await readFile(repo.id, filePath, rootOverride);
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

  // POST /:id/test-script — Run a script in the repo dir and stream output
  app.post<{ Params: { id: string }; Body: { script: string } }>(
    "/:id/test-script",
    async (request, reply) => {
      const repo = await prisma.repository.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: "Repo not found" });

      const script = request.body?.script;
      if (!script) return reply.code(400).send({ error: "No script provided" });

      // Determine the repo directory
      const repoDirectory = repo.provider === "local"
        ? repo.cloneUrl
        : path.join(config.workDir, "repos", repo.fullName.replace("/", "-"));

      // Verify directory exists
      try {
        await fs.access(repoDirectory);
      } catch {
        return reply.code(400).send({
          error: `Repository directory not found: ${repoDirectory}. Try creating a workspace first.`,
        });
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const child = spawn("bash", ["-c", script], {
        cwd: repoDirectory,
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (data: Buffer) => {
        reply.raw.write(data);
      });

      child.stderr.on("data", (data: Buffer) => {
        reply.raw.write(data);
      });

      // Kill the process after 15 seconds (dev servers run forever)
      const timeout = setTimeout(() => {
        reply.raw.write("\n--- Process running (stopped log capture after 15s) ---\n");
        child.kill("SIGTERM");
      }, 15_000);

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== null && code !== 0) {
          reply.raw.write(`\n--- Exited with code ${code} ---\n`);
        }
        reply.raw.end();
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reply.raw.write(`\nError: ${err.message}\n`);
        reply.raw.end();
      });
    }
  );
};
