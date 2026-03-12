/**
 * Project Memory Service
 *
 * Implements Phase 5 Project Memory:
 * 1. Store and retrieve project decisions
 * 2. Contextual memory retrieval based on current task
 * 3. Memory importance scoring
 * 4. Memory consolidation (summarize old memories)
 * 5. Memory search with embeddings (optional)
 */

import { prisma } from "../db.js";
import { simpleQuery } from "./claude-query.js";

// ============================================================================
// Types
// ============================================================================

export type MemoryCategory =
  | "architecture"
  | "convention"
  | "decision"
  | "learning"
  | "context";

export interface ProjectMemory {
  id: string;
  projectId: string | null;
  repositoryId: string | null;
  userId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  importance: number;
  tags: string[];
  relatedTaskIds: string[];
  embedding?: number[];
  embeddingModel?: string;
  isConsolidated: boolean;
  consolidatedAt?: Date;
  sourceMemoryIds: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMemoryInput {
  projectId?: string;
  repositoryId?: string;
  category: MemoryCategory;
  title: string;
  content: string;
  importance?: number;
  tags?: string[];
  relatedTaskIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateMemoryInput {
  title?: string;
  content?: string;
  category?: MemoryCategory;
  importance?: number;
  tags?: string[];
  relatedTaskIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemorySearchOptions {
  projectId?: string;
  repositoryId?: string;
  category?: MemoryCategory;
  tags?: string[];
  minImportance?: number;
  limit?: number;
  includeConsolidated?: boolean;
}

export interface RelevantMemoryQuery {
  taskTitle?: string;
  taskDescription?: string;
  taskType?: string;
  affectedFiles?: string[];
  codeContext?: string;
}

export interface ConsolidationResult {
  consolidatedMemory: ProjectMemory;
  sourceMemoryIds: string[];
  summary: string;
}

// ============================================================================
// Memory Storage Operations
// ============================================================================

/**
 * Create a new project memory
 */
export async function createMemory(
  userId: string,
  input: CreateMemoryInput
): Promise<ProjectMemory> {
  const memory = await prisma.projectMemory.create({
    data: {
      userId,
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      category: input.category,
      title: input.title,
      content: input.content,
      importance: input.importance ?? 5,
      tags: input.tags ?? [],
      relatedTaskIds: input.relatedTaskIds ?? [],
      metadata: input.metadata ?? {},
      isConsolidated: false,
      sourceMemoryIds: [],
    },
  });

  return formatMemory(memory);
}

/**
 * Get a memory by ID
 */
export async function getMemory(
  userId: string,
  memoryId: string
): Promise<ProjectMemory | null> {
  const memory = await prisma.projectMemory.findFirst({
    where: { id: memoryId, userId },
  });

  return memory ? formatMemory(memory) : null;
}

/**
 * Update an existing memory
 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  input: UpdateMemoryInput
): Promise<ProjectMemory | null> {
  const existing = await prisma.projectMemory.findFirst({
    where: { id: memoryId, userId },
  });

  if (!existing) return null;

  const memory = await prisma.projectMemory.update({
    where: { id: memoryId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.importance !== undefined && { importance: input.importance }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.relatedTaskIds !== undefined && {
        relatedTaskIds: input.relatedTaskIds,
      }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    },
  });

  return formatMemory(memory);
}

/**
 * Delete a memory
 */
export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  const existing = await prisma.projectMemory.findFirst({
    where: { id: memoryId, userId },
  });

  if (!existing) return false;

  await prisma.projectMemory.delete({
    where: { id: memoryId },
  });

  return true;
}

/**
 * Get all memories for a project
 */
export async function getProjectMemories(
  userId: string,
  projectId: string,
  options: MemorySearchOptions = {}
): Promise<ProjectMemory[]> {
  const {
    category,
    tags,
    minImportance = 0,
    limit = 50,
    includeConsolidated = true,
  } = options;

  const memories = await prisma.projectMemory.findMany({
    where: {
      userId,
      projectId,
      ...(category && { category }),
      ...(minImportance > 0 && { importance: { gte: minImportance } }),
      ...(!includeConsolidated && { isConsolidated: false }),
      ...(tags &&
        tags.length > 0 && {
          tags: { hasSome: tags },
        }),
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return memories.map(formatMemory);
}

/**
 * Get all memories for a repository
 */
export async function getRepositoryMemories(
  userId: string,
  repositoryId: string,
  options: MemorySearchOptions = {}
): Promise<ProjectMemory[]> {
  const {
    category,
    tags,
    minImportance = 0,
    limit = 50,
    includeConsolidated = true,
  } = options;

  const memories = await prisma.projectMemory.findMany({
    where: {
      userId,
      repositoryId,
      ...(category && { category }),
      ...(minImportance > 0 && { importance: { gte: minImportance } }),
      ...(!includeConsolidated && { isConsolidated: false }),
      ...(tags &&
        tags.length > 0 && {
          tags: { hasSome: tags },
        }),
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return memories.map(formatMemory);
}

// ============================================================================
// Memory Importance Scoring
// ============================================================================

/**
 * Calculate importance score for a memory based on various factors
 */
export async function calculateImportanceScore(
  userId: string,
  memoryId: string
): Promise<number> {
  const memory = await prisma.projectMemory.findFirst({
    where: { id: memoryId, userId },
  });

  if (!memory) return 0;

  let score = memory.importance;

  // Factor 1: Age decay (older memories lose importance unless refreshed)
  const ageInDays =
    (Date.now() - memory.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  const ageDecay = Math.max(0, 1 - ageInDays / 365); // Decay over a year
  score *= 0.7 + 0.3 * ageDecay; // 30% weight for recency

  // Factor 2: Category importance weights
  const categoryWeights: Record<MemoryCategory, number> = {
    architecture: 1.2,
    decision: 1.1,
    convention: 1.0,
    learning: 0.9,
    context: 0.8,
  };
  score *= categoryWeights[memory.category as MemoryCategory] ?? 1.0;

  // Factor 3: Number of related tasks (more related = more important)
  const relatedTaskCount = memory.relatedTaskIds.length;
  if (relatedTaskCount > 0) {
    score *= 1 + Math.min(relatedTaskCount * 0.05, 0.3); // Up to 30% boost
  }

  // Factor 4: Tag relevance (more tags = more specific = more useful)
  const tagCount = memory.tags.length;
  if (tagCount > 0) {
    score *= 1 + Math.min(tagCount * 0.02, 0.1); // Up to 10% boost
  }

  // Normalize to 1-10 range
  return Math.max(1, Math.min(10, Math.round(score)));
}

/**
 * Recalculate and update importance scores for all memories
 */
export async function recalculateImportanceScores(
  userId: string,
  options: { projectId?: string; repositoryId?: string } = {}
): Promise<number> {
  const memories = await prisma.projectMemory.findMany({
    where: {
      userId,
      ...(options.projectId && { projectId: options.projectId }),
      ...(options.repositoryId && { repositoryId: options.repositoryId }),
    },
  });

  let updated = 0;
  for (const memory of memories) {
    const newScore = await calculateImportanceScore(userId, memory.id);
    if (newScore !== memory.importance) {
      await prisma.projectMemory.update({
        where: { id: memory.id },
        data: { importance: newScore },
      });
      updated++;
    }
  }

  return updated;
}

// ============================================================================
// Contextual Memory Retrieval
// ============================================================================

/**
 * Find memories relevant to a specific task context
 */
export async function getRelevantMemories(
  userId: string,
  query: RelevantMemoryQuery,
  options: {
    projectId?: string;
    repositoryId?: string;
    limit?: number;
  } = {}
): Promise<ProjectMemory[]> {
  const { projectId, repositoryId, limit = 10 } = options;

  // Build search context
  const searchContext = [
    query.taskTitle,
    query.taskDescription,
    query.taskType,
    ...(query.affectedFiles ?? []),
    query.codeContext,
  ]
    .filter(Boolean)
    .join(" ");

  if (!searchContext.trim()) {
    // No context, return recent important memories
    return getProjectMemories(userId, projectId || "", {
      repositoryId,
      minImportance: 5,
      limit,
    });
  }

  // Use AI to find relevant memories
  const allMemories = await prisma.projectMemory.findMany({
    where: {
      userId,
      ...(projectId && { projectId }),
      ...(repositoryId && { repositoryId }),
      isConsolidated: false, // Skip consolidated (they are summaries)
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 100, // Get top 100 for AI to filter
  });

  if (allMemories.length === 0) {
    return [];
  }

  // Format memories for AI evaluation
  const memorySummaries = allMemories
    .map(
      (m, i) =>
        `[${i}] "${m.title}" (${m.category}, importance: ${m.importance}): ${m.content.substring(0, 200)}...`
    )
    .join("\n");

  const systemPrompt = `You are a memory retrieval system. Given a task context and a list of project memories, identify which memories are most relevant to the task.

Respond with a JSON array of memory indices (0-based) that are relevant, ordered by relevance. Include only indices of memories that would actually help with the task.

Example response: [2, 5, 0, 7]`;

  const userPrompt = `Task Context:
${searchContext}

Available Memories:
${memorySummaries}

Return the indices of memories relevant to this task (max ${limit}):`;

  try {
    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    // Extract array from response
    const arrayMatch = result.match(/\[[\d,\s]+\]/);
    if (!arrayMatch) {
      // Fallback to most important memories
      return allMemories.slice(0, limit).map(formatMemory);
    }

    const indices = JSON.parse(arrayMatch[0]) as number[];
    const relevantMemories = indices
      .filter((i) => i >= 0 && i < allMemories.length)
      .slice(0, limit)
      .map((i) => formatMemory(allMemories[i]));

    return relevantMemories;
  } catch (error) {
    console.error("Failed to find relevant memories:", error);
    // Fallback to most important memories
    return allMemories.slice(0, limit).map(formatMemory);
  }
}

/**
 * Get memory context string for AI prompts
 */
export async function getMemoryContextForTask(
  userId: string,
  query: RelevantMemoryQuery,
  options: { projectId?: string; repositoryId?: string } = {}
): Promise<string> {
  const memories = await getRelevantMemories(userId, query, {
    ...options,
    limit: 5,
  });

  if (memories.length === 0) {
    return "";
  }

  let context = "\n## Project Memory Context\n";
  context +=
    "The following decisions and context from previous work may be relevant:\n\n";

  for (const memory of memories) {
    context += `### ${memory.title} (${memory.category})\n`;
    context += `${memory.content}\n\n`;
  }

  return context;
}

// ============================================================================
// Memory Consolidation
// ============================================================================

/**
 * Consolidate multiple memories into a single summary memory
 */
export async function consolidateMemories(
  userId: string,
  memoryIds: string[],
  options: {
    projectId?: string;
    repositoryId?: string;
    category?: MemoryCategory;
  } = {}
): Promise<ConsolidationResult | null> {
  if (memoryIds.length < 2) {
    return null;
  }

  const memories = await prisma.projectMemory.findMany({
    where: {
      id: { in: memoryIds },
      userId,
    },
    orderBy: { createdAt: "asc" },
  });

  if (memories.length < 2) {
    return null;
  }

  // Use AI to consolidate memories
  const memoriesText = memories
    .map(
      (m) =>
        `## ${m.title} (${m.category}, importance: ${m.importance})\n${m.content}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are consolidating multiple project memories into a single, comprehensive summary.
Create a consolidated memory that:
1. Captures the key decisions and context from all memories
2. Removes redundancy while preserving important details
3. Maintains a clear, organized structure
4. Highlights the most important points

Respond with a JSON object:
{
  "title": "Consolidated title",
  "content": "Consolidated content with clear sections",
  "importance": 1-10,
  "tags": ["tag1", "tag2"],
  "summary": "Brief one-line summary of what was consolidated"
}`;

  const userPrompt = `Consolidate these ${memories.length} memories:\n\n${memoriesText}`;

  try {
    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Determine category (use most common or specified)
    const category =
      options.category ||
      (memories.reduce(
        (acc, m) => {
          acc[m.category as MemoryCategory] =
            (acc[m.category as MemoryCategory] || 0) + 1;
          return acc;
        },
        {} as Record<MemoryCategory, number>
      ) &&
        memories[0].category);

    // Create consolidated memory
    const consolidatedMemory = await prisma.projectMemory.create({
      data: {
        userId,
        projectId: options.projectId || memories[0].projectId,
        repositoryId: options.repositoryId || memories[0].repositoryId,
        category: category as string,
        title: parsed.title,
        content: parsed.content,
        importance: parsed.importance || 7,
        tags: parsed.tags || [],
        relatedTaskIds: [...new Set(memories.flatMap((m) => m.relatedTaskIds))],
        isConsolidated: true,
        consolidatedAt: new Date(),
        sourceMemoryIds: memoryIds,
        metadata: {
          consolidatedFrom: memoryIds.length,
          consolidationDate: new Date().toISOString(),
        },
      },
    });

    // Optionally mark source memories as consolidated
    await prisma.projectMemory.updateMany({
      where: { id: { in: memoryIds } },
      data: {
        metadata: {
          consolidatedInto: consolidatedMemory.id,
        },
      },
    });

    return {
      consolidatedMemory: formatMemory(consolidatedMemory),
      sourceMemoryIds: memoryIds,
      summary: parsed.summary,
    };
  } catch (error) {
    console.error("Failed to consolidate memories:", error);
    return null;
  }
}

/**
 * Auto-consolidate old memories for a project
 * Groups similar memories and consolidates them
 */
export async function autoConsolidateMemories(
  userId: string,
  options: {
    projectId?: string;
    repositoryId?: string;
    olderThanDays?: number;
    minMemoriesToConsolidate?: number;
  } = {}
): Promise<ConsolidationResult[]> {
  const {
    projectId,
    repositoryId,
    olderThanDays = 30,
    minMemoriesToConsolidate = 3,
  } = options;

  const cutoffDate = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  );

  // Get old, unconsolidated memories
  const oldMemories = await prisma.projectMemory.findMany({
    where: {
      userId,
      ...(projectId && { projectId }),
      ...(repositoryId && { repositoryId }),
      isConsolidated: false,
      createdAt: { lt: cutoffDate },
    },
    orderBy: { createdAt: "asc" },
  });

  if (oldMemories.length < minMemoriesToConsolidate) {
    return [];
  }

  // Group by category
  const groups = oldMemories.reduce(
    (acc, m) => {
      const cat = m.category as MemoryCategory;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(m);
      return acc;
    },
    {} as Record<MemoryCategory, typeof oldMemories>
  );

  const results: ConsolidationResult[] = [];

  for (const [category, memories] of Object.entries(groups)) {
    if (memories.length >= minMemoriesToConsolidate) {
      const memoryIds = memories.map((m) => m.id);
      const result = await consolidateMemories(userId, memoryIds, {
        projectId,
        repositoryId,
        category: category as MemoryCategory,
      });

      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}

// ============================================================================
// Memory Search
// ============================================================================

/**
 * Search memories by text (simple keyword search)
 */
export async function searchMemories(
  userId: string,
  query: string,
  options: MemorySearchOptions = {}
): Promise<ProjectMemory[]> {
  const {
    projectId,
    repositoryId,
    category,
    minImportance = 0,
    limit = 20,
    includeConsolidated = true,
  } = options;

  // Simple text search (could be enhanced with full-text search)
  const memories = await prisma.projectMemory.findMany({
    where: {
      userId,
      ...(projectId && { projectId }),
      ...(repositoryId && { repositoryId }),
      ...(category && { category }),
      ...(minImportance > 0 && { importance: { gte: minImportance } }),
      ...(!includeConsolidated && { isConsolidated: false }),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
        { tags: { has: query.toLowerCase() } },
      ],
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return memories.map(formatMemory);
}

/**
 * Get memory statistics
 */
export async function getMemoryStats(
  userId: string,
  options: { projectId?: string; repositoryId?: string } = {}
): Promise<{
  total: number;
  byCategory: Record<MemoryCategory, number>;
  avgImportance: number;
  consolidated: number;
  recentCount: number;
}> {
  const { projectId, repositoryId } = options;

  const memories = await prisma.projectMemory.findMany({
    where: {
      userId,
      ...(projectId && { projectId }),
      ...(repositoryId && { repositoryId }),
    },
    select: {
      category: true,
      importance: true,
      isConsolidated: true,
      createdAt: true,
    },
  });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const byCategory = memories.reduce(
    (acc, m) => {
      acc[m.category as MemoryCategory] =
        (acc[m.category as MemoryCategory] || 0) + 1;
      return acc;
    },
    {} as Record<MemoryCategory, number>
  );

  const avgImportance =
    memories.length > 0
      ? memories.reduce((sum, m) => sum + m.importance, 0) / memories.length
      : 0;

  return {
    total: memories.length,
    byCategory,
    avgImportance: Math.round(avgImportance * 10) / 10,
    consolidated: memories.filter((m) => m.isConsolidated).length,
    recentCount: memories.filter((m) => m.createdAt >= weekAgo).length,
  };
}

// ============================================================================
// Auto-Memory from Tasks
// ============================================================================

/**
 * Automatically create memory from task completion
 */
export async function createMemoryFromTask(
  userId: string,
  taskId: string
): Promise<ProjectMemory | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      repository: { select: { fullName: true } },
    },
  });

  if (!task || task.status !== "completed") {
    return null;
  }

  // Only create memory for tasks with enhanced plans or significant work
  if (!task.enhancedPlan && !task.pullRequestUrl) {
    return null;
  }

  const metadata = task.metadata as Record<string, unknown> || {};

  // Determine if this is worth remembering
  const hasSignificantChanges =
    (task.affectedFiles as string[])?.length >= 3 ||
    task.enhancedPlan?.length >= 500 ||
    task.pullRequestUrl;

  if (!hasSignificantChanges) {
    return null;
  }

  // Use AI to extract learnings
  const systemPrompt = `You are extracting learnings from a completed task for future reference.
Create a concise memory entry that captures:
1. What was done
2. Key decisions made
3. Any patterns or approaches that worked well

Respond with JSON:
{
  "title": "Short descriptive title",
  "content": "Key learnings and decisions",
  "category": "architecture|convention|decision|learning|context",
  "importance": 1-10,
  "tags": ["tag1", "tag2"]
}`;

  const taskContext = `
Task: ${task.title}
Description: ${task.description}
Type: ${task.type}
${task.enhancedPlan ? `Plan:\n${task.enhancedPlan}` : ""}
${metadata.resultSummary ? `Result: ${metadata.resultSummary}` : ""}
`;

  try {
    const { result } = await simpleQuery(
      systemPrompt,
      `Extract learnings from:\n${taskContext}`,
      { model: "claude-sonnet-4-20250514" }
    );

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return createMemory(userId, {
      projectId: task.projectId || undefined,
      repositoryId: task.repositoryId,
      category: parsed.category || "learning",
      title: parsed.title,
      content: parsed.content,
      importance: parsed.importance || 5,
      tags: parsed.tags || [],
      relatedTaskIds: [taskId],
      metadata: {
        sourceTaskId: taskId,
        sourceTaskTitle: task.title,
        autoGenerated: true,
      },
    });
  } catch (error) {
    console.error("Failed to create memory from task:", error);
    return null;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function formatMemory(memory: any): ProjectMemory {
  return {
    id: memory.id,
    projectId: memory.projectId,
    repositoryId: memory.repositoryId,
    userId: memory.userId,
    category: memory.category as MemoryCategory,
    title: memory.title,
    content: memory.content,
    importance: memory.importance,
    tags: memory.tags,
    relatedTaskIds: memory.relatedTaskIds,
    embedding: memory.embedding,
    embeddingModel: memory.embeddingModel,
    isConsolidated: memory.isConsolidated,
    consolidatedAt: memory.consolidatedAt,
    sourceMemoryIds: memory.sourceMemoryIds,
    metadata: memory.metadata as Record<string, unknown>,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}
