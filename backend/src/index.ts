import "./types.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
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
import { schedulerService } from "./services/scheduler.js";

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

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(repoRoutes, { prefix: "/api/repos" });
await app.register(taskRoutes, { prefix: "/api/tasks" });
await app.register(scanRoutes, { prefix: "/api/scans" });
await app.register(aiRoutes, { prefix: "/api/ai" });
await app.register(activityRoutes, { prefix: "/api/activity" });
await app.register(queueRoutes, { prefix: "/api/queues" });
await app.register(apiKeyRoutes, { prefix: "/api/api-keys" });
await app.register(projectRoutes, { prefix: "/api/projects" });

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
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  });
}
