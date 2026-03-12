import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import type { TaskPriority, TaskType } from "@autosoftware/shared";

export interface GitHubLabelMapping {
  priorityLabels?: Record<string, TaskPriority>;
  typeLabels?: Record<string, TaskType>;
}

export interface UserSettings {
  scanBudget?: number;
  taskBudget?: number;
  planBudget?: number;
  githubLabelMapping?: GitHubLabelMapping;
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

  // ============================================================================
  // GitHub Label Mapping Settings
  // ============================================================================

  // GET /settings/github-labels - Get current GitHub label mappings
  app.get("/github-labels", async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { settings: true },
    });

    const settings = (user?.settings as UserSettings) || {};
    const labelMapping = settings.githubLabelMapping || {};

    // Return custom mappings with default values shown
    return {
      data: {
        customMappings: labelMapping,
        defaultPriorityLabels: {
          "priority: critical": "critical",
          "priority: high": "high",
          "priority: medium": "medium",
          "priority: low": "low",
          "p0": "critical",
          "p1": "high",
          "p2": "medium",
          "p3": "low",
          "urgent": "critical",
          "blocker": "critical",
        },
        defaultTypeLabels: {
          "bug": "bugfix",
          "feature": "feature",
          "enhancement": "feature",
          "improvement": "improvement",
          "refactor": "refactor",
          "tech-debt": "refactor",
          "security": "security",
        },
      },
    };
  });

  // PUT /settings/github-labels - Update GitHub label mappings
  app.put<{
    Body: {
      priorityLabels?: Record<string, TaskPriority>;
      typeLabels?: Record<string, TaskType>;
    };
  }>("/github-labels", async (request, reply) => {
    const { priorityLabels, typeLabels } = request.body;

    // Validate priorities
    const validPriorities = ["low", "medium", "high", "critical"];
    if (priorityLabels) {
      for (const [label, priority] of Object.entries(priorityLabels)) {
        if (!validPriorities.includes(priority)) {
          return reply.code(400).send({
            error: { message: `Invalid priority "${priority}" for label "${label}"` },
          });
        }
      }
    }

    // Validate types
    const validTypes = ["improvement", "bugfix", "feature", "refactor", "security"];
    if (typeLabels) {
      for (const [label, type] of Object.entries(typeLabels)) {
        if (!validTypes.includes(type)) {
          return reply.code(400).send({
            error: { message: `Invalid type "${type}" for label "${label}"` },
          });
        }
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { settings: true },
    });

    const currentSettings = (user?.settings as UserSettings) || {};
    const currentMapping = currentSettings.githubLabelMapping || {};

    const newMapping: GitHubLabelMapping = {
      priorityLabels: {
        ...(currentMapping.priorityLabels || {}),
        ...(priorityLabels || {}),
      },
      typeLabels: {
        ...(currentMapping.typeLabels || {}),
        ...(typeLabels || {}),
      },
    };

    // Clean up empty values
    if (newMapping.priorityLabels) {
      for (const key of Object.keys(newMapping.priorityLabels)) {
        if (!newMapping.priorityLabels[key]) {
          delete newMapping.priorityLabels[key];
        }
      }
    }
    if (newMapping.typeLabels) {
      for (const key of Object.keys(newMapping.typeLabels)) {
        if (!newMapping.typeLabels[key]) {
          delete newMapping.typeLabels[key];
        }
      }
    }

    const newSettings: UserSettings = {
      ...currentSettings,
      githubLabelMapping: newMapping,
    };

    await prisma.user.update({
      where: { id: request.userId },
      data: { settings: newSettings },
    });

    return { data: { githubLabelMapping: newMapping } };
  });

  // DELETE /settings/github-labels/:label - Remove a custom label mapping
  app.delete<{
    Params: { label: string };
    Querystring: { mappingType: "priority" | "type" };
  }>("/github-labels/:label", async (request, reply) => {
    const { label } = request.params;
    const { mappingType } = request.query;

    if (!mappingType || !["priority", "type"].includes(mappingType)) {
      return reply.code(400).send({
        error: { message: "mappingType query param must be 'priority' or 'type'" },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { settings: true },
    });

    const currentSettings = (user?.settings as UserSettings) || {};
    const currentMapping = currentSettings.githubLabelMapping || {};

    if (mappingType === "priority" && currentMapping.priorityLabels) {
      delete currentMapping.priorityLabels[label];
    } else if (mappingType === "type" && currentMapping.typeLabels) {
      delete currentMapping.typeLabels[label];
    }

    await prisma.user.update({
      where: { id: request.userId },
      data: {
        settings: {
          ...currentSettings,
          githubLabelMapping: currentMapping,
        },
      },
    });

    return { data: { success: true } };
  });
};
