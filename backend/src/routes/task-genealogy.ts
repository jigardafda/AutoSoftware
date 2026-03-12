import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";

// Genealogy node representing a scan, task, or subtask
export interface GenealogyNode {
  id: string;
  type: "scan" | "task";
  title: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  metadata: {
    // Scan-specific
    repositoryName?: string;
    branch?: string;
    tasksCreated?: number;
    // Task-specific
    taskType?: string;
    priority?: string;
    forkReason?: string;
    forkDepth?: number;
    parentTaskId?: string;
    scanResultId?: string;
    pullRequestUrl?: string;
    selectedApproach?: number | null;
    source?: string;
  };
  children: GenealogyNode[];
}

export interface GenealogyTreeResponse {
  roots: GenealogyNode[];
  stats: {
    totalScans: number;
    totalTasks: number;
    totalSubtasks: number;
    maxDepth: number;
  };
}

export const taskGenealogyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // Get full genealogy tree showing scans -> tasks -> subtasks
  app.get<{
    Querystring: {
      repositoryId?: string;
      projectId?: string;
      scanId?: string;
      taskId?: string;
      includeCompleted?: string;
      maxDepth?: string;
      limit?: string;
    };
  }>("/genealogy", async (request, reply) => {
    const {
      repositoryId,
      projectId,
      scanId,
      taskId,
      includeCompleted = "true",
      maxDepth = "10",
      limit = "50",
    } = request.query;

    const includeCompletedBool = includeCompleted === "true";
    const maxDepthNum = Math.min(parseInt(maxDepth, 10) || 10, 20);
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);

    // Build status filter
    const statusFilter = includeCompletedBool
      ? undefined
      : { notIn: ["completed", "cancelled"] as const };

    // If taskId is provided, get the lineage for that specific task
    if (taskId) {
      const lineage = await getTaskLineage(request.userId, taskId, maxDepthNum);
      if (!lineage) {
        return reply.code(404).send({ error: { message: "Task not found" } });
      }
      return { data: lineage };
    }

    // If scanId is provided, get the tree for that specific scan
    if (scanId) {
      const scanTree = await getScanTree(request.userId, scanId, maxDepthNum);
      if (!scanTree) {
        return reply.code(404).send({ error: { message: "Scan not found" } });
      }
      return { data: { roots: [scanTree], stats: calculateStats([scanTree]) } };
    }

    // Get scans as root nodes
    const scansWhere: any = {
      repository: { userId: request.userId },
    };
    if (repositoryId) scansWhere.repositoryId = repositoryId;
    if (projectId) {
      // Get repository IDs for this project
      const projectRepos = await prisma.projectRepository.findMany({
        where: { projectId },
        select: { repositoryId: true },
      });
      scansWhere.repositoryId = { in: projectRepos.map((pr) => pr.repositoryId) };
    }

    const scans = await prisma.scanResult.findMany({
      where: scansWhere,
      include: {
        repository: { select: { fullName: true } },
        tasks: {
          where: {
            parentTaskId: null, // Only root tasks (not forks)
            ...(statusFilter && { status: statusFilter }),
          },
          include: {
            childForks: {
              select: { id: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { scannedAt: "desc" },
      take: limitNum,
    });

    // Also get manual tasks (tasks without scanResultId) as separate roots
    const manualTasksWhere: any = {
      userId: request.userId,
      scanResultId: null,
      parentTaskId: null, // Only root tasks
      ...(statusFilter && { status: statusFilter }),
    };
    if (repositoryId) manualTasksWhere.repositoryId = repositoryId;
    if (projectId) manualTasksWhere.projectId = projectId;

    const manualTasks = await prisma.task.findMany({
      where: manualTasksWhere,
      include: {
        repository: { select: { fullName: true } },
        childForks: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limitNum,
    });

    // Build the tree structure
    const roots: GenealogyNode[] = [];

    // Add scans as root nodes with their tasks as children
    for (const scan of scans) {
      const scanNode = await buildScanNode(scan, request.userId, maxDepthNum);
      roots.push(scanNode);
    }

    // Add manual tasks as root nodes
    for (const task of manualTasks) {
      const taskNode = await buildTaskNode(task, request.userId, maxDepthNum, 0);
      roots.push(taskNode);
    }

    // Sort roots by creation date (most recent first)
    roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const stats = calculateStats(roots);

    return { data: { roots, stats } };
  });

  // Get ancestors (lineage) for a specific task
  app.get<{ Params: { taskId: string } }>(
    "/genealogy/tasks/:taskId/ancestors",
    async (request, reply) => {
      const { taskId } = request.params;

      const task = await prisma.task.findFirst({
        where: { id: taskId, userId: request.userId },
        include: {
          repository: { select: { fullName: true } },
          scanResult: {
            include: {
              repository: { select: { fullName: true } },
            },
          },
        },
      });

      if (!task) {
        return reply.code(404).send({ error: { message: "Task not found" } });
      }

      // Build ancestor chain
      const ancestors: any[] = [];
      let currentId: string | null = task.parentTaskId;

      while (currentId) {
        const ancestor = await prisma.task.findUnique({
          where: { id: currentId },
          include: {
            repository: { select: { fullName: true } },
          },
        });

        if (!ancestor) break;

        ancestors.push({
          id: ancestor.id,
          type: "task",
          title: ancestor.title,
          status: ancestor.status,
          forkReason: ancestor.forkReason,
          forkDepth: ancestor.forkDepth,
          repositoryName: ancestor.repository.fullName,
          createdAt: ancestor.createdAt.toISOString(),
        });

        currentId = ancestor.parentTaskId;
      }

      // Add scan as ultimate ancestor if exists
      if (task.scanResult) {
        ancestors.push({
          id: task.scanResult.id,
          type: "scan",
          title: task.scanResult.summary || "Repository Scan",
          status: task.scanResult.status,
          repositoryName: task.scanResult.repository.fullName,
          branch: task.scanResult.branch,
          tasksCreated: task.scanResult.tasksCreated,
          createdAt: task.scanResult.scannedAt.toISOString(),
        });
      }

      return {
        data: {
          currentTask: {
            id: task.id,
            title: task.title,
            status: task.status,
            forkDepth: task.forkDepth,
          },
          ancestors: ancestors.reverse(), // Root first
          depth: ancestors.length,
        },
      };
    }
  );

  // Get descendants for a specific task (all forks and sub-forks)
  app.get<{ Params: { taskId: string }; Querystring: { maxDepth?: string } }>(
    "/genealogy/tasks/:taskId/descendants",
    async (request, reply) => {
      const { taskId } = request.params;
      const maxDepth = Math.min(parseInt(request.query.maxDepth || "10", 10), 20);

      const task = await prisma.task.findFirst({
        where: { id: taskId, userId: request.userId },
        include: {
          repository: { select: { fullName: true } },
        },
      });

      if (!task) {
        return reply.code(404).send({ error: { message: "Task not found" } });
      }

      const descendants = await buildDescendantTree(task, request.userId, maxDepth, 0);

      return {
        data: {
          rootTask: {
            id: task.id,
            title: task.title,
            status: task.status,
            forkDepth: task.forkDepth,
          },
          descendants: descendants.children,
          totalDescendants: countDescendants(descendants),
        },
      };
    }
  );

  // Get spawn relationships - who spawned what
  app.get<{
    Querystring: {
      repositoryId?: string;
      projectId?: string;
      groupBy?: "scan" | "task" | "day";
    };
  }>("/genealogy/spawn-map", async (request, reply) => {
    const { repositoryId, projectId, groupBy = "scan" } = request.query;

    const where: any = { userId: request.userId };
    if (repositoryId) where.repositoryId = repositoryId;
    if (projectId) where.projectId = projectId;

    // Get all tasks with their spawn relationships
    const tasks = await prisma.task.findMany({
      where,
      include: {
        repository: { select: { fullName: true } },
        scanResult: { select: { id: true, summary: true, scannedAt: true } },
        parentTask: { select: { id: true, title: true } },
        childForks: {
          select: { id: true, title: true, forkReason: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by the specified dimension
    const groups: Record<string, any> = {};

    for (const task of tasks) {
      let groupKey: string;
      let groupLabel: string;

      if (groupBy === "scan") {
        groupKey = task.scanResultId || "manual";
        groupLabel = task.scanResult?.summary || "Manual Tasks";
      } else if (groupBy === "day") {
        const date = task.createdAt.toISOString().split("T")[0];
        groupKey = date;
        groupLabel = date;
      } else {
        // Group by parent task
        groupKey = task.parentTaskId || task.id;
        groupLabel = task.parentTask?.title || task.title;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          label: groupLabel,
          tasks: [],
          totalForks: 0,
          spawnedFrom: task.scanResultId ? "scan" : task.parentTaskId ? "task" : "manual",
        };
      }

      groups[groupKey].tasks.push({
        id: task.id,
        title: task.title,
        status: task.status,
        type: task.type,
        forkCount: task.childForks.length,
        spawnedFrom: task.scanResultId ? "scan" : task.parentTaskId ? "fork" : "manual",
        parentId: task.parentTaskId || task.scanResultId || null,
      });
      groups[groupKey].totalForks += task.childForks.length;
    }

    return {
      data: {
        groups: Object.values(groups),
        summary: {
          totalGroups: Object.keys(groups).length,
          totalTasks: tasks.length,
          totalForks: tasks.reduce((sum, t) => sum + t.childForks.length, 0),
        },
      },
    };
  });

  // Filter tasks by lineage - get all tasks in a specific lineage path
  app.get<{
    Querystring: {
      ancestorId: string;
      includeAncestor?: string;
      status?: string;
    };
  }>("/genealogy/filter-by-lineage", async (request, reply) => {
    const { ancestorId, includeAncestor = "true", status } = request.query;

    if (!ancestorId) {
      return reply.code(400).send({ error: { message: "ancestorId is required" } });
    }

    // Check if ancestorId is a scan or task
    const scan = await prisma.scanResult.findFirst({
      where: {
        id: ancestorId,
        repository: { userId: request.userId },
      },
    });

    const statusFilter = status ? status.split(",") : undefined;

    if (scan) {
      // Get all tasks spawned from this scan
      const tasks = await prisma.task.findMany({
        where: {
          scanResultId: scan.id,
          userId: request.userId,
          ...(statusFilter && { status: { in: statusFilter } }),
        },
        include: {
          repository: { select: { fullName: true } },
          childForks: { select: { id: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      // Also get all descendants of these tasks
      const allTaskIds = new Set(tasks.map((t) => t.id));
      const descendants = await getAllDescendants(
        tasks.map((t) => t.id),
        request.userId,
        statusFilter
      );

      return {
        data: {
          ancestorType: "scan",
          ancestor: {
            id: scan.id,
            type: "scan",
            status: scan.status,
            summary: scan.summary,
            createdAt: scan.scannedAt.toISOString(),
          },
          tasks: [
            ...tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              type: t.type,
              priority: t.priority,
              forkDepth: t.forkDepth,
              forkCount: t.childForks.length,
              repositoryName: t.repository.fullName,
              createdAt: t.createdAt.toISOString(),
            })),
            ...descendants,
          ],
          totalCount: tasks.length + descendants.length,
        },
      };
    }

    // Check if it's a task
    const task = await prisma.task.findFirst({
      where: { id: ancestorId, userId: request.userId },
      include: {
        repository: { select: { fullName: true } },
      },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Ancestor not found" } });
    }

    // Get all descendants of this task
    const descendants = await getAllDescendants([task.id], request.userId, statusFilter);

    const result = includeAncestor === "true"
      ? [
          {
            id: task.id,
            title: task.title,
            status: task.status,
            type: task.type,
            priority: task.priority,
            forkDepth: task.forkDepth,
            repositoryName: task.repository.fullName,
            createdAt: task.createdAt.toISOString(),
          },
          ...descendants,
        ]
      : descendants;

    return {
      data: {
        ancestorType: "task",
        ancestor: {
          id: task.id,
          type: "task",
          title: task.title,
          status: task.status,
          createdAt: task.createdAt.toISOString(),
        },
        tasks: result,
        totalCount: result.length,
      },
    };
  });
};

// Helper function to build a scan node with its task children
async function buildScanNode(
  scan: any,
  userId: string,
  maxDepth: number
): Promise<GenealogyNode> {
  const children: GenealogyNode[] = [];

  for (const task of scan.tasks || []) {
    const taskNode = await buildTaskNode(task, userId, maxDepth, 1);
    children.push(taskNode);
  }

  return {
    id: scan.id,
    type: "scan",
    title: scan.summary || "Repository Scan",
    status: scan.status,
    createdAt: scan.scannedAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() || null,
    metadata: {
      repositoryName: scan.repository.fullName,
      branch: scan.branch,
      tasksCreated: scan.tasksCreated,
    },
    children,
  };
}

// Helper function to build a task node with its fork children
async function buildTaskNode(
  task: any,
  userId: string,
  maxDepth: number,
  currentDepth: number
): Promise<GenealogyNode> {
  const children: GenealogyNode[] = [];

  if (currentDepth < maxDepth && task.childForks?.length > 0) {
    // Fetch full child fork data
    const childForks = await prisma.task.findMany({
      where: {
        parentTaskId: task.id,
        userId,
      },
      include: {
        repository: { select: { fullName: true } },
        childForks: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const childFork of childForks) {
      const childNode = await buildTaskNode(childFork, userId, maxDepth, currentDepth + 1);
      children.push(childNode);
    }
  }

  return {
    id: task.id,
    type: "task",
    title: task.title,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() || null,
    metadata: {
      repositoryName: task.repository?.fullName,
      taskType: task.type,
      priority: task.priority,
      forkReason: task.forkReason,
      forkDepth: task.forkDepth,
      parentTaskId: task.parentTaskId,
      scanResultId: task.scanResultId,
      pullRequestUrl: task.pullRequestUrl,
      selectedApproach: task.selectedApproach,
      source: task.source,
    },
    children,
  };
}

// Helper function to build descendant tree
async function buildDescendantTree(
  task: any,
  userId: string,
  maxDepth: number,
  currentDepth: number
): Promise<GenealogyNode> {
  const children: GenealogyNode[] = [];

  if (currentDepth < maxDepth) {
    const childForks = await prisma.task.findMany({
      where: {
        parentTaskId: task.id,
        userId,
      },
      include: {
        repository: { select: { fullName: true } },
        childForks: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const childFork of childForks) {
      const childNode = await buildDescendantTree(childFork, userId, maxDepth, currentDepth + 1);
      children.push(childNode);
    }
  }

  return {
    id: task.id,
    type: "task",
    title: task.title,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() || null,
    metadata: {
      repositoryName: task.repository?.fullName,
      taskType: task.type,
      priority: task.priority,
      forkReason: task.forkReason,
      forkDepth: task.forkDepth,
      parentTaskId: task.parentTaskId,
      scanResultId: task.scanResultId,
      pullRequestUrl: task.pullRequestUrl,
      selectedApproach: task.selectedApproach,
      source: task.source,
    },
    children,
  };
}

// Helper function to get task lineage
async function getTaskLineage(userId: string, taskId: string, maxDepth: number) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      repository: { select: { fullName: true } },
      scanResult: {
        include: { repository: { select: { fullName: true } } },
      },
    },
  });

  if (!task) return null;

  // Build path from root to this task
  const path: any[] = [];
  let currentTask: any = task;

  // Go up the tree to find the root
  while (currentTask.parentTaskId) {
    const parent = await prisma.task.findUnique({
      where: { id: currentTask.parentTaskId },
      include: { repository: { select: { fullName: true } } },
    });
    if (!parent) break;
    path.unshift({
      id: parent.id,
      type: "task",
      title: parent.title,
      status: parent.status,
      forkDepth: parent.forkDepth,
    });
    currentTask = parent;
  }

  // Add scan as root if exists
  if (task.scanResult) {
    path.unshift({
      id: task.scanResult.id,
      type: "scan",
      title: task.scanResult.summary || "Repository Scan",
      status: task.scanResult.status,
      repositoryName: task.scanResult.repository.fullName,
    });
  }

  // Add current task
  path.push({
    id: task.id,
    type: "task",
    title: task.title,
    status: task.status,
    forkDepth: task.forkDepth,
    isCurrent: true,
  });

  // Get descendants
  const descendantTree = await buildDescendantTree(task, userId, maxDepth, 0);

  return {
    path,
    currentTask: {
      id: task.id,
      title: task.title,
      status: task.status,
      type: task.type,
      priority: task.priority,
      forkDepth: task.forkDepth,
      repositoryName: task.repository.fullName,
    },
    descendants: descendantTree.children,
    depth: path.length,
  };
}

// Helper function to get scan tree
async function getScanTree(userId: string, scanId: string, maxDepth: number) {
  const scan = await prisma.scanResult.findFirst({
    where: {
      id: scanId,
      repository: { userId },
    },
    include: {
      repository: { select: { fullName: true } },
      tasks: {
        where: { parentTaskId: null },
        include: {
          repository: { select: { fullName: true } },
          childForks: { select: { id: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!scan) return null;

  return buildScanNode(scan, userId, maxDepth);
}

// Helper function to get all descendants recursively
async function getAllDescendants(
  parentIds: string[],
  userId: string,
  statusFilter?: string[]
): Promise<any[]> {
  if (parentIds.length === 0) return [];

  const children = await prisma.task.findMany({
    where: {
      parentTaskId: { in: parentIds },
      userId,
      ...(statusFilter && { status: { in: statusFilter } }),
    },
    include: {
      repository: { select: { fullName: true } },
      childForks: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const mapped = children.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    type: t.type,
    priority: t.priority,
    forkDepth: t.forkDepth,
    forkCount: t.childForks.length,
    parentTaskId: t.parentTaskId,
    repositoryName: t.repository.fullName,
    createdAt: t.createdAt.toISOString(),
  }));

  // Recursively get descendants of these children
  const childIds = children.map((c) => c.id);
  const grandchildren = await getAllDescendants(childIds, userId, statusFilter);

  return [...mapped, ...grandchildren];
}

// Helper function to calculate stats
function calculateStats(roots: GenealogyNode[]) {
  let totalScans = 0;
  let totalTasks = 0;
  let totalSubtasks = 0;
  let maxDepth = 0;

  function traverse(node: GenealogyNode, depth: number) {
    if (node.type === "scan") {
      totalScans++;
    } else {
      if (node.metadata.forkDepth && node.metadata.forkDepth > 0) {
        totalSubtasks++;
      } else {
        totalTasks++;
      }
    }
    maxDepth = Math.max(maxDepth, depth);
    for (const child of node.children) {
      traverse(child, depth + 1);
    }
  }

  for (const root of roots) {
    traverse(root, 0);
  }

  return { totalScans, totalTasks, totalSubtasks, maxDepth };
}

// Helper function to count descendants
function countDescendants(node: GenealogyNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}
