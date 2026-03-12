/**
 * AI Assistant Clarification Routes
 *
 * Endpoints for the Smart Clarification feature:
 * - Generate clarifying questions based on codebase context
 * - Save and retrieve user preferences
 * - Manage clarification sessions
 */

import type { FastifyPluginAsync } from "fastify";
import {
  generateClarifyingQuestions,
  saveClarificationAnswers,
  getClarificationSession,
  createClarificationSession,
  completeClarificationSession,
  skipClarification,
  getClarificationHistory,
  clearPreferences,
  exportPreferences,
  importPreferences,
  type ClarificationAnswer,
} from "../services/clarification-service.js";
import { prisma } from "../db.js";

export const aiAssistantRoutes: FastifyPluginAsync = async (app) => {
  // Require authentication for all routes
  app.addHook("preHandler", (app as any).requireAuth);

  // ══════════════════════════════════════════════════════════════════════════
  // CLARIFICATION QUESTIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /clarify - Generate clarifying questions for a task description
   *
   * This endpoint analyzes a task description and generates contextual
   * clarifying questions based on:
   * - Detected frameworks and patterns in the codebase
   * - Ambiguous terms that could have multiple meanings
   * - User's previous preferences for this project
   */
  app.post<{
    Body: {
      repositoryId: string;
      taskDescription: string;
      projectId?: string;
    };
  }>("/clarify", async (request, reply) => {
    const { repositoryId, taskDescription, projectId } = request.body;

    if (!repositoryId || !taskDescription) {
      return reply.code(400).send({
        error: { message: "repositoryId and taskDescription are required" },
      });
    }

    // Verify repository ownership
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });

    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    // Verify project ownership if provided
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
      });

      if (!project) {
        return reply.code(404).send({ error: { message: "Project not found" } });
      }
    }

    try {
      const result = await generateClarifyingQuestions(
        request.userId,
        repositoryId,
        taskDescription,
        projectId
      );

      // Create a session if questions were generated
      let sessionId: string | undefined;
      if (result.questions.length > 0) {
        sessionId = await createClarificationSession(
          request.userId,
          repositoryId,
          taskDescription,
          result.questions,
          projectId
        );
      }

      return {
        data: {
          sessionId,
          questions: result.questions,
          projectContext: {
            frameworks: result.projectContext.detectedFrameworks,
            patterns: result.projectContext.detectedPatterns,
            primaryLanguage: result.projectContext.primaryLanguage,
          },
          ambiguousTerms: result.ambiguousTerms.map((t) => ({
            term: t.term,
            meanings: t.possibleMeanings,
          })),
        },
      };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to generate clarifying questions" },
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CLARIFICATION SESSIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /clarify/sessions/:id - Get a clarification session
   */
  app.get<{
    Params: { id: string };
  }>("/clarify/sessions/:id", async (request, reply) => {
    const session = await getClarificationSession(request.params.id, request.userId);

    if (!session) {
      return reply.code(404).send({ error: { message: "Session not found" } });
    }

    return { data: session };
  });

  /**
   * POST /clarify/sessions/:id/complete - Complete a clarification session with answers
   *
   * Saves the user's answers and updates learned preferences
   */
  app.post<{
    Params: { id: string };
    Body: {
      answers: ClarificationAnswer[];
    };
  }>("/clarify/sessions/:id/complete", async (request, reply) => {
    const { answers } = request.body;

    if (!Array.isArray(answers)) {
      return reply.code(400).send({ error: { message: "answers array is required" } });
    }

    try {
      await completeClarificationSession(request.params.id, request.userId, answers);

      return { data: { success: true } };
    } catch (err: any) {
      return reply.code(400).send({
        error: { message: err.message || "Failed to complete clarification" },
      });
    }
  });

  /**
   * POST /clarify/sessions/:id/skip - Skip clarification for a session
   */
  app.post<{
    Params: { id: string };
  }>("/clarify/sessions/:id/skip", async (request, reply) => {
    try {
      await skipClarification(request.params.id, request.userId);

      return { data: { success: true } };
    } catch (err: any) {
      return reply.code(400).send({
        error: { message: err.message || "Failed to skip clarification" },
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PREFERENCES MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /clarify/preferences/:projectId - Get learned preferences for a project
   */
  app.get<{
    Params: { projectId: string };
    Querystring: { limit?: string };
  }>("/clarify/preferences/:projectId", async (request, reply) => {
    const { projectId } = request.params;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;

    // Verify ownership (could be project or repository ID)
    const [project, repo] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, userId: request.userId } }),
      prisma.repository.findFirst({ where: { id: projectId, userId: request.userId } }),
    ]);

    if (!project && !repo) {
      return reply.code(404).send({ error: { message: "Project or repository not found" } });
    }

    try {
      const history = await getClarificationHistory(request.userId, projectId, limit);

      return { data: history };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to get preferences" },
      });
    }
  });

  /**
   * DELETE /clarify/preferences/:projectId - Clear all learned preferences for a project
   */
  app.delete<{
    Params: { projectId: string };
  }>("/clarify/preferences/:projectId", async (request, reply) => {
    const { projectId } = request.params;

    // Verify ownership
    const [project, repo] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, userId: request.userId } }),
      prisma.repository.findFirst({ where: { id: projectId, userId: request.userId } }),
    ]);

    if (!project && !repo) {
      return reply.code(404).send({ error: { message: "Project or repository not found" } });
    }

    try {
      const count = await clearPreferences(request.userId, projectId);

      return { data: { success: true, deletedCount: count } };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to clear preferences" },
      });
    }
  });

  /**
   * GET /clarify/preferences/:projectId/export - Export preferences as JSON
   */
  app.get<{
    Params: { projectId: string };
  }>("/clarify/preferences/:projectId/export", async (request, reply) => {
    const { projectId } = request.params;

    // Verify ownership
    const [project, repo] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, userId: request.userId } }),
      prisma.repository.findFirst({ where: { id: projectId, userId: request.userId } }),
    ]);

    if (!project && !repo) {
      return reply.code(404).send({ error: { message: "Project or repository not found" } });
    }

    try {
      const preferences = await exportPreferences(request.userId, projectId);

      return { data: preferences };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to export preferences" },
      });
    }
  });

  /**
   * POST /clarify/preferences/:projectId/import - Import preferences from JSON
   */
  app.post<{
    Params: { projectId: string };
    Body: {
      repositoryId: string;
      preferences: Record<string, string>;
    };
  }>("/clarify/preferences/:projectId/import", async (request, reply) => {
    const { projectId } = request.params;
    const { repositoryId, preferences } = request.body;

    if (!repositoryId || !preferences || typeof preferences !== "object") {
      return reply.code(400).send({
        error: { message: "repositoryId and preferences object are required" },
      });
    }

    // Verify ownership
    const [project, repo] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, userId: request.userId } }),
      prisma.repository.findFirst({ where: { id: repositoryId, userId: request.userId } }),
    ]);

    if (!project && !repo) {
      return reply.code(404).send({ error: { message: "Project or repository not found" } });
    }

    try {
      const count = await importPreferences(request.userId, projectId, repositoryId, preferences);

      return { data: { success: true, importedCount: count } };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to import preferences" },
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // QUICK CLARIFY (for inline task creation)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /clarify/quick - Quick clarification that returns questions inline
   *
   * Used for immediate clarification without creating a session.
   * Ideal for simple task creation flows where the user can answer immediately.
   */
  app.post<{
    Body: {
      repositoryId: string;
      taskDescription: string;
      projectId?: string;
      skipAmbiguousOnly?: boolean;
    };
  }>("/clarify/quick", async (request, reply) => {
    const { repositoryId, taskDescription, projectId, skipAmbiguousOnly } = request.body;

    if (!repositoryId || !taskDescription) {
      return reply.code(400).send({
        error: { message: "repositoryId and taskDescription are required" },
      });
    }

    // Verify repository ownership
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });

    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const result = await generateClarifyingQuestions(
        request.userId,
        repositoryId,
        taskDescription,
        projectId
      );

      // Filter to disambiguation questions only if requested
      const questions = skipAmbiguousOnly
        ? result.questions.filter((q) => q.type !== "disambiguation")
        : result.questions;

      return {
        data: {
          questions,
          hasAmbiguousTerms: result.ambiguousTerms.length > 0,
          ambiguousTerms: result.ambiguousTerms.map((t) => t.term),
          detectedContext: {
            frameworks: result.projectContext.detectedFrameworks,
            language: result.projectContext.primaryLanguage,
          },
        },
      };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to generate quick clarification" },
      });
    }
  });

  /**
   * POST /clarify/save-inline - Save inline clarification answers without a session
   *
   * Used when answers are collected inline without a formal session.
   */
  app.post<{
    Body: {
      repositoryId: string;
      projectId?: string;
      answers: ClarificationAnswer[];
    };
  }>("/clarify/save-inline", async (request, reply) => {
    const { repositoryId, projectId, answers } = request.body;

    if (!repositoryId || !Array.isArray(answers)) {
      return reply.code(400).send({
        error: { message: "repositoryId and answers array are required" },
      });
    }

    // Verify repository ownership
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });

    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      await saveClarificationAnswers(request.userId, repositoryId, answers, projectId);

      return { data: { success: true, savedCount: answers.length } };
    } catch (err: any) {
      return reply.code(500).send({
        error: { message: err.message || "Failed to save answers" },
      });
    }
  });
};
