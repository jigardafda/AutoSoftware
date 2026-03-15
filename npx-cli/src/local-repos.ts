import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";

const execFileAsync = promisify(execFile);

export interface LocalRepoInfo {
  path: string;
  name: string;
  isGit: boolean;
  remoteName: string | null;
  remoteUrl: string | null;
  branch: string | null;
  status: string | null;
}

/**
 * Scans a local folder and extracts repository information.
 */
export async function scanLocalFolder(
  folderPath: string
): Promise<LocalRepoInfo> {
  const resolvedPath = path.resolve(folderPath);
  const name = path.basename(resolvedPath);

  // Check that the directory exists
  try {
    await access(resolvedPath, constants.R_OK);
  } catch {
    throw new Error(`Directory not accessible: ${resolvedPath}`);
  }

  // Check if it is a git repository
  let isGit = false;
  try {
    await access(path.join(resolvedPath, ".git"), constants.F_OK);
    isGit = true;
  } catch {
    // Not a git repo — that is fine
  }

  if (!isGit) {
    return {
      path: resolvedPath,
      name,
      isGit: false,
      remoteName: null,
      remoteUrl: null,
      branch: null,
      status: null,
    };
  }

  // Extract git information
  let remoteName: string | null = null;
  let remoteUrl: string | null = null;
  let branch: string | null = null;
  let status: string | null = null;

  try {
    const { stdout: remoteStdout } = await execFileAsync(
      "git",
      ["remote"],
      { cwd: resolvedPath }
    );
    const remotes = remoteStdout.trim().split("\n").filter(Boolean);
    remoteName = remotes[0] ?? null;

    if (remoteName) {
      const { stdout: urlStdout } = await execFileAsync(
        "git",
        ["remote", "get-url", remoteName],
        { cwd: resolvedPath }
      );
      remoteUrl = urlStdout.trim() || null;
    }
  } catch {
    // Could not determine remote — not critical
  }

  try {
    const { stdout: branchStdout } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: resolvedPath }
    );
    branch = branchStdout.trim() || null;
  } catch {
    // Detached HEAD or empty repo
  }

  try {
    const { stdout: statusStdout } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd: resolvedPath }
    );
    status = statusStdout.trim() || "clean";
  } catch {
    // Could not get status
  }

  return {
    path: resolvedPath,
    name,
    isGit,
    remoteName,
    remoteUrl,
    branch,
    status,
  };
}

/**
 * Adds a local folder as a repository in the database.
 */
export async function addLocalFolder(
  folderPath: string,
  userId: string,
  prisma: any
): Promise<void> {
  const info = await scanLocalFolder(folderPath);

  // Check if this folder is already registered
  const existing = await prisma.repository.findFirst({
    where: {
      userId,
      localPath: info.path,
    },
  });

  if (existing) {
    console.log(
      chalk.yellow(`Repository already registered: ${info.path}`)
    );
    return;
  }

  await prisma.repository.create({
    data: {
      userId,
      provider: "local",
      providerRepoId: `local-${Date.now()}`,
      fullName: info.path,
      cloneUrl: info.remoteUrl ?? info.path,
      defaultBranch: info.branch ?? "main",
      localPath: info.path,
    },
  });

  console.log(chalk.green(`Added local repository: ${info.name}`));
}
