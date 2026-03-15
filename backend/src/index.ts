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
import { agentRoutes } from "./routes/agents.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { reviewRoutes } from "./routes/reviews.js";
import { schedulerService } from "./services/scheduler.js";
import { agentRegistry } from "./services/acp/agent-registry.js";
import { sessionPool } from "./services/acp/acp-session.js";
import { registerWebSocket } from "./websocket/index.js";
import { initTerminalStream, shutdownTerminalStream } from "./websocket/terminal-stream.js";
import { registerPreviewProxy } from "./services/browser-preview/preview-proxy.js";

// Register integration adapters
import "./services/integrations/index.js";

// Create PostgreSQL pool for WebSocket event listener
const pool = new Pool({
  connectionString: config.databaseUrl,
});

const app = Fastify({
  logger: process.env.IS_BUNDLED !== "1",
  bodyLimit: 20 * 1024 * 1024, // 20MB for image attachments
});

await app.register(cors, {
  origin: config.frontendUrl,
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
  parseOptions: {},
});

app.decorateRequest("userId", "");
app.decorateRequest("isLocalAuth", false);

// In local/CLI mode, auto-create a local user and bypass auth
const isLocalMode = process.env.IS_BUNDLED === "1";
let localUserId: string | null = null;

if (isLocalMode) {
  try {
    const localUser = await prisma.user.upsert({
      where: { email: "local@autosoftware.app" },
      create: { email: "local@autosoftware.app", name: "Local User" },
      update: {},
    });
    localUserId = localUser.id;
  } catch {
    // DB may not be ready yet — will be set later
  }
}

app.addHook("preHandler", async (request) => {
  const token = request.cookies.session_token;
  if (token) {
    const unsigned = request.unsignCookie(token);
    if (unsigned.valid && unsigned.value) {
      request.userId = unsigned.value;
    }
  }
  // In local mode, fall back to the local user if no session
  if (!request.userId && isLocalMode && localUserId) {
    request.userId = localUserId;
    (request as any).isLocalAuth = true;
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
await app.register(agentRoutes, { prefix: "/api/agents" });
await app.register(workspaceRoutes, { prefix: "/api/workspaces" });
await app.register(reviewRoutes, { prefix: "/api/reviews" });
await app.register(embedRoutes, { prefix: "/embed" });

// Register browser preview proxy (local mode only)
registerPreviewProxy(app);

app.get("/api/health", async () => ({ status: "ok" }));

// Filesystem browse endpoint — for local folder selection in CLI mode
app.get<{ Querystring: { path?: string } }>("/api/filesystem/browse", async (request, reply) => {
  const targetPath = request.query.path || process.env.HOME || "/";
  const { resolve, join } = await import("path");
  const { readdir, stat, access: fsAccess } = await import("fs/promises");

  const resolved = resolve(targetPath);

  try {
    await fsAccess(resolved);
  } catch {
    return reply.code(404).send({ error: { message: "Path not found" } });
  }

  const info = await stat(resolved);
  if (!info.isDirectory()) {
    return reply.code(400).send({ error: { message: "Path is not a directory" } });
  }

  // Check if this directory is a git repo
  let isGitRepo = false;
  try {
    await fsAccess(join(resolved, ".git"));
    isGitRepo = true;
  } catch {}

  // List directory entries
  const entries = await readdir(resolved, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const fullPath = join(resolved, e.name);
      // Quick git check for each subdirectory
      let childIsGit = false;
      try {
        const { accessSync } = require("fs");
        accessSync(join(fullPath, ".git"));
        childIsGit = true;
      } catch {}
      return { name: e.name, path: fullPath, isGitRepo: childIsGit };
    });

  // Get parent path
  const parentPath = resolve(resolved, "..");

  return {
    path: resolved,
    parent: parentPath !== resolved ? parentPath : null,
    isGitRepo,
    entries: dirs,
  };
});

// List branches for a local git repo path
app.get<{ Querystring: { path: string } }>("/api/filesystem/branches", async (request, reply) => {
  const targetPath = request.query.path;
  if (!targetPath) {
    return reply.code(400).send({ error: { message: "Query parameter 'path' is required" } });
  }

  const { resolve, join } = await import("path");
  const { access: fsAccess } = await import("fs/promises");
  const resolved = resolve(targetPath);

  try {
    await fsAccess(join(resolved, ".git"));
  } catch {
    return reply.code(400).send({ error: { message: "Not a git repository" } });
  }

  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(resolved);
    const branchSummary = await git.branch();
    const branches = branchSummary.all
      .filter((name) => !name.startsWith("remotes/"))
      .map((name) => ({
        name,
        isDefault: name === branchSummary.current,
      }))
      .sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
    return { data: branches };
  } catch (err: any) {
    return reply.code(500).send({ error: { message: `Failed to list branches: ${err.message}` } });
  }
});

// Config endpoint — tells the frontend if we're running in local/CLI mode
app.get("/api/config", async () => ({
  localMode: process.env.IS_BUNDLED === "1",
}));

// Detect available coding agents (non-blocking)
try {
  const detectedAgents = await agentRegistry.detectAll();
  const availableCount = detectedAgents.filter((a) => a.available).length;
  console.log(`Agent registry: ${availableCount}/${detectedAgents.length} agents available`);
} catch (err) {
  console.warn("Agent detection failed:", err);
}

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
    await sessionPool.stopAll();
    await schedulerService.stop();
    await shutdownTerminalStream();
    await pool.end();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  });
}
