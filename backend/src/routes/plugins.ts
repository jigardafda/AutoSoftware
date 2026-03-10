import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

// Official Anthropic plugin marketplace URL
const OFFICIAL_MARKETPLACE_URL =
  "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/marketplace.json";

interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  repoUrl: string;
  iconUrl?: string;
  categories?: string[];
  tags?: string[];
}

interface PluginManifest {
  name: string;
  description?: string;
  version: string;
  author?: string;
  permissions?: string[];
  skills?: Array<{ name: string; description: string }>;
  agents?: Array<{ name: string; description: string }>;
  hooks?: Array<{ event: string; command: string }>;
  mcp_servers?: Array<{ name: string; command: string }>;
}

async function fetchMarketplace(url: string): Promise<MarketplacePlugin[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.plugins || [];
  } catch (err) {
    console.error(`Failed to fetch marketplace from ${url}:`, err);
    return [];
  }
}

async function fetchPluginManifest(repoUrl: string): Promise<PluginManifest | null> {
  try {
    // Convert repo URL to raw plugin.json URL
    // e.g., https://github.com/user/repo -> https://raw.githubusercontent.com/user/repo/main/.claude-plugin/plugin.json
    let rawUrl: string;
    if (repoUrl.includes("github.com")) {
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        rawUrl = `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/.claude-plugin/plugin.json`;
      } else {
        return null;
      }
    } else {
      // For other providers, try direct URL
      rawUrl = `${repoUrl.replace(/\/$/, "")}/.claude-plugin/plugin.json`;
    }

    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch plugin manifest from ${repoUrl}:`, err);
    return null;
  }
}

export const pluginRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET /plugins/marketplaces - list configured marketplaces
  app.get("/marketplaces", async (request) => {
    const marketplaces = await prisma.pluginMarketplace.findMany({
      where: { userId: request.userId },
      orderBy: [{ isOfficial: "desc" }, { createdAt: "asc" }],
    });

    return { data: marketplaces };
  });

  // POST /plugins/marketplaces - add a marketplace
  app.post<{ Body: { name: string; url: string } }>("/marketplaces", async (request, reply) => {
    const { name, url } = request.body;

    if (!name || !url) {
      return reply.code(400).send({ error: { message: "name and url are required" } });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return reply.code(400).send({ error: { message: "Invalid URL format" } });
    }

    // Check for duplicates
    const existing = await prisma.pluginMarketplace.findFirst({
      where: { userId: request.userId, url },
    });
    if (existing) {
      return reply.code(409).send({ error: { message: "Marketplace already added" } });
    }

    const marketplace = await prisma.pluginMarketplace.create({
      data: {
        userId: request.userId,
        name,
        url,
        isOfficial: url === OFFICIAL_MARKETPLACE_URL,
      },
    });

    return { data: marketplace };
  });

  // POST /plugins/marketplaces/add-official - add the official marketplace
  app.post("/marketplaces/add-official", async (request, reply) => {
    const existing = await prisma.pluginMarketplace.findFirst({
      where: { userId: request.userId, url: OFFICIAL_MARKETPLACE_URL },
    });
    if (existing) {
      return { data: existing };
    }

    const marketplace = await prisma.pluginMarketplace.create({
      data: {
        userId: request.userId,
        name: "Official Claude Plugins",
        url: OFFICIAL_MARKETPLACE_URL,
        isOfficial: true,
      },
    });

    return { data: marketplace };
  });

  // DELETE /plugins/marketplaces/:id - remove a marketplace
  app.delete<{ Params: { id: string } }>("/marketplaces/:id", async (request, reply) => {
    const { id } = request.params;

    const marketplace = await prisma.pluginMarketplace.findFirst({
      where: { id, userId: request.userId },
    });
    if (!marketplace) {
      return reply.code(404).send({ error: { message: "Marketplace not found" } });
    }

    await prisma.pluginMarketplace.delete({ where: { id } });
    return { data: { success: true } };
  });

  // GET /plugins/browse - browse available plugins from all marketplaces
  app.get<{ Querystring: { search?: string; category?: string } }>("/browse", async (request) => {
    const { search, category } = request.query;

    // Get all enabled marketplaces for user
    const marketplaces = await prisma.pluginMarketplace.findMany({
      where: { userId: request.userId, isEnabled: true },
    });

    // Fetch plugins from all marketplaces
    const allPlugins: (MarketplacePlugin & { marketplaceId: string; marketplaceName: string })[] = [];

    for (const marketplace of marketplaces) {
      const plugins = await fetchMarketplace(marketplace.url);
      for (const plugin of plugins) {
        allPlugins.push({
          ...plugin,
          marketplaceId: marketplace.id,
          marketplaceName: marketplace.name,
        });
      }

      // Update last fetched time
      await prisma.pluginMarketplace.update({
        where: { id: marketplace.id },
        data: { lastFetched: new Date(), lastError: null },
      });
    }

    // Apply filters
    let filtered = allPlugins;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description.toLowerCase().includes(searchLower) ||
          p.tags?.some((t) => t.toLowerCase().includes(searchLower))
      );
    }
    if (category) {
      filtered = filtered.filter((p) => p.categories?.includes(category));
    }

    // Get user's installed plugins to mark installed status
    const installed = await prisma.installedPlugin.findMany({
      where: { userId: request.userId },
      select: { pluginId: true, scope: true, projectId: true },
    });
    const installedMap = new Map(installed.map((p) => [p.pluginId, p]));

    const result = filtered.map((p) => ({
      ...p,
      installed: installedMap.has(p.id),
      installedScope: installedMap.get(p.id)?.scope,
      installedProjectId: installedMap.get(p.id)?.projectId,
    }));

    return { data: result };
  });

  // GET /plugins/installed - list installed plugins
  app.get<{ Querystring: { scope?: string; projectId?: string } }>(
    "/installed",
    async (request) => {
      const { scope, projectId } = request.query;

      const where: any = { userId: request.userId };
      if (scope) where.scope = scope;
      if (projectId) where.projectId = projectId;

      const plugins = await prisma.installedPlugin.findMany({
        where,
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });

      return { data: plugins };
    }
  );

  // POST /plugins/install - install a plugin
  app.post<{
    Body: {
      pluginId: string;
      repoUrl: string;
      scope?: "global" | "project";
      projectId?: string;
    };
  }>("/install", async (request, reply) => {
    const { pluginId, repoUrl, scope = "global", projectId } = request.body;

    if (!pluginId || !repoUrl) {
      return reply.code(400).send({ error: { message: "pluginId and repoUrl are required" } });
    }

    if (scope === "project" && !projectId) {
      return reply.code(400).send({ error: { message: "projectId required for project scope" } });
    }

    // Check if already installed with same scope
    const existing = await prisma.installedPlugin.findFirst({
      where: {
        userId: request.userId,
        pluginId,
        projectId: scope === "project" ? projectId : null,
      },
    });
    if (existing) {
      return reply.code(409).send({ error: { message: "Plugin already installed" } });
    }

    // Fetch plugin manifest
    const manifest = await fetchPluginManifest(repoUrl);
    if (!manifest) {
      return reply.code(400).send({ error: { message: "Could not fetch plugin manifest" } });
    }

    const plugin = await prisma.installedPlugin.create({
      data: {
        userId: request.userId,
        projectId: scope === "project" ? projectId : null,
        scope,
        pluginId,
        name: manifest.name,
        description: manifest.description || "",
        version: manifest.version,
        author: manifest.author,
        repoUrl,
        manifest: manifest as any,
        permissions: manifest.permissions || [],
        lastSyncedAt: new Date(),
      },
    });

    return { data: plugin };
  });

  // GET /plugins/:id - get plugin details
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;

    const plugin = await prisma.installedPlugin.findFirst({
      where: { id, userId: request.userId },
      include: { project: { select: { id: true, name: true } } },
    });

    if (!plugin) {
      return reply.code(404).send({ error: { message: "Plugin not found" } });
    }

    return { data: plugin };
  });

  // PATCH /plugins/:id - update plugin settings
  app.patch<{
    Params: { id: string };
    Body: {
      isEnabled?: boolean;
      skillsEnabled?: boolean;
      agentsEnabled?: boolean;
      hooksEnabled?: boolean;
      mcpEnabled?: boolean;
      config?: Record<string, any>;
    };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    const plugin = await prisma.installedPlugin.findFirst({
      where: { id, userId: request.userId },
    });
    if (!plugin) {
      return reply.code(404).send({ error: { message: "Plugin not found" } });
    }

    const updated = await prisma.installedPlugin.update({
      where: { id },
      data: {
        ...(updates.isEnabled !== undefined && { isEnabled: updates.isEnabled }),
        ...(updates.skillsEnabled !== undefined && { skillsEnabled: updates.skillsEnabled }),
        ...(updates.agentsEnabled !== undefined && { agentsEnabled: updates.agentsEnabled }),
        ...(updates.hooksEnabled !== undefined && { hooksEnabled: updates.hooksEnabled }),
        ...(updates.mcpEnabled !== undefined && { mcpEnabled: updates.mcpEnabled }),
        ...(updates.config !== undefined && {
          config: { ...(plugin.config as object), ...updates.config },
        }),
      },
    });

    return { data: updated };
  });

  // POST /plugins/:id/sync - refresh plugin manifest
  app.post<{ Params: { id: string } }>("/:id/sync", async (request, reply) => {
    const { id } = request.params;

    const plugin = await prisma.installedPlugin.findFirst({
      where: { id, userId: request.userId },
    });
    if (!plugin) {
      return reply.code(404).send({ error: { message: "Plugin not found" } });
    }

    const manifest = await fetchPluginManifest(plugin.repoUrl);
    if (!manifest) {
      await prisma.installedPlugin.update({
        where: { id },
        data: { lastError: "Failed to fetch manifest" },
      });
      return reply.code(500).send({ error: { message: "Failed to fetch plugin manifest" } });
    }

    const updated = await prisma.installedPlugin.update({
      where: { id },
      data: {
        name: manifest.name,
        description: manifest.description || "",
        version: manifest.version,
        author: manifest.author,
        manifest: manifest as any,
        permissions: manifest.permissions || [],
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    return { data: updated };
  });

  // DELETE /plugins/:id - uninstall a plugin
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;

    const plugin = await prisma.installedPlugin.findFirst({
      where: { id, userId: request.userId },
    });
    if (!plugin) {
      return reply.code(404).send({ error: { message: "Plugin not found" } });
    }

    await prisma.installedPlugin.delete({ where: { id } });
    return { data: { success: true } };
  });
};
