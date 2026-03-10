import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  getAdapter,
  getAllAdapters,
  encryptToken,
  decryptToken,
  getValidAccessToken,
} from "../services/integrations/index.js";
import type { IntegrationProvider } from "@autosoftware/shared";
import type { Prisma } from "../../../generated/prisma/client.js";

export const integrationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // --- Provider metadata ---
  app.get("/providers", async () => {
    const adapters = getAllAdapters();
    return {
      data: adapters.map((a) => a.meta),
    };
  });

  // --- List user's integrations ---
  app.get("/", async (request) => {
    const integrations = await prisma.integration.findMany({
      where: { userId: request.userId },
      include: { _count: { select: { links: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: integrations.map((i) => ({
        id: i.id,
        provider: i.provider,
        authType: i.authType,
        status: i.status,
        displayName: i.displayName,
        accountEmail: i.accountEmail,
        config: i.config,
        lastSyncedAt: i.lastSyncedAt,
        lastError: i.lastError,
        linkCount: i._count.links,
        createdAt: i.createdAt,
      })),
    };
  });

  // --- OAuth: Start flow ---
  app.get<{ Params: { provider: string } }>(
    "/connect/:provider",
    async (request, reply) => {
      const provider = request.params.provider as IntegrationProvider;
      const adapter = getAdapter(provider);
      if (!adapter.getOAuthUrl) {
        return reply.code(400).send({ error: { message: "This provider does not support OAuth" } });
      }

      const state = randomBytes(32).toString("hex");
      const redirectUri = `${config.backendUrl}/api/integrations/callback/${provider}`;
      const url = adapter.getOAuthUrl(state, redirectUri);

      reply.setCookie("integration_oauth_state", state, {
        path: "/",
        httpOnly: true,
        signed: true,
        maxAge: 600,
        sameSite: "lax",
      });

      return reply.redirect(url);
    }
  );

  // --- OAuth: Callback ---
  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>("/callback/:provider", async (request, reply) => {
    const provider = request.params.provider as IntegrationProvider;
    const { code, state, error } = request.query;

    if (error || !code) {
      return reply.redirect(`${config.frontendUrl}/settings?tab=integrations&error=${encodeURIComponent(error || "no_code")}`);
    }

    // Verify state
    const cookie = request.cookies.integration_oauth_state;
    if (cookie) {
      const unsigned = request.unsignCookie(cookie);
      if (!unsigned.valid || unsigned.value !== state) {
        return reply.redirect(`${config.frontendUrl}/settings?tab=integrations&error=invalid_state`);
      }
    }

    const adapter = getAdapter(provider);
    if (!adapter.exchangeCode) {
      return reply.redirect(`${config.frontendUrl}/settings?tab=integrations&error=not_oauth`);
    }

    try {
      const redirectUri = `${config.backendUrl}/api/integrations/callback/${provider}`;
      const result = await adapter.exchangeCode(code, redirectUri);

      await prisma.integration.upsert({
        where: {
          userId_provider_providerAccountId: {
            userId: request.userId,
            provider,
            providerAccountId: result.accountId || "",
          },
        },
        update: {
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: result.refreshToken ? encryptToken(result.refreshToken) : null,
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          status: "connected",
          accountEmail: result.accountEmail || null,
          config: (result.config || {}) as Prisma.InputJsonValue,
          lastError: null,
        },
        create: {
          userId: request.userId,
          provider,
          authType: "oauth2",
          displayName: adapter.meta.name,
          encryptedAccessToken: encryptToken(result.accessToken),
          encryptedRefreshToken: result.refreshToken ? encryptToken(result.refreshToken) : null,
          tokenExpiresAt: result.expiresIn
            ? new Date(Date.now() + result.expiresIn * 1000)
            : null,
          providerAccountId: result.accountId || "",
          accountEmail: result.accountEmail || null,
          config: (result.config || {}) as Prisma.InputJsonValue,
        },
      });

      reply.clearCookie("integration_oauth_state", { path: "/" });
      return reply.redirect(`${config.frontendUrl}/settings?tab=integrations&connected=${provider}`);
    } catch (err: any) {
      return reply.redirect(
        `${config.frontendUrl}/settings?tab=integrations&error=${encodeURIComponent(err.message)}`
      );
    }
  });

  // --- Connect via API token ---
  app.post<{
    Body: {
      provider: string;
      token: string;
      config?: Record<string, string>;
      displayName?: string;
    };
  }>("/", async (request, reply) => {
    const { provider, token, config: providerConfig, displayName } = request.body;
    const adapter = getAdapter(provider as IntegrationProvider);

    if (!adapter.validateToken) {
      return reply.code(400).send({ error: { message: "This provider does not support API token auth" } });
    }

    const validation = await adapter.validateToken(token, providerConfig || {});
    if (!validation.valid) {
      return reply.code(400).send({ error: { message: "Invalid token or configuration" } });
    }

    const integration = await prisma.integration.create({
      data: {
        userId: request.userId,
        provider: provider as IntegrationProvider,
        authType: "api_token",
        displayName: displayName || validation.displayName || adapter.meta.name,
        encryptedAccessToken: encryptToken(token),
        accountEmail: validation.accountEmail || null,
        config: providerConfig || {},
      },
    });

    return reply.code(201).send({
      data: {
        id: integration.id,
        provider: integration.provider,
        status: integration.status,
        displayName: integration.displayName,
      },
    });
  });

  // --- Disconnect ---
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const integration = await prisma.integration.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!integration) return reply.code(404).send({ error: { message: "Integration not found" } });

    await prisma.integration.delete({ where: { id: integration.id } });
    return { data: { success: true } };
  });

  // --- Test connection ---
  app.post<{ Params: { id: string } }>("/:id/test", async (request, reply) => {
    try {
      const { accessToken, integration } = await getValidAccessToken(request.params.id);
      if (integration.userId !== request.userId) {
        return reply.code(404).send({ error: { message: "Integration not found" } });
      }

      const adapter = getAdapter(integration.provider);
      const projects = await adapter.listProjects(accessToken, integration.config as Record<string, unknown>);

      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: "connected", lastError: null, lastSyncedAt: new Date() },
      });

      return { data: { success: true, projectCount: projects.length } };
    } catch (err: any) {
      await prisma.integration.update({
        where: { id: request.params.id },
        data: { status: "error", lastError: err.message },
      }).catch(() => {});
      return reply.code(400).send({ error: { message: err.message } });
    }
  });

  // --- List external projects ---
  app.get<{ Params: { id: string } }>("/:id/projects", async (request, reply) => {
    const { accessToken, integration } = await getValidAccessToken(request.params.id);
    if (integration.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Integration not found" } });
    }

    const adapter = getAdapter(integration.provider);
    const projects = await adapter.listProjects(accessToken, integration.config as Record<string, unknown>);
    return { data: projects };
  });

  // --- List items from external project ---
  app.get<{
    Params: { id: string; extProjectId: string };
    Querystring: { cursor?: string; limit?: string; search?: string };
  }>("/:id/projects/:extProjectId/items", async (request, reply) => {
    const { accessToken, integration } = await getValidAccessToken(request.params.id);
    if (integration.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Integration not found" } });
    }

    const adapter = getAdapter(integration.provider);
    const result = await adapter.listItems(
      accessToken,
      integration.config as Record<string, unknown>,
      request.params.extProjectId,
      {
        cursor: request.query.cursor,
        limit: request.query.limit ? parseInt(request.query.limit) : undefined,
        search: request.query.search,
      }
    );

    return { data: result };
  });

  // --- Get item detail ---
  app.get<{
    Params: { id: string; extProjectId: string; itemId: string };
  }>("/:id/projects/:extProjectId/items/:itemId", async (request, reply) => {
    const { accessToken, integration } = await getValidAccessToken(request.params.id);
    if (integration.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Integration not found" } });
    }

    const adapter = getAdapter(integration.provider);
    const detail = await adapter.getItemDetail(
      accessToken,
      integration.config as Record<string, unknown>,
      request.params.extProjectId,
      request.params.itemId
    );

    return { data: detail };
  });

  // --- Integration links for a project ---
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/links",
    async (request) => {
      const links = await prisma.integrationLink.findMany({
        where: {
          projectId: request.params.projectId,
          project: { userId: request.userId },
        },
        include: {
          integration: { select: { provider: true, displayName: true } },
          _count: { select: { imports: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        data: links.map((l) => ({
          id: l.id,
          integrationId: l.integrationId,
          projectId: l.projectId,
          externalProjectId: l.externalProjectId,
          externalProjectName: l.externalProjectName,
          externalProjectKey: l.externalProjectKey,
          externalProjectUrl: l.externalProjectUrl,
          lastSyncedAt: l.lastSyncedAt,
          importCount: l._count.imports,
          integration: l.integration,
        })),
      };
    }
  );

  // --- Create link ---
  app.post<{
    Params: { projectId: string };
    Body: {
      integrationId: string;
      externalProjectId: string;
      externalProjectName: string;
      externalProjectKey?: string;
      externalProjectUrl?: string;
    };
  }>("/projects/:projectId/links", async (request, reply) => {
    const { integrationId, externalProjectId, externalProjectName, externalProjectKey, externalProjectUrl } = request.body;

    // Verify ownership
    const [project, integration] = await Promise.all([
      prisma.project.findFirst({ where: { id: request.params.projectId, userId: request.userId } }),
      prisma.integration.findFirst({ where: { id: integrationId, userId: request.userId } }),
    ]);

    if (!project) return reply.code(404).send({ error: { message: "Project not found" } });
    if (!integration) return reply.code(404).send({ error: { message: "Integration not found" } });

    const link = await prisma.integrationLink.create({
      data: {
        integrationId,
        projectId: request.params.projectId,
        externalProjectId,
        externalProjectName,
        externalProjectKey: externalProjectKey || "",
        externalProjectUrl: externalProjectUrl || null,
      },
      include: {
        integration: { select: { provider: true, displayName: true } },
      },
    });

    return reply.code(201).send({ data: link });
  });

  // --- Delete link ---
  app.delete<{ Params: { linkId: string } }>(
    "/links/:linkId",
    async (request, reply) => {
      const link = await prisma.integrationLink.findFirst({
        where: { id: request.params.linkId },
        include: { project: { select: { userId: true } } },
      });
      if (!link || link.project.userId !== request.userId) {
        return reply.code(404).send({ error: { message: "Link not found" } });
      }

      await prisma.integrationLink.delete({ where: { id: link.id } });
      return { data: { success: true } };
    }
  );

  // --- Import items ---
  app.post<{
    Params: { linkId: string };
    Body: { itemIds: string[]; repositoryId: string };
  }>("/links/:linkId/import", async (request, reply) => {
    const { itemIds, repositoryId } = request.body;

    const link = await prisma.integrationLink.findFirst({
      where: { id: request.params.linkId },
      include: {
        project: { select: { userId: true, id: true } },
        integration: true,
      },
    });

    if (!link || link.project.userId !== request.userId) {
      return reply.code(404).send({ error: { message: "Link not found" } });
    }

    // Verify repo access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repository not found" } });

    const adapter = getAdapter(link.integration.provider);
    const accessToken = decryptToken(link.integration.encryptedAccessToken);
    const integrationConfig = link.integration.config as Record<string, unknown>;

    const createdTasks: string[] = [];

    for (const itemId of itemIds) {
      // Skip already-imported items
      const existing = await prisma.taskExternalLink.findUnique({
        where: { integrationLinkId_externalItemId: { integrationLinkId: link.id, externalItemId: itemId } },
      });
      if (existing) continue;

      const detail = await adapter.getItemDetail(accessToken, integrationConfig, link.externalProjectId, itemId);
      const fields = adapter.mapToTaskFields(detail);

      // Build rich description
      const parts = [detail.description];
      if (detail.comments.length > 0) {
        parts.push("\n--- Comments ---");
        for (const c of detail.comments.slice(0, 10)) {
          parts.push(`\n[${c.author}] (${c.createdAt}):\n${c.body}`);
        }
      }
      if (detail.stackTrace) {
        parts.push(`\n--- Stack Trace ---\n${detail.stackTrace}`);
      }
      if (detail.labels.length > 0) {
        parts.push(`\nLabels: ${detail.labels.join(", ")}`);
      }

      const task = await prisma.task.create({
        data: {
          repositoryId,
          userId: request.userId,
          projectId: link.project.id,
          title: fields.title,
          description: parts.join("\n"),
          type: fields.type,
          priority: fields.priority,
          source: "external_import",
          status: "pending",
        },
      });

      await prisma.taskExternalLink.create({
        data: {
          taskId: task.id,
          integrationLinkId: link.id,
          externalItemId: itemId,
          externalItemUrl: detail.url,
          externalItemType: detail.itemType,
          importedData: {
            title: detail.title,
            status: detail.status,
            priority: detail.priority,
            type: detail.type,
            labels: detail.labels,
          },
        },
      });

      createdTasks.push(task.id);
    }

    // Update last synced
    await prisma.integrationLink.update({
      where: { id: link.id },
      data: { lastSyncedAt: new Date() },
    });

    return { data: { taskIds: createdTasks, imported: createdTasks.length } };
  });
};
