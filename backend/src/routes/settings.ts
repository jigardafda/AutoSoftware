import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

export interface UserSettings {
  scanBudget?: number;
  taskBudget?: number;
  planBudget?: number;
}

const DEFAULT_SETTINGS: Required<UserSettings> = {
  scanBudget: 2.0,
  taskBudget: 10.0,
  planBudget: 1.0,
};

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET /settings - get current user settings
  app.get("/", async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { settings: true },
    });

    const settings = (user?.settings as UserSettings) || {};
    return {
      data: {
        ...DEFAULT_SETTINGS,
        ...settings,
      },
    };
  });

  // PUT /settings - update user settings
  app.put<{ Body: Partial<UserSettings> }>("/", async (request, reply) => {
    const { scanBudget, taskBudget, planBudget } = request.body;

    // Validate budgets are positive numbers
    const updates: UserSettings = {};
    if (scanBudget !== undefined) {
      if (typeof scanBudget !== "number" || scanBudget <= 0 || scanBudget > 100) {
        return reply.code(400).send({ error: { message: "scanBudget must be between 0.01 and 100" } });
      }
      updates.scanBudget = scanBudget;
    }
    if (taskBudget !== undefined) {
      if (typeof taskBudget !== "number" || taskBudget <= 0 || taskBudget > 500) {
        return reply.code(400).send({ error: { message: "taskBudget must be between 0.01 and 500" } });
      }
      updates.taskBudget = taskBudget;
    }
    if (planBudget !== undefined) {
      if (typeof planBudget !== "number" || planBudget <= 0 || planBudget > 50) {
        return reply.code(400).send({ error: { message: "planBudget must be between 0.01 and 50" } });
      }
      updates.planBudget = planBudget;
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { settings: true },
    });

    const currentSettings = (user?.settings as UserSettings) || {};
    const newSettings = { ...currentSettings, ...updates };

    await prisma.user.update({
      where: { id: request.userId },
      data: { settings: newSettings },
    });

    return {
      data: {
        ...DEFAULT_SETTINGS,
        ...newSettings,
      },
    };
  });

  // GET /settings/usage - aggregated usage stats for settings page
  app.get("/usage", async (request) => {
    const [keys, tasks, scans] = await Promise.all([
      prisma.apiKey.findMany({
        where: { userId: request.userId },
        select: { id: true, label: true },
      }),
      prisma.task.findMany({
        where: { userId: request.userId },
        select: {
          createdAt: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsd: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.scanResult.findMany({
        where: { repository: { userId: request.userId } },
        select: {
          scannedAt: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsd: true,
        },
        orderBy: { scannedAt: "desc" },
        take: 100,
      }),
    ]);

    // Calculate totals
    const taskTotals = tasks.reduce(
      (acc, t) => ({
        inputTokens: acc.inputTokens + t.inputTokens,
        outputTokens: acc.outputTokens + t.outputTokens,
        cost: acc.cost + t.estimatedCostUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cost: 0 }
    );

    const scanTotals = scans.reduce(
      (acc, s) => ({
        inputTokens: acc.inputTokens + s.inputTokens,
        outputTokens: acc.outputTokens + s.outputTokens,
        cost: acc.cost + s.estimatedCostUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cost: 0 }
    );

    // Daily aggregation with task and scan counts
    const dailyData = new Map<string, { cost: number; inputTokens: number; outputTokens: number; taskCount: number; scanCount: number }>();

    for (const t of tasks) {
      const day = t.createdAt.toISOString().slice(0, 10);
      const existing = dailyData.get(day) || { cost: 0, inputTokens: 0, outputTokens: 0, taskCount: 0, scanCount: 0 };
      dailyData.set(day, {
        cost: existing.cost + t.estimatedCostUsd,
        inputTokens: existing.inputTokens + t.inputTokens,
        outputTokens: existing.outputTokens + t.outputTokens,
        taskCount: existing.taskCount + 1,
        scanCount: existing.scanCount,
      });
    }

    for (const s of scans) {
      const day = s.scannedAt.toISOString().slice(0, 10);
      const existing = dailyData.get(day) || { cost: 0, inputTokens: 0, outputTokens: 0, taskCount: 0, scanCount: 0 };
      dailyData.set(day, {
        cost: existing.cost + s.estimatedCostUsd,
        inputTokens: existing.inputTokens + s.inputTokens,
        outputTokens: existing.outputTokens + s.outputTokens,
        taskCount: existing.taskCount,
        scanCount: existing.scanCount + 1,
      });
    }

    const daily = Array.from(dailyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return {
      data: {
        totals: {
          inputTokens: taskTotals.inputTokens + scanTotals.inputTokens,
          outputTokens: taskTotals.outputTokens + scanTotals.outputTokens,
          cost: taskTotals.cost + scanTotals.cost,
          tasks: tasks.length,
          scans: scans.length,
        },
        daily,
      },
    };
  });
};
