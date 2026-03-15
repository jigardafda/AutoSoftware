import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import os from 'os';

export interface DevServerProcess {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoName: string;
  script: string;
  cwd: string;
  status: 'running' | 'completed' | 'failed' | 'killed';
  exitCode: number | null;
  logs: string[];
  maxLogLines: number;
  process: ChildProcess | null;
  emitter: EventEmitter;
  startedAt: number;
  completedAt: number | null;
  detectedPort: number | null;
}

// Regex to detect dev server URLs in log output
const URL_PATTERN =
  /https?:\/\/(?:\[?[0-9a-f:]+\]?|localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d{2,5}))(?:\/\S*)?/gi;

const processes = new Map<string, DevServerProcess>();

function getShell(): { shell: string; args: string[] } {
  if (os.platform() === 'win32') {
    return { shell: process.env.COMSPEC || 'cmd.exe', args: ['/c'] };
  }
  return { shell: process.env.SHELL || '/bin/sh', args: ['-c'] };
}

export function startDevServer(opts: {
  workspaceId: string;
  repositoryId: string;
  repoName: string;
  script: string;
  cwd: string;
}): DevServerProcess {
  const id = `devserver-${opts.workspaceId}-${opts.repositoryId}-${Date.now()}`;
  const emitter = new EventEmitter();
  const maxLogLines = 5000;

  const proc: DevServerProcess = {
    id,
    workspaceId: opts.workspaceId,
    repositoryId: opts.repositoryId,
    repoName: opts.repoName,
    script: opts.script,
    cwd: opts.cwd,
    status: 'running',
    exitCode: null,
    logs: [],
    maxLogLines,
    process: null,
    emitter,
    startedAt: Date.now(),
    completedAt: null,
    detectedPort: null,
  };

  const { shell, args } = getShell();

  try {
    const child = spawn(shell, [...args, opts.script], {
      cwd: opts.cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    proc.process = child;

    const pushLog = (line: string) => {
      proc.logs.push(line);
      if (proc.logs.length > maxLogLines) {
        proc.logs.shift();
      }
      emitter.emit('log', line);

      // Detect dev server port from log output
      if (!proc.detectedPort) {
        // Strip ANSI codes before matching
        const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
        URL_PATTERN.lastIndex = 0;
        const match = URL_PATTERN.exec(clean);
        if (match && match[1]) {
          const port = parseInt(match[1], 10);
          if (port > 0 && port <= 65535) {
            proc.detectedPort = port;
            emitter.emit('port-detected', port);
          }
        }
      }
    };

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      pushLog(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      pushLog(text);
    });

    child.on('exit', (code, signal) => {
      proc.exitCode = code ?? (signal ? 1 : 0);
      proc.status = code === 0 ? 'completed' : 'failed';
      proc.completedAt = Date.now();
      proc.process = null;
      emitter.emit('exit', proc.exitCode, proc.status);
    });

    child.on('error', (err) => {
      pushLog(`[error] ${err.message}\n`);
      proc.status = 'failed';
      proc.completedAt = Date.now();
      proc.process = null;
      emitter.emit('exit', 1, 'failed');
    });
  } catch (err: any) {
    proc.logs.push(`[error] Failed to spawn: ${err.message}\n`);
    proc.status = 'failed';
    proc.completedAt = Date.now();
    emitter.emit('exit', 1, 'failed');
  }

  processes.set(id, proc);
  return proc;
}

export function stopDevServer(id: string): boolean {
  const proc = processes.get(id);
  if (!proc || proc.status !== 'running' || !proc.process) return false;

  proc.status = 'killed';
  proc.completedAt = Date.now();

  try {
    // Kill entire process group
    if (proc.process.pid) {
      try {
        process.kill(-proc.process.pid, 'SIGTERM');
      } catch {
        proc.process.kill('SIGTERM');
      }
    } else {
      proc.process.kill('SIGTERM');
    }
  } catch {
    // Process may already be dead
  }

  proc.emitter.emit('exit', 0, 'killed');
  return true;
}

export function stopDevServersForWorkspace(workspaceId: string): number {
  let count = 0;
  for (const proc of processes.values()) {
    if (proc.workspaceId === workspaceId && proc.status === 'running') {
      stopDevServer(proc.id);
      count++;
    }
  }
  return count;
}

export function getDevServerProcess(id: string): DevServerProcess | undefined {
  return processes.get(id);
}

export function getDevServersForWorkspace(workspaceId: string): DevServerProcess[] {
  const result: DevServerProcess[] = [];
  // Deduplicate by repositoryId, keep latest
  const byRepo = new Map<string, DevServerProcess>();
  for (const proc of processes.values()) {
    if (proc.workspaceId === workspaceId) {
      const existing = byRepo.get(proc.repositoryId);
      if (!existing || proc.startedAt > existing.startedAt) {
        byRepo.set(proc.repositoryId, proc);
      }
    }
  }
  for (const proc of byRepo.values()) {
    result.push(proc);
  }
  return result.sort((a, b) => b.startedAt - a.startedAt);
}

export function getAllDevServersForWorkspace(workspaceId: string): DevServerProcess[] {
  const result: DevServerProcess[] = [];
  for (const proc of processes.values()) {
    if (proc.workspaceId === workspaceId) {
      result.push(proc);
    }
  }
  return result.sort((a, b) => b.startedAt - a.startedAt);
}

export function getRunningDevServersForWorkspace(workspaceId: string): DevServerProcess[] {
  return getDevServersForWorkspace(workspaceId).filter(p => p.status === 'running');
}

export function cleanupStaleProcesses(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, proc] of processes.entries()) {
    if (proc.status !== 'running' && (proc.completedAt || proc.startedAt) < oneHourAgo) {
      processes.delete(id);
    }
  }
}
