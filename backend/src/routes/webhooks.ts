/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services:
 * - GitHub webhooks for issue/PR/review events
 * - Future: Linear, Jira, etc.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { prisma } from "../db.js";
import { githubSyncService, type WebhookPayload } from "../services/github-sync.js";

// ============================================================================
// Types
// ============================================================================

interface WebhookConfig {
  id: string;
  provider: "github" | "linear" | "jira";
  secret: string;
  repositoryId?: string;
  projectId?: string;
  enabled: boolean;
}

// ============================================================================
// Signature Verification
// ============================================================================

function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Webhook Routes
// ============================================================================

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // Note: Webhook routes don't require auth - they're authenticated via signatures

  // ============================================================================
  // GitHub Webhooks
  // ============================================================================

  /**
   * POST /webhooks/github/:webhookId
   *
   * Receives GitHub webhook events for a specific webhook configuration
   */
  app.post<{
    Params: { webhookId: string };
    Body: WebhookPayload;
  }>(
    "/github/:webhookId",
    {
      config: {
        rawBody: true, // Need raw body for signature verification
      },
    },
    async (request, reply) => {
      const { webhookId } = request.params;

      // Get webhook configuration
      const webhook = await getWebhookConfig(webhookId);

      if (!webhook || webhook.provider !== "github") {
        return reply.code(404).send({ error: "Webhook not found" });
      }

      if (!webhook.enabled) {
        return reply.code(200).send({ message: "Webhook disabled" });
      }

      // Verify signature
      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);

      if (!verifyGitHubSignature(rawBody, signature, webhook.secret)) {
        console.warn(`Invalid GitHub webhook signature for webhook ${webhookId}`);
        return reply.code(401).send({ error: "Invalid signature" });
      }

      // Get event type
      const eventType = request.headers["x-github-event"] as string;
      const deliveryId = request.headers["x-github-delivery"] as string;

      if (!eventType) {
        return reply.code(400).send({ error: "Missing X-GitHub-Event header" });
      }

      // Log webhook receipt
      console.log(`Received GitHub webhook: ${eventType} (delivery: ${deliveryId})`);

      // Handle ping event
      if (eventType === "ping") {
        return reply.code(200).send({
          message: "Pong! Webhook configured successfully.",
          webhookId,
          zen: (request.body as any).zen,
        });
      }

      // Process the webhook
      try {
        const result = await githubSyncService.processGitHubWebhook(
          eventType,
          request.body
        );

        // Log the processing result
        await logWebhookEvent(webhookId, eventType, deliveryId, result);

        return reply.code(200).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Processing failed";
        console.error(`GitHub webhook processing error: ${message}`);

        await logWebhookEvent(webhookId, eventType, deliveryId, {
          processed: false,
          error: message,
        });

        // Return 200 to prevent GitHub from retrying (we've logged the error)
        return reply.code(200).send({
          processed: false,
          error: message,
        });
      }
    }
  );

  /**
   * POST /webhooks/github
   *
   * Generic GitHub webhook endpoint that routes based on repository
   * Used when webhook is configured at the organization/account level
   */
  app.post<{ Body: WebhookPayload }>(
    "/github",
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      const eventType = request.headers["x-github-event"] as string;
      const deliveryId = request.headers["x-github-delivery"] as string;
      const signature = request.headers["x-hub-signature-256"] as string | undefined;

      if (!eventType) {
        return reply.code(400).send({ error: "Missing X-GitHub-Event header" });
      }

      // Handle ping event (no repository context needed)
      if (eventType === "ping") {
        return reply.code(200).send({
          message: "Pong!",
          zen: (request.body as any).zen,
        });
      }

      // Get repository from payload
      const repoFullName = request.body.repository?.full_name;
      if (!repoFullName) {
        return reply.code(400).send({ error: "Missing repository in payload" });
      }

      // Find webhook configuration for this repository
      const webhook = await findWebhookForRepository(repoFullName);

      if (!webhook) {
        // No webhook configured, but we should still process if we have a global secret
        const globalSecret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!globalSecret) {
          console.log(`No webhook config found for ${repoFullName}, skipping`);
          return reply.code(200).send({ message: "No webhook configured" });
        }

        // Verify with global secret
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);
        if (!verifyGitHubSignature(rawBody, signature, globalSecret)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }
      } else {
        // Verify with webhook-specific secret
        const rawBody = (request as any).rawBody || JSON.stringify(request.body);
        if (!verifyGitHubSignature(rawBody, signature, webhook.secret)) {
          return reply.code(401).send({ error: "Invalid signature" });
        }

        if (!webhook.enabled) {
          return reply.code(200).send({ message: "Webhook disabled" });
        }
      }

      console.log(`Received GitHub webhook: ${eventType} for ${repoFullName}`);

      try {
        const result = await githubSyncService.processGitHubWebhook(
          eventType,
          request.body
        );

        if (webhook) {
          await logWebhookEvent(webhook.id, eventType, deliveryId, result);
        }

        return reply.code(200).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Processing failed";
        console.error(`GitHub webhook processing error: ${message}`);
        return reply.code(200).send({ processed: false, error: message });
      }
    }
  );

  // ============================================================================
  // Webhook Management (Requires Auth)
  // ============================================================================

  /**
   * GET /webhooks
   *
   * List all webhook configurations for the user
   */
  app.get("/", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const webhooks = await prisma.webhookConfig.findMany({
      where: { userId: request.userId },
      select: {
        id: true,
        provider: true,
        repositoryId: true,
        projectId: true,
        enabled: true,
        createdAt: true,
        lastEventAt: true,
        eventCount: true,
        repository: {
          select: { fullName: true },
        },
        project: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: webhooks.map((w) => ({
        ...w,
        // Don't expose secrets
        webhookUrl: `${process.env.BACKEND_URL || "http://localhost:5002"}/webhooks/github/${w.id}`,
      })),
    };
  });

  /**
   * POST /webhooks
   *
   * Create a new webhook configuration
   */
  app.post<{
    Body: {
      provider: "github" | "linear" | "jira";
      repositoryId?: string;
      projectId?: string;
    };
  }>("/", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const { provider, repositoryId, projectId } = request.body;

    // Validate repository belongs to user
    if (repositoryId) {
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId: request.userId },
      });
      if (!repo) {
        return reply.code(404).send({ error: { message: "Repository not found" } });
      }
    }

    // Validate project belongs to user
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
      });
      if (!project) {
        return reply.code(404).send({ error: { message: "Project not found" } });
      }
    }

    // Generate webhook secret
    const secret = crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhookConfig.create({
      data: {
        userId: request.userId,
        provider,
        secret,
        repositoryId,
        projectId,
        enabled: true,
      },
      select: {
        id: true,
        provider: true,
        repositoryId: true,
        projectId: true,
        enabled: true,
        createdAt: true,
      },
    });

    return reply.code(201).send({
      data: {
        ...webhook,
        secret, // Only expose secret on creation
        webhookUrl: `${process.env.BACKEND_URL || "http://localhost:5002"}/webhooks/github/${webhook.id}`,
      },
    });
  });

  /**
   * DELETE /webhooks/:id
   *
   * Delete a webhook configuration
   */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const webhook = await prisma.webhookConfig.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!webhook) {
      return reply.code(404).send({ error: { message: "Webhook not found" } });
    }

    await prisma.webhookConfig.delete({
      where: { id: webhook.id },
    });

    return { data: { success: true } };
  });

  /**
   * PATCH /webhooks/:id
   *
   * Update webhook configuration
   */
  app.patch<{
    Params: { id: string };
    Body: { enabled?: boolean; regenerateSecret?: boolean };
  }>("/:id", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const webhook = await prisma.webhookConfig.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!webhook) {
      return reply.code(404).send({ error: { message: "Webhook not found" } });
    }

    const { enabled, regenerateSecret } = request.body;

    const updateData: { enabled?: boolean; secret?: string } = {};

    if (typeof enabled === "boolean") {
      updateData.enabled = enabled;
    }

    if (regenerateSecret) {
      updateData.secret = crypto.randomBytes(32).toString("hex");
    }

    const updated = await prisma.webhookConfig.update({
      where: { id: webhook.id },
      data: updateData,
      select: {
        id: true,
        provider: true,
        repositoryId: true,
        projectId: true,
        enabled: true,
        createdAt: true,
      },
    });

    return {
      data: {
        ...updated,
        webhookUrl: `${process.env.BACKEND_URL || "http://localhost:5002"}/webhooks/github/${updated.id}`,
        ...(regenerateSecret && { secret: updateData.secret }),
      },
    };
  });

  /**
   * GET /webhooks/:id/events
   *
   * Get recent webhook events for debugging
   */
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>("/:id/events", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: { message: "Unauthorized" } });
    }

    const webhook = await prisma.webhookConfig.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });

    if (!webhook) {
      return reply.code(404).send({ error: { message: "Webhook not found" } });
    }

    const limit = parseInt(request.query.limit || "50", 10);

    const events = await prisma.webhookEvent.findMany({
      where: { webhookConfigId: webhook.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return { data: events };
  });
};

// ============================================================================
// Helper Functions
// ============================================================================

async function getWebhookConfig(webhookId: string): Promise<WebhookConfig | null> {
  const config = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
    select: {
      id: true,
      provider: true,
      secret: true,
      repositoryId: true,
      projectId: true,
      enabled: true,
    },
  });

  return config as WebhookConfig | null;
}

async function findWebhookForRepository(
  repoFullName: string
): Promise<WebhookConfig | null> {
  // First, find the repository
  const repo = await prisma.repository.findFirst({
    where: { fullName: repoFullName },
    select: { id: true },
  });

  if (!repo) {
    return null;
  }

  // Find webhook config for this repository
  const config = await prisma.webhookConfig.findFirst({
    where: {
      repositoryId: repo.id,
      provider: "github",
    },
    select: {
      id: true,
      provider: true,
      secret: true,
      repositoryId: true,
      projectId: true,
      enabled: true,
    },
  });

  return config as WebhookConfig | null;
}

async function logWebhookEvent(
  webhookConfigId: string,
  eventType: string,
  deliveryId: string,
  result: { processed: boolean; action?: string; error?: string }
): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.webhookEvent.create({
        data: {
          webhookConfigId,
          eventType,
          deliveryId,
          processed: result.processed,
          action: result.action,
          error: result.error,
        },
      }),
      prisma.webhookConfig.update({
        where: { id: webhookConfigId },
        data: {
          lastEventAt: new Date(),
          eventCount: { increment: 1 },
        },
      }),
    ]);
  } catch (error) {
    console.error("Failed to log webhook event:", error);
  }
}

export default webhookRoutes;
