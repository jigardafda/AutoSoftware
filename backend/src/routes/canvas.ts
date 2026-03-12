import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

interface CanvasStateInput {
  taskPositions?: Record<string, { x: number; y: number; width: number; height: number }>;
  connections?: Array<{ id: string; sourceId: string; targetId: string; label?: string }>;
  groups?: Array<{
    id: string;
    name: string;
    taskIds: string[];
    color: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  zoom?: number;
  viewportX?: number;
  viewportY?: number;
}

interface ConnectionInput {
  sourceTaskId: string;
  targetTaskId: string;
  label?: string;
}

export const canvasRoutes: FastifyPluginAsync = async (app) => {
  // Require authentication for all routes
  app.addHook("preHandler", (app as any).requireAuth);

  /**
   * GET /api/canvas/:projectId
   * Get canvas state for a project (or "global" for all tasks)
   */
  app.get<{
    Params: { projectId: string };
  }>("/:projectId", async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.userId;

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    const canvasState = await prisma.canvasState.findFirst({
      where: {
        projectId: projectIdValue,
        userId,
      },
    });

    if (!canvasState) {
      // Return default empty canvas state
      return {
        data: {
          id: null,
          projectId: projectIdValue,
          taskPositions: {},
          connections: [],
          groups: [],
          zoom: 1.0,
          viewportX: 0,
          viewportY: 0,
        },
      };
    }

    return {
      data: {
        id: canvasState.id,
        projectId: canvasState.projectId,
        taskPositions: canvasState.taskPositions,
        connections: canvasState.connections,
        groups: canvasState.groups,
        zoom: canvasState.zoom,
        viewportX: canvasState.viewportX,
        viewportY: canvasState.viewportY,
        createdAt: canvasState.createdAt,
        updatedAt: canvasState.updatedAt,
      },
    };
  });

  /**
   * PUT /api/canvas/:projectId
   * Save canvas state for a project (or "global" for all tasks)
   */
  app.put<{
    Params: { projectId: string };
    Body: CanvasStateInput;
  }>("/:projectId", async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.userId;
    const { taskPositions, connections, groups, zoom, viewportX, viewportY } = request.body;

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    // Validate project exists if not global
    if (projectIdValue) {
      const project = await prisma.project.findFirst({
        where: {
          id: projectIdValue,
          userId,
        },
      });

      if (!project) {
        return reply.code(404).send({
          error: { message: "Project not found" },
        });
      }
    }

    // Upsert canvas state
    const canvasState = await prisma.canvasState.upsert({
      where: {
        projectId_userId: {
          projectId: projectIdValue,
          userId,
        },
      },
      create: {
        projectId: projectIdValue,
        userId,
        taskPositions: taskPositions || {},
        connections: connections || [],
        groups: groups || [],
        zoom: zoom ?? 1.0,
        viewportX: viewportX ?? 0,
        viewportY: viewportY ?? 0,
      },
      update: {
        taskPositions: taskPositions !== undefined ? taskPositions : undefined,
        connections: connections !== undefined ? connections : undefined,
        groups: groups !== undefined ? groups : undefined,
        zoom: zoom !== undefined ? zoom : undefined,
        viewportX: viewportX !== undefined ? viewportX : undefined,
        viewportY: viewportY !== undefined ? viewportY : undefined,
      },
    });

    return {
      data: {
        id: canvasState.id,
        projectId: canvasState.projectId,
        taskPositions: canvasState.taskPositions,
        connections: canvasState.connections,
        groups: canvasState.groups,
        zoom: canvasState.zoom,
        viewportX: canvasState.viewportX,
        viewportY: canvasState.viewportY,
        updatedAt: canvasState.updatedAt,
      },
    };
  });

  /**
   * POST /api/canvas/:projectId/connections
   * Add a connection between two tasks
   */
  app.post<{
    Params: { projectId: string };
    Body: ConnectionInput;
  }>("/:projectId/connections", async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.userId;
    const { sourceTaskId, targetTaskId, label } = request.body;

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    // Validate both tasks exist and belong to user
    const [sourceTask, targetTask] = await Promise.all([
      prisma.task.findFirst({ where: { id: sourceTaskId, userId } }),
      prisma.task.findFirst({ where: { id: targetTaskId, userId } }),
    ]);

    if (!sourceTask) {
      return reply.code(404).send({
        error: { message: "Source task not found" },
      });
    }

    if (!targetTask) {
      return reply.code(404).send({
        error: { message: "Target task not found" },
      });
    }

    // Get current canvas state
    let canvasState = await prisma.canvasState.findFirst({
      where: {
        projectId: projectIdValue,
        userId,
      },
    });

    // Create canvas state if it doesn't exist
    if (!canvasState) {
      canvasState = await prisma.canvasState.create({
        data: {
          projectId: projectIdValue,
          userId,
          taskPositions: {},
          connections: [],
          groups: [],
        },
      });
    }

    // Parse existing connections
    const connections = (canvasState.connections as any[]) || [];

    // Check if connection already exists
    const existingConnection = connections.find(
      (c: any) =>
        (c.sourceId === sourceTaskId && c.targetId === targetTaskId) ||
        (c.sourceId === targetTaskId && c.targetId === sourceTaskId)
    );

    if (existingConnection) {
      return reply.code(409).send({
        error: { message: "Connection already exists between these tasks" },
      });
    }

    // Add new connection
    const newConnection = {
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceId: sourceTaskId,
      targetId: targetTaskId,
      label: label || undefined,
    };

    connections.push(newConnection);

    // Update canvas state
    await prisma.canvasState.update({
      where: { id: canvasState.id },
      data: { connections },
    });

    return {
      data: newConnection,
    };
  });

  /**
   * DELETE /api/canvas/:projectId/connections/:connectionId
   * Remove a connection
   */
  app.delete<{
    Params: { projectId: string; connectionId: string };
  }>("/:projectId/connections/:connectionId", async (request, reply) => {
    const { projectId, connectionId } = request.params;
    const userId = request.userId;

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    const canvasState = await prisma.canvasState.findFirst({
      where: {
        projectId: projectIdValue,
        userId,
      },
    });

    if (!canvasState) {
      return reply.code(404).send({
        error: { message: "Canvas state not found" },
      });
    }

    // Filter out the connection
    const connections = ((canvasState.connections as any[]) || []).filter(
      (c: any) => c.id !== connectionId
    );

    await prisma.canvasState.update({
      where: { id: canvasState.id },
      data: { connections },
    });

    return { success: true };
  });

  /**
   * POST /api/canvas/:projectId/groups
   * Create a group of tasks
   */
  app.post<{
    Params: { projectId: string };
    Body: {
      name: string;
      taskIds: string[];
      color: string;
    };
  }>("/:projectId/groups", async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.userId;
    const { name, taskIds, color } = request.body;

    if (!name || !taskIds || taskIds.length < 2) {
      return reply.code(400).send({
        error: { message: "Group requires a name and at least 2 tasks" },
      });
    }

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    // Validate all tasks exist and belong to user
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        userId,
      },
    });

    if (tasks.length !== taskIds.length) {
      return reply.code(404).send({
        error: { message: "Some tasks not found" },
      });
    }

    // Get current canvas state
    let canvasState = await prisma.canvasState.findFirst({
      where: {
        projectId: projectIdValue,
        userId,
      },
    });

    if (!canvasState) {
      canvasState = await prisma.canvasState.create({
        data: {
          projectId: projectIdValue,
          userId,
          taskPositions: {},
          connections: [],
          groups: [],
        },
      });
    }

    // Get task positions to calculate bounds
    const taskPositions = (canvasState.taskPositions as Record<string, any>) || {};
    const positions = taskIds
      .map((id) => taskPositions[id])
      .filter((p) => p);

    let bounds = { x: 0, y: 0, width: 400, height: 300 };
    if (positions.length > 0) {
      bounds = {
        x: Math.min(...positions.map((p: any) => p.x || 0)),
        y: Math.min(...positions.map((p: any) => p.y || 0)),
        width:
          Math.max(...positions.map((p: any) => (p.x || 0) + (p.width || 280))) -
          Math.min(...positions.map((p: any) => p.x || 0)),
        height:
          Math.max(...positions.map((p: any) => (p.y || 0) + (p.height || 120))) -
          Math.min(...positions.map((p: any) => p.y || 0)),
      };
    }

    const groups = ((canvasState.groups as any[]) || []);
    const newGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      taskIds,
      color: color || "blue",
      bounds,
    };

    groups.push(newGroup);

    await prisma.canvasState.update({
      where: { id: canvasState.id },
      data: { groups },
    });

    return { data: newGroup };
  });

  /**
   * DELETE /api/canvas/:projectId/groups/:groupId
   * Remove a group
   */
  app.delete<{
    Params: { projectId: string; groupId: string };
  }>("/:projectId/groups/:groupId", async (request, reply) => {
    const { projectId, groupId } = request.params;
    const userId = request.userId;

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    const canvasState = await prisma.canvasState.findFirst({
      where: {
        projectId: projectIdValue,
        userId,
      },
    });

    if (!canvasState) {
      return reply.code(404).send({
        error: { message: "Canvas state not found" },
      });
    }

    const groups = ((canvasState.groups as any[]) || []).filter(
      (g: any) => g.id !== groupId
    );

    await prisma.canvasState.update({
      where: { id: canvasState.id },
      data: { groups },
    });

    return { success: true };
  });

  /**
   * GET /api/canvas/:projectId/export
   * Export canvas as JSON
   */
  app.get<{
    Params: { projectId: string };
  }>("/:projectId/export", async (request, reply) => {
    const { projectId } = request.params;
    const userId = request.userId;

    // Use null for global canvas
    const projectIdValue = projectId === "global" ? null : projectId;

    const canvasState = await prisma.canvasState.findFirst({
      where: {
        projectId: projectIdValue,
        userId,
      },
    });

    if (!canvasState) {
      return reply.code(404).send({
        error: { message: "Canvas state not found" },
      });
    }

    // Get tasks for the canvas
    const taskWhere: any = { userId };
    if (projectIdValue) {
      taskWhere.projectId = projectIdValue;
    }

    const tasks = await prisma.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        priority: true,
        repository: {
          select: { fullName: true },
        },
      },
    });

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      projectId: projectIdValue,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        type: t.type,
        priority: t.priority,
        repositoryName: t.repository?.fullName,
        position: (canvasState.taskPositions as any)?.[t.id] || null,
      })),
      connections: canvasState.connections,
      groups: canvasState.groups,
      viewport: {
        zoom: canvasState.zoom,
        x: canvasState.viewportX,
        y: canvasState.viewportY,
      },
    };

    reply.header("Content-Type", "application/json");
    reply.header(
      "Content-Disposition",
      `attachment; filename="canvas-${projectId}-${Date.now()}.json"`
    );

    return exportData;
  });
};
