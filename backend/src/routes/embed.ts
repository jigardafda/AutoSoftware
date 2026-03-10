import type { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";
import { renderEmbedPage } from "../templates/embed.js";

const MAX_SUBMISSIONS_PER_HOUR = 3;

export const embedRoutes: FastifyPluginAsync = async (app) => {
  // No requireAuth — these are public routes

  // Helper: get or create session token from cookie
  function getSessionToken(request: any, reply: any): string {
    const existing = request.cookies.embed_session;
    if (existing) {
      const unsigned = request.unsignCookie(existing);
      if (unsigned.valid && unsigned.value) return unsigned.value;
    }
    const token = crypto.randomUUID();
    reply.setCookie("embed_session", token, {
      path: "/embed/",
      httpOnly: true,
      signed: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "none",
      secure: true,
    });
    return token;
  }

  // Serve the HTML embed page
  app.get<{ Params: { projectId: string }; Querystring: { preview?: string } }>(
    "/:projectId",
    async (request, reply) => {
      const project = await prisma.project.findUnique({
        where: { id: request.params.projectId },
      });
      if (!project) return reply.code(404).send("Project not found");

      let config = await prisma.embedConfig.findUnique({
        where: { projectId: project.id },
      });
      if (!config) {
        config = await prisma.embedConfig.create({ data: { projectId: project.id } });
      }
      if (!config.enabled && request.query.preview !== "true") {
        return reply.code(403).send("Embed is disabled for this project");
      }

      // Set session cookie (skip for preview)
      if (request.query.preview !== "true") {
        getSessionToken(request, reply);
      }

      const html = renderEmbedPage({
        title: config.title,
        welcomeMessage: config.welcomeMessage,
        logoUrl: config.logoUrl,
        primaryColor: config.primaryColor,
        backgroundColor: config.backgroundColor,
        textColor: config.textColor,
        borderRadius: config.borderRadius,
        fontFamily: config.fontFamily,
        maxFileSize: config.maxFileSize,
        maxTotalSize: config.maxTotalSize,
        allowedFileTypes: config.allowedFileTypes,
        language: config.language,
        projectId: project.id,
      }, project.name);
      return reply.type("text/html").send(html);
    }
  );

  // Submit a new requirement
  app.post<{ Params: { projectId: string }; Body: { title: string; description: string; inputMethod?: string; attachments?: any[] } }>(
    "/:projectId/submit",
    async (request, reply) => {
      const project = await prisma.project.findUnique({ where: { id: request.params.projectId } });
      if (!project) return reply.code(404).send({ error: { message: "Project not found" } });

      const config = await prisma.embedConfig.findUnique({ where: { projectId: project.id } });
      if (!config?.enabled) return reply.code(403).send({ error: { message: "Embed disabled" } });

      const sessionToken = getSessionToken(request, reply);
      const { title, description, inputMethod, attachments } = request.body;

      // Validate content
      if (!title || title.trim().length < 5) {
        return reply.code(400).send({ error: { message: "Title must be at least 5 characters" } });
      }
      if (!description || description.trim().length < 20) {
        return reply.code(400).send({ error: { message: "Description must be at least 20 characters" } });
      }

      // Validate attachments
      if (attachments && Array.isArray(attachments)) {
        let totalSize = 0;
        for (const file of attachments) {
          if (!file.filename || !file.data) continue;
          const ext = file.filename.split(".").pop()?.toLowerCase();
          if (ext && !config.allowedFileTypes.includes(ext)) {
            return reply.code(400).send({ error: { message: `File type .${ext} is not allowed` } });
          }
          const sizeBytes = Buffer.byteLength(file.data, "base64");
          if (sizeBytes > config.maxFileSize * 1024 * 1024) {
            return reply.code(400).send({ error: { message: `File ${file.filename} exceeds ${config.maxFileSize}MB limit` } });
          }
          totalSize += sizeBytes;
        }
        if (totalSize > config.maxTotalSize * 1024 * 1024) {
          return reply.code(400).send({ error: { message: `Total file size exceeds ${config.maxTotalSize}MB limit` } });
        }
      }

      // Rate limit
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await prisma.embedSubmission.count({
        where: { projectId: project.id, sessionToken, createdAt: { gte: oneHourAgo } },
      });
      if (recentCount >= MAX_SUBMISSIONS_PER_HOUR) {
        return reply.code(429).send({ error: { message: "Too many submissions. Please try again later." } });
      }

      const submission = await prisma.embedSubmission.create({
        data: {
          projectId: project.id,
          sessionToken,
          title: title.trim(),
          description: description.trim(),
          inputMethod: inputMethod || "text",
          attachments: attachments || [],
        },
      });

      await schedulerService.queueEmbedScreening(submission.id);

      return reply.code(201).send({ data: { id: submission.id, screeningStatus: "pending" } });
    }
  );

  // Get submission status (cookie-gated)
  app.get<{ Params: { projectId: string; id: string } }>(
    "/:projectId/submission/:id",
    async (request, reply) => {
      const sessionToken = getSessionToken(request, reply);

      const submission = await prisma.embedSubmission.findFirst({
        where: {
          id: request.params.id,
          projectId: request.params.projectId,
          sessionToken,
        },
        include: {
          questions: { orderBy: [{ round: "asc" }, { sortOrder: "asc" }] },
        },
      });
      if (!submission) return reply.code(404).send({ error: { message: "Submission not found" } });

      // Strip base64 data from attachments in response
      const attachments = (submission.attachments as any[]).map(({ data, ...rest }) => rest);

      return {
        data: {
          ...submission,
          attachments,
        },
      };
    }
  );

  // Submit clarification answers
  app.post<{ Params: { projectId: string; id: string }; Body: { answers: Record<string, any> } }>(
    "/:projectId/submission/:id/answers",
    async (request, reply) => {
      const sessionToken = getSessionToken(request, reply);

      const submission = await prisma.embedSubmission.findFirst({
        where: {
          id: request.params.id,
          projectId: request.params.projectId,
          sessionToken,
          screeningStatus: "needs_input",
        },
      });
      if (!submission) return reply.code(404).send({ error: { message: "Submission not found or not awaiting input" } });

      const { answers } = request.body;
      if (!answers || typeof answers !== "object") {
        return reply.code(400).send({ error: { message: "Answers object is required" } });
      }

      // Update each question's answer
      const questions = await prisma.embedQuestion.findMany({
        where: { submissionId: submission.id, round: submission.clarificationRound },
      });

      for (const q of questions) {
        if (answers[q.questionKey] !== undefined) {
          await prisma.embedQuestion.update({
            where: { id: q.id },
            data: { answer: answers[q.questionKey] },
          });
        }
      }

      // Re-queue for screening
      await prisma.embedSubmission.update({
        where: { id: submission.id },
        data: { screeningStatus: "screening" },
      });

      await schedulerService.queueEmbedScreening(submission.id);

      return { data: { success: true } };
    }
  );

  // List all submissions for current session
  app.get<{ Params: { projectId: string } }>(
    "/:projectId/submissions",
    async (request, reply) => {
      const sessionToken = getSessionToken(request, reply);

      const submissions = await prisma.embedSubmission.findMany({
        where: {
          projectId: request.params.projectId,
          sessionToken,
        },
        include: {
          questions: { orderBy: [{ round: "asc" }, { sortOrder: "asc" }] },
        },
        orderBy: { createdAt: "desc" },
      });

      const data = submissions.map((sub) => ({
        id: sub.id,
        title: sub.title,
        description: sub.description,
        screeningStatus: sub.screeningStatus,
        screeningScore: sub.screeningScore,
        screeningReason: sub.screeningReason,
        clarificationRound: sub.clarificationRound,
        inputMethod: sub.inputMethod,
        createdAt: sub.createdAt,
        questions: sub.questions,
      }));

      return { data };
    }
  );

  // Get embed config (public, for preview rendering)
  app.get<{ Params: { projectId: string } }>(
    "/:projectId/config",
    async (request, reply) => {
      const config = await prisma.embedConfig.findFirst({
        where: { projectId: request.params.projectId },
      });
      if (!config) return reply.code(404).send({ error: { message: "Config not found" } });

      return { data: config };
    }
  );
};
