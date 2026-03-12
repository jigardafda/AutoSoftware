/**
 * AI Assistant Chat Routes
 *
 * Comprehensive API for the AI Assistant:
 * - Conversation management (CRUD)
 * - Streaming chat with MCP tools
 * - Voice settings
 * - Custom MCP server management
 * - Artifact management
 */

import type { FastifyPluginAsync } from "fastify";
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversationTitle,
  archiveConversation,
  deleteConversation,
  streamChat,
  simpleChat,
  createTaskFromChat,
  addMessageFeedback,
  getVoiceSettings,
  updateVoiceSettings,
} from "../services/chat-service.js";
import {
  generateClarifyingQuestions,
  type ClarificationAnswer,
} from "../services/clarification-service.js";
import {
  addMcpServer,
  updateMcpServer,
  deleteMcpServer,
  listMcpServers,
  testMcpServer,
  validateMcpServer,
} from "../services/mcp-server-service.js";
import { prisma } from "../db.js";
import type { ConversationContextType } from "../../../generated/prisma/enums.js";

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Require authentication for all chat routes
  app.addHook("preHandler", (app as any).requireAuth);

  // ══════════════════════════════════════════════════════════════════════════
  // CONVERSATIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /conversations - List user's conversations
   */
  app.get<{
    Querystring: {
      contextType?: ConversationContextType;
      contextId?: string;
      limit?: string;
      includeArchived?: string;
    };
  }>("/conversations", async (request) => {
    const { contextType, contextId, limit, includeArchived } = request.query;

    // Sanitize contextId - ignore "undefined" string
    const sanitizedContextId = contextId && contextId !== "undefined" ? contextId : undefined;

    const conversations = await listConversations(request.userId, {
      contextType: contextType as ConversationContextType | undefined,
      contextId: sanitizedContextId,
      limit: limit ? parseInt(limit, 10) : undefined,
      includeArchived: includeArchived === "true",
    });

    return {
      data: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        contextType: c.contextType,
        contextId: c.contextId,
        messageCount: c._count.messages,
        lastMessage: c.messages[0] || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        archivedAt: c.archivedAt,
      })),
    };
  });

  /**
   * POST /conversations - Create a new conversation
   */
  app.post<{
    Body: {
      contextType?: ConversationContextType;
      contextId?: string;
    };
  }>("/conversations", async (request) => {
    const { contextType = "global", contextId } = request.body || {};

    // Validate context
    if (contextType === "project" && contextId) {
      const project = await prisma.project.findFirst({
        where: { id: contextId, userId: request.userId },
      });
      if (!project) {
        return { error: { message: "Project not found" } };
      }
    } else if (contextType === "repository" && contextId) {
      const repo = await prisma.repository.findFirst({
        where: { id: contextId, userId: request.userId },
      });
      if (!repo) {
        return { error: { message: "Repository not found" } };
      }
    }

    const conversationId = await createConversation(
      request.userId,
      contextType,
      contextId
    );

    return { data: { id: conversationId } };
  });

  /**
   * GET /conversations/:id - Get a conversation with messages
   */
  app.get<{
    Params: { id: string };
  }>("/conversations/:id", async (request, reply) => {
    const conversation = await getConversation(request.params.id, request.userId);

    if (!conversation) {
      return reply.code(404).send({ error: { message: "Conversation not found" } });
    }

    return { data: conversation };
  });

  /**
   * PATCH /conversations/:id - Update conversation (title, archive)
   */
  app.patch<{
    Params: { id: string };
    Body: { title?: string; archive?: boolean };
  }>("/conversations/:id", async (request, reply) => {
    const { title, archive } = request.body;

    if (title !== undefined) {
      await updateConversationTitle(request.params.id, request.userId, title);
    }

    if (archive === true) {
      await archiveConversation(request.params.id, request.userId);
    }

    return { data: { success: true } };
  });

  /**
   * DELETE /conversations/:id - Delete a conversation
   */
  app.delete<{
    Params: { id: string };
  }>("/conversations/:id", async (request) => {
    await deleteConversation(request.params.id, request.userId);
    return { data: { success: true } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT (Streaming)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /conversations/:id/messages - Send a message (streaming SSE response)
   */
  app.post<{
    Params: { id: string };
    Body: {
      message: string;
      attachments?: Array<{
        id: string;
        type: "image" | "file" | "code";
        name: string;
        url?: string;
        content?: string;
        size?: number;
        mimeType?: string;
      }>;
      voiceInput?: boolean;
      voiceDuration?: number;
      stream?: boolean;
    };
  }>("/conversations/:id/messages", async (request, reply) => {
    const { message, attachments, voiceInput, voiceDuration, stream = true } =
      request.body;

    if (!message?.trim()) {
      return reply.code(400).send({ error: { message: "Message is required" } });
    }

    // Verify conversation exists
    const conversation = await getConversation(request.params.id, request.userId);
    if (!conversation) {
      return reply.code(404).send({ error: { message: "Conversation not found" } });
    }

    if (stream) {
      // Set up SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      try {
        for await (const chunk of streamChat(
          request.userId,
          request.params.id,
          message,
          { attachments, voiceInput, voiceDuration }
        )) {
          const data = JSON.stringify(chunk);
          reply.raw.write(`data: ${data}\n\n`);

          // Flush for real-time streaming
          if (typeof (reply.raw as any).flush === "function") {
            (reply.raw as any).flush();
          }
        }

        reply.raw.write("data: [DONE]\n\n");
      } catch (err: any) {
        reply.raw.write(
          `data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`
        );
      }

      reply.raw.end();
    } else {
      // Non-streaming response
      try {
        const result = await simpleChat(
          request.userId,
          request.params.id,
          message,
          { attachments }
        );

        return { data: result };
      } catch (err: any) {
        return reply.code(500).send({ error: { message: err.message } });
      }
    }
  });

  /**
   * POST /messages/:id/feedback - Add feedback to a message
   */
  app.post<{
    Params: { id: string };
    Body: { feedback: "positive" | "negative"; note?: string };
  }>("/messages/:id/feedback", async (request, reply) => {
    const { feedback, note } = request.body;

    if (!["positive", "negative"].includes(feedback)) {
      return reply.code(400).send({ error: { message: "Invalid feedback" } });
    }

    try {
      await addMessageFeedback(request.params.id, request.userId, feedback, note);
      return { data: { success: true } };
    } catch (err: any) {
      return reply.code(404).send({ error: { message: err.message } });
    }
  });

  /**
   * POST /messages/:id/regenerate - Regenerate an AI response
   */
  app.post<{
    Params: { id: string };
  }>("/messages/:id/regenerate", async (request, reply) => {
    // Get the message
    const message = await prisma.chatMessage.findUnique({
      where: { id: request.params.id },
      include: {
        conversation: { select: { id: true, userId: true } },
      },
    });

    if (!message || message.conversation.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Message not found" } });
    }

    if (message.role !== "assistant") {
      return reply.code(400).send({ error: { message: "Can only regenerate assistant messages" } });
    }

    // Find the previous user message
    const prevMessage = await prisma.chatMessage.findFirst({
      where: {
        conversationId: message.conversationId,
        role: "user",
        createdAt: { lt: message.createdAt },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!prevMessage) {
      return reply.code(400).send({ error: { message: "No previous user message found" } });
    }

    // Delete the old assistant message
    await prisma.chatMessage.delete({ where: { id: message.id } });

    // Set up SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      for await (const chunk of streamChat(
        request.userId,
        message.conversationId,
        prevMessage.content,
        {
          attachments: prevMessage.attachments as any,
          voiceInput: prevMessage.voiceInput,
          voiceDuration: prevMessage.voiceDuration || undefined,
        }
      )) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write("data: [DONE]\n\n");
    } catch (err: any) {
      reply.raw.write(
        `data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`
      );
    }

    reply.raw.end();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ARTIFACTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /artifacts/:id - Get an artifact
   */
  app.get<{
    Params: { id: string };
  }>("/artifacts/:id", async (request, reply) => {
    const artifact = await prisma.chatArtifact.findUnique({
      where: { id: request.params.id },
      include: {
        message: {
          include: {
            conversation: { select: { userId: true } },
          },
        },
      },
    });

    if (!artifact || artifact.message.conversation.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Artifact not found" } });
    }

    return { data: artifact };
  });

  /**
   * POST /artifacts/:id/attach-task - Attach artifact to a task
   */
  app.post<{
    Params: { id: string };
    Body: { taskId: string };
  }>("/artifacts/:id/attach-task", async (request, reply) => {
    const { taskId } = request.body;

    // Verify artifact ownership
    const artifact = await prisma.chatArtifact.findUnique({
      where: { id: request.params.id },
      include: {
        message: {
          include: {
            conversation: { select: { userId: true } },
          },
        },
      },
    });

    if (!artifact || artifact.message.conversation.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Artifact not found" } });
    }

    // Verify task ownership
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId: request.userId },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    // Attach artifact to task
    await prisma.chatArtifact.update({
      where: { id: request.params.id },
      data: { taskId },
    });

    return { data: { success: true } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TASK CREATION FROM CHAT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /messages/:id/create-task - Create a task from a chat message
   *
   * If clarification questions exist for the description, returns them
   * instead of creating the task immediately. Pass skipClarification: true
   * to bypass, or include clarificationAnswers to submit with answers.
   */
  app.post<{
    Params: { id: string };
    Body: {
      repositoryId: string;
      title: string;
      description: string;
      type: "improvement" | "bugfix" | "feature" | "refactor" | "security";
      priority: "low" | "medium" | "high" | "critical";
      attachArtifacts?: boolean;
      projectId?: string;
      skipClarification?: boolean;
      clarificationAnswers?: ClarificationAnswer[];
    };
  }>("/messages/:id/create-task", async (request, reply) => {
    const {
      repositoryId,
      title,
      description,
      type,
      priority,
      attachArtifacts,
      projectId,
      skipClarification,
      clarificationAnswers,
    } = request.body;

    if (!repositoryId || !title || !description || !type || !priority) {
      return reply.code(400).send({ error: { message: "Missing required fields" } });
    }

    try {
      // Generate clarifying questions unless skipped or already answered
      if (!skipClarification && !clarificationAnswers?.length) {
        const clarification = await generateClarifyingQuestions(
          request.userId,
          repositoryId,
          description,
          projectId
        );

        // If there are questions to ask, return them instead of creating task
        if (clarification.questions.length > 0) {
          return {
            data: {
              needsClarification: true,
              questions: clarification.questions,
              projectContext: {
                frameworks: clarification.projectContext.detectedFrameworks,
                patterns: clarification.projectContext.detectedPatterns,
                language: clarification.projectContext.primaryLanguage,
              },
              ambiguousTerms: clarification.ambiguousTerms.map((t) => ({
                term: t.term,
                meanings: t.possibleMeanings,
              })),
            },
          };
        }
      }

      // Create the task (clarification skipped, answered, or no questions needed)
      const task = await createTaskFromChat(request.userId, request.params.id, {
        repositoryId,
        title,
        description,
        type,
        priority,
        attachArtifacts,
      });

      return { data: { needsClarification: false, task } };
    } catch (err: any) {
      return reply.code(400).send({ error: { message: err.message } });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // VOICE SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /voice-settings - Get user's voice settings
   */
  app.get("/voice-settings", async (request) => {
    const settings = await getVoiceSettings(request.userId);
    return { data: settings };
  });

  /**
   * PATCH /voice-settings - Update voice settings
   */
  app.patch<{
    Body: {
      voiceEnabled?: boolean;
      pushToTalk?: boolean;
      autoSendDelay?: number;
      language?: string;
      ttsEnabled?: boolean;
      ttsVoice?: string;
      ttsSpeed?: number;
      ttsVolume?: number;
    };
  }>("/voice-settings", async (request) => {
    const settings = await updateVoiceSettings(request.userId, request.body);
    return { data: settings };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOM MCP SERVERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /mcp-servers - List user's custom MCP servers
   */
  app.get<{
    Querystring: { enabledOnly?: string };
  }>("/mcp-servers", async (request) => {
    const servers = await listMcpServers(request.userId, {
      enabledOnly: request.query.enabledOnly === "true",
    });
    return { data: servers };
  });

  /**
   * POST /mcp-servers - Add a new MCP server
   */
  app.post<{
    Body: {
      name: string;
      url: string;
      description?: string;
      authType?: "bearer" | "api_key" | "none";
      authToken?: string;
    };
  }>("/mcp-servers", async (request, reply) => {
    const { name, url, description, authType, authToken } = request.body;

    if (!name || !url) {
      return reply.code(400).send({ error: { message: "Name and URL are required" } });
    }

    const result = await addMcpServer(request.userId, {
      name,
      url,
      description,
      authType,
      authToken,
    });

    if (!result.success) {
      return reply.code(400).send({ error: { message: result.error } });
    }

    return { data: result.server };
  });

  /**
   * POST /mcp-servers/validate - Validate an MCP server URL without adding
   */
  app.post<{
    Body: { url: string; authToken?: string };
  }>("/mcp-servers/validate", async (request, reply) => {
    const { url, authToken } = request.body;

    if (!url) {
      return reply.code(400).send({ error: { message: "URL is required" } });
    }

    const result = await validateMcpServer(url, authToken);

    return { data: result };
  });

  /**
   * PATCH /mcp-servers/:id - Update an MCP server
   */
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      priority?: number;
      authToken?: string;
    };
  }>("/mcp-servers/:id", async (request, reply) => {
    const result = await updateMcpServer(
      request.userId,
      request.params.id,
      request.body
    );

    if (!result.success) {
      return reply.code(400).send({ error: { message: result.error } });
    }

    return { data: result.server };
  });

  /**
   * DELETE /mcp-servers/:id - Delete an MCP server
   */
  app.delete<{
    Params: { id: string };
  }>("/mcp-servers/:id", async (request, reply) => {
    const result = await deleteMcpServer(request.userId, request.params.id);

    if (!result.success) {
      return reply.code(404).send({ error: { message: result.error } });
    }

    return { data: { success: true } };
  });

  /**
   * POST /mcp-servers/:id/test - Test/revalidate an MCP server
   */
  app.post<{
    Params: { id: string };
  }>("/mcp-servers/:id/test", async (request, reply) => {
    const result = await testMcpServer(request.userId, request.params.id);

    if (!result.valid) {
      return { data: { success: false, error: result.error } };
    }

    return { data: { success: true, serverInfo: result.serverInfo, capabilities: result.capabilities } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /conversations/search - Search conversations
   */
  app.get<{
    Querystring: { q: string; limit?: string };
  }>("/conversations/search", async (request) => {
    const { q, limit } = request.query;

    if (!q || q.length < 2) {
      return { data: [] };
    }

    // Search in conversation titles and message content
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: request.userId,
        archivedAt: null,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          {
            messages: {
              some: { content: { contains: q, mode: "insensitive" } },
            },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit ? parseInt(limit, 10) : 20,
      include: {
        _count: { select: { messages: true } },
      },
    });

    return {
      data: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        contextType: c.contextType,
        contextId: c.contextId,
        messageCount: c._count.messages,
        updatedAt: c.updatedAt,
      })),
    };
  });
};
