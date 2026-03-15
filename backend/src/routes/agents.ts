import { FastifyPluginAsync } from "fastify";
import { agentRegistry } from "../services/acp/agent-registry.js";
import { sessionPool } from "../services/acp/acp-session.js";

// ------- Request body / param schemas -------

interface AgentIdParams {
  id: string;
}

interface SessionIdParams {
  sessionId: string;
}

interface CreateSessionBody {
  agentId: string;
  workspacePath: string;
}

interface SendMessageBody {
  content: string;
}

interface ApprovalBody {
  requestId: string;
  approved: boolean;
  reason?: string;
}

// ------- Route plugin -------

export const agentRoutes: FastifyPluginAsync = async (app) => {
  // ---- Agent registry endpoints ----

  /** List all registered agents with their availability status. */
  app.get("/", { preHandler: [app.requireAuth] }, async () => {
    const agents = agentRegistry.getAll();
    return { agents };
  });

  /** Re-detect which agents are installed on the system. */
  app.post("/detect", { preHandler: [app.requireAuth] }, async () => {
    const agents = await agentRegistry.detectAll();
    return { agents };
  });

  /** Get details for a single agent by ID. */
  app.get<{ Params: AgentIdParams }>(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { id } = request.params;
      const agent = agentRegistry.getById(id);
      if (!agent) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      return { agent };
    }
  );

  /** Test an agent+model combination by running a quick test prompt. */
  app.post<{ Body: { agentId: string; modelId?: string } }>(
    "/test",
    { preHandler: [app.requireAuth] },
    async (request) => {
      const { agentId, modelId } = request.body;
      const result = await agentRegistry.testAgent(agentId, modelId);
      return result;
    }
  );

  /** Install an npx-based agent globally. */
  app.post<{ Body: { agentId: string } }>(
    "/install",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { agentId } = request.body;
      const result = await agentRegistry.installAgent(agentId);
      if (!result.success) {
        return reply.code(400).send({ error: result.message });
      }
      return result;
    }
  );

  // ---- Session management endpoints ----

  /** List all active sessions. */
  app.get("/sessions", { preHandler: [app.requireAuth] }, async () => {
    const sessions = sessionPool.getAll().map((s) => s.toInfo());
    return { sessions };
  });

  /** Create and start a new ACP session with a specified agent. */
  app.post<{ Body: CreateSessionBody }>(
    "/sessions",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { agentId, workspacePath } = request.body;

      if (!agentId || !workspacePath) {
        return reply
          .code(400)
          .send({ error: "agentId and workspacePath are required" });
      }

      const agent = agentRegistry.getById(agentId);
      if (!agent) {
        return reply
          .code(404)
          .send({ error: `Agent "${agentId}" is not registered` });
      }
      if (!agent.available) {
        return reply.code(400).send({
          error: `Agent "${agentId}" is not available. Make sure "${agent.command}" is installed.`,
        });
      }

      try {
        const session = sessionPool.create(agentId, workspacePath);
        await session.start();
        return {
          sessionId: session.id,
          agentId: session.agentId,
          status: session.status,
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to start session";
        return reply.code(500).send({ error: message });
      }
    }
  );

  /** Get the current status of a session. */
  app.get<{ Params: SessionIdParams }>(
    "/sessions/:sessionId",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { sessionId } = request.params;
      const session = sessionPool.get(sessionId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }
      return { session: session.toInfo() };
    }
  );

  /** Send a user message to a running session. */
  app.post<{ Params: SessionIdParams; Body: SendMessageBody }>(
    "/sessions/:sessionId/message",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { sessionId } = request.params;
      const { content } = request.body;

      if (!content) {
        return reply.code(400).send({ error: "content is required" });
      }

      const session = sessionPool.get(sessionId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      try {
        await session.sendMessage(content);
        return { ok: true };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to send message";
        return reply.code(400).send({ error: message });
      }
    }
  );

  /** Approve or reject a pending agent action. */
  app.post<{ Params: SessionIdParams; Body: ApprovalBody }>(
    "/sessions/:sessionId/approve",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { sessionId } = request.params;
      const { requestId, approved } = request.body;

      if (!requestId || typeof approved !== "boolean") {
        return reply
          .code(400)
          .send({ error: "requestId (string) and approved (boolean) are required" });
      }

      const session = sessionPool.get(sessionId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // Approvals not currently supported with stream-json protocol (Claude Code runs with --permission-mode=bypassPermissions)
      return { ok: true };
    }
  );

  /** Stop a running session. */
  app.delete<{ Params: SessionIdParams }>(
    "/sessions/:sessionId",
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const { sessionId } = request.params;
      const session = sessionPool.get(sessionId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      await session.stop();
      return { ok: true, status: session.status };
    }
  );
};
