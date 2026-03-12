/**
 * MCP Tools for AI Assistant
 *
 * These tools allow the AI to interact with AutoSoftware resources:
 * - Repositories: browse, read files, trigger scans
 * - Tasks: list, create, update, retry, cancel
 * - Projects: list, view, stats
 * - Scans: list, view results
 * - Analytics: overview, time saved, contributors
 */

import { prisma } from "../db.js";
import { schedulerService } from "./scheduler.js";
import { listDirectory, readFile } from "./repo-fs.js";
import type { TaskType, TaskPriority, ChatArtifactType } from "@autosoftware/shared";

// ============================================================================
// Artifact Extraction for Task Descriptions
// ============================================================================

const ARTIFACT_REGEX = /```artifact:(\w+):([^\n]+)\n([\s\S]*?)```/g;

interface ExtractedArtifact {
  type: ChatArtifactType;
  name: string;
  content: string;
  language?: string;
}

function extractArtifactsFromText(content: string): {
  cleanContent: string;
  artifacts: ExtractedArtifact[]
} {
  const artifacts: ExtractedArtifact[] = [];
  let cleanContent = content;

  // Reset regex state
  ARTIFACT_REGEX.lastIndex = 0;

  let match;
  while ((match = ARTIFACT_REGEX.exec(content)) !== null) {
    const [fullMatch, type, name, artifactContent] = match;

    if (["html", "react", "svg", "code", "markdown", "mermaid", "json"].includes(type)) {
      artifacts.push({
        type: type as ChatArtifactType,
        name: name.trim(),
        content: artifactContent.trim(),
        language: type === "code" ? inferLanguage(name) : undefined,
      });
    }

    cleanContent = cleanContent.replace(fullMatch, `[Artifact: ${name.trim()}]`);
  }

  return { cleanContent, artifacts };
}

function inferLanguage(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    kt: "kotlin", swift: "swift", cs: "csharp", cpp: "cpp", c: "c",
    php: "php", sql: "sql", sh: "bash", yaml: "yaml", yml: "yaml",
    json: "json", xml: "xml", html: "html", css: "css", scss: "scss",
    md: "markdown",
  };
  return ext ? langMap[ext] : undefined;
}

// Conversation artifact store - tracks artifacts generated during a conversation
// Key: conversationId, Value: array of pending artifacts
const conversationArtifactStore = new Map<string, ExtractedArtifact[]>();

export function addPendingArtifact(conversationId: string, artifact: ExtractedArtifact) {
  const existing = conversationArtifactStore.get(conversationId) || [];
  existing.push(artifact);
  conversationArtifactStore.set(conversationId, existing);
}

export function getPendingArtifacts(conversationId: string): ExtractedArtifact[] {
  return conversationArtifactStore.get(conversationId) || [];
}

export function clearPendingArtifacts(conversationId: string) {
  conversationArtifactStore.delete(conversationId);
}

// Store to track current conversation context per user
const userConversationContext = new Map<string, string>();

export function setUserConversationContext(userId: string, conversationId: string) {
  userConversationContext.set(userId, conversationId);
}

export function getUserConversationContext(userId: string): string | undefined {
  return userConversationContext.get(userId);
}

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  error?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type ToolHandler<TInput, TOutput> = (
  input: TInput,
  userId: string
) => Promise<ToolResult<TOutput>>;

// ============================================================================
// Tool Definitions
// ============================================================================

export const MCP_TOOLS = {
  // Repository tools
  list_repositories: {
    description: "List all repositories connected by the user",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["idle", "scanning", "error"],
          description: "Filter by repository status",
        },
        limit: { type: "number", description: "Max results to return" },
      },
    },
  },
  get_repository: {
    description: "Get details about a specific repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID" },
      },
      required: ["repositoryId"],
    },
  },
  get_repository_tree: {
    description: "List files and directories in a repository path",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID" },
        path: {
          type: "string",
          description: "Directory path (empty for root)",
        },
      },
      required: ["repositoryId"],
    },
  },
  get_file_content: {
    description: "Read the content of a file in a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID" },
        path: { type: "string", description: "File path" },
      },
      required: ["repositoryId", "path"],
    },
  },
  trigger_scan: {
    description: "Trigger a new scan for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID" },
        branch: {
          type: "string",
          description: "Branch to scan (defaults to repo default)",
        },
      },
      required: ["repositoryId"],
    },
  },

  // Task tools
  list_tasks: {
    description: "List tasks with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Filter by repository" },
        projectId: { type: "string", description: "Filter by project" },
        status: {
          type: "string",
          enum: [
            "planning",
            "awaiting_input",
            "planned",
            "pending",
            "in_progress",
            "completed",
            "failed",
            "cancelled",
          ],
          description: "Filter by status",
        },
        type: {
          type: "string",
          enum: ["improvement", "bugfix", "feature", "refactor", "security"],
          description: "Filter by task type",
        },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  get_task: {
    description: "Get detailed information about a specific task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
      },
      required: ["taskId"],
    },
  },
  create_task: {
    description: "Create a new task for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID" },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        type: {
          type: "string",
          enum: ["improvement", "bugfix", "feature", "refactor", "security"],
          description: "Task type",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Task priority",
        },
        projectId: {
          type: "string",
          description: "Optional project to assign task to",
        },
        skipPlanning: {
          type: "boolean",
          description: "Skip planning phase and execute immediately",
        },
      },
      required: ["repositoryId", "title", "description", "type", "priority"],
    },
  },
  update_task: {
    description: "Update a task's details",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "New priority",
        },
      },
      required: ["taskId"],
    },
  },
  retry_task: {
    description: "Retry a failed or cancelled task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
      },
      required: ["taskId"],
    },
  },
  cancel_task: {
    description: "Cancel an active task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
      },
      required: ["taskId"],
    },
  },

  // Project tools
  list_projects: {
    description: "List all projects for the user",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results" },
      },
    },
  },
  get_project: {
    description: "Get detailed information about a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
      },
      required: ["projectId"],
    },
  },
  get_project_stats: {
    description: "Get statistics for a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID" },
      },
      required: ["projectId"],
    },
  },

  // Scan tools
  list_scans: {
    description: "List recent scans",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Filter by repository" },
        status: {
          type: "string",
          enum: ["queued", "in_progress", "completed", "failed", "cancelled"],
          description: "Filter by status",
        },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  get_scan: {
    description: "Get detailed information about a scan",
    inputSchema: {
      type: "object",
      properties: {
        scanId: { type: "string", description: "Scan ID" },
      },
      required: ["scanId"],
    },
  },
  get_scan_results: {
    description: "Get analysis results from a completed scan",
    inputSchema: {
      type: "object",
      properties: {
        scanId: { type: "string", description: "Scan ID" },
      },
      required: ["scanId"],
    },
  },

  // Analytics tools
  get_analytics_overview: {
    description: "Get an overview of key metrics: tasks, hours saved, costs, ROI",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date (ISO format)" },
        endDate: { type: "string", description: "End date (ISO format)" },
        projectId: { type: "string", description: "Filter by project" },
      },
    },
  },
  get_time_saved: {
    description: "Get engineering time saved breakdown",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date (ISO format)" },
        endDate: { type: "string", description: "End date (ISO format)" },
        groupBy: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Grouping period",
        },
      },
    },
  },
  get_contributors: {
    description: "Get top contributors ranked by activity",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
} as const;

export type ToolName = keyof typeof MCP_TOOLS;

// ============================================================================
// Tool Handlers
// ============================================================================

const handlers: Record<ToolName, ToolHandler<any, any>> = {
  // ── Repository Tools ────────────────────────────────────────────────────

  async list_repositories(input: { status?: string; limit?: number }, userId: string) {
    const start = Date.now();
    try {
      const where: any = { userId };
      if (input.status) where.status = input.status;

      const repos = await prisma.repository.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: input.limit || 50,
        select: {
          id: true,
          fullName: true,
          provider: true,
          defaultBranch: true,
          status: true,
          lastScannedAt: true,
          isActive: true,
        },
      });

      return { success: true, data: repos };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_repository(input: { repositoryId: string }, userId: string) {
    try {
      const repo = await prisma.repository.findFirst({
        where: { id: input.repositoryId, userId },
        include: {
          _count: {
            select: { tasks: true, scanResults: true },
          },
        },
      });

      if (!repo) {
        return { success: false, error: "Repository not found" };
      }

      return {
        success: true,
        data: {
          ...repo,
          taskCount: repo._count.tasks,
          scanCount: repo._count.scanResults,
          _count: undefined,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_repository_tree(
    input: { repositoryId: string; path?: string },
    userId: string
  ) {
    try {
      const repo = await prisma.repository.findFirst({
        where: { id: input.repositoryId, userId },
      });
      if (!repo) {
        return { success: false, error: "Repository not found" };
      }

      const entries = await listDirectory(repo.id, input.path || "");
      return { success: true, data: entries };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return {
          success: false,
          error: "Repository not cloned. Trigger a scan first.",
        };
      }
      return { success: false, error: err.message };
    }
  },

  async get_file_content(
    input: { repositoryId: string; path: string },
    userId: string
  ) {
    try {
      const repo = await prisma.repository.findFirst({
        where: { id: input.repositoryId, userId },
      });
      if (!repo) {
        return { success: false, error: "Repository not found" };
      }

      const result = await readFile(repo.id, input.path);
      return { success: true, data: result };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return { success: false, error: "File not found" };
      }
      return { success: false, error: err.message };
    }
  },

  async trigger_scan(
    input: { repositoryId: string; branch?: string },
    userId: string
  ) {
    try {
      const repo = await prisma.repository.findFirst({
        where: { id: input.repositoryId, userId },
      });
      if (!repo) {
        return { success: false, error: "Repository not found" };
      }

      const scan = await schedulerService.triggerScan(
        repo.id,
        undefined,
        input.branch
      );
      return {
        success: true,
        data: {
          message: "Scan queued successfully",
          scanId: scan.id,
          branch: scan.branch,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ── Task Tools ──────────────────────────────────────────────────────────

  async list_tasks(
    input: {
      repositoryId?: string;
      projectId?: string;
      status?: string;
      type?: string;
      limit?: number;
    },
    userId: string
  ) {
    try {
      const where: any = { userId };
      if (input.repositoryId) where.repositoryId = input.repositoryId;
      if (input.projectId) where.projectId = input.projectId;
      if (input.status) where.status = input.status;
      if (input.type) where.type = input.type;

      const tasks = await prisma.task.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: input.limit || 20,
        select: {
          id: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          source: true,
          pullRequestUrl: true,
          createdAt: true,
          updatedAt: true,
          repository: { select: { fullName: true } },
        },
      });

      return {
        success: true,
        data: tasks.map((t) => ({
          ...t,
          repositoryName: t.repository.fullName,
          repository: undefined,
        })),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_task(input: { taskId: string }, userId: string) {
    try {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId },
        include: {
          repository: { select: { fullName: true } },
          planningQuestions: {
            orderBy: [{ round: "desc" }, { sortOrder: "asc" }],
          },
          logs: {
            orderBy: { createdAt: "asc" },
            take: 50,
          },
          steps: {
            orderBy: { order: "asc" },
          },
        },
      });

      if (!task) {
        return { success: false, error: "Task not found" };
      }

      return {
        success: true,
        data: {
          ...task,
          repositoryName: task.repository.fullName,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async create_task(
    input: {
      repositoryId: string;
      title: string;
      description: string;
      type: TaskType;
      priority: TaskPriority;
      projectId?: string;
      skipPlanning?: boolean;
      attachArtifacts?: boolean; // If true, attach pending conversation artifacts
    },
    userId: string
  ) {
    try {
      const repo = await prisma.repository.findFirst({
        where: { id: input.repositoryId, userId },
      });
      if (!repo) {
        return { success: false, error: "Repository not found" };
      }

      // Extract any artifacts embedded in the description
      const { cleanContent: cleanDescription, artifacts: embeddedArtifacts } =
        extractArtifactsFromText(input.description);

      // Get any pending artifacts from the conversation
      const conversationId = getUserConversationContext(userId);
      const pendingArtifacts = conversationId
        ? getPendingArtifacts(conversationId)
        : [];

      // Combine embedded and pending artifacts (deduplicate by name)
      const allArtifacts = [...embeddedArtifacts];
      for (const pending of pendingArtifacts) {
        if (!allArtifacts.find((a) => a.name === pending.name)) {
          allArtifacts.push(pending);
        }
      }

      const task = await prisma.task.create({
        data: {
          repositoryId: input.repositoryId,
          userId,
          title: input.title,
          description: cleanDescription,
          type: input.type,
          priority: input.priority,
          source: "ai_assistant",
          status: input.skipPlanning ? "pending" : "planning",
          projectId: input.projectId || null,
        },
      });

      // Save artifacts and link them to the task
      const savedArtifacts: Array<{ id: string; name: string; type: string }> = [];
      for (const artifact of allArtifacts) {
        try {
          const saved = await prisma.chatArtifact.create({
            data: {
              messageId: "mcp-tool-generated", // Special marker for MCP-generated artifacts
              type: artifact.type,
              name: artifact.name,
              content: artifact.content,
              language: artifact.language,
              taskId: task.id,
            },
          });
          savedArtifacts.push({ id: saved.id, name: saved.name, type: saved.type });
        } catch (err) {
          console.error("Failed to save artifact:", artifact.name, err);
        }
      }

      // Clear pending artifacts after use
      if (conversationId && input.attachArtifacts !== false) {
        clearPendingArtifacts(conversationId);
      }

      if (input.skipPlanning) {
        await schedulerService.queueTaskExecution(task.id);
      } else {
        await schedulerService.queueTaskPlanning(task.id);
      }

      return {
        success: true,
        data: {
          message: input.skipPlanning
            ? "Task created and queued for execution"
            : "Task created and queued for planning",
          taskId: task.id,
          status: task.status,
          artifacts: savedArtifacts.length > 0 ? savedArtifacts : undefined,
          artifactCount: savedArtifacts.length,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async update_task(
    input: {
      taskId: string;
      title?: string;
      description?: string;
      priority?: TaskPriority;
    },
    userId: string
  ) {
    try {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId },
      });
      if (!task) {
        return { success: false, error: "Task not found" };
      }

      const data: any = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.priority !== undefined) data.priority = input.priority;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data,
      });

      return { success: true, data: { message: "Task updated", task: updated } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async retry_task(input: { taskId: string }, userId: string) {
    try {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId },
      });
      if (!task) {
        return { success: false, error: "Task not found" };
      }

      if (!["failed", "cancelled"].includes(task.status)) {
        return {
          success: false,
          error: "Only failed or cancelled tasks can be retried",
        };
      }

      await prisma.taskLog.deleteMany({ where: { taskId: task.id } });

      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: "planning",
          planningRound: 0,
          enhancedPlan: null,
          affectedFiles: "[]",
          pullRequestUrl: null,
          pullRequestStatus: null,
          completedAt: null,
          metadata: {},
        },
      });

      await schedulerService.queueTaskPlanning(task.id);

      return { success: true, data: { message: "Task queued for retry" } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async cancel_task(input: { taskId: string }, userId: string) {
    try {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, userId },
      });
      if (!task) {
        return { success: false, error: "Task not found" };
      }

      if (
        !["pending", "planning", "in_progress", "awaiting_input", "planned"].includes(
          task.status
        )
      ) {
        return { success: false, error: "Only active tasks can be cancelled" };
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { status: "cancelled" },
      });

      return { success: true, data: { message: "Task cancelled" } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ── Project Tools ───────────────────────────────────────────────────────

  async list_projects(input: { limit?: number }, userId: string) {
    try {
      const projects = await prisma.project.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: input.limit || 50,
        include: {
          _count: {
            select: { repositories: true, tasks: true },
          },
        },
      });

      return {
        success: true,
        data: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          repoCount: p._count.repositories,
          taskCount: p._count.tasks,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_project(input: { projectId: string }, userId: string) {
    try {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId },
        include: {
          repositories: {
            include: {
              repository: {
                select: {
                  id: true,
                  fullName: true,
                  provider: true,
                  status: true,
                },
              },
            },
          },
          documents: { orderBy: { sortOrder: "asc" } },
          _count: { select: { tasks: true } },
        },
      });

      if (!project) {
        return { success: false, error: "Project not found" };
      }

      return {
        success: true,
        data: {
          ...project,
          repos: project.repositories.map((r) => ({
            ...r.repository,
            branchOverride: r.branchOverride,
          })),
          taskCount: project._count.tasks,
          repositories: undefined,
          _count: undefined,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_project_stats(input: { projectId: string }, userId: string) {
    try {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId },
        include: { repositories: { select: { repositoryId: true } } },
      });

      if (!project) {
        return { success: false, error: "Project not found" };
      }

      const repoIds = project.repositories.map((r) => r.repositoryId);

      if (repoIds.length === 0) {
        return {
          success: true,
          data: {
            tasksByStatus: [],
            tasksByType: [],
            totalTasks: 0,
            completedTasks: 0,
          },
        };
      }

      const [tasksByStatus, tasksByType] = await Promise.all([
        prisma.task.groupBy({
          by: ["status"],
          where: { repositoryId: { in: repoIds } },
          _count: { id: true },
        }),
        prisma.task.groupBy({
          by: ["type"],
          where: { repositoryId: { in: repoIds } },
          _count: { id: true },
        }),
      ]);

      const totalTasks = tasksByStatus.reduce((s, g) => s + g._count.id, 0);
      const completedTasks =
        tasksByStatus.find((g) => g.status === "completed")?._count.id || 0;

      return {
        success: true,
        data: {
          tasksByStatus: tasksByStatus.map((g) => ({
            status: g.status,
            count: g._count.id,
          })),
          tasksByType: tasksByType.map((g) => ({
            type: g.type,
            count: g._count.id,
          })),
          totalTasks,
          completedTasks,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ── Scan Tools ──────────────────────────────────────────────────────────

  async list_scans(
    input: { repositoryId?: string; status?: string; limit?: number },
    userId: string
  ) {
    try {
      const where: any = { repository: { userId } };
      if (input.repositoryId) where.repositoryId = input.repositoryId;
      if (input.status) where.status = input.status;

      const scans = await prisma.scanResult.findMany({
        where,
        orderBy: { scannedAt: "desc" },
        take: input.limit || 20,
        select: {
          id: true,
          branch: true,
          status: true,
          source: true,
          summary: true,
          tasksCreated: true,
          scannedAt: true,
          startedAt: true,
          completedAt: true,
          repository: { select: { fullName: true } },
        },
      });

      return {
        success: true,
        data: scans.map((s) => ({
          ...s,
          repositoryName: s.repository.fullName,
          repository: undefined,
        })),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_scan(input: { scanId: string }, userId: string) {
    try {
      const scan = await prisma.scanResult.findUnique({
        where: { id: input.scanId },
        include: {
          repository: { select: { userId: true, fullName: true } },
          tasks: {
            select: { id: true, title: true, type: true, status: true },
          },
          logs: { orderBy: { createdAt: "asc" }, take: 100 },
        },
      });

      if (!scan || scan.repository.userId !== userId) {
        return { success: false, error: "Scan not found" };
      }

      return {
        success: true,
        data: {
          ...scan,
          repositoryName: scan.repository.fullName,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_scan_results(input: { scanId: string }, userId: string) {
    try {
      const scan = await prisma.scanResult.findUnique({
        where: { id: input.scanId },
        include: {
          repository: { select: { userId: true } },
          codeAnalysis: true,
        },
      });

      if (!scan || scan.repository.userId !== userId) {
        return { success: false, error: "Scan not found" };
      }

      if (scan.status !== "completed") {
        return { success: false, error: "Scan is not completed" };
      }

      return {
        success: true,
        data: {
          summary: scan.summary,
          tasksCreated: scan.tasksCreated,
          analysisData: scan.analysisData,
          codeAnalysis: scan.codeAnalysis,
          primaryLanguage: scan.primaryLanguage,
          languageProfile: scan.languageProfile,
          usage: {
            inputTokens: scan.inputTokens,
            outputTokens: scan.outputTokens,
            estimatedCostUsd: scan.estimatedCostUsd,
          },
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ── Analytics Tools ─────────────────────────────────────────────────────

  async get_analytics_overview(
    input: { startDate?: string; endDate?: string; projectId?: string },
    userId: string
  ) {
    try {
      const dateFilter: any = {};
      if (input.startDate)
        dateFilter.createdAt = { gte: new Date(input.startDate) };
      if (input.endDate)
        dateFilter.createdAt = {
          ...dateFilter.createdAt,
          lte: new Date(input.endDate),
        };

      const projectFilter = input.projectId ? { projectId: input.projectId } : {};

      const [totalTasks, completedTasks, timeSaved, usageRecords] =
        await Promise.all([
          prisma.task.count({
            where: { userId, ...dateFilter, ...projectFilter },
          }),
          prisma.task.count({
            where: {
              userId,
              status: "completed",
              ...dateFilter,
              ...projectFilter,
            },
          }),
          prisma.engineeringTimeSaved.aggregate({
            where: { userId, ...dateFilter, ...projectFilter },
            _sum: { estimatedMinutesSaved: true },
          }),
          prisma.usageRecord.aggregate({
            where: { userId, ...dateFilter },
            _sum: { estimatedCostUsd: true },
          }),
        ]);

      const hoursSaved = Math.round(
        (timeSaved._sum.estimatedMinutesSaved || 0) / 60
      );
      const totalCost = usageRecords._sum.estimatedCostUsd || 0;
      const successRate =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const roi = totalCost > 0 ? Math.round((hoursSaved * 75) / totalCost) : 0;

      return {
        success: true,
        data: {
          totalTasks,
          completedTasks,
          hoursSaved,
          totalCost: Math.round(totalCost * 100) / 100,
          successRate,
          roi,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_time_saved(
    input: { startDate?: string; endDate?: string; groupBy?: string },
    userId: string
  ) {
    try {
      const dateFilter: any = {};
      if (input.startDate)
        dateFilter.createdAt = { gte: new Date(input.startDate) };
      if (input.endDate)
        dateFilter.createdAt = {
          ...dateFilter.createdAt,
          lte: new Date(input.endDate),
        };

      const records = await prisma.engineeringTimeSaved.findMany({
        where: { userId, ...dateFilter },
        orderBy: { createdAt: "asc" },
      });

      const totalMinutes = records.reduce(
        (sum, r) => sum + r.estimatedMinutesSaved,
        0
      );

      // Group by day/week/month
      const groupBy = input.groupBy || "day";
      const grouped = new Map<string, number>();

      for (const r of records) {
        const date = r.createdAt;
        let key: string;

        if (groupBy === "week") {
          const d = new Date(date);
          d.setDate(d.getDate() - d.getDay());
          key = d.toISOString().split("T")[0];
        } else if (groupBy === "month") {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        } else {
          key = date.toISOString().split("T")[0];
        }

        grouped.set(key, (grouped.get(key) || 0) + r.estimatedMinutesSaved);
      }

      return {
        success: true,
        data: {
          totalHours: Math.round(totalMinutes / 60),
          totalMinutes,
          taskCount: records.length,
          timeline: Array.from(grouped.entries()).map(([date, minutes]) => ({
            date,
            minutes,
            hours: Math.round((minutes / 60) * 10) / 10,
          })),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async get_contributors(input: { limit?: number }, userId: string) {
    try {
      // For single-user mode, return the current user's stats
      const [taskCount, timeSaved, codeChanges] = await Promise.all([
        prisma.task.count({ where: { userId, status: "completed" } }),
        prisma.engineeringTimeSaved.aggregate({
          where: { userId },
          _sum: { estimatedMinutesSaved: true },
        }),
        prisma.codeChangeMetrics.aggregate({
          where: { userId },
          _sum: { linesAdded: true, linesDeleted: true },
        }),
      ]);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true },
      });

      return {
        success: true,
        data: [
          {
            rank: 1,
            userId,
            userName: user?.name || "You",
            userAvatar: user?.avatarUrl,
            taskCount,
            hoursSaved: Math.round(
              (timeSaved._sum.estimatedMinutesSaved || 0) / 60
            ),
            linesChanged:
              (codeChanges._sum.linesAdded || 0) +
              (codeChanges._sum.linesDeleted || 0),
          },
        ],
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

// ============================================================================
// Executor
// ============================================================================

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<ToolCall> {
  const id = crypto.randomUUID();
  const start = Date.now();

  const handler = handlers[name as ToolName];
  if (!handler) {
    return {
      id,
      name,
      input,
      output: null,
      duration: Date.now() - start,
      error: `Unknown tool: ${name}`,
    };
  }

  const result = await handler(input, userId);

  return {
    id,
    name,
    input,
    output: result.success ? result.data : null,
    duration: Date.now() - start,
    error: result.success ? undefined : result.error,
  };
}

/**
 * Get tool definitions formatted for Claude Agent SDK
 */
export function getToolDefinitions() {
  return Object.entries(MCP_TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}
