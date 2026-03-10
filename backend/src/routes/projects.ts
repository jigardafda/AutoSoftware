import type { FastifyPluginAsync } from "fastify";
import type { UpdateEmbedConfigInput } from "@autosoftware/shared";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // List projects
  app.get("/", async (request) => {
    const projects = await prisma.project.findMany({
      where: { userId: request.userId },
      include: {
        _count: {
          select: { repositories: true, documents: true, tasks: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      data: projects.map((p) => ({
        ...p,
        repoCount: p._count.repositories,
        docCount: p._count.documents,
        taskCount: p._count.tasks,
        _count: undefined,
      })),
    };
  });

  // Create project
  app.post<{ Body: { name: string; description?: string } }>("/", async (request, reply) => {
    const { name, description } = request.body;
    if (!name?.trim()) {
      return reply.code(400).send({ error: { message: "Name is required" } });
    }
    const project = await prisma.project.create({
      data: {
        userId: request.userId,
        name: name.trim(),
        description: description?.trim() || "",
      },
    });
    return reply.code(201).send({ data: project });
  });

  // Get project detail
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        repositories: {
          include: {
            repository: {
              select: {
                id: true,
                fullName: true,
                provider: true,
                status: true,
                lastScannedAt: true,
                isActive: true,
              },
            },
          },
          orderBy: { addedAt: "desc" },
        },
        documents: {
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: { repositories: true, documents: true, tasks: true },
        },
      },
    });
    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });
    return {
      data: {
        ...project,
        repos: project.repositories.map((pr) => ({
          ...pr.repository,
          addedAt: pr.addedAt,
        })),
        repoCount: project._count.repositories,
        docCount: project._count.documents,
        taskCount: project._count.tasks,
        repositories: undefined,
        _count: undefined,
      },
    };
  });

  // Update project
  app.patch<{ Params: { id: string }; Body: { name?: string; description?: string } }>(
    "/:id",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const data: any = {};
      if (request.body.name !== undefined) data.name = request.body.name.trim();
      if (request.body.description !== undefined) data.description = request.body.description.trim();

      const updated = await prisma.project.update({
        where: { id: project.id },
        data,
      });
      return { data: updated };
    }
  );

  // Delete project
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

    await prisma.project.delete({ where: { id: project.id } });
    return { data: { success: true } };
  });

  // Project stats
  app.get<{ Params: { id: string } }>("/:id/stats", async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        repositories: { select: { repositoryId: true } },
      },
    });
    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

    const repoIds = project.repositories.map((r) => r.repositoryId);

    if (repoIds.length === 0) {
      return {
        data: {
          tasksByStatus: [],
          tasksByType: [],
          scansByStatus: [],
          totalTasks: 0,
          totalScans: 0,
          usage: { totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, totalRequests: 0, daily: [] },
        },
      };
    }

    const [tasksByStatus, tasksByType, scansByStatus, tasks] = await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: { repositoryId: { in: repoIds } },
        _count: { id: true },
      }),
      prisma.task.groupBy({
        by: ["type"],
        where: { repositoryId: { in: repoIds } },
        _count: { id: true },
      }),
      prisma.scanResult.groupBy({
        by: ["status"],
        where: { repositoryId: { in: repoIds } },
        _count: { id: true },
      }),
      prisma.task.findMany({
        where: { repositoryId: { in: repoIds } },
        select: { id: true },
      }),
    ]);

    const taskIds = tasks.map((t) => t.id);
    const usage = await prisma.apiKeyUsage.findMany({
      where: {
        OR: [
          { source: "scan", sourceId: { in: repoIds } },
          ...(taskIds.length > 0 ? [{ source: "task", sourceId: { in: taskIds } }] : []),
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    const totalInputTokens = usage.reduce((s, u) => s + u.inputTokens, 0);
    const totalOutputTokens = usage.reduce((s, u) => s + u.outputTokens, 0);
    const totalCost = usage.reduce((s, u) => s + u.estimatedCostUsd, 0);

    const dailyCost = new Map<string, number>();
    for (const u of usage) {
      const day = u.createdAt.toISOString().slice(0, 10);
      dailyCost.set(day, (dailyCost.get(day) || 0) + u.estimatedCostUsd);
    }

    const totalTasks = tasksByStatus.reduce((s, g) => s + g._count.id, 0);
    const totalScans = scansByStatus.reduce((s, g) => s + g._count.id, 0);

    return {
      data: {
        tasksByStatus: tasksByStatus.map((g) => ({ status: g.status, count: g._count.id })),
        tasksByType: tasksByType.map((g) => ({ type: g.type, count: g._count.id })),
        scansByStatus: scansByStatus.map((g) => ({ status: g.status, count: g._count.id })),
        totalTasks,
        totalScans,
        usage: {
          totalInputTokens,
          totalOutputTokens,
          totalCost,
          totalRequests: usage.length,
          daily: Array.from(dailyCost.entries()).map(([date, cost]) => ({ date, cost })),
        },
      },
    };
  });

  // Add repo to project
  app.post<{ Params: { id: string }; Body: { repositoryId: string } }>(
    "/:id/repos",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const repo = await prisma.repository.findFirst({
        where: { id: request.body.repositoryId, userId: request.userId },
      });
      if (!repo) return reply.code(404).send({ error: { message: "Repository not found" } });

      const existing = await prisma.projectRepository.findUnique({
        where: { projectId_repositoryId: { projectId: project.id, repositoryId: repo.id } },
      });
      if (existing) {
        return reply.code(409).send({ error: { message: "Repository already in project" } });
      }

      const pr = await prisma.projectRepository.create({
        data: { projectId: project.id, repositoryId: repo.id },
      });
      return reply.code(201).send({ data: pr });
    }
  );

  // Remove repo from project
  app.delete<{ Params: { id: string; repoId: string } }>(
    "/:id/repos/:repoId",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const pr = await prisma.projectRepository.findUnique({
        where: { projectId_repositoryId: { projectId: project.id, repositoryId: request.params.repoId } },
      });
      if (!pr) return reply.code(404).send({ error: { message: "Repository not in project" } });

      await prisma.projectRepository.delete({ where: { id: pr.id } });
      return { data: { success: true } };
    }
  );

  // List documents
  app.get<{ Params: { id: string } }>("/:id/documents", async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

    const documents = await prisma.projectDocument.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: "asc" },
    });
    return { data: documents };
  });

  // Create document
  app.post<{ Params: { id: string }; Body: { title: string; content?: string } }>(
    "/:id/documents",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const maxSort = await prisma.projectDocument.aggregate({
        where: { projectId: project.id },
        _max: { sortOrder: true },
      });

      const doc = await prisma.projectDocument.create({
        data: {
          projectId: project.id,
          title: request.body.title,
          content: request.body.content || "",
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });
      return reply.code(201).send({ data: doc });
    }
  );

  // Update document
  app.patch<{ Params: { id: string; docId: string }; Body: { title?: string; content?: string; sortOrder?: number } }>(
    "/:id/documents/:docId",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const doc = await prisma.projectDocument.findFirst({
        where: { id: request.params.docId, projectId: project.id },
      });
      if (!doc) return reply.code(404).send({ error: { message: "Document not found" } });

      const data: any = {};
      if (request.body.title !== undefined) data.title = request.body.title;
      if (request.body.content !== undefined) data.content = request.body.content;
      if (request.body.sortOrder !== undefined) data.sortOrder = request.body.sortOrder;

      const updated = await prisma.projectDocument.update({
        where: { id: doc.id },
        data,
      });
      return { data: updated };
    }
  );

  // Delete document
  app.delete<{ Params: { id: string; docId: string } }>(
    "/:id/documents/:docId",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const doc = await prisma.projectDocument.findFirst({
        where: { id: request.params.docId, projectId: project.id },
      });
      if (!doc) return reply.code(404).send({ error: { message: "Document not found" } });

      await prisma.projectDocument.delete({ where: { id: doc.id } });
      return { data: { success: true } };
    }
  );

  // Get embed config
  app.get<{ Params: { id: string } }>("/:id/embed-config", async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

    let config = await prisma.embedConfig.findUnique({
      where: { projectId: project.id },
    });

    if (!config) {
      config = await prisma.embedConfig.create({
        data: { projectId: project.id },
      });
    }

    return { data: config };
  });

  // Update embed config
  app.put<{ Params: { id: string }; Body: UpdateEmbedConfigInput }>(
    "/:id/embed-config",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const config = await prisma.embedConfig.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, ...request.body },
        update: request.body,
      });

      return { data: config };
    }
  );

  // List embed submissions
  app.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    "/:id/submissions",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const where: any = { projectId: project.id };
      if (request.query.status) {
        where.screeningStatus = request.query.status;
      }

      const submissions = await prisma.embedSubmission.findMany({
        where,
        include: { questions: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
      });

      return { data: submissions };
    }
  );

  // Approve submission → convert to task
  app.post<{ Params: { id: string; subId: string }; Body: { repositoryId: string } }>(
    "/:id/submissions/:subId/approve",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
        include: { repositories: { select: { repositoryId: true } } },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const submission = await prisma.embedSubmission.findFirst({
        where: { id: request.params.subId, projectId: project.id },
      });
      if (!submission) return reply.code(404).send({ error: { message: "Submission not found" } });
      if (submission.taskId) return reply.code(400).send({ error: { message: "Already converted" } });

      const { repositoryId } = request.body;
      const repoInProject = project.repositories.some((r) => r.repositoryId === repositoryId);
      if (!repoInProject) return reply.code(400).send({ error: { message: "Repository not in project" } });

      const task = await prisma.task.create({
        data: {
          repositoryId,
          userId: request.userId,
          projectId: project.id,
          title: submission.title,
          description: submission.description,
          type: "feature",
          priority: "medium",
          status: "planning",
          source: "embed",
          metadata: { embedSubmissionId: submission.id },
        },
      });

      await prisma.embedSubmission.update({
        where: { id: submission.id },
        data: { screeningStatus: "approved", taskId: task.id },
      });

      await schedulerService.queueTaskPlanning(task.id);

      return { data: { task, submission: { ...submission, screeningStatus: "approved", taskId: task.id } } };
    }
  );

  // Reject submission
  app.post<{ Params: { id: string; subId: string } }>(
    "/:id/submissions/:subId/reject",
    async (request, reply) => {
      const project = await prisma.project.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const submission = await prisma.embedSubmission.update({
        where: { id: request.params.subId, projectId: project.id },
        data: { screeningStatus: "rejected" },
      });

      return { data: submission };
    }
  );
};
