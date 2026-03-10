import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { encrypt, decrypt, makeKeyPrefix, estimateCost } from "@autosoftware/shared";
import Anthropic from "@anthropic-ai/sdk";

export const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET / - List user's keys with aggregated usage totals
  app.get("/", async (request) => {
    const keys = await prisma.apiKey.findMany({
      where: { userId: request.userId },
      orderBy: { priority: "asc" },
      include: {
        usageRecords: {
          select: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
        },
      },
    });

    const data = keys.map((key) => {
      const totalCost = key.usageRecords.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
      const totalInputTokens = key.usageRecords.reduce((sum, r) => sum + r.inputTokens, 0);
      const totalOutputTokens = key.usageRecords.reduce((sum, r) => sum + r.outputTokens, 0);
      return {
        id: key.id,
        label: key.label,
        keyPrefix: key.keyPrefix,
        priority: key.priority,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        lastError: key.lastError,
        createdAt: key.createdAt,
        totalCost,
        totalInputTokens,
        totalOutputTokens,
        usageCount: key.usageRecords.length,
      };
    });

    return { data };
  });

  // POST / - Add a new API key
  app.post<{ Body: { label: string; apiKey: string } }>("/", async (request, reply) => {
    const { label, apiKey } = request.body;
    if (!label || !apiKey) {
      return reply.code(400).send({ error: { message: "label and apiKey are required" } });
    }

    if (!config.apiKeyEncryptionSecret) {
      return reply.code(500).send({ error: { message: "Encryption secret not configured" } });
    }

    // Validate the API key by listing models (free, no tokens used, model-agnostic)
    try {
      const client = new Anthropic({ apiKey });
      await client.models.list({ limit: 1 });
    } catch (err: any) {
      const msg = err?.status === 401
        ? "Invalid API key — authentication failed"
        : `API key validation failed: ${err.message}`;
      return reply.code(400).send({ error: { message: msg } });
    }

    // Get max priority for ordering
    const maxPriority = await prisma.apiKey.aggregate({
      where: { userId: request.userId },
      _max: { priority: true },
    });
    const nextPriority = (maxPriority._max.priority ?? -1) + 1;

    const encryptedKey = encrypt(apiKey, config.apiKeyEncryptionSecret);
    const keyPrefix = makeKeyPrefix(apiKey);

    const created = await prisma.apiKey.create({
      data: {
        userId: request.userId,
        label,
        encryptedKey,
        keyPrefix,
        priority: nextPriority,
      },
    });

    return {
      data: {
        id: created.id,
        label: created.label,
        keyPrefix: created.keyPrefix,
        priority: created.priority,
        isActive: created.isActive,
        lastUsedAt: created.lastUsedAt,
        lastError: created.lastError,
        createdAt: created.createdAt,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        usageCount: 0,
      },
    };
  });

  // PATCH /:id - Update label/isActive
  app.patch<{ Params: { id: string }; Body: { label?: string; isActive?: boolean } }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const { label, isActive } = request.body;

      const key = await prisma.apiKey.findFirst({
        where: { id, userId: request.userId },
      });
      if (!key) return reply.code(404).send({ error: { message: "Key not found" } });

      const updated = await prisma.apiKey.update({
        where: { id },
        data: {
          ...(label !== undefined && { label }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      return {
        data: {
          id: updated.id,
          label: updated.label,
          keyPrefix: updated.keyPrefix,
          priority: updated.priority,
          isActive: updated.isActive,
          lastUsedAt: updated.lastUsedAt,
          lastError: updated.lastError,
        },
      };
    }
  );

  // DELETE /:id - Delete key + cascading usage records
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;

    const key = await prisma.apiKey.findFirst({
      where: { id, userId: request.userId },
    });
    if (!key) return reply.code(404).send({ error: { message: "Key not found" } });

    await prisma.apiKey.delete({ where: { id } });
    return { data: { success: true } };
  });

  // PUT /reorder - Bulk reorder by { keyIds: string[] }
  app.put<{ Body: { keyIds: string[] } }>("/reorder", async (request, reply) => {
    const { keyIds } = request.body;
    if (!keyIds || !Array.isArray(keyIds)) {
      return reply.code(400).send({ error: { message: "keyIds array is required" } });
    }

    // Verify all keys belong to user
    const keys = await prisma.apiKey.findMany({
      where: { userId: request.userId },
    });
    const userKeyIds = new Set(keys.map((k) => k.id));
    for (const kid of keyIds) {
      if (!userKeyIds.has(kid)) {
        return reply.code(400).send({ error: { message: `Key ${kid} not found` } });
      }
    }

    // Update priorities
    await Promise.all(
      keyIds.map((kid, index) =>
        prisma.apiKey.update({ where: { id: kid }, data: { priority: index } })
      )
    );

    return { data: { success: true } };
  });

  // GET /:id/usage - Detailed usage breakdown
  app.get<{ Params: { id: string }; Querystring: { days?: string } }>(
    "/:id/usage",
    async (request, reply) => {
      const { id } = request.params;
      const days = parseInt(request.query.days || "30");

      const key = await prisma.apiKey.findFirst({
        where: { id, userId: request.userId },
      });
      if (!key) return reply.code(404).send({ error: { message: "Key not found" } });

      const since = new Date();
      since.setDate(since.getDate() - days);

      const records = await prisma.apiKeyUsage.findMany({
        where: { apiKeyId: id, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
      });

      // Daily aggregation
      const dailyMap = new Map<string, { cost: number; input: number; output: number; count: number }>();
      for (const r of records) {
        const day = r.createdAt.toISOString().slice(0, 10);
        const existing = dailyMap.get(day) || { cost: 0, input: 0, output: 0, count: 0 };
        existing.cost += r.estimatedCostUsd;
        existing.input += r.inputTokens;
        existing.output += r.outputTokens;
        existing.count++;
        dailyMap.set(day, existing);
      }

      // By model
      const modelMap = new Map<string, { cost: number; input: number; output: number; count: number }>();
      for (const r of records) {
        const existing = modelMap.get(r.model) || { cost: 0, input: 0, output: 0, count: 0 };
        existing.cost += r.estimatedCostUsd;
        existing.input += r.inputTokens;
        existing.output += r.outputTokens;
        existing.count++;
        modelMap.set(r.model, existing);
      }

      // By source
      const sourceMap = new Map<string, { cost: number; count: number }>();
      for (const r of records) {
        const existing = sourceMap.get(r.source) || { cost: 0, count: 0 };
        existing.cost += r.estimatedCostUsd;
        existing.count++;
        sourceMap.set(r.source, existing);
      }

      return {
        data: {
          daily: Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v })),
          byModel: Array.from(modelMap.entries()).map(([model, v]) => ({ model, ...v })),
          bySource: Array.from(sourceMap.entries()).map(([source, v]) => ({ source, ...v })),
          totalCost: records.reduce((s, r) => s + r.estimatedCostUsd, 0),
          totalRequests: records.length,
        },
      };
    }
  );
};
