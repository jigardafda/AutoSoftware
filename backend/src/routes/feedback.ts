/**
 * Feedback Routes
 *
 * API endpoints for Phase 5 Feedback Loops:
 * - User feedback (thumbs up/down)
 * - PR review results
 * - Approach feedback
 * - A/B experiments
 * - Learned patterns
 * - Rejection memories
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import {
  recordUserFeedback,
  recordPRReviewResult,
  recordApproachFeedback,
  getLearnedPatterns,
  getRejectionMemories,
  getFeedbackContextForTask,
  getFeedbackSummary,
  createABExperiment,
  getActiveExperiments,
  getExperiment,
  recordABTestResult,
  type FeedbackType,
  type PatternCategory,
  type PRReviewComment,
} from "../services/feedback-learning.js";

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // ============================================================================
  // User Feedback (Thumbs Up/Down)
  // ============================================================================

  /**
   * POST /feedback/signal - Record user feedback on a suggestion
   */
  app.post<{
    Body: {
      type: "thumbs_up" | "thumbs_down";
      taskId?: string;
      messageId?: string;
      repositoryId: string;
      projectId?: string;
      suggestionType: string;
      context?: string;
      note?: string;
    };
  }>("/signal", async (request, reply) => {
    const { type, taskId, messageId, repositoryId, projectId, suggestionType, context, note } =
      request.body;

    if (!["thumbs_up", "thumbs_down"].includes(type)) {
      return reply.code(400).send({
        error: { message: "type must be 'thumbs_up' or 'thumbs_down'" },
      });
    }

    if (!repositoryId || !suggestionType) {
      return reply.code(400).send({
        error: { message: "repositoryId and suggestionType are required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const signal = await recordUserFeedback(request.userId, {
        type,
        taskId,
        messageId,
        repositoryId,
        projectId,
        suggestionType,
        context,
        note,
      });

      return { data: signal };
    } catch (err) {
      console.error("Failed to record feedback:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to record feedback" },
      });
    }
  });

  /**
   * POST /feedback/pr-review - Record PR review result
   */
  app.post<{
    Body: {
      taskId: string;
      pullRequestUrl: string;
      repositoryId: string;
      projectId?: string;
      result: "approved" | "rejected" | "changes_requested";
      comments?: PRReviewComment[];
      reviewerNotes?: string;
    };
  }>("/pr-review", async (request, reply) => {
    const { taskId, pullRequestUrl, repositoryId, projectId, result, comments, reviewerNotes } =
      request.body;

    if (!taskId || !pullRequestUrl || !repositoryId) {
      return reply.code(400).send({
        error: { message: "taskId, pullRequestUrl, and repositoryId are required" },
      });
    }

    if (!["approved", "rejected", "changes_requested"].includes(result)) {
      return reply.code(400).send({
        error: { message: "result must be 'approved', 'rejected', or 'changes_requested'" },
      });
    }

    // Verify task access
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: request.userId },
    });
    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    try {
      const signal = await recordPRReviewResult(request.userId, {
        taskId,
        pullRequestUrl,
        repositoryId,
        projectId,
        result,
        comments,
        reviewerNotes,
      });

      return { data: signal };
    } catch (err) {
      console.error("Failed to record PR review:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to record PR review" },
      });
    }
  });

  /**
   * POST /feedback/approach - Record approach selection/rejection feedback
   */
  app.post<{
    Body: {
      taskId: string;
      repositoryId: string;
      projectId?: string;
      approachIndex: number;
      selected: boolean;
      reason?: string;
      approachDetails: {
        name: string;
        description: string;
        complexity: string;
      };
    };
  }>("/approach", async (request, reply) => {
    const { taskId, repositoryId, projectId, approachIndex, selected, reason, approachDetails } =
      request.body;

    if (!taskId || !repositoryId || approachIndex === undefined) {
      return reply.code(400).send({
        error: { message: "taskId, repositoryId, and approachIndex are required" },
      });
    }

    // Verify task access
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: request.userId },
    });
    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    try {
      const signal = await recordApproachFeedback(request.userId, {
        taskId,
        repositoryId,
        projectId,
        approachIndex,
        selected,
        reason,
        approachDetails,
      });

      return { data: signal };
    } catch (err) {
      console.error("Failed to record approach feedback:", err);
      return reply.code(500).send({
        error: {
          message: err instanceof Error ? err.message : "Failed to record approach feedback",
        },
      });
    }
  });

  // ============================================================================
  // Learned Patterns
  // ============================================================================

  /**
   * GET /feedback/patterns - Get learned patterns for a repository
   */
  app.get<{
    Querystring: {
      repositoryId: string;
      projectId?: string;
      category?: PatternCategory;
      minConfidence?: string;
      limit?: string;
    };
  }>("/patterns", async (request, reply) => {
    const { repositoryId, projectId, category, minConfidence, limit } = request.query;

    if (!repositoryId) {
      return reply.code(400).send({
        error: { message: "repositoryId is required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const patterns = await getLearnedPatterns(request.userId, repositoryId, {
        projectId,
        category,
        minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return { data: patterns };
    } catch (err) {
      console.error("Failed to get patterns:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get patterns" },
      });
    }
  });

  /**
   * DELETE /feedback/patterns/:id - Delete a learned pattern
   */
  app.delete<{ Params: { id: string } }>("/patterns/:id", async (request, reply) => {
    const pattern = await prisma.learnedPattern.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!pattern) {
      return reply.code(404).send({ error: { message: "Pattern not found" } });
    }

    await prisma.learnedPattern.delete({ where: { id: pattern.id } });

    return { data: { success: true } };
  });

  // ============================================================================
  // Rejection Memories
  // ============================================================================

  /**
   * GET /feedback/rejections - Get rejection memories for a repository
   */
  app.get<{
    Querystring: {
      repositoryId: string;
      projectId?: string;
      limit?: string;
    };
  }>("/rejections", async (request, reply) => {
    const { repositoryId, projectId, limit } = request.query;

    if (!repositoryId) {
      return reply.code(400).send({
        error: { message: "repositoryId is required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const rejections = await getRejectionMemories(request.userId, repositoryId, {
        projectId,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return { data: rejections };
    } catch (err) {
      console.error("Failed to get rejections:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get rejections" },
      });
    }
  });

  /**
   * DELETE /feedback/rejections/:id - Delete a rejection memory
   */
  app.delete<{ Params: { id: string } }>("/rejections/:id", async (request, reply) => {
    const rejection = await prisma.rejectionMemory.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!rejection) {
      return reply.code(404).send({ error: { message: "Rejection memory not found" } });
    }

    await prisma.rejectionMemory.delete({ where: { id: rejection.id } });

    return { data: { success: true } };
  });

  /**
   * PATCH /feedback/rejections/:id - Update learned action for a rejection
   */
  app.patch<{
    Params: { id: string };
    Body: { learnedAction: string };
  }>("/rejections/:id", async (request, reply) => {
    const { learnedAction } = request.body;

    const rejection = await prisma.rejectionMemory.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!rejection) {
      return reply.code(404).send({ error: { message: "Rejection memory not found" } });
    }

    const updated = await prisma.rejectionMemory.update({
      where: { id: rejection.id },
      data: { learnedAction },
    });

    return { data: updated };
  });

  // ============================================================================
  // Feedback Context
  // ============================================================================

  /**
   * GET /feedback/context - Get feedback context for task planning
   */
  app.get<{
    Querystring: {
      repositoryId: string;
      projectId?: string;
    };
  }>("/context", async (request, reply) => {
    const { repositoryId, projectId } = request.query;

    if (!repositoryId) {
      return reply.code(400).send({
        error: { message: "repositoryId is required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const context = await getFeedbackContextForTask(request.userId, repositoryId, projectId);

      return { data: { context } };
    } catch (err) {
      console.error("Failed to get feedback context:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get feedback context" },
      });
    }
  });

  // ============================================================================
  // Summary & Analytics
  // ============================================================================

  /**
   * GET /feedback/summary - Get feedback summary for a repository
   */
  app.get<{
    Querystring: {
      repositoryId: string;
      projectId?: string;
      since?: string;
    };
  }>("/summary", async (request, reply) => {
    const { repositoryId, projectId, since } = request.query;

    if (!repositoryId) {
      return reply.code(400).send({
        error: { message: "repositoryId is required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const summary = await getFeedbackSummary(request.userId, repositoryId, {
        projectId,
        since: since ? new Date(since) : undefined,
      });

      return { data: summary };
    } catch (err) {
      console.error("Failed to get feedback summary:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get feedback summary" },
      });
    }
  });

  /**
   * GET /feedback/signals - Get recent feedback signals
   */
  app.get<{
    Querystring: {
      repositoryId?: string;
      projectId?: string;
      type?: FeedbackType;
      rating?: "positive" | "negative" | "neutral";
      limit?: string;
      offset?: string;
    };
  }>("/signals", async (request, reply) => {
    const { repositoryId, projectId, type, rating, limit, offset } = request.query;

    try {
      const signals = await prisma.feedbackSignal.findMany({
        where: {
          userId: request.userId,
          ...(repositoryId && { repositoryId }),
          ...(projectId && { projectId }),
          ...(type && { type }),
          ...(rating && { rating }),
        },
        orderBy: { createdAt: "desc" },
        take: limit ? parseInt(limit, 10) : 50,
        skip: offset ? parseInt(offset, 10) : 0,
      });

      return { data: signals };
    } catch (err) {
      console.error("Failed to get feedback signals:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get feedback signals" },
      });
    }
  });

  // ============================================================================
  // A/B Experiments
  // ============================================================================

  /**
   * POST /feedback/experiments - Create a new A/B experiment
   */
  app.post<{
    Body: {
      name: string;
      description: string;
      repositoryId?: string;
      projectId?: string;
      variantA: {
        name: string;
        description: string;
        configuration: Record<string, unknown>;
      };
      variantB: {
        name: string;
        description: string;
        configuration: Record<string, unknown>;
      };
      sampleSize: number;
    };
  }>("/experiments", async (request, reply) => {
    const { name, description, repositoryId, projectId, variantA, variantB, sampleSize } =
      request.body;

    if (!name || !variantA || !variantB) {
      return reply.code(400).send({
        error: { message: "name, variantA, and variantB are required" },
      });
    }

    if (sampleSize < 2 || sampleSize > 1000) {
      return reply.code(400).send({
        error: { message: "sampleSize must be between 2 and 1000" },
      });
    }

    // Verify repository access if specified
    if (repositoryId) {
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId: request.userId },
      });
      if (!repo) {
        return reply.code(404).send({ error: { message: "Repository not found" } });
      }
    }

    try {
      const experiment = await createABExperiment(request.userId, {
        name,
        description,
        repositoryId,
        projectId,
        variantA,
        variantB,
        sampleSize,
      });

      return reply.code(201).send({ data: experiment });
    } catch (err) {
      console.error("Failed to create experiment:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to create experiment" },
      });
    }
  });

  /**
   * GET /feedback/experiments - List A/B experiments
   */
  app.get<{
    Querystring: {
      repositoryId?: string;
      projectId?: string;
      status?: "active" | "completed" | "cancelled";
    };
  }>("/experiments", async (request, reply) => {
    const { repositoryId, projectId, status } = request.query;

    try {
      const experiments = await prisma.aBExperiment.findMany({
        where: {
          userId: request.userId,
          ...(repositoryId && { repositoryId }),
          ...(projectId && { projectId }),
          ...(status && { status }),
        },
        orderBy: { startedAt: "desc" },
      });

      return {
        data: experiments.map((exp) => ({
          id: exp.id,
          name: exp.name,
          description: exp.description,
          repositoryId: exp.repositoryId,
          projectId: exp.projectId,
          status: exp.status,
          variantA: exp.variantA,
          variantB: exp.variantB,
          results: {
            variantA: exp.resultsA,
            variantB: exp.resultsB,
          },
          currentSamples: {
            A: exp.currentSampleA,
            B: exp.currentSampleB,
          },
          sampleSize: exp.sampleSize,
          winner: exp.winner,
          startedAt: exp.startedAt,
          completedAt: exp.completedAt,
        })),
      };
    } catch (err) {
      console.error("Failed to get experiments:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get experiments" },
      });
    }
  });

  /**
   * GET /feedback/experiments/:id - Get experiment details
   */
  app.get<{ Params: { id: string } }>("/experiments/:id", async (request, reply) => {
    try {
      const experiment = await getExperiment(request.userId, request.params.id);

      if (!experiment) {
        return reply.code(404).send({ error: { message: "Experiment not found" } });
      }

      // Get experiment results
      const results = await prisma.aBTestResult.findMany({
        where: { experimentId: request.params.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return {
        data: {
          ...experiment,
          recentResults: results,
        },
      };
    } catch (err) {
      console.error("Failed to get experiment:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get experiment" },
      });
    }
  });

  /**
   * POST /feedback/experiments/:id/result - Record an A/B test result
   */
  app.post<{
    Params: { id: string };
    Body: {
      variant: "A" | "B";
      taskId: string;
      success: boolean;
      executionTimeMs: number;
      prApproved?: boolean;
      userSatisfaction?: number;
      codeQualityScore?: number;
      revisions?: number;
    };
  }>("/experiments/:id/result", async (request, reply) => {
    const { variant, taskId, success, executionTimeMs, prApproved, userSatisfaction, codeQualityScore, revisions } =
      request.body;

    if (!["A", "B"].includes(variant)) {
      return reply.code(400).send({
        error: { message: "variant must be 'A' or 'B'" },
      });
    }

    const experiment = await prisma.aBExperiment.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!experiment) {
      return reply.code(404).send({ error: { message: "Experiment not found" } });
    }

    if (experiment.status !== "active") {
      return reply.code(400).send({
        error: { message: "Experiment is not active" },
      });
    }

    try {
      await recordABTestResult(request.userId, request.params.id, {
        variant,
        taskId,
        success,
        executionTimeMs,
        prApproved,
        userSatisfaction,
        codeQualityScore,
        revisions,
      });

      // Get updated experiment
      const updated = await getExperiment(request.userId, request.params.id);

      return { data: updated };
    } catch (err) {
      console.error("Failed to record experiment result:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to record result" },
      });
    }
  });

  /**
   * POST /feedback/experiments/:id/cancel - Cancel an experiment
   */
  app.post<{ Params: { id: string } }>("/experiments/:id/cancel", async (request, reply) => {
    const experiment = await prisma.aBExperiment.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!experiment) {
      return reply.code(404).send({ error: { message: "Experiment not found" } });
    }

    if (experiment.status !== "active") {
      return reply.code(400).send({
        error: { message: "Only active experiments can be cancelled" },
      });
    }

    const updated = await prisma.aBExperiment.update({
      where: { id: experiment.id },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    return { data: updated };
  });

  /**
   * DELETE /feedback/experiments/:id - Delete an experiment
   */
  app.delete<{ Params: { id: string } }>("/experiments/:id", async (request, reply) => {
    const experiment = await prisma.aBExperiment.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!experiment) {
      return reply.code(404).send({ error: { message: "Experiment not found" } });
    }

    // Delete results first
    await prisma.aBTestResult.deleteMany({
      where: { experimentId: experiment.id },
    });

    // Delete experiment
    await prisma.aBExperiment.delete({ where: { id: experiment.id } });

    return { data: { success: true } };
  });
};
