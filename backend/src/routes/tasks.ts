import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { schedulerService } from "../services/scheduler.js";
import { zoneTriggerService } from "../services/zone-triggers.js";
import type { CreateTaskInput, UpdateTaskInput, SubmitAnswersInput } from "@autosoftware/shared";
import {
  parseTaskIntent,
  quickParseIntent,
  resolveHistoryReferences,
  type ParsedIntent,
} from "../services/intent-parser.js";
import {
  findSimilarTasks,
  findSimilarResolutions,
  findRelatedIssues,
  searchTasks,
  suggestRelatedTasks,
  getTaskContext,
  type SimilarTask,
} from "../services/task-similarity.js";

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  app.get<{
    Querystring: {
      repositoryId?: string;
      status?: string;
      type?: string;
      priority?: string;
    };
  }>("/", async (request) => {
    const { repositoryId, status, type, priority } = request.query;
    const where: any = { userId: request.userId };
    if (repositoryId) where.repositoryId = repositoryId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (priority) where.priority = priority;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        repository: { select: { fullName: true } },
        steps: {
          orderBy: { order: "asc" },
          select: { id: true, status: true, order: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: tasks.map((t) => ({
        ...t,
        repositoryName: t.repository.fullName,
        repository: undefined,
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const [task, artifacts] = await Promise.all([
      prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        include: {
          repository: { select: { fullName: true } },
          planningQuestions: {
            orderBy: [{ round: "desc" }, { sortOrder: "asc" }],
          },
          logs: {
            orderBy: { createdAt: "asc" },
          },
          steps: {
            orderBy: { order: "asc" },
          },
          scanResult: {
            select: {
              id: true,
              scannedAt: true,
              status: true,
              summary: true,
              tasksCreated: true,
            },
          },
          externalLink: {
            include: {
              integrationLink: {
                include: {
                  integration: { select: { provider: true, displayName: true } },
                },
              },
            },
          },
        },
      }),
      // Fetch artifacts attached to this task
      prisma.chatArtifact.findMany({
        where: { taskId: request.params.id },
        select: {
          id: true,
          type: true,
          name: true,
          content: true,
          language: true,
          previewUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
    return {
      data: {
        ...task,
        repositoryName: task.repository.fullName,
        planningRound: task.planningRound,
        enhancedPlan: task.enhancedPlan,
        planningQuestions: task.planningQuestions,
        approaches: task.approaches,
        selectedApproach: task.selectedApproach,
        logs: task.logs,
        steps: task.steps,
        scanResult: task.scanResult,
        artifacts: artifacts, // Include attached artifacts
      },
    };
  });

  // GET /:id/artifacts - Get artifacts for a task
  app.get<{ Params: { id: string } }>("/:id/artifacts", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
      select: { id: true },
    });

    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    const artifacts = await prisma.chatArtifact.findMany({
      where: { taskId: request.params.id },
      select: {
        id: true,
        type: true,
        name: true,
        content: true,
        language: true,
        previewUrl: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return { data: artifacts };
  });

  // GET /:id/logs - Poll for new task logs (for live streaming)
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/:id/logs",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: { id: true },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const { after } = request.query;
      const logs = await prisma.taskLog.findMany({
        where: {
          taskId: task.id,
          ...(after && {
            createdAt: { gt: new Date(after) },
          }),
        },
        orderBy: { createdAt: "asc" },
      });

      return { data: logs };
    }
  );

  // GET /:id/steps - Get task execution steps with progress
  app.get<{ Params: { id: string } }>(
    "/:id/steps",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: { id: true },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const steps = await prisma.taskStep.findMany({
        where: { taskId: task.id },
        orderBy: { order: "asc" },
      });

      const total = steps.length;
      const completed = steps.filter((s) => s.status === "completed").length;
      const failed = steps.filter((s) => s.status === "failed").length;
      const skipped = steps.filter((s) => s.status === "skipped").length;
      const inProgress = steps.filter((s) => s.status === "in_progress").length;
      const doneCount = completed + failed + skipped;
      const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      const currentStep = steps.find((s) => s.status === "in_progress") || null;

      return {
        data: {
          steps,
          progress: {
            total,
            completed,
            failed,
            skipped,
            inProgress,
            pending: total - doneCount - inProgress,
            percentage,
            currentStep,
          },
        },
      };
    }
  );

  // GET /:id/plan - Get AI transparency execution plan
  app.get<{ Params: { id: string } }>(
    "/:id/plan",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: {
          id: true,
          status: true,
          metadata: true,
          steps: {
            orderBy: { order: "asc" },
          },
        },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      // Get execution plan from metadata if available
      const metadata = task.metadata as Record<string, any> || {};
      const storedPlan = metadata.executionPlan;

      if (!storedPlan && task.steps.length === 0) {
        return { data: { plan: null } };
      }

      // Build plan from steps if stored plan is not available
      const steps = task.steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        status: step.status,
        estimatedSeconds: 60, // Default estimate
        actualSeconds: step.startedAt && step.completedAt
          ? Math.round((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000)
          : undefined,
        confidence: 80, // Default confidence
        startedAt: step.startedAt?.toISOString(),
        completedAt: step.completedAt?.toISOString(),
      }));

      const plan = {
        taskId: task.id,
        overview: storedPlan?.overview || "Executing task...",
        steps,
        totalEstimatedSeconds: storedPlan?.totalEstimatedSeconds || steps.length * 60,
        confidence: storedPlan?.confidence || 80,
        reasoning: storedPlan?.reasoning,
        createdAt: new Date().toISOString(),
      };

      return { data: { plan } };
    }
  );

  // GET /:id/blockers - Get current blockers for a task
  app.get<{ Params: { id: string } }>(
    "/:id/blockers",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: {
          id: true,
          status: true,
          retryCount: true,
          metadata: true,
        },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      // Extract blockers from metadata
      const metadata = task.metadata as Record<string, any> || {};
      const blockers = metadata.blockers || [];
      const currentBlocker = blockers.find((b: any) => !b.resolvedAt) || null;

      return {
        data: {
          hasBlocker: !!currentBlocker,
          currentBlocker,
          blockerHistory: blockers,
          retryCount: task.retryCount,
          maxRetries: 3,
        },
      };
    }
  );

  // ============================================================================
  // Intent Understanding API
  // ============================================================================

  // POST /parse-intent - Parse natural language task description
  app.post<{
    Body: {
      repositoryId: string;
      description: string;
      projectId?: string;
    };
  }>("/parse-intent", async (request, reply) => {
    const { repositoryId, description, projectId } = request.body;

    if (!repositoryId || !description) {
      return reply.code(400).send({
        error: { message: "repositoryId and description are required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const parsedIntent = await parseTaskIntent(
        request.userId,
        repositoryId,
        description,
        projectId
      );

      return {
        data: parsedIntent,
      };
    } catch (err) {
      console.error("Intent parsing failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to parse intent" },
      });
    }
  });

  // POST /quick-parse - Quick intent parsing without AI (faster)
  app.post<{
    Body: {
      description: string;
    };
  }>("/quick-parse", async (request, reply) => {
    const { description } = request.body;

    if (!description) {
      return reply.code(400).send({
        error: { message: "description is required" },
      });
    }

    const result = quickParseIntent(description);
    return { data: result };
  });

  // POST /similar - Find similar tasks
  app.post<{
    Body: {
      repositoryId: string;
      description: string;
      projectId?: string;
      limit?: number;
      minSimilarity?: number;
      includeCompleted?: boolean;
      taskType?: string;
    };
  }>("/similar", async (request, reply) => {
    const {
      repositoryId,
      description,
      projectId,
      limit = 5,
      minSimilarity = 0.3,
      includeCompleted = true,
      taskType,
    } = request.body;

    if (!repositoryId || !description) {
      return reply.code(400).send({
        error: { message: "repositoryId and description are required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      const similarTasks = await findSimilarTasks(
        request.userId,
        repositoryId,
        description,
        projectId,
        {
          limit,
          minSimilarity,
          includeCompleted,
          taskType: taskType as any,
          useAI: true,
        }
      );

      return { data: similarTasks };
    } catch (err) {
      console.error("Similarity search failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to find similar tasks" },
      });
    }
  });

  // POST /related - Find related issues and similar resolutions
  app.post<{
    Body: {
      repositoryId: string;
      description: string;
      affectedFiles?: string[];
      referenceTaskId?: string;
      projectId?: string;
    };
  }>("/related", async (request, reply) => {
    const { repositoryId, description, affectedFiles = [], referenceTaskId, projectId } = request.body;

    if (!repositoryId || !description) {
      return reply.code(400).send({
        error: { message: "repositoryId and description are required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      // Get related bugs if files are provided
      let relatedBugs: SimilarTask[] = [];
      if (affectedFiles.length > 0) {
        relatedBugs = await findRelatedIssues(
          request.userId,
          repositoryId,
          description,
          affectedFiles,
          { limit: 5 }
        );
      }

      // Get similar resolutions if reference task is provided
      let similarResolutions: SimilarTask[] = [];
      if (referenceTaskId) {
        similarResolutions = await findSimilarResolutions(
          request.userId,
          repositoryId,
          description,
          referenceTaskId,
          { limit: 5 }
        );
      }

      // Get general suggestions
      const { similarTasks, potentialDuplicates, relatedBugs: suggestedBugs } =
        await suggestRelatedTasks(
          request.userId,
          repositoryId,
          "", // title derived from description
          description,
          projectId
        );

      return {
        data: {
          similarTasks,
          potentialDuplicates,
          relatedBugs: relatedBugs.length > 0 ? relatedBugs : suggestedBugs,
          similarResolutions,
        },
      };
    } catch (err) {
      console.error("Related task search failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to find related tasks" },
      });
    }
  });

  // GET /search - Search tasks by text query
  app.get<{
    Querystring: {
      q: string;
      repositoryId?: string;
      projectId?: string;
      limit?: string;
      status?: string;
      type?: string;
    };
  }>("/search", async (request, reply) => {
    const { q: query, repositoryId, projectId, limit, status, type } = request.query;

    if (!query || query.trim().length < 2) {
      return reply.code(400).send({
        error: { message: "Query (q) must be at least 2 characters" },
      });
    }

    try {
      const results = await searchTasks(request.userId, query.trim(), {
        repositoryId,
        projectId,
        limit: limit ? parseInt(limit, 10) : 10,
        status: status ? status.split(",") : undefined,
        type: type ? (type.split(",") as any[]) : undefined,
      });

      return { data: results };
    } catch (err) {
      console.error("Task search failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Search failed" },
      });
    }
  });

  // GET /:id/context - Get task context for "like we did in X" references
  app.get<{ Params: { id: string } }>("/:id/context", async (request, reply) => {
    try {
      const context = await getTaskContext(request.userId, request.params.id);

      if (!context.task) {
        return reply.code(404).send({ error: { message: "Task not found" } });
      }

      return { data: context };
    } catch (err) {
      console.error("Get task context failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to get task context" },
      });
    }
  });

  // GET /:id/execution-logs - Get persisted terminal output and file changes
  app.get<{ Params: { id: string } }>("/:id/execution-logs", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id },
      include: { repository: { select: { userId: true } } },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    if (task.repository.userId !== request.userId) {
      return reply.code(403).send({ error: { message: "Access denied" } });
    }

    try {
      const logs = await prisma.taskExecutionLog.findMany({
        where: { taskId: request.params.id },
        orderBy: { timestamp: "asc" },
      });

      const terminalLines: Array<{
        timestamp: number;
        stream: string;
        data: string;
        sequence: number;
      }> = [];

      const fileChanges: Array<{
        timestamp: number;
        operation: string;
        filePath: string;
        diff?: string;
        language?: string;
      }> = [];

      for (const log of logs) {
        if (log.type === "terminal" && log.stream && log.data) {
          terminalLines.push({
            timestamp: log.timestamp.getTime(),
            stream: log.stream,
            data: log.data,
            sequence: log.sequence,
          });
        } else if (log.type === "file_change" && log.operation && log.filePath) {
          fileChanges.push({
            timestamp: log.timestamp.getTime(),
            operation: log.operation,
            filePath: log.filePath,
            diff: log.diff || undefined,
            language: log.language || undefined,
          });
        }
      }

      return {
        data: {
          terminalLines,
          fileChanges,
          lastSequence: terminalLines.length > 0
            ? Math.max(...terminalLines.map((l) => l.sequence))
            : 0,
        },
      };
    } catch (err) {
      console.error("Get execution logs failed:", err);
      return reply.code(500).send({
        error: { message: "Failed to get execution logs" },
      });
    }
  });

  // POST /from-natural-language - Create task from natural language with intent parsing
  app.post<{
    Body: {
      repositoryId: string;
      naturalLanguageDescription: string;
      projectId?: string;
      targetBranch?: string;
      skipPlanning?: boolean;
      useAI?: boolean;
    };
  }>("/from-natural-language", async (request, reply) => {
    const {
      repositoryId,
      naturalLanguageDescription,
      projectId,
      targetBranch,
      skipPlanning = false,
      useAI = true,
    } = request.body;

    if (!repositoryId || !naturalLanguageDescription) {
      return reply.code(400).send({
        error: { message: "repositoryId and naturalLanguageDescription are required" },
      });
    }

    // Verify repository access
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) {
      return reply.code(404).send({ error: { message: "Repository not found" } });
    }

    try {
      // Parse intent from natural language
      let parsedIntent: ParsedIntent;
      if (useAI) {
        parsedIntent = await parseTaskIntent(
          request.userId,
          repositoryId,
          naturalLanguageDescription,
          projectId
        );
      } else {
        // Quick parse without AI
        const quickResult = quickParseIntent(naturalLanguageDescription);
        parsedIntent = {
          taskType: quickResult.taskType,
          priority: quickResult.priority,
          confidence: quickResult.confidence,
          title: naturalLanguageDescription.split(/[.!?\n]/)[0]?.trim().slice(0, 80) || "Task",
          description: naturalLanguageDescription,
          components: [],
          filePatterns: [],
          historyReferences: [],
          relatedTasks: [],
          inferredScope: {
            areas: [],
            estimatedComplexity: "medium",
            suggestedFiles: [],
            relatedDomains: [],
          },
          keywords: [],
          entities: [],
          parseMetadata: {
            originalInput: naturalLanguageDescription,
            processingTimeMs: 0,
            aiModelUsed: "none",
            fallbackUsed: true,
            warnings: [],
          },
        };
      }

      // Resolve effective branch
      let effectiveBranch: string | null = targetBranch || null;
      if (!effectiveBranch && projectId) {
        const projectRepo = await prisma.projectRepository.findUnique({
          where: { projectId_repositoryId: { projectId, repositoryId } },
          include: { project: { select: { defaultBranch: true } } },
        });
        if (projectRepo) {
          effectiveBranch = projectRepo.branchOverride || projectRepo.project.defaultBranch || null;
        }
      }

      // Store parse metadata in task metadata - cast to JSON-compatible format
      const taskMetadata = {
        parsedFromNaturalLanguage: true,
        parseConfidence: parsedIntent.confidence,
        inferredScope: {
          areas: parsedIntent.inferredScope.areas,
          estimatedComplexity: parsedIntent.inferredScope.estimatedComplexity,
          suggestedFiles: parsedIntent.inferredScope.suggestedFiles,
          relatedDomains: parsedIntent.inferredScope.relatedDomains,
        },
        relatedTaskIds: parsedIntent.relatedTasks.map((t) => t.id),
        filePatterns: parsedIntent.filePatterns,
      } as const;

      // Create the task
      const taskData = {
        repositoryId,
        userId: request.userId,
        title: parsedIntent.title,
        description: parsedIntent.description,
        type: parsedIntent.taskType,
        priority: parsedIntent.priority,
        targetBranch: effectiveBranch,
        source: "manual" as const,
        projectId: projectId || null,
        status: skipPlanning ? ("pending" as const) : ("planning" as const),
        metadata: taskMetadata as any,
        affectedFiles: parsedIntent.filePatterns,
      };

      const task = await prisma.task.create({ data: taskData });

      // Queue for planning or execution
      if (skipPlanning) {
        await schedulerService.queueTaskExecution(task.id);
      } else {
        await schedulerService.queueTaskPlanning(task.id);
      }

      return reply.code(201).send({
        data: {
          task,
          parsedIntent: {
            confidence: parsedIntent.confidence,
            inferredScope: parsedIntent.inferredScope,
            relatedTasks: parsedIntent.relatedTasks.slice(0, 3),
            parseMetadata: parsedIntent.parseMetadata,
          },
        },
      });
    } catch (err) {
      console.error("Create task from natural language failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Failed to create task" },
      });
    }
  });

  // ============================================================================
  // Standard Task CRUD
  // ============================================================================

  app.post<{ Body: CreateTaskInput & { projectId?: string; skipPlanning?: boolean } }>("/", async (request, reply) => {
    const { repositoryId, title, description, type, priority, targetBranch, projectId, skipPlanning } = request.body;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId: request.userId },
    });
    if (!repo) return reply.code(404).send({ error: { message: "Repo not found" } });

    // Resolve effective branch: explicit targetBranch > projectRepo.branchOverride > project.defaultBranch > (null = uses repo.defaultBranch at runtime)
    let effectiveBranch: string | null = targetBranch || null;

    if (!effectiveBranch && projectId) {
      // Look up project-level branch settings
      const projectRepo = await prisma.projectRepository.findUnique({
        where: { projectId_repositoryId: { projectId, repositoryId } },
        include: { project: { select: { defaultBranch: true } } },
      });

      if (projectRepo) {
        effectiveBranch = projectRepo.branchOverride || projectRepo.project.defaultBranch || null;
      }
    }

    if (skipPlanning) {
      const task = await prisma.task.create({
        data: {
          repositoryId,
          userId: request.userId,
          title,
          description,
          type,
          priority,
          targetBranch: effectiveBranch,
          source: "manual",
          projectId: projectId || null,
        },
      });
      await schedulerService.queueTaskExecution(task.id);
      return reply.code(201).send({ data: task });
    }

    const task = await prisma.task.create({
      data: {
        repositoryId,
        userId: request.userId,
        title,
        description,
        type,
        priority,
        targetBranch: effectiveBranch,
        source: "manual",
        status: "planning",
        projectId: projectId || null,
      },
    });

    await schedulerService.queueTaskPlanning(task.id);

    return reply.code(201).send({ data: task });
  });

  app.patch<{ Params: { id: string }; Body: UpdateTaskInput }>(
    "/:id",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: request.body,
      });
      return { data: updated };
    }
  );

  app.post<{ Params: { id: string }; Body: SubmitAnswersInput }>(
    "/:id/answers",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
      if (task.status !== "awaiting_input") {
        return reply.code(400).send({ error: { message: "Task is not awaiting input" } });
      }

      const { answers } = request.body;
      for (const [questionKey, answer] of Object.entries(answers)) {
        await prisma.planningQuestion.updateMany({
          where: {
            taskId: task.id,
            questionKey,
            round: task.planningRound,
          },
          data: { answer: answer as any },
        });
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { status: "planning" },
      });

      await schedulerService.queueTaskPlanning(task.id);

      return { data: { success: true } };
    }
  );

  // Select an implementation approach
  app.post<{ Params: { id: string }; Body: { approachIndex: number } }>(
    "/:id/select-approach",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      const approaches = (task.approaches as any[]) || [];
      if (approaches.length === 0) {
        return reply.code(400).send({ error: { message: "No approaches available for this task" } });
      }

      const { approachIndex } = request.body;
      if (typeof approachIndex !== "number" || approachIndex < 0 || approachIndex >= approaches.length) {
        return reply.code(400).send({
          error: { message: `Invalid approach index. Must be between 0 and ${approaches.length - 1}` },
        });
      }

      // Update selected approach and continue planning
      await prisma.task.update({
        where: { id: task.id },
        data: {
          selectedApproach: approachIndex,
          status: "planning",
          // Increment planning round to move past approach selection
          planningRound: Math.max(task.planningRound, 1),
        },
      });

      // Queue task for continued planning with selected approach
      await schedulerService.queueTaskPlanning(task.id);

      return {
        data: {
          success: true,
          selectedApproach: approaches[approachIndex],
        },
      };
    }
  );

  // Regenerate approaches for a task
  app.post<{ Params: { id: string } }>(
    "/:id/regenerate-approaches",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });
      if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

      if (!["awaiting_input", "planning", "planned", "pending"].includes(task.status)) {
        return reply.code(400).send({
          error: { message: "Can only regenerate approaches for tasks that are not in progress" },
        });
      }

      // Reset to approach generation state
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: "planning",
          planningRound: 0,
          approaches: "[]",
          selectedApproach: null,
          enhancedPlan: null,
          affectedFiles: "[]",
        },
      });

      await schedulerService.queueTaskPlanning(task.id);

      return { data: { success: true } };
    }
  );

  app.post<{ Params: { id: string } }>("/:id/plan", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });
    if (!["pending", "planned", "failed"].includes(task.status)) {
      return reply.code(400).send({ error: { message: "Task cannot be planned in its current state" } });
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "planning", planningRound: 0, enhancedPlan: null, affectedFiles: "[]" },
    });

    await schedulerService.queueTaskPlanning(task.id);

    return { data: { success: true } };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    // Cancel running jobs by marking cancelled first so workers skip it
    if (["planning", "in_progress"].includes(task.status)) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "cancelled" },
      });
    }

    await prisma.task.delete({ where: { id: task.id } });
    return { data: { success: true } };
  });

  app.post<{ Body: { ids: string[] } }>("/bulk-delete", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user
    const tasks = await prisma.task.findMany({
      where: { id: { in: ids }, userId: request.userId },
      select: { id: true, status: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No matching tasks found" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Cancel any running/planning tasks so workers skip them
    const activeIds = tasks
      .filter((t) => ["planning", "in_progress"].includes(t.status))
      .map((t) => t.id);

    if (activeIds.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: activeIds } },
        data: { status: "cancelled" },
      });
    }

    // Delete all tasks (planning questions cascade)
    await prisma.task.deleteMany({
      where: { id: { in: taskIds } },
    });

    return { data: { deleted: taskIds.length } };
  });

  // Cancel a running task
  app.post<{ Params: { id: string } }>("/:id/cancel", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    if (!["pending", "planning", "in_progress", "awaiting_input", "planned"].includes(task.status)) {
      return reply.code(400).send({ error: { message: "Only active tasks can be cancelled" } });
    }

    const oldStatus = task.status;
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "cancelled" },
    });

    // Emit trigger for status change
    await zoneTriggerService.emitTaskStatusChange(
      task.id,
      oldStatus,
      "cancelled",
      request.userId,
      task.repositoryId,
      task.projectId || undefined
    ).catch((err) => console.error("Failed to emit task status trigger:", err));

    return { data: { success: true } };
  });

  // Retry a single failed task
  app.post<{ Params: { id: string } }>("/:id/retry", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    if (!["failed", "cancelled"].includes(task.status)) {
      return reply.code(400).send({ error: { message: "Only failed or cancelled tasks can be retried" } });
    }

    // Clear previous logs for clean retry
    await prisma.taskLog.deleteMany({ where: { taskId: task.id } });

    // Reset task state and re-queue for planning
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "planning",
        planningRound: 0,
        enhancedPlan: null,
        affectedFiles: "[]",
        approaches: "[]",
        selectedApproach: null,
        pullRequestUrl: null,
        pullRequestStatus: null,
        completedAt: null,
        metadata: {},
      },
    });

    await schedulerService.queueTaskPlanning(task.id);

    return { data: { success: true } };
  });

  // Bulk retry failed/cancelled tasks
  app.post<{ Body: { ids: string[] } }>("/bulk-retry", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user and are retryable
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
        status: { in: ["failed", "cancelled"] },
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No retryable tasks found" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Clear previous logs for clean retry
    await prisma.taskLog.deleteMany({ where: { taskId: { in: taskIds } } });

    // Reset task states
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: {
        status: "planning",
        planningRound: 0,
        enhancedPlan: null,
        affectedFiles: "[]",
        approaches: "[]",
        selectedApproach: null,
        pullRequestUrl: null,
        pullRequestStatus: null,
        completedAt: null,
        metadata: {},
      },
    });

    // Queue each task for planning
    for (const taskId of taskIds) {
      await schedulerService.queueTaskPlanning(taskId);
    }

    return { data: { retried: taskIds.length } };
  });

  // Bulk start planning for pending/planned tasks
  app.post<{ Body: { ids: string[] } }>("/bulk-plan", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user and are plannable
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
        status: { in: ["pending", "planned"] },
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No plannable tasks found (must be pending or planned)" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Reset task states for planning
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: {
        status: "planning",
        planningRound: 0,
        enhancedPlan: null,
        affectedFiles: "[]",
        approaches: "[]",
        selectedApproach: null,
      },
    });

    // Queue each task for planning
    for (const taskId of taskIds) {
      await schedulerService.queueTaskPlanning(taskId);
    }

    return { data: { planned: taskIds.length } };
  });

  // Start execution for a single planned task
  app.post<{ Params: { id: string } }>("/:id/execute", async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!task) return reply.code(404).send({ error: { message: "Task not found" } });

    if (task.status !== "planned") {
      return reply.code(400).send({ error: { message: "Only planned tasks can be executed" } });
    }

    await schedulerService.queueTaskExecution(task.id);

    return { data: { success: true } };
  });

  // Bulk execute planned tasks
  app.post<{ Body: { ids: string[] } }>("/bulk-execute", async (request, reply) => {
    const { ids } = request.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: { message: "ids array is required" } });
    }

    // Verify all tasks belong to the current user and are planned
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        userId: request.userId,
        status: "planned",
      },
      select: { id: true },
    });

    if (tasks.length === 0) {
      return reply.code(404).send({ error: { message: "No planned tasks found" } });
    }

    const taskIds = tasks.map((t) => t.id);

    // Queue each task for execution
    for (const taskId of taskIds) {
      await schedulerService.queueTaskExecution(taskId);
    }

    return { data: { executed: taskIds.length } };
  });

  // ============================================================================
  // GitHub Integration Endpoints
  // ============================================================================

  // GET /:id/github-status - Get GitHub status for a task's PR
  app.get<{ Params: { id: string } }>(
    "/:id/github-status",
    async (request, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: {
          id: true,
          metadata: true,
          pullRequestUrl: true,
          pullRequestStatus: true,
        },
      });

      if (!task) {
        return reply.code(404).send({ error: { message: "Task not found" } });
      }

      const metadata = task.metadata as Record<string, any> || {};

      return {
        data: {
          pullRequestUrl: task.pullRequestUrl,
          pullRequestStatus: task.pullRequestStatus,
          githubStatus: metadata.githubStatus || null,
          githubContext: metadata.githubContext || null,
          githubComments: metadata.githubComments || [],
          lastStatusSync: metadata.lastStatusSync || null,
          lastCommentsSync: metadata.lastCommentsSync || null,
        },
      };
    }
  );

  // POST /:id/sync-github - Manually sync GitHub status for a task
  app.post<{
    Params: { id: string };
    Body: { syncComments?: boolean };
  }>("/:id/sync-github", async (request, reply) => {
    const { syncComments = false } = request.body || {};

    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        repository: { select: { fullName: true } },
        externalLink: {
          include: {
            integrationLink: {
              include: {
                integration: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    // Get GitHub token from integration or account
    let token: string | null = null;
    let owner: string | undefined;
    let repo: string | undefined;
    let prNumber: number | undefined;

    // Try to get from external link
    if (task.externalLink?.integrationLink?.integration) {
      const integration = task.externalLink.integrationLink.integration;
      if (integration.provider === "github_issues") {
        // Decrypt token
        const { decryptToken } = await import("../services/integrations/token-manager.js");
        token = decryptToken(integration.encryptedAccessToken);

        const projectId = task.externalLink.integrationLink.externalProjectId;
        const [repoOwner, repoName] = projectId.split("/");
        owner = repoOwner;
        repo = repoName;
        prNumber = parseInt(task.externalLink.externalItemId, 10);
      }
    }

    // Try to parse from PR URL
    if (!token && task.pullRequestUrl) {
      const match = task.pullRequestUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (match) {
        [, owner, repo, prNumber as any] = match;
        prNumber = parseInt(prNumber as any, 10);

        // Get token from user's GitHub account
        const account = await prisma.account.findFirst({
          where: { userId: request.userId, provider: "github" },
          select: { accessToken: true },
        });

        if (account) {
          token = account.accessToken;
        }
      }
    }

    if (!token || !owner || !repo || !prNumber) {
      return reply.code(400).send({
        error: { message: "Cannot sync: No GitHub connection or PR URL found" },
      });
    }

    try {
      const { githubSyncService } = await import("../services/github-sync.js");

      // Sync PR status
      const status = await githubSyncService.syncGitHubStatusToTask(
        task.id,
        token,
        owner,
        repo,
        prNumber
      );

      // Optionally sync comments
      let comments = null;
      if (syncComments) {
        comments = await githubSyncService.syncPRCommentsToTask(
          task.id,
          token,
          owner,
          repo,
          prNumber
        );
      }

      return {
        data: {
          success: true,
          status,
          comments: comments || undefined,
        },
      };
    } catch (err) {
      console.error("GitHub sync failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Sync failed" },
      });
    }
  });

  // POST /:id/inject-github-context - Inject GitHub issue/PR context into task
  app.post<{
    Params: { id: string };
    Body: { issueOrPrNumber: number; owner?: string; repo?: string };
  }>("/:id/inject-github-context", async (request, reply) => {
    const { issueOrPrNumber, owner: providedOwner, repo: providedRepo } = request.body;

    if (!issueOrPrNumber) {
      return reply.code(400).send({
        error: { message: "issueOrPrNumber is required" },
      });
    }

    const task = await prisma.task.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        repository: { select: { fullName: true } },
      },
    });

    if (!task) {
      return reply.code(404).send({ error: { message: "Task not found" } });
    }

    // Determine owner/repo
    let owner = providedOwner;
    let repo = providedRepo;

    if (!owner || !repo) {
      const [repoOwner, repoName] = task.repository.fullName.split("/");
      owner = owner || repoOwner;
      repo = repo || repoName;
    }

    // Get GitHub token
    const account = await prisma.account.findFirst({
      where: { userId: request.userId, provider: "github" },
      select: { accessToken: true },
    });

    if (!account) {
      return reply.code(400).send({
        error: { message: "No GitHub account connected" },
      });
    }

    try {
      const { githubSyncService } = await import("../services/github-sync.js");

      await githubSyncService.injectGitHubContextToTask(
        task.id,
        account.accessToken,
        owner,
        repo,
        issueOrPrNumber
      );

      // Fetch updated task
      const updatedTask = await prisma.task.findUnique({
        where: { id: task.id },
        select: { metadata: true, priority: true, type: true },
      });

      const metadata = updatedTask?.metadata as Record<string, any> || {};

      return {
        data: {
          success: true,
          context: metadata.githubContext,
          updatedPriority: updatedTask?.priority,
          updatedType: updatedTask?.type,
        },
      };
    } catch (err) {
      console.error("GitHub context injection failed:", err);
      return reply.code(500).send({
        error: { message: err instanceof Error ? err.message : "Context injection failed" },
      });
    }
  });
};
