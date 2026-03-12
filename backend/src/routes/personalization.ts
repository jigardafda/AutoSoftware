/**
 * Personalization Routes
 *
 * API endpoints for managing user preferences, behavior tracking,
 * and personalization insights.
 */

import type { FastifyPluginAsync } from "fastify";
import { personalizationService, type BehaviorSignal } from "../services/personalization.js";

export const personalizationRoutes: FastifyPluginAsync = async (app) => {
  // All routes require authentication
  app.addHook("preHandler", (app as any).requireAuth);

  // ==========================================================================
  // GET /api/personalization/preferences - Get user preferences
  // ==========================================================================
  app.get("/preferences", async (request) => {
    const preferences = await personalizationService.getPreferences(request.userId);

    return {
      data: preferences,
    };
  });

  // ==========================================================================
  // PUT /api/personalization/preferences - Update user preferences
  // ==========================================================================
  app.put<{
    Body: {
      aiVerbosity?: "minimal" | "medium" | "detailed";
      preferredLanguages?: string[];
      preferredTools?: string[];
      codeStyle?: {
        indentation?: "tabs" | "spaces";
        indentSize?: number;
        quotes?: "single" | "double";
        semicolons?: boolean;
        trailingComma?: "none" | "es5" | "all";
        lineWidth?: number;
        bracketSpacing?: boolean;
      };
      notificationPrefs?: {
        email?: boolean;
        push?: boolean;
        desktop?: boolean;
        taskComplete?: boolean;
        scanComplete?: boolean;
        prMerged?: boolean;
        reviewRequested?: boolean;
        mentionedInComment?: boolean;
        dailyDigest?: boolean;
      };
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
      timezone?: string;
      uiDensity?: "compact" | "comfortable" | "spacious";
      aiTone?: "casual" | "professional" | "technical";
      enableAutoDetection?: boolean;
    };
  }>("/preferences", async (request, reply) => {
    const updates = request.body;

    // Validate aiVerbosity
    if (updates.aiVerbosity && !["minimal", "medium", "detailed"].includes(updates.aiVerbosity)) {
      return reply.code(400).send({
        error: { message: "aiVerbosity must be 'minimal', 'medium', or 'detailed'" },
      });
    }

    // Validate uiDensity
    if (updates.uiDensity && !["compact", "comfortable", "spacious"].includes(updates.uiDensity)) {
      return reply.code(400).send({
        error: { message: "uiDensity must be 'compact', 'comfortable', or 'spacious'" },
      });
    }

    // Validate aiTone
    if (updates.aiTone && !["casual", "professional", "technical"].includes(updates.aiTone)) {
      return reply.code(400).send({
        error: { message: "aiTone must be 'casual', 'professional', or 'technical'" },
      });
    }

    // Validate quiet hours format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (updates.quietHoursStart && !timeRegex.test(updates.quietHoursStart)) {
      return reply.code(400).send({
        error: { message: "quietHoursStart must be in HH:MM format" },
      });
    }
    if (updates.quietHoursEnd && !timeRegex.test(updates.quietHoursEnd)) {
      return reply.code(400).send({
        error: { message: "quietHoursEnd must be in HH:MM format" },
      });
    }

    // Validate code style indentSize
    if (updates.codeStyle?.indentSize) {
      if (updates.codeStyle.indentSize < 1 || updates.codeStyle.indentSize > 8) {
        return reply.code(400).send({
          error: { message: "indentSize must be between 1 and 8" },
        });
      }
    }

    // Validate code style lineWidth
    if (updates.codeStyle?.lineWidth) {
      if (updates.codeStyle.lineWidth < 40 || updates.codeStyle.lineWidth > 200) {
        return reply.code(400).send({
          error: { message: "lineWidth must be between 40 and 200" },
        });
      }
    }

    const preferences = await personalizationService.updatePreferences(request.userId, updates);

    return {
      data: preferences,
    };
  });

  // ==========================================================================
  // GET /api/personalization/insights - Get learned insights about user
  // ==========================================================================
  app.get("/insights", async (request) => {
    const insights = await personalizationService.getInsights(request.userId);

    return {
      data: insights,
    };
  });

  // ==========================================================================
  // POST /api/personalization/feedback - Record preference signal
  // ==========================================================================
  app.post<{
    Body: {
      signalType: string;
      category: "ui" | "ai" | "code" | "workflow";
      data: Record<string, unknown>;
      context?: string;
      sessionId?: string;
    };
  }>("/feedback", async (request, reply) => {
    const { signalType, category, data, context, sessionId } = request.body;

    // Validate required fields
    if (!signalType || !category || !data) {
      return reply.code(400).send({
        error: { message: "signalType, category, and data are required" },
      });
    }

    // Validate category
    if (!["ui", "ai", "code", "workflow"].includes(category)) {
      return reply.code(400).send({
        error: { message: "category must be 'ui', 'ai', 'code', or 'workflow'" },
      });
    }

    const signal: BehaviorSignal = {
      signalType,
      category,
      data,
      context,
      sessionId,
    };

    await personalizationService.recordSignal(request.userId, signal);

    return {
      data: { success: true },
    };
  });

  // ==========================================================================
  // GET /api/personalization/quiet-hours/status - Check if in quiet hours
  // ==========================================================================
  app.get("/quiet-hours/status", async (request) => {
    const isQuiet = await personalizationService.isQuietHours(request.userId);

    return {
      data: {
        isQuietHours: isQuiet,
        timestamp: new Date().toISOString(),
      },
    };
  });

  // ==========================================================================
  // GET /api/personalization/ai-context - Get AI prompt modifications
  // ==========================================================================
  app.get("/ai-context", async (request) => {
    const context = await personalizationService.getAIPromptModifications(request.userId);

    return {
      data: context,
    };
  });

  // ==========================================================================
  // POST /api/personalization/track/tool - Track tool usage
  // ==========================================================================
  app.post<{
    Body: {
      tool: string;
      context?: string;
    };
  }>("/track/tool", async (request, reply) => {
    const { tool, context } = request.body;

    if (!tool) {
      return reply.code(400).send({
        error: { message: "tool is required" },
      });
    }

    await personalizationService.trackToolUsage(request.userId, tool, context);

    return {
      data: { success: true },
    };
  });

  // ==========================================================================
  // POST /api/personalization/track/language - Track language usage
  // ==========================================================================
  app.post<{
    Body: {
      language: string;
      context?: string;
    };
  }>("/track/language", async (request, reply) => {
    const { language, context } = request.body;

    if (!language) {
      return reply.code(400).send({
        error: { message: "language is required" },
      });
    }

    await personalizationService.trackLanguageUsage(request.userId, language, context);

    return {
      data: { success: true },
    };
  });

  // ==========================================================================
  // POST /api/personalization/track/activity - Track user activity
  // ==========================================================================
  app.post<{
    Body: {
      activityType: string;
      sessionId?: string;
    };
  }>("/track/activity", async (request, reply) => {
    const { activityType, sessionId } = request.body;

    if (!activityType) {
      return reply.code(400).send({
        error: { message: "activityType is required" },
      });
    }

    await personalizationService.trackActivity(request.userId, activityType, sessionId);

    return {
      data: { success: true },
    };
  });

  // ==========================================================================
  // DELETE /api/personalization/signals - Clear behavior signals
  // ==========================================================================
  app.delete<{
    Querystring: {
      category?: string;
      olderThan?: string; // ISO date string
    };
  }>("/signals", async (request, reply) => {
    const { category, olderThan } = request.query;

    // Build where clause
    const where: Record<string, unknown> = { userId: request.userId };

    if (category) {
      if (!["ui", "ai", "code", "workflow"].includes(category)) {
        return reply.code(400).send({
          error: { message: "category must be 'ui', 'ai', 'code', or 'workflow'" },
        });
      }
      where.category = category;
    }

    if (olderThan) {
      const date = new Date(olderThan);
      if (isNaN(date.getTime())) {
        return reply.code(400).send({
          error: { message: "olderThan must be a valid ISO date string" },
        });
      }
      where.createdAt = { lt: date };
    }

    const { prisma } = await import("../db.js");
    const result = await prisma.userBehaviorSignal.deleteMany({ where: where as any });

    return {
      data: {
        deleted: result.count,
      },
    };
  });

  // ==========================================================================
  // POST /api/personalization/reset - Reset preferences to defaults
  // ==========================================================================
  app.post("/reset", async (request) => {
    const { prisma } = await import("../db.js");

    // Delete existing preferences (will be recreated with defaults on next fetch)
    await prisma.userPreferences.deleteMany({
      where: { userId: request.userId },
    });

    // Get fresh defaults
    const preferences = await personalizationService.getPreferences(request.userId);

    return {
      data: preferences,
    };
  });
};
