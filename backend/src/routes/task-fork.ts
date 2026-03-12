import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";

interface ForkTaskInput {
  reason?: string;
  title?: string;
  startPlanning?: boolean;
}

interface MergePartsInput {
  sourceTaskId: string;
  targetTaskId: string;
  parts: {
    enhancedPlan?: boolean;
    approaches?: boolean;
    selectedApproach?: boolean;
    affectedFiles?: boolean;
  };
}

export const taskForkRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // Fork a task to create a new branch of exploration
  app.post<{ Params: { id: string }; Body: ForkTaskInput }>(
    "/:id/fork",
    async (request, reply) => {
      const { id } = request.params;
      const { reason, title, startPlanning } = request.body || {};

      // Get the original task
      const originalTask = await prisma.task.findFirst({
        where: { id, userId: request.userId },
        include: {
          planningQuestions: true,
        },
      });

      if (!originalTask) {
        return reply.code(404).send({ error: { message: "Task not found" } });
      }

      // Calculate fork depth
      const forkDepth = (originalTask.forkDepth || 0) + 1;

      // Create the forked task with a deep copy of relevant data
      const forkedTask = await prisma.task.create({
        data: {
          repositoryId: originalTask.repositoryId,
          userId: request.userId,
          projectId: originalTask.projectId,
          title: title || `[Fork] ${originalTask.title}`,
          description: originalTask.description,
          type: originalTask.type,
          priority: originalTask.priority,
          status: startPlanning ? "planning" : "pending",
          source: originalTask.source,
          targetBranch: originalTask.targetBranch,
          scanResultId: originalTask.scanResultId,
          metadata: originalTask.metadata || {},

          // Fork relationship
          parentTaskId: originalTask.id,
          forkReason: reason || "Exploring alternative approach",
          forkDepth,

          // Copy planning state
          planningRound: originalTask.planningRound,
          enhancedPlan: originalTask.enhancedPlan,
          affectedFiles: originalTask.affectedFiles as any,
          approaches: originalTask.approaches as any,
          selectedApproach: originalTask.selectedApproach,
          refactorType: originalTask.refactorType,
          multiFileMode: originalTask.multiFileMode,
        },
      });

      // Copy planning questions if any
      if (originalTask.planningQuestions.length > 0) {
        await prisma.planningQuestion.createMany({
          data: originalTask.planningQuestions.map((q) => ({
            taskId: forkedTask.id,
            round: q.round,
            questionKey: q.questionKey,
            label: q.label,
            type: q.type,
            options: q.options as any,
            answer: q.answer as any,
            required: q.required,
            sortOrder: q.sortOrder,
          })),
        });
      }

      // Queue for planning if requested
      if (startPlanning) {
        await schedulerService.queueTaskPlanning(forkedTask.id);
      }

      // Fetch the complete forked task
      const result = await prisma.task.findUnique({
        where: { id: forkedTask.id },
        include: {
          repository: { select: { fullName: true } },
          parentTask: { select: { id: true, title: true } },
        },
      });

      return reply.code(201).send({
        data: {
          ...result,
          repositoryName: result?.repository.fullName,
        },
      });
    }
  );

  // Get fork tree for a task (all ancestors and descendants)
  app.get<{ Params: { id: string } }>("/:id/fork-tree", async (request, reply) => {
    const { id } = request.params;

    // Get the task
    const task = await prisma.task.findFirst({
      where: { id, userId: request.userId },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    // Find the root task
    let rootTaskId = id;
    let currentTask = task;

    while (currentTask.parentTaskId) {
      const parent = await prisma.task.findUnique({
        where: { id: currentTask.parentTaskId },
      });
      if (!parent) break;
      rootTaskId = parent.id;
      currentTask = parent;
    }

    // Build the tree recursively
    const buildTree = async (taskId: string): Promise<any> => {
      const t = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          repository: { select: { fullName: true } },
          childForks: {
            select: { id: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!t) return null;

      const children = await Promise.all(
        t.childForks.map((child) => buildTree(child.id))
      );

      return {
        id: t.id,
        title: t.title,
        status: t.status,
        forkReason: t.forkReason,
        forkDepth: t.forkDepth,
        parentTaskId: t.parentTaskId,
        selectedApproach: t.selectedApproach,
        enhancedPlan: t.enhancedPlan ? true : false,
        pullRequestUrl: t.pullRequestUrl,
        createdAt: t.createdAt,
        repositoryName: t.repository.fullName,
        children: children.filter(Boolean),
      };
    };

    const tree = await buildTree(rootTaskId);

    return { data: { tree, currentTaskId: id, rootTaskId } };
  });

  // Get all forks of a task (direct children only)
  app.get<{ Params: { id: string } }>("/:id/forks", async (request, reply) => {
    const { id } = request.params;

    const task = await prisma.task.findFirst({
      where: { id, userId: request.userId },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    const forks = await prisma.task.findMany({
      where: { parentTaskId: id, userId: request.userId },
      include: {
        repository: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: forks.map((f) => ({
        ...f,
        repositoryName: f.repository.fullName,
      })),
    };
  });

  // Compare two tasks side by side
  app.get<{ Querystring: { taskIds: string } }>("/compare", async (request, reply) => {
    const { taskIds } = request.query;

    if (!taskIds) {
      return reply.code(400).send({ error: { message: "taskIds query parameter is required" } });
    }

    const ids = taskIds.split(",").map((id) => id.trim());

    if (ids.length < 2) {
      return reply.code(400).send({ error: { message: "At least 2 task IDs are required for comparison" } });
    }

    if (ids.length > 4) {
      return reply.code(400).send({ error: { message: "Maximum 4 tasks can be compared at once" } });
    }

    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
      },
      include: {
        repository: { select: { fullName: true } },
        parentTask: { select: { id: true, title: true } },
        planningQuestions: {
          orderBy: [{ round: "desc" }, { sortOrder: "asc" }],
        },
      },
    });

    if (tasks.length !== ids.length) {
      return reply.code(404).send({
        error: { message: "One or more tasks not found or not accessible" },
      });
    }

    // Sort tasks by the order in the query
    const sortedTasks = ids.map((id) => tasks.find((t) => t.id === id)!);

    return {
      data: sortedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        repositoryName: t.repository.fullName,
        parentTask: t.parentTask,
        forkReason: t.forkReason,
        forkDepth: t.forkDepth,
        planningRound: t.planningRound,
        enhancedPlan: t.enhancedPlan,
        affectedFiles: t.affectedFiles,
        approaches: t.approaches,
        selectedApproach: t.selectedApproach,
        planningQuestions: t.planningQuestions,
        pullRequestUrl: t.pullRequestUrl,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      })),
    };
  });

  // Merge selected parts from one fork into another
  app.post<{ Body: MergePartsInput }>("/merge-parts", async (request, reply) => {
    const { sourceTaskId, targetTaskId, parts } = request.body;

    if (!sourceTaskId || !targetTaskId) {
      return reply.code(400).send({
        error: { message: "sourceTaskId and targetTaskId are required" },
      });
    }

    const [source, target] = await Promise.all([
      prisma.task.findFirst({
        where: { id: sourceTaskId, userId: request.userId },
      }),
      prisma.task.findFirst({
        where: { id: targetTaskId, userId: request.userId },
      }),
    ]);

    if (!source) {
      return reply.code(404).send({ error: { message: "Source task not found" } });
    }

    if (!target) {
      return reply.code(404).send({ error: { message: "Target task not found" } });
    }

    // Check if target can be modified
    if (["in_progress", "completed"].includes(target.status)) {
      return reply.code(400).send({
        error: { message: "Cannot merge into a task that is in progress or completed" },
      });
    }

    // Build update data based on requested parts
    const updateData: any = {};

    if (parts.enhancedPlan && source.enhancedPlan) {
      updateData.enhancedPlan = source.enhancedPlan;
    }

    if (parts.approaches && source.approaches) {
      updateData.approaches = source.approaches;
    }

    if (parts.selectedApproach !== undefined && source.selectedApproach !== null) {
      updateData.selectedApproach = source.selectedApproach;
    }

    if (parts.affectedFiles && source.affectedFiles) {
      updateData.affectedFiles = source.affectedFiles;
    }

    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({
        error: { message: "No parts selected for merge or source has no data to merge" },
      });
    }

    // Record the merge in metadata
    const existingMetadata = (target.metadata as Record<string, any>) || {};
    updateData.metadata = {
      ...existingMetadata,
      mergeHistory: [
        ...(existingMetadata.mergeHistory || []),
        {
          sourceTaskId,
          mergedParts: Object.keys(parts).filter(
            (k) => parts[k as keyof typeof parts]
          ),
          mergedAt: new Date().toISOString(),
        },
      ],
    };

    const updated = await prisma.task.update({
      where: { id: targetTaskId },
      data: updateData,
      include: {
        repository: { select: { fullName: true } },
      },
    });

    return {
      data: {
        ...updated,
        repositoryName: updated.repository.fullName,
        mergedParts: Object.keys(parts).filter((k) => parts[k as keyof typeof parts]),
      },
    };
  });

  // Get fork history for a task (all ancestors up to root)
  app.get<{ Params: { id: string } }>("/:id/fork-history", async (request, reply) => {
    const { id } = request.params;

    const task = await prisma.task.findFirst({
      where: { id, userId: request.userId },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    const history: any[] = [];
    let currentId: string | null = task.parentTaskId;

    while (currentId) {
      const ancestor = await prisma.task.findUnique({
        where: { id: currentId },
        include: {
          repository: { select: { fullName: true } },
        },
      });

      if (!ancestor) break;

      history.push({
        id: ancestor.id,
        title: ancestor.title,
        status: ancestor.status,
        forkReason: ancestor.forkReason,
        forkDepth: ancestor.forkDepth,
        repositoryName: ancestor.repository.fullName,
        createdAt: ancestor.createdAt,
      });

      currentId = ancestor.parentTaskId;
    }

    return {
      data: {
        currentTask: {
          id: task.id,
          title: task.title,
          forkDepth: task.forkDepth,
        },
        ancestors: history,
      },
    };
  });
};
