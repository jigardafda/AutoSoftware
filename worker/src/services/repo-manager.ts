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
  branchName: string
): Promise<string> {
  const worktreeDir = path.join(config.workDir, "worktrees", branchName);
  await mkdir(path.dirname(worktreeDir), { recursive: true });

  const git = simpleGit(repoDir);
  await git.raw(["worktree", "add", "-b", branchName, worktreeDir]);

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
