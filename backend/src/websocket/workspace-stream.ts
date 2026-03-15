import { FastifyInstance } from 'fastify';
import { sessionPool } from '../services/acp/acp-session.js';
import type { PermissionPolicy } from '../services/acp/acp-session.js';
import {
  createPtySession,
  getPtySession,
  getActiveSessionForWorkspace,
  writeToPty,
  resizePty,
  closePtySession,
} from '../services/pty-service.js';
import { prisma } from '../db.js';
import { getDevServerProcess } from '../services/dev-server.js';

export function registerWorkspaceStream(app: FastifyInstance) {
  app.get('/ws/workspace/:workspaceId', { websocket: true }, (socket, request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    let ptySessionId: string | null = null;

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // ── Subscribe to ACP session events ──
        if (msg.type === 'subscribe' && msg.acpSessionId) {
          const session = sessionPool.get(msg.acpSessionId);
          if (session) {
            for (const event of session.getBufferedEvents()) {
              if (socket.readyState === 1) {
                socket.send(JSON.stringify(event));
              }
            }

            const handler = (event: any) => {
              if (socket.readyState === 1) {
                socket.send(JSON.stringify(event));
              }
            };
            session.on('event', handler);
            socket.on('close', () => session.off('event', handler));
          }
        }

        // ── Update permission policy ──
        if (msg.type === 'set_permission_policy' && msg.acpSessionId && msg.policy) {
          const session = sessionPool.get(msg.acpSessionId);
          if (session) {
            const validPolicies: PermissionPolicy[] = ['auto', 'supervised', 'plan'];
            if (validPolicies.includes(msg.policy)) {
              session.permissionPolicy = msg.policy;
            }
          }
        }

        // ── Terminal: start or attach to PTY session ──
        if (msg.type === 'terminal:start') {
          const cols = msg.cols || 120;
          const rows = msg.rows || 30;

          // Get workspace working directory
          const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
          if (!workspace) {
            socket.send(JSON.stringify({ type: 'terminal:error', data: 'Workspace not found' }));
            return;
          }

          const cwd = workspace.worktreePath || workspace.localPath;
          if (!cwd) {
            socket.send(JSON.stringify({ type: 'terminal:error', data: 'No working directory' }));
            return;
          }

          // Verify directory exists
          const fs = await import('fs');
          if (!fs.existsSync(cwd)) {
            console.error(`[workspace-stream] PTY cwd does not exist: ${cwd}`);
            socket.send(JSON.stringify({ type: 'terminal:error', data: `Working directory not found: ${cwd}` }));
            return;
          }

          // Reuse existing PTY session for this workspace, or create a new one
          let ptySession = getActiveSessionForWorkspace(workspaceId);
          if (!ptySession) {
            const id = `pty-${workspaceId}-${Date.now()}`;
            ptySession = createPtySession(id, workspaceId, cwd, cols, rows);
          }

          ptySessionId = ptySession.id;

          // Send output to this WebSocket client
          const outputHandler = (data: string) => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'terminal:output', data }));
            }
          };

          const exitHandler = (exitCode: number) => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'terminal:exit', exitCode }));
            }
          };

          ptySession.emitter.on('output', outputHandler);
          ptySession.emitter.on('exit', exitHandler);

          // Clean up on socket close
          socket.on('close', () => {
            ptySession!.emitter.off('output', outputHandler);
            ptySession!.emitter.off('exit', exitHandler);
          });

          // Confirm terminal is ready
          socket.send(JSON.stringify({
            type: 'terminal:ready',
            sessionId: ptySession.id,
          }));
        }

        // ── Terminal: user input ──
        if (msg.type === 'terminal:input' && ptySessionId) {
          writeToPty(ptySessionId, msg.data);
        }

        // ── Terminal: resize ──
        if (msg.type === 'terminal:resize' && ptySessionId) {
          if (msg.cols && msg.rows) {
            resizePty(ptySessionId, msg.cols, msg.rows);
          }
        }

        // ── Dev Server: subscribe to logs ──
        if (msg.type === 'devserver:subscribe' && msg.processId) {
          const proc = getDevServerProcess(msg.processId);
          if (!proc) {
            socket.send(JSON.stringify({ type: 'devserver:error', data: 'Process not found' }));
            return;
          }

          // Send existing logs
          if (proc.logs.length > 0) {
            socket.send(JSON.stringify({
              type: 'devserver:logs',
              processId: proc.id,
              data: proc.logs.join(''),
              status: proc.status,
              exitCode: proc.exitCode,
            }));
          }

          // Stream new logs
          const logHandler = (line: string) => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({
                type: 'devserver:log',
                processId: proc.id,
                data: line,
              }));
            }
          };

          const exitHandler = (exitCode: number, status: string) => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({
                type: 'devserver:exit',
                processId: proc.id,
                exitCode,
                status,
              }));
            }
          };

          proc.emitter.on('log', logHandler);
          proc.emitter.on('exit', exitHandler);
          socket.on('close', () => {
            proc.emitter.off('log', logHandler);
            proc.emitter.off('exit', exitHandler);
          });

          // Send current status
          socket.send(JSON.stringify({
            type: 'devserver:status',
            processId: proc.id,
            status: proc.status,
            exitCode: proc.exitCode,
          }));
        }

      } catch (e) {
        console.error('[workspace-stream] Error handling message:', e);
      }
    });

    // On socket close, don't kill the PTY — it persists for reconnection
    // PTY sessions are cleaned up when the workspace is deleted
  });
}
