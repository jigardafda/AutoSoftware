/**
 * Memory Routes
 *
 * API endpoints for Project Memory feature (Phase 5)
 */

import type { FastifyPluginAsync } from "fastify";
import {
  createMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  getProjectMemories,
  getRepositoryMemories,
  getRelevantMemories,
  searchMemories,
  consolidateMemories,
  autoConsolidateMemories,
  getMemoryStats,
  createMemoryFromTask,
  type MemoryCategory,
  type CreateMemoryInput,
  type UpdateMemoryInput,
  type RelevantMemoryQuery,
} from "../services/project-memory.js";

export const memoryRoutes: FastifyPluginAsync = async (app) => {
  // All memory routes require authentication
  app.addHook("preHandler", (app as any).requireAuth);

  // ============================================================================
  // GET /api/memory/project/:projectId - Get all memories for a project
  // ============================================================================
  app.get<{
    Params: { projectId: string };
    Querystring: {
      category?: MemoryCategory;
      minImportance?: string;
      limit?: string;
      includeConsolidated?: string;
      tags?: string;
    };
  }>("/project/:projectId", async (request) => {
    const { projectId } = request.params;
    const {
      category,
      minImportance,
      limit,
      includeConsolidated,
      tags,
    } = request.query;

    const memories = await getProjectMemories(request.userId, projectId, {
      category,
      minImportance: minImportance ? parseInt(minImportance) : undefined,
      limit: limit ? parseInt(limit) : 50,
      includeConsolidated: includeConsolidated !== "false",
      tags: tags ? tags.split(",").map((t) => t.trim()) : undefined,
    });

    return { data: memories };
  });

  // ============================================================================
  // GET /api/memory/repository/:repositoryId - Get all memories for a repository
  // ============================================================================
  app.get<{
    Params: { repositoryId: string };
    Querystring: {
      category?: MemoryCategory;
      minImportance?: string;
      limit?: string;
      includeConsolidated?: string;
      tags?: string;
    };
  }>("/repository/:repositoryId", async (request) => {
    const { repositoryId } = request.params;
    const {
      category,
      minImportance,
      limit,
      includeConsolidated,
      tags,
    } = request.query;

    const memories = await getRepositoryMemories(request.userId, repositoryId, {
      category,
      minImportance: minImportance ? parseInt(minImportance) : undefined,
      limit: limit ? parseInt(limit) : 50,
      includeConsolidated: includeConsolidated !== "false",
      tags: tags ? tags.split(",").map((t) => t.trim()) : undefined,
    });

    return { data: memories };
  });

  // ============================================================================
  // GET /api/memory/:id - Get a single memory
  // ============================================================================
  app.get<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;

    const memory = await getMemory(request.userId, id);

    if (!memory) {
      return reply.code(404).send({ error: { message: "Memory not found" } });
    }

    return { data: memory };
  });

  // ============================================================================
  // POST /api/memory - Create a new memory
  // ============================================================================
  app.post<{
    Body: CreateMemoryInput;
  }>("/", async (request, reply) => {
    const input = request.body;

    if (!input.title || !input.content || !input.category) {
      return reply.code(400).send({
        error: { message: "title, content, and category are required" },
      });
    }

    // Validate category
    const validCategories: MemoryCategory[] = [
      "architecture",
      "convention",
      "decision",
      "learning",
      "context",
    ];
    if (!validCategories.includes(input.category)) {
      return reply.code(400).send({
        error: { message: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
      });
    }

    // Validate importance
    if (input.importance !== undefined && (input.importance < 1 || input.importance > 10)) {
      return reply.code(400).send({
        error: { message: "Importance must be between 1 and 10" },
      });
    }

    const memory = await createMemory(request.userId, input);

    return { data: memory };
  });

  // ============================================================================
  // PUT /api/memory/:id - Update a memory
  // ============================================================================
  app.put<{
    Params: { id: string };
    Body: UpdateMemoryInput;
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const input = request.body;

    // Validate category if provided
    if (input.category) {
      const validCategories: MemoryCategory[] = [
        "architecture",
        "convention",
        "decision",
        "learning",
        "context",
      ];
      if (!validCategories.includes(input.category)) {
        return reply.code(400).send({
          error: { message: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        });
      }
    }

    // Validate importance if provided
    if (input.importance !== undefined && (input.importance < 1 || input.importance > 10)) {
      return reply.code(400).send({
        error: { message: "Importance must be between 1 and 10" },
      });
    }

    const memory = await updateMemory(request.userId, id, input);

    if (!memory) {
      return reply.code(404).send({ error: { message: "Memory not found" } });
    }

    return { data: memory };
  });

  // ============================================================================
  // DELETE /api/memory/:id - Delete a memory
  // ============================================================================
  app.delete<{
    Params: { id: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;

    const deleted = await deleteMemory(request.userId, id);

    if (!deleted) {
      return reply.code(404).send({ error: { message: "Memory not found" } });
    }

    return { data: { success: true } };
  });

  // ============================================================================
  // GET /api/memory/relevant - Get memories relevant to current context
  // ============================================================================
  app.get<{
    Querystring: {
      projectId?: string;
      repositoryId?: string;
      taskTitle?: string;
      taskDescription?: string;
      taskType?: string;
      affectedFiles?: string;
      limit?: string;
    };
  }>("/relevant", async (request) => {
    const {
      projectId,
      repositoryId,
      taskTitle,
      taskDescription,
      taskType,
      affectedFiles,
      limit,
    } = request.query;

    const query: RelevantMemoryQuery = {
      taskTitle,
      taskDescription,
      taskType,
      affectedFiles: affectedFiles ? affectedFiles.split(",").map((f) => f.trim()) : undefined,
    };

    const memories = await getRelevantMemories(request.userId, query, {
      projectId,
      repositoryId,
      limit: limit ? parseInt(limit) : 10,
    });

    return { data: memories };
  });

  // ============================================================================
  // GET /api/memory/search - Search memories
  // ============================================================================
  app.get<{
    Querystring: {
      q: string;
      projectId?: string;
      repositoryId?: string;
      category?: MemoryCategory;
      minImportance?: string;
      limit?: string;
    };
  }>("/search", async (request, reply) => {
    const {
      q,
      projectId,
      repositoryId,
      category,
      minImportance,
      limit,
    } = request.query;

    if (!q || q.trim().length < 2) {
      return reply.code(400).send({
        error: { message: "Search query must be at least 2 characters" },
      });
    }

    const memories = await searchMemories(request.userId, q, {
      projectId,
      repositoryId,
      category,
      minImportance: minImportance ? parseInt(minImportance) : undefined,
      limit: limit ? parseInt(limit) : 20,
    });

    return { data: memories };
  });

  // ============================================================================
  // POST /api/memory/consolidate - Consolidate multiple memories
  // ============================================================================
  app.post<{
    Body: {
      memoryIds: string[];
      projectId?: string;
      repositoryId?: string;
      category?: MemoryCategory;
    };
  }>("/consolidate", async (request, reply) => {
    const { memoryIds, projectId, repositoryId, category } = request.body;

    if (!memoryIds || !Array.isArray(memoryIds) || memoryIds.length < 2) {
      return reply.code(400).send({
        error: { message: "At least 2 memory IDs are required for consolidation" },
      });
    }

    const result = await consolidateMemories(request.userId, memoryIds, {
      projectId,
      repositoryId,
      category,
    });

    if (!result) {
      return reply.code(400).send({
        error: { message: "Failed to consolidate memories" },
      });
    }

    return { data: result };
  });

  // ============================================================================
  // POST /api/memory/auto-consolidate - Auto-consolidate old memories
  // ============================================================================
  app.post<{
    Body: {
      projectId?: string;
      repositoryId?: string;
      olderThanDays?: number;
      minMemoriesToConsolidate?: number;
    };
  }>("/auto-consolidate", async (request) => {
    const { projectId, repositoryId, olderThanDays, minMemoriesToConsolidate } = request.body;

    const results = await autoConsolidateMemories(request.userId, {
      projectId,
      repositoryId,
      olderThanDays: olderThanDays ?? 30,
      minMemoriesToConsolidate: minMemoriesToConsolidate ?? 3,
    });

    return {
      data: {
        consolidationCount: results.length,
        results,
      },
    };
  });

  // ============================================================================
  // GET /api/memory/stats - Get memory statistics
  // ============================================================================
  app.get<{
    Querystring: {
      projectId?: string;
      repositoryId?: string;
    };
  }>("/stats", async (request) => {
    const { projectId, repositoryId } = request.query;

    const stats = await getMemoryStats(request.userId, {
      projectId,
      repositoryId,
    });

    return { data: stats };
  });

  // ============================================================================
  // POST /api/memory/from-task/:taskId - Create memory from completed task
  // ============================================================================
  app.post<{
    Params: { taskId: string };
  }>("/from-task/:taskId", async (request, reply) => {
    const { taskId } = request.params;

    const memory = await createMemoryFromTask(request.userId, taskId);

    if (!memory) {
      return reply.code(400).send({
        error: { message: "Could not create memory from task. Task may not be completed or significant enough." },
      });
    }

    return { data: memory };
  });
};
