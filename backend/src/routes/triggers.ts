/**
 * Trigger Routes
 *
 * API endpoints for managing workflow automation triggers:
 * - CRUD operations for triggers
 * - Trigger testing
 * - Execution history
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import {
  zoneTriggerService,
  type ConditionTree,
  type ActionConfig,
  type TriggerType,
} from "../services/zone-triggers.js";

// ============================================================================
// Types
// ============================================================================

interface CreateTriggerInput {
  name: string;
  description?: string;
  triggerType: TriggerType;
  conditions: ConditionTree;
  actions: ActionConfig[];
  enabled?: boolean;
  repositoryId?: string;
  projectId?: string;
}

interface UpdateTriggerInput {
  name?: string;
  description?: string;
  triggerType?: TriggerType;
  conditions?: ConditionTree;
  actions?: ActionConfig[];
  enabled?: boolean;
  repositoryId?: string | null;
  projectId?: string | null;
}

interface TestTriggerInput {
  testData: Record<string, any>;
}

// ============================================================================
// Routes
// ============================================================================

export const triggerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // ============================================================================
  // GET /api/triggers - List all triggers for user
  // ============================================================================
  app.get<{
    Querystring: {
      enabled?: string;
      triggerType?: string;
      repositoryId?: string;
      projectId?: string;
    };
  }>("/", async (request) => {
    const { enabled, triggerType, repositoryId, projectId } = request.query;

    const where: any = { userId: request.userId };

    if (enabled !== undefined) {
      where.enabled = enabled === "true";
    }
    if (triggerType) {
      where.triggerType = triggerType;
    }
    if (repositoryId) {
      where.repositoryId = repositoryId;
    }
    if (projectId) {
      where.projectId = projectId;
    }

    const triggers = await prisma.trigger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });

    return {
      data: triggers.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        enabled: t.enabled,
        triggerType: t.triggerType,
        conditions: t.conditions,
        actions: t.actions,
        repositoryId: t.repositoryId,
        projectId: t.projectId,
        lastTriggeredAt: t.lastTriggeredAt,
        triggerCount: t.triggerCount,
        executionCount: t._count.executions,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
  });

  // ============================================================================
  // GET /api/triggers/templates - Get trigger templates
  // NOTE: This route MUST be defined before /:id to avoid being caught by the param
  // ============================================================================
  app.get("/templates", async () => {
    const templates = [
      {
        id: "task-completed-notify",
        name: "Notify on Task Completion",
        description:
          "Send a notification when any task is marked as completed",
        triggerType: "task_status_change",
        conditions: {
          type: "condition",
          field: "newStatus",
          operator: "equals",
          value: "completed",
        },
        actions: [
          {
            type: "notify",
            config: {
              channel: "in_app",
              title: "Task Completed",
              message: "Task '{{taskTitle}}' has been completed",
            },
          },
        ],
      },
      {
        id: "scan-issues-webhook",
        name: "Webhook on Scan with Issues",
        description:
          "Call a webhook when a scan completes with new tasks found",
        triggerType: "scan_complete",
        conditions: {
          type: "group",
          operator: "AND",
          conditions: [
            {
              type: "condition",
              field: "status",
              operator: "equals",
              value: "completed",
            },
            {
              type: "condition",
              field: "tasksCreated",
              operator: "greater_than",
              value: 0,
            },
          ],
        },
        actions: [
          {
            type: "webhook",
            config: {
              url: "https://your-webhook-url.com/scan-results",
              method: "POST",
              body: {
                scanId: "{{scanId}}",
                repository: "{{repositoryName}}",
                tasksCreated: "{{tasksCreated}}",
              },
            },
          },
        ],
      },
      {
        id: "critical-task-auto-assign",
        name: "Auto-assign Critical Tasks",
        description: "Automatically assign critical priority tasks to a team lead",
        triggerType: "task_status_change",
        conditions: {
          type: "group",
          operator: "AND",
          conditions: [
            {
              type: "condition",
              field: "newStatus",
              operator: "equals",
              value: "pending",
            },
            {
              type: "condition",
              field: "priority",
              operator: "equals",
              value: "critical",
            },
          ],
        },
        actions: [
          {
            type: "auto_assign",
            config: {
              assignTo: "team-lead",
            },
          },
          {
            type: "notify",
            config: {
              channel: "email",
              title: "Critical Task Assigned",
              message:
                "A critical task '{{taskTitle}}' has been auto-assigned to you",
            },
          },
        ],
      },
      {
        id: "security-task-email",
        name: "Email on Security Issues",
        description: "Send an email when a security-type task is created",
        triggerType: "task_status_change",
        conditions: {
          type: "group",
          operator: "AND",
          conditions: [
            {
              type: "condition",
              field: "newStatus",
              operator: "equals",
              value: "pending",
            },
            {
              type: "condition",
              field: "taskType",
              operator: "equals",
              value: "security",
            },
          ],
        },
        actions: [
          {
            type: "email",
            config: {
              to: "security-team@company.com",
              subject: "Security Issue Detected: {{taskTitle}}",
              body: "A new security issue has been detected in {{repositoryName}}.\n\nTask: {{taskTitle}}\nPriority: {{priority}}",
            },
          },
        ],
      },
      {
        id: "failed-task-retry",
        name: "Auto-retry Failed Tasks",
        description: "Automatically retry task execution when it fails",
        triggerType: "task_status_change",
        conditions: {
          type: "condition",
          field: "newStatus",
          operator: "equals",
          value: "failed",
        },
        actions: [
          {
            type: "run_task",
            config: {
              action: "execute",
            },
          },
          {
            type: "notify",
            config: {
              channel: "in_app",
              title: "Task Retry Initiated",
              message: "Task '{{taskTitle}}' failed and is being retried",
            },
          },
        ],
      },
    ];

    return { data: templates };
  });

  // ============================================================================
  // GET /api/triggers/stats - Get trigger statistics
  // NOTE: This route MUST be defined before /:id to avoid being caught by the param
  // ============================================================================
  app.get("/stats", async (request) => {
    const [triggerCount, executionStats, recentExecutions] = await Promise.all([
      prisma.trigger.count({
        where: { userId: request.userId },
      }),
      prisma.triggerExecution.groupBy({
        by: ["status"],
        where: {
          trigger: { userId: request.userId },
        },
        _count: true,
      }),
      prisma.triggerExecution.findMany({
        where: {
          trigger: { userId: request.userId },
        },
        orderBy: { executedAt: "desc" },
        take: 10,
        include: {
          trigger: {
            select: { name: true },
          },
        },
      }),
    ]);

    const stats = {
      success: 0,
      failed: 0,
      skipped: 0,
    };

    for (const stat of executionStats) {
      if (stat.status in stats) {
        stats[stat.status as keyof typeof stats] = stat._count;
      }
    }

    return {
      data: {
        totalTriggers: triggerCount,
        executionStats: stats,
        totalExecutions: stats.success + stats.failed + stats.skipped,
        successRate:
          stats.success + stats.failed > 0
            ? (stats.success / (stats.success + stats.failed)) * 100
            : 100,
        recentExecutions: recentExecutions.map((e) => ({
          id: e.id,
          triggerName: e.trigger.name,
          status: e.status,
          executedAt: e.executedAt,
          durationMs: e.durationMs,
        })),
      },
    };
  });

  // ============================================================================
  // GET /api/triggers/:id - Get single trigger
  // ============================================================================
  app.get<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
    const trigger = await prisma.trigger.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });

    if (!trigger) {
      return reply.code(404).send({ error: { message: "Trigger not found" } });
    }

    return {
      data: {
        id: trigger.id,
        name: trigger.name,
        description: trigger.description,
        enabled: trigger.enabled,
        triggerType: trigger.triggerType,
        conditions: trigger.conditions,
        actions: trigger.actions,
        repositoryId: trigger.repositoryId,
        projectId: trigger.projectId,
        lastTriggeredAt: trigger.lastTriggeredAt,
        triggerCount: trigger.triggerCount,
        executionCount: trigger._count.executions,
        createdAt: trigger.createdAt,
        updatedAt: trigger.updatedAt,
      },
    };
  });

  // ============================================================================
  // POST /api/triggers - Create new trigger
  // ============================================================================
  app.post<{
    Body: CreateTriggerInput;
  }>("/", async (request, reply) => {
    const {
      name,
      description,
      triggerType,
      conditions,
      actions,
      enabled = true,
      repositoryId,
      projectId,
    } = request.body;

    // Validate trigger type
    const validTriggerTypes: TriggerType[] = [
      "task_status_change",
      "scan_complete",
      "time_based",
      "file_change",
    ];
    if (!validTriggerTypes.includes(triggerType)) {
      return reply.code(400).send({
        error: { message: `Invalid trigger type: ${triggerType}` },
      });
    }

    // Validate conditions
    const conditionValidation = zoneTriggerService.validateConditions(conditions);
    if (!conditionValidation.valid) {
      return reply.code(400).send({
        error: {
          message: "Invalid conditions",
          details: conditionValidation.errors,
        },
      });
    }

    // Validate actions
    const actionValidation = zoneTriggerService.validateActions(actions);
    if (!actionValidation.valid) {
      return reply.code(400).send({
        error: {
          message: "Invalid actions",
          details: actionValidation.errors,
        },
      });
    }

    // Validate repository belongs to user if specified
    if (repositoryId) {
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId: request.userId },
      });
      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }
    }

    // Validate project belongs to user if specified
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
      });
      if (!project) {
        return reply.code(404).send({
          error: { message: "Project not found" },
        });
      }
    }

    const trigger = await prisma.trigger.create({
      data: {
        userId: request.userId,
        name,
        description,
        triggerType,
        conditions,
        actions,
        enabled,
        repositoryId,
        projectId,
      },
    });

    return reply.code(201).send({ data: trigger });
  });

  // ============================================================================
  // PUT /api/triggers/:id - Update trigger
  // ============================================================================
  app.put<{
    Params: { id: string };
    Body: UpdateTriggerInput;
  }>("/:id", async (request, reply) => {
    const existingTrigger = await prisma.trigger.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!existingTrigger) {
      return reply.code(404).send({ error: { message: "Trigger not found" } });
    }

    const {
      name,
      description,
      triggerType,
      conditions,
      actions,
      enabled,
      repositoryId,
      projectId,
    } = request.body;

    // Validate trigger type if provided
    if (triggerType) {
      const validTriggerTypes: TriggerType[] = [
        "task_status_change",
        "scan_complete",
        "time_based",
        "file_change",
      ];
      if (!validTriggerTypes.includes(triggerType)) {
        return reply.code(400).send({
          error: { message: `Invalid trigger type: ${triggerType}` },
        });
      }
    }

    // Validate conditions if provided
    if (conditions) {
      const conditionValidation =
        zoneTriggerService.validateConditions(conditions);
      if (!conditionValidation.valid) {
        return reply.code(400).send({
          error: {
            message: "Invalid conditions",
            details: conditionValidation.errors,
          },
        });
      }
    }

    // Validate actions if provided
    if (actions) {
      const actionValidation = zoneTriggerService.validateActions(actions);
      if (!actionValidation.valid) {
        return reply.code(400).send({
          error: {
            message: "Invalid actions",
            details: actionValidation.errors,
          },
        });
      }
    }

    // Validate repository if changing
    if (repositoryId !== undefined && repositoryId !== null) {
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId: request.userId },
      });
      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }
    }

    // Validate project if changing
    if (projectId !== undefined && projectId !== null) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: request.userId },
      });
      if (!project) {
        return reply.code(404).send({
          error: { message: "Project not found" },
        });
      }
    }

    const trigger = await prisma.trigger.update({
      where: { id: request.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(triggerType !== undefined && { triggerType }),
        ...(conditions !== undefined && { conditions }),
        ...(actions !== undefined && { actions }),
        ...(enabled !== undefined && { enabled }),
        ...(repositoryId !== undefined && { repositoryId }),
        ...(projectId !== undefined && { projectId }),
      },
    });

    return { data: trigger };
  });

  // ============================================================================
  // DELETE /api/triggers/:id - Delete trigger
  // ============================================================================
  app.delete<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
    const trigger = await prisma.trigger.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!trigger) {
      return reply.code(404).send({ error: { message: "Trigger not found" } });
    }

    await prisma.trigger.delete({
      where: { id: request.params.id },
    });

    return { data: { success: true } };
  });

  // ============================================================================
  // POST /api/triggers/:id/test - Test trigger execution
  // ============================================================================
  app.post<{
    Params: { id: string };
    Body: TestTriggerInput;
  }>("/:id/test", async (request, reply) => {
    const trigger = await prisma.trigger.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!trigger) {
      return reply.code(404).send({ error: { message: "Trigger not found" } });
    }

    const { testData } = request.body;

    try {
      const result = await zoneTriggerService.testTrigger(
        request.params.id,
        testData
      );

      return {
        data: {
          triggerId: trigger.id,
          triggerName: trigger.name,
          testData,
          ...result,
        },
      };
    } catch (error) {
      return reply.code(400).send({
        error: {
          message: error instanceof Error ? error.message : "Test failed",
        },
      });
    }
  });

  // ============================================================================
  // GET /api/triggers/:id/history - Execution history
  // ============================================================================
  app.get<{
    Params: { id: string };
    Querystring: {
      limit?: string;
      offset?: string;
      status?: string;
    };
  }>("/:id/history", async (request, reply) => {
    const trigger = await prisma.trigger.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!trigger) {
      return reply.code(404).send({ error: { message: "Trigger not found" } });
    }

    const limit = Math.min(parseInt(request.query.limit || "50", 10), 100);
    const offset = parseInt(request.query.offset || "0", 10);
    const { status } = request.query;

    const where: any = { triggerId: request.params.id };
    if (status) {
      where.status = status;
    }

    const [executions, total] = await Promise.all([
      prisma.triggerExecution.findMany({
        where,
        orderBy: { executedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.triggerExecution.count({ where }),
    ]);

    return {
      data: executions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + executions.length < total,
      },
    };
  });

  // ============================================================================
  // PATCH /api/triggers/:id/toggle - Toggle trigger enabled/disabled
  // ============================================================================
  app.patch<{
    Params: { id: string };
  }>("/:id/toggle", async (request, reply) => {
    const trigger = await prisma.trigger.findFirst({
      where: {
        id: request.params.id,
        userId: request.userId,
      },
    });

    if (!trigger) {
      return reply.code(404).send({ error: { message: "Trigger not found" } });
    }

    const updated = await prisma.trigger.update({
      where: { id: request.params.id },
      data: { enabled: !trigger.enabled },
    });

    return { data: updated };
  });
};

export default triggerRoutes;
