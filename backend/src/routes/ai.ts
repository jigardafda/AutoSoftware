import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { config } from "../config.js";
import Anthropic from "@anthropic-ai/sdk";

const getClient = () =>
  new Anthropic({ apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY });

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // POST /command - parse natural language command
  app.post<{ Body: { text: string } }>("/command", async (request, reply) => {
    const { text } = request.body;
    if (!text)
      return reply.code(400).send({ error: { message: "text is required" } });

    // Get user context
    const repos = await prisma.repository.findMany({
      where: { userId: request.userId },
      select: { id: true, fullName: true },
    });
    const tasks = await prisma.task.findMany({
      where: { userId: request.userId },
      select: { id: true, title: true, status: true },
      take: 20,
      orderBy: { updatedAt: "desc" },
    });

    try {
      const client = getClient();
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: `You parse user commands for a code analysis tool. Given the user's repos and tasks, return a JSON action.

Available actions:
- {"action": "scan", "repoId": "...", "repoName": "..."} - trigger a scan
- {"action": "create_task", "repoId": "...", "title": "...", "description": "..."} - create a task
- {"action": "navigate", "path": "/dashboard|/repos|/tasks|/scans|/activity|/settings"} - navigate
- {"action": "search", "query": "...", "results": [...]} - fuzzy search results from repos/tasks

User's repos: ${JSON.stringify(repos)}
Recent tasks: ${JSON.stringify(tasks)}

Return ONLY valid JSON, no other text.`,
        messages: [{ role: "user", content: text }],
      });

      const content = response.content[0];
      if (content.type === "text") {
        const parsed = JSON.parse(content.text);
        return { data: parsed };
      }
      return reply
        .code(500)
        .send({ error: { message: "Unexpected response" } });
    } catch (err: any) {
      return reply
        .code(500)
        .send({ error: { message: err.message || "AI command failed" } });
    }
  });

  // POST /chat - streaming AI chat
  app.post<{ Body: { message: string; context?: any } }>(
    "/chat",
    async (request, reply) => {
      const { message, context } = request.body;
      if (!message)
        return reply
          .code(400)
          .send({ error: { message: "message is required" } });

      const repos = await prisma.repository.findMany({
        where: { userId: request.userId },
        select: {
          id: true,
          fullName: true,
          status: true,
          lastScannedAt: true,
        },
      });
      const recentTasks = await prisma.task.findMany({
        where: { userId: request.userId },
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          priority: true,
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
      });

      try {
        const client = getClient();

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const stream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: `You are an AI assistant for AutoSoftware, a code analysis and improvement platform. Help users understand their repositories, tasks, and scan results.

User's repositories: ${JSON.stringify(repos)}
Recent tasks: ${JSON.stringify(recentTasks)}
Current page context: ${JSON.stringify(context || {})}

Be concise and helpful. Use markdown for formatting.`,
          messages: [{ role: "user", content: message }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            reply.raw.write(
              `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
            );
          }
        }

        reply.raw.write(`data: [DONE]\n\n`);
        reply.raw.end();
      } catch (err: any) {
        reply.raw.write(
          `data: ${JSON.stringify({ error: err.message })}\n\n`
        );
        reply.raw.end();
      }
    }
  );

  // GET /insights - cached AI insights
  app.get("/insights", async (request) => {
    const insights = await prisma.aiInsight.findMany({
      where: {
        userId: request.userId,
        dismissed: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return { data: insights };
  });

  // POST /insights/:id/dismiss
  app.post<{ Params: { id: string } }>(
    "/insights/:id/dismiss",
    async (request) => {
      await prisma.aiInsight.update({
        where: { id: request.params.id },
        data: { dismissed: true },
      });
      return { data: { success: true } };
    }
  );
};
