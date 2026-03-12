import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { Pool } from "pg";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { repoRoutes } from "./routes/repos.js";
import { taskRoutes } from "./routes/tasks.js";
import { scanRoutes } from "./routes/scans.js";
import { aiRoutes } from "./routes/ai.js";
import { activityRoutes } from "./routes/activity.js";
import { queueRoutes } from "./routes/queues.js";
import { apiKeyRoutes } from "./routes/api-keys.js";
import { projectRoutes } from "./routes/projects.js";
import { integrationRoutes } from "./routes/integrations.js";
import { embedRoutes } from "./routes/embed.js";
import { settingsRoutes } from "./routes/settings.js";
import { pluginRoutes } from "./routes/plugins.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { presenceRoutes } from "./routes/presence.js";
import { batchRoutes } from "./routes/batch.js";
import { chatRoutes } from "./routes/chat.js";
import { aiAssistantRoutes } from "./routes/ai-assistant.js";
import { taskForkRoutes } from "./routes/task-fork.js";
import { taskGenealogyRoutes } from "./routes/task-genealogy.js";
import { collaborationRoutes } from "./routes/collaboration.js";
import { dependencyRoutes } from "./routes/dependencies.js";
import { predictionRoutes } from "./routes/predictions.js";
import { codeHealthRoutes } from "./routes/code-health.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { suggestionRoutes } from "./routes/suggestions.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { teamRoutes } from "./routes/team.js";
import { memoryRoutes } from "./routes/memory.js";
import { notificationRoutes } from "./routes/notifications.js";
import { canvasRoutes } from "./routes/canvas.js";
import { personalizationRoutes } from "./routes/personalization.js";
import { triggerRoutes } from "./routes/triggers.js";
import { aiMetricsRoutes } from "./routes/ai-metrics.js";
import { schedulerService } from "./services/scheduler.js";
import { registerWebSocket } from "./websocket/index.js";
import { initTerminalStream, shutdownTerminalStream } from "./websocket/terminal-stream.js";

// Register integration adapters
import "./services/integrations/index.js";

// Create PostgreSQL pool for WebSocket event listener
const pool = new Pool({
  connectionString: config.databaseUrl,
});

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: config.frontendUrl,
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
  parseOptions: {},
});

app.decorateRequest("userId", "");
app.addHook("preHandler", async (request) => {
  const token = request.cookies.session_token;
  if (token) {
    const unsigned = request.unsignCookie(token);
    if (unsigned.valid && unsigned.value) {
      request.userId = unsigned.value;
    }
  }
});

app.decorate("requireAuth", async (request: any, reply: any) => {
  if (!request.userId) {
    reply.code(401).send({ error: { message: "Unauthorized" } });
  }
});

// Register WebSocket support
try {
  await registerWebSocket(app, pool);
  console.log("WebSocket registered at /ws");

  // Initialize terminal streaming for live execution view
  initTerminalStream(pool);
  console.log("Terminal streaming initialized");
} catch (err) {
  console.warn("WebSocket registration failed:", err);
}

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(repoRoutes, { prefix: "/api/repos" });
await app.register(taskRoutes, { prefix: "/api/tasks" });
await app.register(scanRoutes, { prefix: "/api/scans" });
await app.register(aiRoutes, { prefix: "/api/ai" });
await app.register(activityRoutes, { prefix: "/api/activity" });
await app.register(queueRoutes, { prefix: "/api/queues" });
await app.register(apiKeyRoutes, { prefix: "/api/api-keys" });
await app.register(projectRoutes, { prefix: "/api/projects" });
await app.register(integrationRoutes, { prefix: "/api/integrations" });
await app.register(settingsRoutes, { prefix: "/api/settings" });
await app.register(pluginRoutes, { prefix: "/api/plugins" });
await app.register(analyticsRoutes, { prefix: "/api/analytics" });
await app.register(presenceRoutes, { prefix: "/api/presence" });
await app.register(batchRoutes, { prefix: "/api/batch" });
await app.register(chatRoutes, { prefix: "/api/chat" });
await app.register(aiAssistantRoutes, { prefix: "/api/ai-assistant" });
await app.register(taskForkRoutes, { prefix: "/api/tasks" });
await app.register(taskGenealogyRoutes, { prefix: "/api/tasks" });
await app.register(collaborationRoutes, { prefix: "/api/collaboration" });
await app.register(dependencyRoutes, { prefix: "/api/dependencies" });
await app.register(predictionRoutes, { prefix: "/api/predictions" });
await app.register(codeHealthRoutes, { prefix: "/api/code-health" });
await app.register(webhookRoutes, { prefix: "/webhooks" });
await app.register(suggestionRoutes, { prefix: "/api/suggestions" });
await app.register(feedbackRoutes, { prefix: "/api/feedback" });
await app.register(teamRoutes, { prefix: "/api/team" });
await app.register(memoryRoutes, { prefix: "/api/memory" });
await app.register(notificationRoutes, { prefix: "/api/notifications" });
await app.register(canvasRoutes, { prefix: "/api/canvas" });
await app.register(personalizationRoutes, { prefix: "/api/personalization" });
await app.register(triggerRoutes, { prefix: "/api/triggers" });
await app.register(aiMetricsRoutes, { prefix: "/api/ai-metrics" });
await app.register(embedRoutes, { prefix: "/embed" });

app.get("/api/health", async () => ({ status: "ok" }));

// Only start scheduler if DATABASE_URL is available
try {
  await schedulerService.start();
} catch (err) {
  console.warn("Scheduler failed to start (DB may not be running):", err);
}

await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`Backend running on port ${config.port}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await schedulerService.stop();
    await shutdownTerminalStream();
    await pool.end();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  });
}
