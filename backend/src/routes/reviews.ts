import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { processReview } from "../services/review-processor.js";

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  // List all reviews (authenticated)
  app.get("/", {
    preHandler: [(app as any).requireAuth],
  }, async (request) => {
    const reviews = await prisma.prReview.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { reviews };
  });

  // Get a single review (authenticated)
  app.get<{ Params: { id: string } }>("/:id", {
    preHandler: [(app as any).requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const review = await prisma.prReview.findUnique({ where: { id } });
    if (!review) {
      return reply.status(404).send({ error: { message: "Review not found" } });
    }
    return { review };
  });

  // Create a review (from CLI or UI - auth optional)
  app.post("/", async (request, reply) => {
    const body = request.body as any;

    // Try to get userId from auth, but allow unauthenticated (CLI mode)
    let userId: string | null = null;
    if (request.userId) {
      userId = request.userId;
    }

    // Infer provider and parse PR details from URL if not provided
    let provider = body.provider;
    let owner = body.owner;
    let repo = body.repo;
    let prNumber = body.prNumber;
    let title = body.title;

    if (body.prUrl && (!provider || !owner || !repo || !prNumber)) {
      const ghMatch = body.prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (ghMatch) {
        provider = provider || "github";
        owner = owner || ghMatch[1];
        repo = repo || ghMatch[2];
        prNumber = prNumber || parseInt(ghMatch[3], 10);
        title = title || `${ghMatch[1]}/${ghMatch[2]}#${ghMatch[3]}`;
      }
    }

    if (!provider) {
      return reply.status(400).send({ error: { message: "Could not determine provider from PR URL" } });
    }

    const isCompleted = !!body.summary;

    const review = await prisma.prReview.create({
      data: {
        prUrl: body.prUrl,
        provider,
        owner,
        repo,
        prNumber,
        title,
        description: body.description || "",
        agentId: body.agentId || "claude-code",
        status: isCompleted ? "completed" : "pending",
        summary: body.summary || null,
        verdict: body.verdict || null,
        comments: body.comments || null,
        filesChanged: body.filesChanged || null,
        baseBranch: body.baseBranch || "",
        headBranch: body.headBranch || "",
        userId,
      },
    });

    // If review wasn't submitted with results (UI flow), process it async
    if (!isCompleted) {
      processReview(review.id).catch((err) => {
        console.error(`[reviews] Background processing failed for ${review.id}:`, err.message);
      });
    }

    return { review };
  });

  // Retry a failed review
  app.post<{ Params: { id: string } }>("/:id/retry", {
    preHandler: [(app as any).requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const review = await prisma.prReview.findUnique({ where: { id } });
    if (!review) {
      return reply.status(404).send({ error: { message: "Review not found" } });
    }
    if (review.status !== "failed" && review.status !== "cancelled") {
      return reply.status(400).send({ error: { message: "Only failed or cancelled reviews can be retried" } });
    }

    await prisma.prReview.update({
      where: { id },
      data: { status: "pending", error: null },
    });

    processReview(id).catch((err) => {
      console.error(`[reviews] Retry processing failed for ${id}:`, err.message);
    });

    return { success: true };
  });

  // Redo a completed review (re-run the entire review process)
  app.post<{ Params: { id: string } }>("/:id/redo", {
    preHandler: [(app as any).requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const review = await prisma.prReview.findUnique({ where: { id } });
    if (!review) {
      return reply.status(404).send({ error: { message: "Review not found" } });
    }
    if (review.status !== "completed") {
      return reply.status(400).send({ error: { message: "Only completed reviews can be redone" } });
    }

    await prisma.prReview.update({
      where: { id },
      data: {
        status: "pending",
        error: null,
        summary: null,
        verdict: null,
        comments: [],
        filesChanged: [],
      },
    });

    processReview(id).catch((err) => {
      console.error(`[reviews] Redo processing failed for ${id}:`, err.message);
    });

    return { success: true };
  });

  // Cancel a pending/running review
  app.post<{ Params: { id: string } }>("/:id/cancel", {
    preHandler: [(app as any).requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const review = await prisma.prReview.findUnique({ where: { id } });
    if (!review) {
      return reply.status(404).send({ error: { message: "Review not found" } });
    }
    if (review.status !== "pending" && review.status !== "running") {
      return reply.status(400).send({ error: { message: "Only pending or running reviews can be cancelled" } });
    }

    await prisma.prReview.update({
      where: { id },
      data: { status: "cancelled", error: "Cancelled by user" },
    });

    return { success: true };
  });

  // Get or create a workspace for a review
  app.post<{ Params: { id: string } }>("/:id/workspace", {
    preHandler: [(app as any).requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const review = await prisma.prReview.findUnique({ where: { id } });
    if (!review) {
      return reply.status(404).send({ error: { message: "Review not found" } });
    }

    // Check if a workspace already exists for this review
    const existing = await prisma.workspace.findFirst({
      where: { prReviewId: id, userId: request.userId },
    });
    if (existing) {
      return { workspace: existing, created: false };
    }

    // Find the repo in the user's connected repos by owner/repo name
    let repositoryId: string | undefined;
    const fullName = `${review.owner}/${review.repo}`;
    const repo = await prisma.repository.findFirst({
      where: {
        fullName,
        userId: request.userId,
      },
    });
    if (repo) {
      repositoryId = repo.id;
    }

    // Look up user's preferred model for this agent
    const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { settings: true } });
    const userSettings = (user?.settings as any) || {};
    const agentId = review.agentId || 'claude-code';
    const agentModel = userSettings.agentModels?.[agentId] || undefined;

    // Create a new workspace linked to this review
    const { workspaceManager } = await import('../services/workspace/workspace-manager.js');
    try {
      const workspace = await workspaceManager.create({
        userId: request.userId,
        name: `Review: ${review.title || `${review.owner}/${review.repo}#${review.prNumber}`}`,
        description: `PR Review workspace for ${review.prUrl}`,
        repositoryId,
        prReviewId: id,
        agentId,
        agentModel,
        baseBranch: review.headBranch || undefined,
        checkoutExisting: true, // Checkout the PR's actual branch, not a new workspace branch
      });

      // If repo is not connected and workspace has no worktreePath, try cloning from GitHub
      if (!repositoryId && !workspace.worktreePath && review.owner && review.repo) {
        try {
          await workspaceManager.setupWorktreeFromGitHub(
            workspace.id,
            review.owner,
            review.repo,
            review.headBranch || undefined,
            true, // checkoutExisting — use the PR's actual branch
          );
          const updated = await prisma.workspace.findUnique({ where: { id: workspace.id } });
          return { workspace: updated ?? workspace, created: true };
        } catch (ghErr) {
          console.warn(`[reviews] GitHub clone fallback failed for ${review.owner}/${review.repo}:`, ghErr);
          // Workspace is still active (without worktree) — user can still chat
        }
      }

      return { workspace, created: true };
    } catch (err: any) {
      console.error(`[reviews] Failed to create workspace for review ${id}:`, err.message);
      return reply.status(500).send({ error: { message: `Failed to create workspace: ${err.message}` } });
    }
  });

  // Delete a review (authenticated)
  app.delete<{ Params: { id: string } }>("/:id", {
    preHandler: [(app as any).requireAuth],
  }, async (request, reply) => {
    const { id } = request.params;
    const review = await prisma.prReview.findUnique({ where: { id } });
    if (!review) {
      return reply.status(404).send({ error: { message: "Review not found" } });
    }
    if (review.userId && review.userId !== request.userId) {
      return reply.status(403).send({ error: { message: "Not authorized" } });
    }
    await prisma.prReview.delete({ where: { id } });
    return { success: true };
  });
};
