import { simpleGit } from "simple-git";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { config } from "../config.js";

export async function cloneOrPullRepo(
  repoId: string,
  cloneUrl: string,
  accessToken: string,
  provider: string
): Promise<string> {
  const repoDir = path.join(config.workDir, "repos", repoId);
  await mkdir(path.dirname(repoDir), { recursive: true });

  let authedUrl = cloneUrl;
  if (provider === "github" || provider === "gitlab") {
    authedUrl = cloneUrl.replace("https://", `https://oauth2:${accessToken}@`);
  } else if (provider === "bitbucket") {
    authedUrl = cloneUrl.replace("https://", `https://x-token-auth:${accessToken}@`);
  }

  const git = simpleGit();

  if (existsSync(path.join(repoDir, ".git"))) {
    const repoGit = simpleGit(repoDir);
    await repoGit.pull();
  } else {
    await git.clone(authedUrl, repoDir);
  }

  return repoDir;
}

export async function createWorktree(
  repoDir: string,
  branchName: string,
  baseBranch?: string
): Promise<string> {
  const worktreeDir = path.join(config.workDir, "worktrees", branchName);
  await mkdir(path.dirname(worktreeDir), { recursive: true });

  const git = simpleGit(repoDir);

  // Prune stale worktree entries
  try {
    await git.raw(["worktree", "prune"]);
  } catch {
    // Ignore prune errors
  }

  if (baseBranch) {
    // Fetch the target branch to ensure we have the latest
    try {
      await git.fetch("origin", baseBranch);
    } catch (err) {
      console.warn(`Failed to fetch branch ${baseBranch}, will try to use existing ref:`, err);
    }

    // Create worktree with new branch based on the target branch
    await git.raw(["worktree", "add", "-b", branchName, worktreeDir, `origin/${baseBranch}`]);
  } else {
    // Create worktree with new branch from HEAD (existing behavior)
    await git.raw(["worktree", "add", "-b", branchName, worktreeDir]);
  }

  return worktreeDir;
}

export async function cleanupWorktree(repoDir: string, worktreeDir: string) {
  try {
    const git = simpleGit(repoDir);
    await git.raw(["worktree", "remove", worktreeDir, "--force"]);
  } catch {
    await rm(worktreeDir, { recursive: true, force: true });
  }
}
