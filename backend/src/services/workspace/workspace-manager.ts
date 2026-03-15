import { prisma } from '../../db.js';
import { simpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../../config.js';

const execFileAsync = promisify(execFile);

export class WorkspaceManager {

  async create(params: {
    userId: string;
    name: string;
    description?: string;
    repositoryId?: string;
    taskId?: string;
    projectId?: string;
    prReviewId?: string;
    agentId?: string;
    agentModel?: string;
    localPath?: string;
    baseBranch?: string;
    /** If true, checkout baseBranch directly instead of creating a workspace/xxx branch */
    checkoutExisting?: boolean;
  }) {
    // Create workspace record
    const workspace = await prisma.workspace.create({
      data: {
        userId: params.userId,
        name: params.name,
        description: params.description || '',
        repositoryId: params.repositoryId,
        taskId: params.taskId,
        projectId: params.projectId,
        prReviewId: params.prReviewId,
        agentId: params.agentId || 'claude-code',
        agentModel: params.agentModel,
        localPath: params.localPath,
        status: 'creating',
      }
    });

    // Setup worktree (wrapped in try-catch so workspace is still usable on failure)
    try {
      if (params.repositoryId) {
        await this.setupWorktree(workspace.id, params.repositoryId, params.baseBranch, params.checkoutExisting);
      } else if (params.localPath) {
        await this.setupWorktreeFromPath(workspace.id, params.localPath, params.baseBranch, params.checkoutExisting);
      } else {
        // No repo or local path — mark as active (worktree will be set up separately if needed)
        await prisma.workspace.update({
          where: { id: workspace.id },
          data: { status: 'active' },
        });
      }
    } catch (err) {
      console.warn(`[workspace-manager] Worktree setup failed for workspace ${workspace.id}:`, err);
      // Still set workspace to active so it's usable (without file access)
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { status: 'active' },
      });
    }

    // Return the updated workspace with worktreePath set
    return await prisma.workspace.findUnique({ where: { id: workspace.id } }) ?? workspace;
  }

  private async resolveBaseBranch(repoDir: string, requestedBranch?: string, repoDefaultBranch?: string): Promise<string> {
    if (requestedBranch) return requestedBranch;
    if (repoDefaultBranch) return repoDefaultBranch;

    // Detect from the git repo itself
    const git = simpleGit(repoDir);
    try {
      const branchSummary = await git.branch();
      return branchSummary.current || 'main';
    } catch {
      return 'main';
    }
  }

  private async setupWorktree(workspaceId: string, repositoryId: string, requestedBranch?: string, checkoutExisting?: boolean) {
    const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
    if (!repo) throw new Error('Repository not found');

    const workDir = config.workDir;
    const worktreeDir = path.join(workDir, 'worktrees', workspaceId);

    let repoDir: string;

    if (repo.provider === 'local') {
      repoDir = repo.cloneUrl;
    } else {
      repoDir = path.join(workDir, 'repos', repo.fullName.replace('/', '-'));
      try {
        await fs.access(repoDir);
      } catch {
        try {
          const git = simpleGit();
          await git.clone(repo.cloneUrl, repoDir);
        } catch (cloneErr) {
          console.warn(`[workspace-manager] git clone failed, trying gh CLI:`, cloneErr);
          await this.cloneWithGhCli(repo.fullName, repoDir);
        }
      }
    }

    const baseBranch = await this.resolveBaseBranch(repoDir, requestedBranch, repo.defaultBranch);
    const git = simpleGit(repoDir);

    // Fetch the branch if it's remote-only
    try { await git.fetch(['origin', baseBranch]); } catch { /* may already be local */ }

    // Prune stale worktree references
    try { await git.raw(['worktree', 'prune']); } catch {}

    let worktreeBranch: string;
    if (checkoutExisting) {
      try {
        await git.raw(['worktree', 'add', worktreeDir, baseBranch]);
      } catch {
        await git.raw(['worktree', 'add', worktreeDir, `origin/${baseBranch}`]);
      }
      worktreeBranch = baseBranch;
    } else {
      const branchName = `workspace/${workspaceId.slice(0, 8)}`;
      await git.raw(['worktree', 'add', '-b', branchName, worktreeDir, baseBranch]);
      worktreeBranch = branchName;
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: 'active',
        worktreePath: worktreeDir,
        worktreeBranch,
        localPath: repo.provider === 'local' ? repo.cloneUrl : undefined,
      }
    });
  }

  private async setupWorktreeFromPath(workspaceId: string, localPath: string, requestedBranch?: string, checkoutExisting?: boolean) {
    const worktreeDir = path.join(config.workDir, 'worktrees', workspaceId);
    const baseBranch = await this.resolveBaseBranch(localPath, requestedBranch);
    const git = simpleGit(localPath);

    // Fetch if remote-only
    try { await git.fetch(['origin', baseBranch]); } catch { /* may already be local */ }

    let worktreeBranch: string;
    if (checkoutExisting) {
      await git.raw(['worktree', 'add', worktreeDir, baseBranch]);
      worktreeBranch = baseBranch;
    } else {
      const branchName = `workspace/${workspaceId.slice(0, 8)}`;
      await git.raw(['worktree', 'add', '-b', branchName, worktreeDir, baseBranch]);
      worktreeBranch = branchName;
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: 'active',
        worktreePath: worktreeDir,
        worktreeBranch,
        localPath,
      }
    });
  }

  private async cloneWithGhCli(fullName: string, targetDir: string): Promise<void> {
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await execFileAsync('gh', ['repo', 'clone', fullName, targetDir], {
      timeout: 120_000,
    });
  }

  async setupWorktreeFromGitHub(workspaceId: string, owner: string, repo: string, branch?: string, checkoutExisting?: boolean) {
    const workDir = config.workDir;
    const fullName = `${owner}/${repo}`;
    const repoDir = path.join(workDir, 'repos', fullName.replace('/', '-'));
    const worktreeDir = path.join(workDir, 'worktrees', workspaceId);

    // Clone if not already present
    try {
      await fs.access(repoDir);
    } catch {
      await this.cloneWithGhCli(fullName, repoDir);
    }

    const baseBranch = await this.resolveBaseBranch(repoDir, branch);

    // Fetch the branch if it's remote-only
    const git = simpleGit(repoDir);
    try {
      await git.fetch(['origin', baseBranch]);
    } catch {
      // Branch may already be local or fetch may fail — continue anyway
    }

    let worktreeBranch: string;
    if (checkoutExisting) {
      // Prune stale worktree references before creating a new one
      try { await git.raw(['worktree', 'prune']); } catch {}

      // Checkout the existing branch directly (e.g., the PR's head branch)
      // If the local branch doesn't exist, try tracking the remote one
      try {
        await git.raw(['worktree', 'add', worktreeDir, baseBranch]);
      } catch {
        // Branch might not exist locally — try with origin/ prefix
        await git.raw(['worktree', 'add', worktreeDir, `origin/${baseBranch}`]);
      }
      worktreeBranch = baseBranch;
    } else {
      const branchName = `workspace/${workspaceId.slice(0, 8)}`;
      await git.raw(['worktree', 'add', '-b', branchName, worktreeDir, baseBranch]);
      worktreeBranch = branchName;
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: 'active',
        worktreePath: worktreeDir,
        worktreeBranch,
      }
    });
  }

  async delete(workspaceId: string) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new Error('Workspace not found');

    // Cleanup worktree if exists
    if (workspace.worktreePath) {
      try {
        // Determine the parent repo dir to run worktree remove from
        let repoDir: string | null = null;

        if (workspace.repositoryId) {
          const repo = await prisma.repository.findUnique({ where: { id: workspace.repositoryId } });
          if (repo) {
            repoDir = repo.provider === 'local'
              ? repo.cloneUrl
              : path.join(config.workDir, 'repos', repo.fullName.replace('/', '-'));
          }
        } else if (workspace.localPath) {
          repoDir = workspace.localPath;
        }

        // Fallback: for GitHub-cloned repos (PR reviews), find the repo dir from the worktree path
        if (!repoDir && workspace.prReviewId) {
          const review = await prisma.prReview.findUnique({ where: { id: workspace.prReviewId } });
          if (review) {
            repoDir = path.join(config.workDir, 'repos', `${review.owner}-${review.repo}`);
          }
        }

        if (repoDir) {
          const git = simpleGit(repoDir);
          await git.raw(['worktree', 'remove', workspace.worktreePath, '--force']);
          // Clean up the workspace branch (only if it's a workspace/ branch, not a PR branch)
          if (workspace.worktreeBranch && workspace.worktreeBranch.startsWith('workspace/')) {
            try {
              await git.raw(['branch', '-D', workspace.worktreeBranch]);
            } catch {}
          }
        } else {
          // Last resort: just delete the directory
          await fs.rm(workspace.worktreePath, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn('Failed to remove worktree:', err);
      }
    }

    await prisma.workspace.delete({ where: { id: workspaceId } });
  }

  async getWorkspaceDiff(workspaceId: string): Promise<string> {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace?.worktreePath) return '';

    try {
      await fs.access(workspace.worktreePath);
    } catch {
      return '';
    }

    const git = simpleGit(workspace.worktreePath);
    const status = await git.status();
    const parts: string[] = [];

    // 1. Staged changes
    const staged = await git.diff(['--cached']);
    if (staged) parts.push(staged);

    // 2. Unstaged tracked file changes
    const unstaged = await git.diff();
    if (unstaged) parts.push(unstaged);

    // 3. Untracked (new) files — generate a pseudo-diff so they show content
    const BINARY_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z', 'mp3', 'mp4', 'avi', 'mov', 'wav', 'woff', 'woff2', 'ttf', 'eot', 'otf', 'exe', 'dll', 'so', 'dylib', 'o', 'a', 'pyc', 'class', 'jar']);
    const untrackedFiles = [...status.not_added, ...status.created].filter(
      (f) => !status.staged.includes(f) &&
             !f.startsWith('.auto-software/') &&
             !BINARY_EXTS.has(f.split('.').pop()?.toLowerCase() || '')
    );
    for (const filePath of untrackedFiles) {
      try {
        const fullPath = path.join(workspace.worktreePath, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        const header = [
          `diff --git a/${filePath} b/${filePath}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${filePath}`,
          `@@ -0,0 +1,${lines.length} @@`,
        ].join('\n');
        parts.push(header + '\n' + lines.map((l) => '+' + l).join('\n'));
      } catch {
        // Skip files that can't be read (binary, permissions, etc.)
      }
    }

    return parts.join('\n');
  }

  async getWorkspaceFiles(workspaceId: string): Promise<{ path: string; status: string; additions: number; deletions: number }[]> {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace?.worktreePath) return [];

    try {
      await fs.access(workspace.worktreePath);
    } catch {
      return [];
    }

    const git = simpleGit(workspace.worktreePath);
    const status = await git.status();

    const files: { path: string; status: string; additions: number; deletions: number }[] = [];

    // Get numstat for line counts
    let numstatMap = new Map<string, { additions: number; deletions: number }>();
    try {
      // Staged numstat
      const stagedNumstat = await git.diff(['--cached', '--numstat']);
      // Unstaged numstat
      const unstagedNumstat = await git.diff(['--numstat']);
      for (const line of (stagedNumstat + '\n' + unstagedNumstat).split('\n')) {
        const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (match) {
          const adds = match[1] === '-' ? 0 : parseInt(match[1], 10);
          const dels = match[2] === '-' ? 0 : parseInt(match[2], 10);
          const existing = numstatMap.get(match[3]);
          if (existing) {
            existing.additions += adds;
            existing.deletions += dels;
          } else {
            numstatMap.set(match[3], { additions: adds, deletions: dels });
          }
        }
      }
    } catch { /* ignore */ }

    const skipFile = (f: string) => f.startsWith('.auto-software/');

    for (const f of status.modified) {
      if (skipFile(f)) continue;
      const stats = numstatMap.get(f) || { additions: 0, deletions: 0 };
      files.push({ path: f, status: 'modified', ...stats });
    }
    for (const f of status.created) {
      if (skipFile(f)) continue;
      let additions = 0;
      try {
        const content = await fs.readFile(path.join(workspace.worktreePath, f), 'utf-8');
        additions = content.split('\n').length;
      } catch { /* ignore */ }
      files.push({ path: f, status: 'added', additions, deletions: 0 });
    }
    for (const f of status.not_added) {
      if (skipFile(f)) continue;
      let additions = 0;
      try {
        const content = await fs.readFile(path.join(workspace.worktreePath, f), 'utf-8');
        additions = content.split('\n').length;
      } catch { /* ignore */ }
      files.push({ path: f, status: 'added', additions, deletions: 0 });
    }
    for (const f of status.deleted) {
      if (skipFile(f)) continue;
      const stats = numstatMap.get(f) || { additions: 0, deletions: 0 };
      files.push({ path: f, status: 'deleted', ...stats });
    }
    for (const f of status.staged) {
      if (skipFile(f)) continue;
      if (!files.some((ef) => ef.path === f)) {
        const stats = numstatMap.get(f) || { additions: 0, deletions: 0 };
        files.push({ path: f, status: 'modified', ...stats });
      }
    }

    return files;
  }
}

export const workspaceManager = new WorkspaceManager();
