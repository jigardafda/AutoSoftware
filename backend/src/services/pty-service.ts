import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import os from 'os';

interface PtySession {
  id: string;
  workspaceId: string;
  ptyProcess: pty.IPty;
  emitter: EventEmitter;
  closed: boolean;
}

const sessions = new Map<string, PtySession>();

function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}

export function createPtySession(
  sessionId: string,
  workspaceId: string,
  cwd: string,
  cols = 120,
  rows = 30
): PtySession {
  // If session already exists, return it
  const existing = sessions.get(sessionId);
  if (existing && !existing.closed) {
    return existing;
  }

  const shell = getDefaultShell();
  const emitter = new EventEmitter();

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  });

  const session: PtySession = {
    id: sessionId,
    workspaceId,
    ptyProcess,
    emitter,
    closed: false,
  };

  // Forward PTY output to emitter
  ptyProcess.onData((data: string) => {
    if (!session.closed) {
      emitter.emit('output', data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    session.closed = true;
    emitter.emit('exit', exitCode);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

export function getPtySession(sessionId: string): PtySession | undefined {
  return sessions.get(sessionId);
}

export function writeToPty(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (session && !session.closed) {
    session.ptyProcess.write(data);
  }
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (session && !session.closed) {
    session.ptyProcess.resize(cols, rows);
  }
}

export function closePtySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session && !session.closed) {
    session.closed = true;
    session.ptyProcess.kill();
    sessions.delete(sessionId);
  }
}

export function getActiveSessionForWorkspace(workspaceId: string): PtySession | undefined {
  for (const session of sessions.values()) {
    if (session.workspaceId === workspaceId && !session.closed) {
      return session;
    }
  }
  return undefined;
}
