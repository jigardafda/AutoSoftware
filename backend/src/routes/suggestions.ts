/**
 * Proactive Suggestions API Routes
 *
 * Provides endpoints for proactive code improvement suggestions:
 * - Generate pre-task suggestions
 * - Get suggestions for a repository
 * - Manage suggestion lifecycle (dismiss, apply)
 * - Scheduled improvement recommendations
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import {
  proactiveSuggestionsService,
  type SuggestionType,
  type SuggestionPriority,
  type SuggestionStatus,
  type SuggestionGenerationContext,
} from "../services/proactive-suggestions.js";

// ============================================================================
// Route Types
// ============================================================================

interface GenerateSuggestionsBody {
  repositoryId: string;
  projectId?: string;
  taskId?: string;
  taskDescription?: string;
  affectedFiles?: string[];
  taskType?: string;
}

interface SuggestionsQuery {
  repositoryId: string;
  projectId?: string;
  type?: SuggestionType;
  priority?: SuggestionPriority;
  status?: SuggestionStatus;
  limit?: string;
}

interface UpdateSuggestionBody {
  status: SuggestionStatus;
  reason?: string;
}

interface ApplySuggestionBody {
  actionId: string;
}

interface CreateSuggestionBody {
  repositoryId: string;
  type: SuggestionType;
  priority: SuggestionPriority;
  title: string;
  description: string;
  rationale?: string;
  affectedFiles?: string[];
  relatedTaskId?: string;
  suggestedActions?: Array<{
    id: string;
    title: string;
    description: string;
    actionType: "create_task" | "apply_fix" | "review" | "ignore" | "defer";
    payload?: Record<string, any>;
  }>;
  estimatedImpact?: {
    codeQuality: number;
    performance: number;
    maintainability: number;
    timeToFix: number;
    riskLevel: "low" | "medium" | "high";
  };
  metadata?: Record<string, any>;
}

// ============================================================================
// Routes
// ============================================================================

export const suggestionRoutes: FastifyPluginAsync = async (app) => {
  // Require authentication for all routes
  app.addHook("preHandler", (app as any).requireAuth);

  // POST /api/suggestions/generate
  // Generate proactive suggestions for a task/context
  app.post<{ Body: GenerateSuggestionsBody }>(
    "/generate",
    async (request, reply) => {
      const {
        repositoryId,
        projectId,
        taskId,
        taskDescription,
        affectedFiles,
        taskType,
      } = request.body;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true, fullName: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const context: SuggestionGenerationContext = {
        repositoryId,
        projectId,
        taskId,
        taskDescription,
        affectedFiles,
        taskType,
      };

      const suggestions = await proactiveSuggestionsService.generatePreTaskSuggestions(
        userId,
        context
      );

      // Store suggestions in database
      for (const suggestion of suggestions) {
        await proactiveSuggestionsService.storeSuggestion(
          userId,
          repositoryId,
          suggestion
        );
      }

      return {
        data: {
          suggestions,
          count: suggestions.length,
          repository: {
            id: repo.id,
            name: repo.fullName,
          },
        },
      };
    }
  );

  // GET /api/suggestions
  // Get suggestions for a repository
  app.get<{ Querystring: SuggestionsQuery }>(
    "/",
    async (request, reply) => {
      const { repositoryId, projectId, type, priority, status, limit } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true, fullName: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const suggestions = await proactiveSuggestionsService.getSuggestions(
        userId,
        repositoryId,
        {
          type,
          priority,
          status,
          limit: limit ? parseInt(limit) : undefined,
        }
      );

      return {
        data: {
          suggestions,
          count: suggestions.length,
          repository: {
            id: repo.id,
            name: repo.fullName,
          },
        },
      };
    }
  );

  // GET /api/suggestions/summary
  // Get suggestion summary for a repository
  app.get<{ Querystring: { repositoryId: string } }>(
    "/summary",
    async (request, reply) => {
      const { repositoryId } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true, fullName: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const summary = await proactiveSuggestionsService.getSuggestionSummary(
        userId,
        repositoryId
      );

      return {
        data: {
          summary,
          repository: {
            id: repo.id,
            name: repo.fullName,
          },
        },
      };
    }
  );

  // GET /api/suggestions/scheduled
  // Get scheduled improvement recommendations
  app.get<{ Querystring: { repositoryId: string } }>(
    "/scheduled",
    async (request, reply) => {
      const { repositoryId } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true, fullName: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const recommendations = await proactiveSuggestionsService.generateScheduledRecommendations(
        userId,
        repositoryId
      );

      return {
        data: {
          recommendations,
          count: recommendations.length,
          repository: {
            id: repo.id,
            name: repo.fullName,
          },
        },
      };
    }
  );

  // GET /api/suggestions/:id
  // Get a specific suggestion
  app.get<{ Params: { id: string } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId;

      const suggestion = await prisma.proactiveSuggestion.findFirst({
        where: { id, userId },
      });

      if (!suggestion) {
        return reply.code(404).send({
          error: { message: "Suggestion not found" },
        });
      }

      return { data: suggestion };
    }
  );

  // PATCH /api/suggestions/:id
  // Update suggestion status
  app.patch<{ Params: { id: string }; Body: UpdateSuggestionBody }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const { status, reason } = request.body;
      const userId = request.userId;

      // Verify suggestion belongs to user
      const suggestion = await prisma.proactiveSuggestion.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!suggestion) {
        return reply.code(404).send({
          error: { message: "Suggestion not found" },
        });
      }

      if (status === "dismissed") {
        await proactiveSuggestionsService.dismissSuggestion(id, userId, reason);
      } else {
        await proactiveSuggestionsService.updateSuggestionStatus(id, userId, status);
      }

      return {
        data: {
          id,
          status,
          success: true,
        },
      };
    }
  );

  // POST /api/suggestions/:id/dismiss
  // Dismiss a suggestion
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/:id/dismiss",
    async (request, reply) => {
      const { id } = request.params;
      const { reason } = request.body || {};
      const userId = request.userId;

      // Verify suggestion belongs to user
      const suggestion = await prisma.proactiveSuggestion.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!suggestion) {
        return reply.code(404).send({
          error: { message: "Suggestion not found" },
        });
      }

      await proactiveSuggestionsService.dismissSuggestion(id, userId, reason);

      return {
        data: {
          id,
          dismissed: true,
        },
      };
    }
  );

  // POST /api/suggestions/:id/apply
  // Apply a suggestion action
  app.post<{ Params: { id: string }; Body: ApplySuggestionBody }>(
    "/:id/apply",
    async (request, reply) => {
      const { id } = request.params;
      const { actionId } = request.body;
      const userId = request.userId;

      if (!actionId) {
        return reply.code(400).send({
          error: { message: "actionId is required" },
        });
      }

      // Verify suggestion belongs to user
      const suggestion = await prisma.proactiveSuggestion.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!suggestion) {
        return reply.code(404).send({
          error: { message: "Suggestion not found" },
        });
      }

      const result = await proactiveSuggestionsService.applySuggestion(
        id,
        userId,
        actionId
      );

      if (!result.success) {
        return reply.code(400).send({
          error: { message: "Failed to apply suggestion" },
        });
      }

      return {
        data: {
          id,
          applied: true,
          actionId,
          result: result.result,
        },
      };
    }
  );

  // POST /api/suggestions
  // Create a custom suggestion (e.g., from plugins or external sources)
  app.post<{ Body: CreateSuggestionBody }>(
    "/",
    async (request, reply) => {
      const {
        repositoryId,
        type,
        priority,
        title,
        description,
        rationale,
        affectedFiles,
        relatedTaskId,
        suggestedActions,
        estimatedImpact,
        metadata,
      } = request.body;
      const userId = request.userId;

      if (!repositoryId || !type || !priority || !title || !description) {
        return reply.code(400).send({
          error: {
            message: "repositoryId, type, priority, title, and description are required",
          },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const suggestion = await proactiveSuggestionsService.storeSuggestion(
        userId,
        repositoryId,
        {
          type,
          priority,
          status: "pending",
          title,
          description,
          rationale: rationale || "",
          affectedFiles: affectedFiles || [],
          suggestedActions: suggestedActions || [],
          relatedTaskId,
          confidence: 1.0,
          estimatedImpact: estimatedImpact || {
            codeQuality: 0,
            performance: 0,
            maintainability: 0,
            timeToFix: 0,
            riskLevel: "low",
          },
          metadata: metadata || {},
        }
      );

      return {
        data: suggestion,
      };
    }
  );

  // DELETE /api/suggestions/:id
  // Delete a suggestion
  app.delete<{ Params: { id: string } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId;

      // Verify suggestion belongs to user
      const suggestion = await prisma.proactiveSuggestion.findFirst({
        where: { id, userId },
        select: { id: true },
      });

      if (!suggestion) {
        return reply.code(404).send({
          error: { message: "Suggestion not found" },
        });
      }

      await prisma.proactiveSuggestion.delete({
        where: { id },
      });

      return {
        data: {
          id,
          deleted: true,
        },
      };
    }
  );

  // POST /api/suggestions/cleanup
  // Clean up expired suggestions
  app.post("/cleanup", async (request, reply) => {
    const userId = request.userId;

    const count = await proactiveSuggestionsService.cleanupExpiredSuggestions();

    return {
      data: {
        cleaned: count,
      },
    };
  });

  // GET /api/suggestions/for-task/:taskId
  // Get suggestions relevant to a specific task
  app.get<{ Params: { taskId: string } }>(
    "/for-task/:taskId",
    async (request, reply) => {
      const { taskId } = request.params;
      const userId = request.userId;

      // Get task details
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        include: {
          repository: {
            select: { id: true, fullName: true },
          },
        },
      });

      if (!task) {
        return reply.code(404).send({
          error: { message: "Task not found" },
        });
      }

      // Generate suggestions for this task
      const context: SuggestionGenerationContext = {
        repositoryId: task.repositoryId,
        projectId: task.projectId || undefined,
        taskId: task.id,
        taskDescription: task.description,
        affectedFiles: (task.affectedFiles as string[]) || [],
        taskType: task.type,
      };

      const suggestions = await proactiveSuggestionsService.generatePreTaskSuggestions(
        userId,
        context
      );

      // Also get any existing stored suggestions for this task
      const storedSuggestions = await prisma.proactiveSuggestion.findMany({
        where: {
          userId,
          relatedTaskId: taskId,
          status: "pending",
        },
        orderBy: { priority: "desc" },
      });

      return {
        data: {
          taskId,
          task: {
            id: task.id,
            title: task.title,
            type: task.type,
            status: task.status,
          },
          generatedSuggestions: suggestions,
          storedSuggestions,
          totalCount: suggestions.length + storedSuggestions.length,
        },
      };
    }
  );

  // GET /api/suggestions/patterns
  // Get common patterns that could apply to a description
  app.get<{ Querystring: { description: string; repositoryId?: string } }>(
    "/patterns",
    async (request, reply) => {
      const { description, repositoryId } = request.query;
      const userId = request.userId;

      if (!description) {
        return reply.code(400).send({
          error: { message: "description is required" },
        });
      }

      // Use the service to detect design patterns
      const patternSuggestions = await (proactiveSuggestionsService as any).detectDesignPatterns(
        userId,
        description
      );

      return {
        data: {
          patterns: patternSuggestions,
          count: patternSuggestions.length,
        },
      };
    }
  );

  // POST /api/suggestions/bulk-dismiss
  // Dismiss multiple suggestions at once
  app.post<{ Body: { suggestionIds: string[]; reason?: string } }>(
    "/bulk-dismiss",
    async (request, reply) => {
      const { suggestionIds, reason } = request.body;
      const userId = request.userId;

      if (!suggestionIds || suggestionIds.length === 0) {
        return reply.code(400).send({
          error: { message: "suggestionIds is required" },
        });
      }

      // Verify all suggestions belong to user
      const suggestions = await prisma.proactiveSuggestion.findMany({
        where: { id: { in: suggestionIds }, userId },
        select: { id: true },
      });

      const validIds = suggestions.map((s) => s.id);

      // Dismiss all valid suggestions
      await Promise.all(
        validIds.map((id) =>
          proactiveSuggestionsService.dismissSuggestion(id, userId, reason)
        )
      );

      return {
        data: {
          dismissed: validIds.length,
          notFound: suggestionIds.length - validIds.length,
        },
      };
    }
  );
};
