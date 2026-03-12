/**
 * AI Metrics Routes
 *
 * API endpoints for AI self-improvement metrics:
 * - Overall accuracy metrics
 * - Accuracy breakdown by type/repo
 * - False positive rate tracking
 * - Execution success rate
 * - Time-series trends
 * - User feedback recording
 * - Prompt refinement suggestions
 */

import type { FastifyPluginAsync } from "fastify";
import {
  getMetricsOverview,
  getAccuracyBreakdown,
  getFalsePositiveTracking,
  getExecutionSuccessRate,
  getMetricsTrends,
  getRecentFeedback,
  recordAIFeedback,
  recordTaskOutcome,
  recordScanFindingAccuracy,
  getPromptSuggestions,
  applyPromptRefinement,
  getRefinementHistory,
  type FeedbackType,
  type PromptCategory,
} from "../services/ai-metrics.js";

interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
}

interface FeedbackBody {
  entityType: string;
  entityId: string;
  feedbackType: FeedbackType;
  comment?: string;
}

interface TaskOutcomeBody {
  taskId: string;
  success: boolean;
  falsePositive?: boolean;
  falseNegative?: boolean;
  taskType: string;
  repositoryId: string;
  planWasAccurate: boolean;
  executionWasCorrect: boolean;
}

interface ScanFindingOutcomeBody {
  findingId: string;
  wasAccurate: boolean;
  falsePositive: boolean;
  findingType: string;
  repositoryId: string;
  scanId: string;
}

export const aiMetricsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET /api/ai-metrics/overview
  // Returns overall AI accuracy metrics and health status
  app.get<{ Querystring: DateRangeQuery }>(
    "/overview",
    async (request, reply) => {
      const { startDate, endDate } = request.query;
      const userId = request.userId;

      try {
        const overview = await getMetricsOverview(userId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });

        return { data: overview };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch metrics overview" },
        });
      }
    }
  );

  // GET /api/ai-metrics/accuracy
  // Returns accuracy breakdown by task type, repository, and finding type
  app.get<{ Querystring: DateRangeQuery }>(
    "/accuracy",
    async (request, reply) => {
      const { startDate, endDate } = request.query;
      const userId = request.userId;

      try {
        const breakdown = await getAccuracyBreakdown(userId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });

        return { data: breakdown };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch accuracy breakdown" },
        });
      }
    }
  );

  // GET /api/ai-metrics/false-positives
  // Returns false positive rate tracking over time
  app.get<{ Querystring: DateRangeQuery & { groupBy?: "day" | "week" | "month" } }>(
    "/false-positives",
    async (request, reply) => {
      const { startDate, endDate, groupBy } = request.query;
      const userId = request.userId;

      try {
        const tracking = await getFalsePositiveTracking(userId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          groupBy: groupBy || "day",
        });

        return { data: tracking };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch false positive tracking" },
        });
      }
    }
  );

  // GET /api/ai-metrics/execution-success
  // Returns execution success rate by task type
  app.get<{ Querystring: DateRangeQuery }>(
    "/execution-success",
    async (request, reply) => {
      const { startDate, endDate } = request.query;
      const userId = request.userId;

      try {
        const successRates = await getExecutionSuccessRate(userId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });

        return { data: successRates };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch execution success rates" },
        });
      }
    }
  );

  // GET /api/ai-metrics/trends
  // Returns time-series trends for all metrics
  app.get<{ Querystring: DateRangeQuery & { groupBy?: "day" | "week" | "month" } }>(
    "/trends",
    async (request, reply) => {
      const { startDate, endDate, groupBy } = request.query;
      const userId = request.userId;

      try {
        const trends = await getMetricsTrends(userId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          groupBy: groupBy || "day",
        });

        return { data: trends };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch trends" },
        });
      }
    }
  );

  // GET /api/ai-metrics/feedback
  // Returns recent user feedback
  app.get<{ Querystring: { limit?: string; feedbackType?: FeedbackType } }>(
    "/feedback",
    async (request, reply) => {
      const { limit, feedbackType } = request.query;
      const userId = request.userId;

      try {
        const feedback = await getRecentFeedback(userId, {
          limit: limit ? parseInt(limit) : undefined,
          feedbackType,
        });

        return { data: feedback };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch feedback" },
        });
      }
    }
  );

  // POST /api/ai-metrics/feedback
  // Record user feedback on AI output
  app.post<{ Body: FeedbackBody }>(
    "/feedback",
    async (request, reply) => {
      const userId = request.userId;
      const { entityType, entityId, feedbackType, comment } = request.body;

      if (!entityType || !entityId || !feedbackType) {
        return reply.code(400).send({
          error: { message: "entityType, entityId, and feedbackType are required" },
        });
      }

      try {
        const feedback = await recordAIFeedback(userId, {
          entityType,
          entityId,
          feedbackType,
          comment,
        });

        return { data: feedback };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to record feedback" },
        });
      }
    }
  );

  // POST /api/ai-metrics/task-outcome
  // Record task execution outcome for accuracy tracking
  app.post<{ Body: TaskOutcomeBody }>(
    "/task-outcome",
    async (request, reply) => {
      const userId = request.userId;
      const {
        taskId,
        success,
        falsePositive,
        falseNegative,
        taskType,
        repositoryId,
        planWasAccurate,
        executionWasCorrect,
      } = request.body;

      if (!taskId || !taskType || !repositoryId) {
        return reply.code(400).send({
          error: { message: "taskId, taskType, and repositoryId are required" },
        });
      }

      try {
        await recordTaskOutcome(userId, taskId, {
          success,
          falsePositive,
          falseNegative,
          taskType,
          repositoryId,
          planWasAccurate,
          executionWasCorrect,
        });

        return { data: { success: true } };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to record task outcome" },
        });
      }
    }
  );

  // POST /api/ai-metrics/scan-finding-outcome
  // Record scan finding accuracy
  app.post<{ Body: ScanFindingOutcomeBody }>(
    "/scan-finding-outcome",
    async (request, reply) => {
      const userId = request.userId;
      const { findingId, wasAccurate, falsePositive, findingType, repositoryId, scanId } =
        request.body;

      if (!findingId || !findingType || !repositoryId || !scanId) {
        return reply.code(400).send({
          error: { message: "findingId, findingType, repositoryId, and scanId are required" },
        });
      }

      try {
        await recordScanFindingAccuracy(userId, findingId, {
          wasAccurate,
          falsePositive,
          findingType,
          repositoryId,
          scanId,
        });

        return { data: { success: true } };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to record scan finding outcome" },
        });
      }
    }
  );

  // GET /api/ai-metrics/prompt-suggestions
  // Get prompt refinement suggestions based on failure patterns
  app.get<{ Querystring: { category?: PromptCategory; minFailureCount?: string } }>(
    "/prompt-suggestions",
    async (request, reply) => {
      const { category, minFailureCount } = request.query;

      try {
        const suggestions = await getPromptSuggestions({
          category,
          minFailureCount: minFailureCount ? parseInt(minFailureCount) : undefined,
        });

        return { data: suggestions };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch prompt suggestions" },
        });
      }
    }
  );

  // POST /api/ai-metrics/prompt-suggestions/:id/apply
  // Apply a prompt refinement suggestion
  app.post<{ Params: { id: string } }>(
    "/prompt-suggestions/:id/apply",
    async (request, reply) => {
      const { id } = request.params;

      try {
        const refinement = await applyPromptRefinement(id);

        return { data: refinement };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to apply prompt refinement" },
        });
      }
    }
  );

  // GET /api/ai-metrics/refinement-history
  // Get history of applied prompt refinements
  app.get<{ Querystring: { category?: PromptCategory; limit?: string } }>(
    "/refinement-history",
    async (request, reply) => {
      const { category, limit } = request.query;

      try {
        const history = await getRefinementHistory({
          category,
          limit: limit ? parseInt(limit) : undefined,
        });

        return { data: history };
      } catch (error: any) {
        return reply.code(500).send({
          error: { message: error.message || "Failed to fetch refinement history" },
        });
      }
    }
  );
};
