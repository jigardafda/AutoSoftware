/**
 * Cross-Repository Synchronization Service
 *
 * Handles coordinated changes across multiple repositories, including:
 * - Monorepo workspace detection
 * - Shared library dependency tracking
 * - Linked PR creation
 */

import { prisma } from "../db.js";
import { simpleGit, SimpleGit } from "simple-git";
import { existsSync } from "fs";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { config } from "../config.js";

// Common monorepo tools and their workspace config files
const MONOREPO_CONFIGS = {
  npm: { file: "package.json", workspaceKey: "workspaces" },
  yarn: { file: "package.json", workspaceKey: "workspaces" },
  pnpm: { file: "pnpm-workspace.yaml", workspaceKey: "packages" },
  lerna: { file: "lerna.json", workspaceKey: "packages" },
  nx: { file: "nx.json", workspaceKey: "projects" },
  turborepo: { file: "turbo.json", workspaceKey: "pipeline" },
  rush: { file: "rush.json", workspaceKey: "projects" },
} as const;

export interface WorkspaceInfo {
  type:
    | "npm"
    | "yarn"
    | "pnpm"
    | "lerna"
    | "nx"
    | "turborepo"
    | "rush"
    | "unknown";
  rootPath: string;
  packages: WorkspacePackage[];
  sharedDependencies: Map<string, string[]>; // dependency -> packages that use it
}

export interface WorkspacePackage {
  name: string;
  path: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  isLocal: boolean; // Is this a workspace package (not external)
}

export interface CrossRepoChange {
  sourceRepoId: string;
  targetRepoIds: string[];
  changedFiles: string[];
  sharedLibraries: string[];
  description: string;
  suggestedActions: string[];
}

export interface LinkedPR {
  repoId: string;
  repoFullName: string;
  prUrl: string;
  prNumber: number;
  status: "pending" | "open" | "merged" | "closed";
}

export interface CrossRepoBatch {
  id: string;
  description: string;
  prs: LinkedPR[];
  createdAt: Date;
}

/**
 * Detect if a repository is a monorepo and extract workspace info
 */
export async function detectMonorepoWorkspace(
  repoPath: string
): Promise<WorkspaceInfo | null> {
  if (!existsSync(repoPath)) {
    return null;
  }

  // Check for various monorepo configurations
  for (const [type, config] of Object.entries(MONOREPO_CONFIGS)) {
    const configPath = path.join(repoPath, config.file);

    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, "utf-8");
        const parsed = config.file.endsWith(".yaml")
          ? parseYaml(content)
          : JSON.parse(content);

        if (parsed && config.workspaceKey in parsed) {
          const packages = await resolveWorkspacePackages(
            repoPath,
            parsed[config.workspaceKey],
            type as keyof typeof MONOREPO_CONFIGS
          );

          const sharedDeps = buildSharedDependencyMap(packages);

          return {
            type: type as WorkspaceInfo["type"],
            rootPath: repoPath,
            packages,
            sharedDependencies: sharedDeps,
          };
        }
      } catch (err) {
        console.warn(`Failed to parse ${config.file}:`, err);
      }
    }
  }

  // Check for standard package.json with workspaces
  const pkgJsonPath = path.join(repoPath, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const content = await readFile(pkgJsonPath, "utf-8");
      const parsed = JSON.parse(content);

      if (parsed.workspaces) {
        const workspacePatterns = Array.isArray(parsed.workspaces)
          ? parsed.workspaces
          : parsed.workspaces.packages || [];

        const packages = await resolveWorkspacePackages(
          repoPath,
          workspacePatterns,
          "npm"
        );
        const sharedDeps = buildSharedDependencyMap(packages);

        return {
          type: "npm",
          rootPath: repoPath,
          packages,
          sharedDependencies: sharedDeps,
        };
      }
    } catch {
      // Not a valid package.json
    }
  }

  return null;
}

/**
 * Simple YAML parser for workspace configs
 */
function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");
  let currentKey = "";
  let currentArray: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.endsWith(":")) {
      if (currentKey && currentArray.length > 0) {
        result[currentKey] = currentArray;
      }
      currentKey = trimmed.slice(0, -1);
      currentArray = [];
    } else if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).replace(/['"]/g, "");
      currentArray.push(value);
    }
  }

  if (currentKey && currentArray.length > 0) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Resolve workspace packages from patterns
 */
async function resolveWorkspacePackages(
  rootPath: string,
  patterns: string[] | Record<string, unknown>,
  _type: string
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [];
  const patternList = Array.isArray(patterns)
    ? patterns
    : Object.keys(patterns);

  for (const pattern of patternList) {
    // Handle glob patterns (simplified)
    const cleanPattern = pattern.replace(/\*/g, "").replace(/\/$/, "");

    // If pattern ends with *, scan the directory
    if (pattern.includes("*")) {
      const baseDir = path.join(rootPath, cleanPattern);
      if (existsSync(baseDir)) {
        try {
          const entries = await readdir(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const pkgPath = path.join(baseDir, entry.name);
              const pkg = await loadPackageInfo(pkgPath);
              if (pkg) {
                packages.push(pkg);
              }
            }
          }
        } catch {
          // Directory not accessible
        }
      }
    } else {
      // Direct path
      const pkgPath = path.join(rootPath, cleanPattern);
      const pkg = await loadPackageInfo(pkgPath);
      if (pkg) {
        packages.push(pkg);
      }
    }
  }

  // Mark packages that are local (workspace) dependencies
  const localNames = new Set(packages.map((p) => p.name));
  for (const pkg of packages) {
    for (const dep of Object.keys(pkg.dependencies)) {
      if (localNames.has(dep)) {
        pkg.isLocal = true;
      }
    }
  }

  return packages;
}

/**
 * Load package.json info from a directory
 */
async function loadPackageInfo(
  pkgPath: string
): Promise<WorkspacePackage | null> {
  const pkgJsonPath = path.join(pkgPath, "package.json");

  if (!existsSync(pkgJsonPath)) {
    return null;
  }

  try {
    const content = await readFile(pkgJsonPath, "utf-8");
    const parsed = JSON.parse(content);

    return {
      name: parsed.name || path.basename(pkgPath),
      path: pkgPath,
      version: parsed.version || "0.0.0",
      dependencies: parsed.dependencies || {},
      devDependencies: parsed.devDependencies || {},
      isLocal: false,
    };
  } catch {
    return null;
  }
}

/**
 * Build a map of dependencies to packages that use them
 */
function buildSharedDependencyMap(
  packages: WorkspacePackage[]
): Map<string, string[]> {
  const depMap = new Map<string, string[]>();

  for (const pkg of packages) {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const dep of Object.keys(allDeps)) {
      const users = depMap.get(dep) || [];
      users.push(pkg.name);
      depMap.set(dep, users);
    }
  }

  return depMap;
}

/**
 * Identify when a change affects multiple repos/packages
 */
export async function analyzeChangeImpact(
  repoPath: string,
  changedFiles: string[]
): Promise<CrossRepoChange | null> {
  const workspace = await detectMonorepoWorkspace(repoPath);

  if (!workspace || workspace.packages.length <= 1) {
    return null;
  }

  // Determine which packages are affected
  const affectedPackages = new Set<string>();
  const sharedLibraries = new Set<string>();

  for (const file of changedFiles) {
    for (const pkg of workspace.packages) {
      const relativePath = path.relative(workspace.rootPath, pkg.path);
      if (file.startsWith(relativePath)) {
        affectedPackages.add(pkg.name);

        // Check if this package is a shared library (used by others)
        const users = workspace.sharedDependencies.get(pkg.name);
        if (users && users.length > 1) {
          sharedLibraries.add(pkg.name);
          // Add dependent packages as affected
          for (const user of users) {
            if (user !== pkg.name) {
              affectedPackages.add(user);
            }
          }
        }
      }
    }
  }

  if (affectedPackages.size <= 1) {
    return null;
  }

  const suggestedActions: string[] = [];

  if (sharedLibraries.size > 0) {
    suggestedActions.push(
      `Update tests in dependent packages: ${[...affectedPackages]
        .filter((p) => !sharedLibraries.has(p))
        .join(", ")}`
    );
    suggestedActions.push(
      `Consider version bumps for shared libraries: ${[...sharedLibraries].join(", ")}`
    );
  }

  if (affectedPackages.size > 3) {
    suggestedActions.push("Consider splitting into multiple PRs for easier review");
  }

  return {
    sourceRepoId: "", // Will be filled by caller
    targetRepoIds: [], // For cross-repo changes outside monorepo
    changedFiles,
    sharedLibraries: [...sharedLibraries],
    description: `Changes affect ${affectedPackages.size} packages: ${[...affectedPackages].join(", ")}`,
    suggestedActions,
  };
}

/**
 * Track linked PRs for coordinated changes
 */
export async function createLinkedPRRecord(
  batchId: string,
  repoId: string,
  repoFullName: string,
  prUrl: string,
  prNumber: number
): Promise<void> {
  await prisma.linkedPR.create({
    data: {
      batchId,
      repositoryId: repoId,
      repoFullName,
      prUrl,
      prNumber,
      status: "open",
    },
  });
}

/**
 * Get all linked PRs for a batch
 */
export async function getLinkedPRs(batchId: string): Promise<LinkedPR[]> {
  const prs = await prisma.linkedPR.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
  });

  return prs.map((pr) => ({
    repoId: pr.repositoryId,
    repoFullName: pr.repoFullName,
    prUrl: pr.prUrl,
    prNumber: pr.prNumber,
    status: pr.status as LinkedPR["status"],
  }));
}

/**
 * Update linked PR status
 */
export async function updateLinkedPRStatus(
  prId: string,
  status: LinkedPR["status"]
): Promise<void> {
  await prisma.linkedPR.update({
    where: { id: prId },
    data: { status },
  });
}

/**
 * Create linked PR references in PR description
 */
export function generateLinkedPRReferences(linkedPRs: LinkedPR[]): string {
  if (linkedPRs.length === 0) {
    return "";
  }

  const lines = [
    "",
    "---",
    "## Related PRs",
    "",
    "This PR is part of a coordinated change across multiple repositories:",
    "",
  ];

  for (const pr of linkedPRs) {
    lines.push(`- [ ] ${pr.repoFullName}: ${pr.prUrl}`);
  }

  lines.push("");
  lines.push(
    "_These PRs should be reviewed and merged together for consistency._"
  );

  return lines.join("\n");
}

/**
 * Detect cross-repository dependencies
 */
export async function detectCrossRepoDependencies(
  repoPath: string,
  allRepos: { id: string; fullName: string; cloneUrl: string }[]
): Promise<string[]> {
  const relatedRepos: string[] = [];

  // Check package.json for repository references
  const pkgJsonPath = path.join(repoPath, "package.json");
  if (existsSync(pkgJsonPath)) {
    try {
      const content = await readFile(pkgJsonPath, "utf-8");
      const parsed = JSON.parse(content);

      const allDeps = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
      };

      for (const [dep, version] of Object.entries(allDeps)) {
        // Check for git URL dependencies
        const versionStr = version as string;
        if (
          versionStr.includes("github.com") ||
          versionStr.includes("gitlab.com") ||
          versionStr.includes("bitbucket.org")
        ) {
          for (const repo of allRepos) {
            if (
              versionStr.includes(repo.fullName) ||
              versionStr.includes(repo.cloneUrl)
            ) {
              relatedRepos.push(repo.id);
            }
          }
        }
      }
    } catch {
      // Invalid package.json
    }
  }

  return relatedRepos;
}

/**
 * Coordinate changes across multiple repositories
 */
export async function coordinateCrossRepoChanges(
  batchOperationId: string,
  repositoryIds: string[],
  changeDescription: string
): Promise<CrossRepoBatch> {
  // Create batch record
  const batch = await prisma.batchOperation.findUnique({
    where: { id: batchOperationId },
  });

  if (!batch) {
    throw new Error(`Batch operation ${batchOperationId} not found`);
  }

  // Get all linked PRs for this batch
  const prs = await getLinkedPRs(batchOperationId);

  return {
    id: batchOperationId,
    description: changeDescription,
    prs,
    createdAt: batch.createdAt,
  };
}

/**
 * Get workspace package by file path
 */
export function getPackageForFile(
  workspace: WorkspaceInfo,
  filePath: string
): WorkspacePackage | null {
  for (const pkg of workspace.packages) {
    const relativePkgPath = path.relative(workspace.rootPath, pkg.path);
    if (filePath.startsWith(relativePkgPath)) {
      return pkg;
    }
  }
  return null;
}

/**
 * Get all packages that depend on a given package
 */
export function getDependentPackages(
  workspace: WorkspaceInfo,
  packageName: string
): WorkspacePackage[] {
  return workspace.packages.filter((pkg) => {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    return packageName in allDeps;
  });
}
