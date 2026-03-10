import { simpleGit } from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";

// Plugin cache directory - shared between backend and worker
const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || "./data/plugins";

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

  console.log(`[PluginManager] Plugin ${pluginId} downloaded to ${cachePath}`);
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
 * Get plugin cache info.
 */
export async function getPluginCacheInfo(pluginId: string): Promise<{ cached: boolean; path: string | null }> {
  const cached = await isPluginCached(pluginId);
  const cachePath = cached ? getPluginCachePath(pluginId) : null;
  return { cached, path: cachePath };
}

/**
 * Get the absolute cache path for a plugin.
 */
export function getAbsolutePluginPath(pluginId: string): string {
  return path.resolve(getPluginCachePath(pluginId));
}
