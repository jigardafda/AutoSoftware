import { simpleGit } from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "../db.js";
import { config } from "../config.js";

// Plugin cache directory
const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || "./data/plugins";

interface PluginPath {
  type: "local";
  path: string;
}

interface InstalledPlugin {
  id: string;
  pluginId: string;
  repoUrl: string;
  isEnabled: boolean;
  skillsEnabled: boolean;
  agentsEnabled: boolean;
  hooksEnabled: boolean;
  mcpEnabled: boolean;
}

/**
 * Ensure the plugin cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(PLUGIN_CACHE_DIR, { recursive: true });
}

/**
 * Get the local cache path for a plugin.
 */
function getPluginCachePath(pluginId: string): string {
  // Sanitize plugin ID for filesystem use
  const safeName = pluginId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(PLUGIN_CACHE_DIR, safeName);
}

/**
 * Check if a plugin is cached locally.
 */
async function isPluginCached(pluginId: string): Promise<boolean> {
  const cachePath = getPluginCachePath(pluginId);
  try {
    const stat = await fs.stat(cachePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Download/clone a plugin to the local cache.
 * Supports GitHub URLs and direct git URLs.
 */
export async function downloadPlugin(pluginId: string, repoUrl: string): Promise<string> {
  await ensureCacheDir();

  const cachePath = getPluginCachePath(pluginId);

  // Convert GitHub URLs to git clone URLs
  let gitUrl = repoUrl;
  if (repoUrl.includes("github.com") && !repoUrl.endsWith(".git")) {
    // Handle tree/blob URLs (e.g., github.com/user/repo/tree/main/plugins/foo)
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/[^/]+\/(.+))?/);
    if (match) {
      gitUrl = `https://github.com/${match[1]}/${match[2]}.git`;
    }
  }

  console.log(`[PluginManager] Downloading plugin ${pluginId} from ${gitUrl}`);

  const isCached = await isPluginCached(pluginId);

  if (isCached) {
    // Pull latest changes
    console.log(`[PluginManager] Plugin ${pluginId} already cached, pulling updates...`);
    const git = simpleGit(cachePath);
    try {
      await git.pull();
    } catch (err) {
      console.warn(`[PluginManager] Failed to pull updates for ${pluginId}:`, err);
      // Continue with existing cache
    }
  } else {
    // Clone fresh
    console.log(`[PluginManager] Cloning plugin ${pluginId}...`);
    const git = simpleGit();
    await git.clone(gitUrl, cachePath, ["--depth", "1"]);
  }

  // Handle plugins in subdirectories (e.g., monorepos)
  // Check if the original URL pointed to a subdirectory
  const subpathMatch = repoUrl.match(/\/(?:tree|blob)\/[^/]+\/(.+)/);
  if (subpathMatch) {
    const subpath = subpathMatch[1];
    const fullPath = path.join(cachePath, subpath);
    // Verify the subpath exists
    try {
      await fs.stat(fullPath);
      return fullPath;
    } catch {
      console.warn(`[PluginManager] Subpath ${subpath} not found in ${pluginId}`);
    }
  }

  return cachePath;
}

/**
 * Remove a plugin from the cache.
 */
export async function removePluginCache(pluginId: string): Promise<void> {
  const cachePath = getPluginCachePath(pluginId);

  try {
    await fs.rm(cachePath, { recursive: true, force: true });
    console.log(`[PluginManager] Removed plugin cache for ${pluginId}`);
  } catch (err) {
    console.warn(`[PluginManager] Failed to remove plugin cache for ${pluginId}:`, err);
  }
}

/**
 * Sync/update a plugin's cache (re-pull from remote).
 */
export async function syncPlugin(pluginId: string, repoUrl: string): Promise<string> {
  return downloadPlugin(pluginId, repoUrl);
}

/**
 * Get all installed and enabled plugins for a user (optionally scoped to a project).
 * Returns paths ready for the Agent SDK.
 */
export async function getInstalledPluginPaths(
  userId: string,
  projectId?: string | null
): Promise<PluginPath[]> {
  // Fetch all enabled plugins for the user
  // Include global plugins and project-specific plugins if projectId is provided
  const plugins = await prisma.installedPlugin.findMany({
    where: {
      userId,
      isEnabled: true,
      OR: [
        { scope: "global" as const },
        ...(projectId ? [{ scope: "project" as const, projectId }] : []),
      ],
    },
    select: {
      pluginId: true,
      repoUrl: true,
      skillsEnabled: true,
      agentsEnabled: true,
      hooksEnabled: true,
      mcpEnabled: true,
    },
  });

  const pluginPaths: PluginPath[] = [];

  for (const plugin of plugins) {
    // Check if at least one component is enabled
    if (!plugin.skillsEnabled && !plugin.agentsEnabled && !plugin.hooksEnabled && !plugin.mcpEnabled) {
      continue;
    }

    const cachePath = getPluginCachePath(plugin.pluginId);

    // Verify plugin is cached
    const cached = await isPluginCached(plugin.pluginId);
    if (!cached) {
      console.warn(`[PluginManager] Plugin ${plugin.pluginId} not cached, downloading...`);
      try {
        await downloadPlugin(plugin.pluginId, plugin.repoUrl);
      } catch (err) {
        console.error(`[PluginManager] Failed to download plugin ${plugin.pluginId}:`, err);
        continue;
      }
    }

    // Find the plugin root (directory containing .claude-plugin/plugin.json or plugin.json)
    const pluginRoot = await findPluginRoot(cachePath);
    if (pluginRoot) {
      pluginPaths.push({ type: "local", path: pluginRoot });
    } else {
      console.warn(`[PluginManager] No plugin manifest found in ${plugin.pluginId}`);
    }
  }

  console.log(`[PluginManager] Resolved ${pluginPaths.length} plugin paths for user ${userId}`);
  return pluginPaths;
}

/**
 * Find the plugin root directory (containing plugin.json or .claude-plugin/plugin.json).
 */
async function findPluginRoot(basePath: string): Promise<string | null> {
  // Check .claude-plugin/plugin.json
  const claudePluginPath = path.join(basePath, ".claude-plugin", "plugin.json");
  try {
    await fs.stat(claudePluginPath);
    return basePath;
  } catch {
    // Not found, try next
  }

  // Check plugin.json at root
  const rootPluginPath = path.join(basePath, "plugin.json");
  try {
    await fs.stat(rootPluginPath);
    return basePath;
  } catch {
    // Not found
  }

  // Check subdirectories (for monorepos)
  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(basePath, entry.name);
        const found = await findPluginRoot(subPath);
        if (found) return found;
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

/**
 * Get plugin information for display.
 */
export async function getPluginInfo(pluginId: string): Promise<{ cached: boolean; path: string | null }> {
  const cached = await isPluginCached(pluginId);
  const cachePath = cached ? getPluginCachePath(pluginId) : null;

  return { cached, path: cachePath };
}
