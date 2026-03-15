import { FastifyPluginAsync } from 'fastify';
import { resolve, join } from 'path';
import { mkdir, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { createReadStream } from 'fs';
import crypto from 'crypto';
import { workspaceManager } from '../services/workspace/workspace-manager.js';
import { sessionPool, type ACPSessionEvent } from '../services/acp/acp-session.js';
import { prisma } from '../db.js';
import { recordUsage } from '../services/claude-query.js';
import {
  startDevServer,
  stopDevServer,
  stopDevServersForWorkspace,
  getDevServerProcess,
  getDevServersForWorkspace,
  getAllDevServersForWorkspace,
  getRunningDevServersForWorkspace,
  type DevServerProcess,
} from '../services/dev-server.js';

/**
 * Build a context prefix for the first message in a workspace linked to a PR review or task.
 */
async function buildWorkspaceContext(workspace: {
  prReviewId?: string | null;
  taskId?: string | null;
}): Promise<string> {
  const parts: string[] = [];

  if (workspace.prReviewId) {
    const review = await prisma.prReview.findUnique({ where: { id: workspace.prReviewId } });
    if (review) {
      parts.push(`## PR Review Context`);
      parts.push(`- **PR:** ${review.title || `${review.owner}/${review.repo}#${review.prNumber}`}`);
      parts.push(`- **URL:** ${review.prUrl}`);
      parts.push(`- **Branch:** ${review.headBranch || '(unknown)'} → ${review.baseBranch || 'main'}`);
      parts.push(`- **Provider:** ${review.provider}`);
      if (review.description) {
        parts.push(`- **Description:** ${review.description.slice(0, 1000)}`);
      }
      if (review.verdict) {
        parts.push(`- **Review Verdict:** ${review.verdict}`);
      }
      if (review.summary) {
        parts.push(`\n### Review Summary\n${review.summary.slice(0, 3000)}`);
      }
      if (review.comments && Array.isArray(review.comments) && (review.comments as any[]).length > 0) {
        const comments = review.comments as Array<{ file: string; line?: number; severity: string; comment: string }>;
        parts.push(`\n### Review Comments (${comments.length} total)`);
        for (const c of comments.slice(0, 30)) {
          const loc = c.line ? `${c.file}:${c.line}` : c.file;
          parts.push(`- [${c.severity}] ${loc}: ${c.comment}`);
        }
        if (comments.length > 30) {
          parts.push(`... and ${comments.length - 30} more comments`);
        }
      }
      if (review.filesChanged && Array.isArray(review.filesChanged)) {
        parts.push(`\n### Files Changed (${(review.filesChanged as string[]).length})`);
        for (const f of (review.filesChanged as string[]).slice(0, 50)) {
          parts.push(`- ${f}`);
        }
        if ((review.filesChanged as string[]).length > 50) {
          parts.push(`... and ${(review.filesChanged as string[]).length - 50} more files`);
        }
      }
    }
  }

  if (workspace.taskId) {
    const task = await prisma.task.findUnique({
      where: { id: workspace.taskId },
      include: {
        repository: { select: { fullName: true, defaultBranch: true } },
        steps: { orderBy: { order: 'asc' }, select: { title: true, status: true, order: true } },
      },
    });
    if (task) {
      parts.push(`## Task Context`);
      parts.push(`- **Title:** ${task.title}`);
      parts.push(`- **Type:** ${task.type} | **Priority:** ${task.priority} | **Status:** ${task.status}`);
      if (task.repository) {
        parts.push(`- **Repository:** ${task.repository.fullName}`);
      }
      if (task.targetBranch) {
        parts.push(`- **Target Branch:** ${task.targetBranch}`);
      }
      if (task.description) {
        parts.push(`\n### Description\n${task.description.slice(0, 3000)}`);
      }
      if (task.enhancedPlan) {
        parts.push(`\n### Implementation Plan\n${task.enhancedPlan.slice(0, 5000)}`);
      }
      if (task.steps && task.steps.length > 0) {
        parts.push(`\n### Steps`);
        for (const step of task.steps) {
          const icon = step.status === 'completed' ? '[done]' : step.status === 'in_progress' ? '[in progress]' : '[ ]';
          parts.push(`${icon} ${step.order}. ${step.title}`);
        }
      }
      if (task.affectedFiles && Array.isArray(task.affectedFiles) && (task.affectedFiles as string[]).length > 0) {
        parts.push(`\n### Affected Files`);
        for (const f of (task.affectedFiles as string[])) {
          parts.push(`- ${f}`);
        }
      }
      if (task.pullRequestUrl) {
        parts.push(`\n- **Existing PR:** ${task.pullRequestUrl}`);
      }
    }
  }

  if (parts.length === 0) return '';

  return `<context>\nThis workspace is linked to the following. Use this context to inform your responses.\n\n${parts.join('\n')}\n</context>\n\n`;
}

export const workspaceRoutes: FastifyPluginAsync = async (app) => {

  // List workspaces
  app.get('/', { preHandler: [app.requireAuth] }, async (request) => {
    const workspaces = await prisma.workspace.findMany({
      where: { userId: request.userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        sessions: { orderBy: { startedAt: 'desc' }, take: 1 },
        prReview: { select: { id: true, title: true, prUrl: true, verdict: true, status: true } },
      }
    });
    return { workspaces };
  });

  // Create workspace
  app.post('/', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = request.body as any;

    // Validate localPath is a git repo if provided
    if (body.localPath) {
      const { resolve, join } = await import('path');
      const { access: fsAccess } = await import('fs/promises');
      const resolved = resolve(body.localPath);
      try {
        await fsAccess(resolved);
      } catch {
        return reply.code(400).send({ error: { message: 'Path does not exist' } });
      }
      try {
        await fsAccess(join(resolved, '.git'));
      } catch {
        return reply.code(400).send({ error: { message: 'Not a git repository. The selected folder must contain a .git directory.' } });
      }
    }

    const workspace = await workspaceManager.create({
      userId: request.userId,
      name: body.name,
      description: body.description,
      repositoryId: body.repositoryId,
      taskId: body.taskId,
      projectId: body.projectId,
      prReviewId: body.prReviewId,
      agentId: body.agentId,
      localPath: body.localPath,
      baseBranch: body.baseBranch,
    });
    return { workspace };
  });

  // Get workspace
  app.get('/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = await prisma.workspace.findUnique({
      where: { id, userId: request.userId },
      include: {
        sessions: {
          orderBy: { startedAt: 'desc' },
          include: { messages: { orderBy: { createdAt: 'asc' } } }
        },
        prReview: { select: { id: true, title: true, prUrl: true, verdict: true, status: true, summary: true, prNumber: true, owner: true, repo: true, provider: true, baseBranch: true, headBranch: true, comments: true, filesChanged: true } },
      }
    });
    if (!workspace) return reply.code(404).send({ error: 'Not found' });

    // Manually fetch linked task (no Prisma relation defined)
    let task: any = null;
    if (workspace.taskId) {
      task = await prisma.task.findUnique({
        where: { id: workspace.taskId },
        select: { id: true, title: true, description: true, type: true, priority: true, status: true, targetBranch: true, pullRequestUrl: true, enhancedPlan: true, affectedFiles: true },
      });
    }

    return { workspace: { ...workspace, task } };
  });

  // Update workspace
  app.patch('/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const workspace = await prisma.workspace.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        agentId: body.agentId,
        agentModel: body.agentModel,
        devServerScript: body.devServerScript,
        status: body.status,
      }
    });
    return { workspace };
  });

  // Delete workspace
  app.delete('/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    await workspaceManager.delete(id);
    return { ok: true };
  });

  // Create a new session (without starting agent — lazy start on first message)
  app.post('/:id/sessions', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) return reply.code(404).send({ error: 'Not found' });

    const dbSession = await prisma.workspaceSession.create({
      data: {
        workspaceId: id,
        agentPid: null,
        status: 'active',
      }
    });

    return { session: dbSession };
  });

  // Send message to session (lazy-starts ACP agent on first message)
  app.post('/:id/sessions/:sessionId/send', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id, sessionId } = request.params as { id: string; sessionId: string };
    const body = request.body as {
      content: string;
      acpSessionId?: string;
      modelId?: string;
      attachments?: Array<{ id: string; type: 'image' | 'file'; name: string; mimeType: string; size: number; data: string }>;
    };
    const content = body.content;
    const attachments = body.attachments;
    const modelId = body.modelId;

    const workspace = await prisma.workspace.findUnique({ where: { id } });
    if (!workspace) return reply.code(404).send({ error: 'Not found' });

    const workDir = workspace.worktreePath || workspace.localPath;

    // Save attachment files to workspace dir and record paths in metadata
    let attachmentMeta: Array<{ id: string; type: string; name: string; mimeType: string; size: number; filename?: string }> = [];
    if (attachments?.length && workDir) {
      const attachDir = join(workDir, '.auto-software/attachments');
      await mkdir(attachDir, { recursive: true });

      for (const att of attachments) {
        const filename = `${crypto.randomUUID().slice(0, 8)}-${att.name}`;
        const filePath = join(attachDir, filename);
        await writeFile(filePath, Buffer.from(att.data, 'base64'));
        attachmentMeta.push({
          id: att.id,
          type: att.type,
          name: att.name,
          mimeType: att.mimeType,
          size: att.size,
          filename,  // relative filename within .auto-software/attachments/
        });
      }
    } else if (attachments?.length) {
      attachmentMeta = attachments.map(a => ({ id: a.id, type: a.type, name: a.name, mimeType: a.mimeType, size: a.size }));
    }

    // Save message to DB (with attachment metadata including filenames for reload)
    await prisma.workspaceMessage.create({
      data: {
        sessionId,
        role: 'user',
        content,
        metadata: attachmentMeta.length
          ? { attachments: attachmentMeta }
          : {},
      }
    });

    let acpSessionId = body.acpSessionId;
    let acpSession = acpSessionId ? sessionPool.get(acpSessionId) : undefined;

    // If no working directory, use a temp directory so the agent can still chat
    let effectiveWorkDir = workDir;
    if (!effectiveWorkDir) {
      const { tmpdir } = await import('os');
      effectiveWorkDir = tmpdir();
    }

    // If no active session, create one and start with the initial prompt
    if (!acpSession) {
      acpSession = sessionPool.create(workspace.agentId, effectiveWorkDir, modelId || workspace.agentModel || undefined);
      acpSessionId = acpSession.id;

      // Check if there's a saved Claude session ID to resume (post-reload scenario)
      const dbSession = await prisma.workspaceSession.findUnique({ where: { id: sessionId } });
      if (dbSession?.claudeSessionId) {
        acpSession.setClaudeSessionId(dbSession.claudeSessionId);
        // Mark as not first message so sendMessage uses --resume
        // We'll call sendMessage instead of start to resume the conversation
      }

      // Persist all chat events to DB for full history on reload
      let agentTextAccum = "";
      let detectedModel = modelId || workspace.agentModel || "unknown";
      const userId = request.userId;

      const saveMsg = (role: string, content: string, metadata?: Record<string, unknown>) => {
        prisma.workspaceMessage.create({
          data: { sessionId, role, content, metadata: (metadata || {}) as any },
        }).catch(() => {});
      };

      acpSession.on("event", (event: ACPSessionEvent) => {
        const d = event.data as Record<string, unknown> | undefined;

        switch (event.type) {
          case "system": {
            if (d?.subtype === "init" && d?.model) {
              detectedModel = d.model as string;
            }
            // Save system events (e.g. "Connected to claude-opus-4-5")
            if (d?.subtype === "init") {
              saveMsg("system", `Connected to ${d?.model || "agent"}`, { subtype: "init", model: d?.model });
              // Persist the Claude session ID so we can resume after page reload
              const claudeId = acpSession!.getClaudeSessionId();
              if (claudeId) {
                prisma.workspaceSession.update({
                  where: { id: sessionId },
                  data: { claudeSessionId: claudeId },
                }).catch(() => {});
              }
            }
            break;
          }
          case "agent_message_chunk": {
            agentTextAccum += ((d?.text as string) || "");
            break;
          }
          case "agent_thought_chunk": {
            // Save thinking blocks individually
            const text = (d?.text as string) || "";
            if (text) {
              saveMsg("thinking", text);
            }
            break;
          }
          case "tool_call": {
            const toolName = (d?.toolName as string) || "Tool";
            saveMsg("tool_call", toolName, { toolName, toolUseId: d?.toolUseId, input: d?.input });
            break;
          }
          case "tool_call_update": {
            const toolName = (d?.toolName as string) || "Tool";
            const result = d?.result;
            const isError = d?.isError || d?.error;
            saveMsg("tool_result", typeof result === "string" ? result : JSON.stringify(result || ""),
              { toolName, isError: !!isError, toolUseId: d?.toolUseId });
            break;
          }
          case "usage_update": {
            const inputTokens = (d?.inputTokens as number) || 0;
            const outputTokens = (d?.outputTokens as number) || 0;
            const costUsd = (d?.totalCost as number) || 0;
            if (inputTokens > 0 || outputTokens > 0) {
              recordUsage({
                userId,
                apiKeyId: null,
                authType: "cli",
                model: detectedModel,
                inputTokens,
                outputTokens,
                costUsd,
                source: "workspace",
                sourceId: id,
                repositoryId: workspace.repositoryId || undefined,
                projectId: workspace.projectId || undefined,
              }).catch(() => {});
            }
            break;
          }
          case "turn_complete": {
            if (agentTextAccum) {
              const text = agentTextAccum;
              agentTextAccum = "";
              saveMsg("assistant", text);
            }
            break;
          }
        }
      });

      // If resuming a previous Claude session (post-reload), use sendMessage
      // which spawns with --resume. Otherwise use start() for a fresh session.
      try {
        if (dbSession?.claudeSessionId) {
          // Resume: mark session active first, then send via sendMessage
          await acpSession.start(); // lazy start (no prompt) — marks session as active
          await acpSession.sendMessage(content, attachments);
        } else {
          // Fresh session: prepend linked entity context (PR review / task) to the first message
          const contextPrefix = await buildWorkspaceContext(workspace);
          const initialPrompt = contextPrefix ? contextPrefix + content : content;
          await acpSession.start(initialPrompt, attachments);
        }
      } catch (err) {
        await sessionPool.remove(acpSessionId);
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: { message: `Failed to start agent: ${msg}` } });
      }

      // Update DB session with PID
      if (acpSession.pid) {
        await prisma.workspaceSession.update({
          where: { id: sessionId },
          data: { agentPid: acpSession.pid }
        });
      }
    } else {
      // Existing session — send follow-up message (fire-and-forget)
      const currentSession = acpSession;
      currentSession.sendMessage(content, attachments).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        currentSession.emit('event', { type: 'error', data: { message: `Failed to send message: ${msg}` }, timestamp: Date.now() });
      });
    }

    return { ok: true, acpSessionId };
  });

  // Stop session
  app.post('/:id/sessions/:sessionId/stop', { preHandler: [app.requireAuth] }, async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const { acpSessionId } = request.body as { acpSessionId: string };

    const acpSession = sessionPool.get(acpSessionId);
    if (acpSession) await acpSession.stop();

    await prisma.workspaceSession.update({
      where: { id: sessionId },
      data: { status: 'completed', endedAt: new Date() }
    });

    return { ok: true };
  });

  // Delete session
  app.delete('/:id/sessions/:sessionId', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id, sessionId } = request.params as { id: string; sessionId: string };

    const session = await prisma.workspaceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.workspaceId !== id) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    // Try to stop the ACP session if running (by agentPid)
    if (session.agentPid) {
      try {
        process.kill(session.agentPid);
      } catch {
        // Ignore — process may already be stopped
      }
    }

    // Delete all messages for the session
    await prisma.workspaceMessage.deleteMany({ where: { sessionId } });

    // Delete the session
    await prisma.workspaceSession.delete({ where: { id: sessionId } });

    return { ok: true };
  });

  // Get workspace file diff
  app.get('/:id/diff', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const diff = await workspaceManager.getWorkspaceDiff(id);
    return { diff };
  });

  // Get workspace changed files
  app.get('/:id/files', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const files = await workspaceManager.getWorkspaceFiles(id);
    return { files };
  });

  // Serve attachment files saved in the workspace directory
  app.get('/:id/attachments/:filename', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id, filename } = request.params as { id: string; filename: string };

    // Validate filename to prevent path traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id, userId: request.userId },
    });
    if (!workspace) return reply.code(404).send({ error: 'Not found' });

    const workDir = workspace.worktreePath || workspace.localPath;
    if (!workDir) return reply.code(404).send({ error: 'No workspace directory' });

    const filePath = join(workDir, '.auto-software/attachments', filename);

    // Verify the resolved path is within the attachments directory (security check)
    const resolvedPath = resolve(filePath);
    const resolvedAttachDir = resolve(join(workDir, '.auto-software/attachments'));
    if (!resolvedPath.startsWith(resolvedAttachDir)) {
      return reply.code(400).send({ error: 'Invalid path' });
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) return reply.code(404).send({ error: 'Not a file' });

      // Infer content type from extension
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
        webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
        txt: 'text/plain', json: 'application/json',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(createReadStream(filePath));
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }
  });

  // ── Dev Server Management ──

  // Start dev server for workspace
  app.post('/:id/dev-server/start', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const workspace = await prisma.workspace.findUnique({ where: { id, userId: request.userId } });
    if (!workspace) return reply.code(404).send({ error: 'Workspace not found' });

    const cwd = workspace.worktreePath || workspace.localPath;
    if (!cwd || !existsSync(cwd)) {
      return reply.code(400).send({ error: 'Workspace has no valid working directory' });
    }

    // Get dev server script from repo or workspace
    let script: string | null = null;
    let repoId = workspace.repositoryId || 'local';
    let repoName = 'local';

    if (workspace.repositoryId) {
      const repo = await prisma.repository.findUnique({ where: { id: workspace.repositoryId } });
      if (repo?.devServerScript) {
        script = repo.devServerScript;
        repoId = repo.id;
        repoName = repo.fullName;
      }
    }

    // Fall back to workspace-level script
    if (!script && workspace.devServerScript) {
      script = workspace.devServerScript;
    }

    if (!script) {
      return reply.code(400).send({ error: 'No dev server script configured. Configure one in the preview panel.' });
    }

    // Stop any existing dev servers for this workspace
    stopDevServersForWorkspace(id);

    // Start the dev server process
    const proc = startDevServer({
      workspaceId: id,
      repositoryId: repoId,
      repoName,
      script,
      cwd,
    });

    return {
      process: serializeDevServerProcess(proc),
    };
  });

  // Stop dev server
  app.post('/:id/dev-server/stop', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { processId?: string };

    if (body.processId) {
      const stopped = stopDevServer(body.processId);
      return { ok: stopped };
    }

    const count = stopDevServersForWorkspace(id);
    return { ok: true, stopped: count };
  });

  // Get dev server processes for workspace (all history)
  app.get('/:id/dev-server', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const procs = getAllDevServersForWorkspace(id);
    return { processes: procs.map(serializeDevServerProcess) };
  });

  // Get dev server logs for a specific process
  app.get('/:id/dev-server/:processId/logs', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { processId } = request.params as { id: string; processId: string };
    const proc = getDevServerProcess(processId);
    if (!proc) return reply.code(404).send({ error: 'Process not found' });
    return {
      logs: proc.logs.join(''),
      status: proc.status,
      exitCode: proc.exitCode,
    };
  });
};

function serializeDevServerProcess(proc: DevServerProcess) {
  return {
    id: proc.id,
    workspaceId: proc.workspaceId,
    repositoryId: proc.repositoryId,
    repoName: proc.repoName,
    script: proc.script,
    status: proc.status,
    exitCode: proc.exitCode,
    startedAt: proc.startedAt,
    completedAt: proc.completedAt,
  };
}
