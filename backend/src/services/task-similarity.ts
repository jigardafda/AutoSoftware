/**
 * Task Similarity Service
 *
 * Finds similar past tasks based on description, type, and affected components.
 * Uses both text similarity and semantic matching to connect related issues.
 *
 * Features:
 * - Text-based similarity (TF-IDF-like scoring)
 * - Component/file overlap detection
 * - Type and priority matching
 * - Temporal relevance weighting
 * - AI-powered semantic similarity (optional)
 */

import { prisma } from "../db.js";
import {
  resolveAuth,
  setupAgentSdkAuth,
  isValidAuth,
  simpleQuery,
} from "./claude-query.js";
import type { TaskType, TaskPriority } from "@autosoftware/shared";

// ============================================================================
// Types
// ============================================================================

export interface SimilarTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: string;
  similarity: SimilarityScore;
  createdAt: Date;
  completedAt?: Date | null;
  pullRequestUrl?: string | null;
  affectedFiles: string[];
}

export interface SimilarityScore {
  overall: number; // 0-1 combined score
  textual: number; // Text similarity
  component: number; // Component/file overlap
  semantic: number; // AI semantic similarity
  temporal: number; // Recency boost
  type: number; // Task type match
}

export interface TaskSearchOptions {
  limit?: number;
  minSimilarity?: number;
  includeCompleted?: boolean;
  maxAge?: number; // Max age in days
  excludeIds?: string[];
  taskType?: TaskType;
  useAI?: boolean;
}

interface TokenizedText {
  tokens: string[];
  frequencies: Map<string, number>;
  length: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SIMILARITY = 0.3;
const DEFAULT_MAX_AGE = 365; // 1 year
const STOPWORDS = new Set([
  "the", "a", "an", "is", "it", "to", "for", "in", "on", "at", "of", "and", "or",
  "be", "are", "was", "were", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "must", "shall",
  "this", "that", "these", "those", "with", "from", "by", "as", "we", "i", "you",
  "they", "he", "she", "but", "not", "so", "if", "then", "when", "where", "which",
  "who", "what", "how", "can", "just", "also", "some", "any", "all", "each",
]);

// Weights for similarity components
const SIMILARITY_WEIGHTS = {
  textual: 0.35,
  component: 0.25,
  semantic: 0.25,
  temporal: 0.05,
  type: 0.10,
};

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Find similar past tasks based on a task description
 */
export async function findSimilarTasks(
  userId: string,
  repositoryId: string,
  description: string,
  projectId?: string,
  options: TaskSearchOptions = {}
): Promise<SimilarTask[]> {
  const {
    limit = DEFAULT_LIMIT,
    minSimilarity = DEFAULT_MIN_SIMILARITY,
    includeCompleted = true,
    maxAge = DEFAULT_MAX_AGE,
    excludeIds = [],
    taskType,
    useAI = true,
  } = options;

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAge);

  // Build query conditions - use proper enum values for TaskStatus
  type TaskStatusValue = "pending" | "planning" | "in_progress" | "awaiting_input" | "planned" | "completed" | "failed" | "cancelled" | "partial_success";
  const statusFilter: { notIn?: TaskStatusValue[]; in?: TaskStatusValue[] } = includeCompleted
    ? { notIn: ["cancelled"] }
    : { in: ["pending", "planning", "in_progress", "awaiting_input", "planned"] };

  // Fetch candidate tasks from the database
  const candidates = await prisma.task.findMany({
    where: {
      userId,
      repositoryId,
      createdAt: { gte: cutoffDate },
      status: statusFilter,
      id: { notIn: excludeIds },
      ...(taskType && { type: taskType }),
      ...(projectId && { projectId }),
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      createdAt: true,
      completedAt: true,
      pullRequestUrl: true,
      affectedFiles: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100, // Get more candidates for better matching
  });

  if (candidates.length === 0) {
    return [];
  }

  // Tokenize the search description
  const searchTokens = tokenize(description);

  // Calculate similarity for each candidate
  const scoredCandidates: Array<{
    task: typeof candidates[0];
    score: SimilarityScore;
  }> = [];

  for (const task of candidates) {
    // Calculate textual similarity
    const taskTokens = tokenize(task.title + " " + task.description);
    const textualScore = calculateTextSimilarity(searchTokens, taskTokens);

    // Calculate component/file overlap
    const affectedFiles = (task.affectedFiles as string[]) || [];
    const componentScore = calculateComponentSimilarity(description, affectedFiles);

    // Calculate type match score
    const inferredType = inferTaskType(description);
    const typeScore = task.type === inferredType ? 1.0 : 0.3;

    // Calculate temporal relevance (more recent = higher score)
    const ageInDays = (Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const temporalScore = Math.max(0, 1 - ageInDays / maxAge);

    // Initial semantic score (will be enhanced by AI if available)
    let semanticScore = textualScore * 0.8; // Start with scaled textual

    scoredCandidates.push({
      task,
      score: {
        overall: 0, // Will be calculated after AI
        textual: textualScore,
        component: componentScore,
        semantic: semanticScore,
        temporal: temporalScore,
        type: typeScore,
      },
    });
  }

  // Sort by initial combined score
  scoredCandidates.sort((a, b) => {
    const scoreA = a.score.textual + a.score.component + a.score.type;
    const scoreB = b.score.textual + b.score.component + b.score.type;
    return scoreB - scoreA;
  });

  // Take top candidates for AI enhancement
  const topCandidates = scoredCandidates.slice(0, Math.min(15, scoredCandidates.length));

  // Enhance with AI semantic similarity if available
  if (useAI && topCandidates.length > 0) {
    const auth = await resolveAuth(userId);
    if (isValidAuth(auth)) {
      setupAgentSdkAuth(auth);
      try {
        const semanticScores = await calculateSemanticSimilarity(
          description,
          topCandidates.map((c) => ({
            id: c.task.id,
            title: c.task.title,
            description: c.task.description,
          }))
        );

        // Update semantic scores
        for (const candidate of topCandidates) {
          if (semanticScores[candidate.task.id] !== undefined) {
            candidate.score.semantic = semanticScores[candidate.task.id];
          }
        }
      } catch (err) {
        console.error("AI semantic similarity failed:", err);
        // Continue with rule-based scores
      }
    }
  }

  // Calculate final overall scores
  for (const candidate of topCandidates) {
    candidate.score.overall = calculateOverallScore(candidate.score);
  }

  // Sort by overall score and filter by minimum similarity
  const results = topCandidates
    .filter((c) => c.score.overall >= minSimilarity)
    .sort((a, b) => b.score.overall - a.score.overall)
    .slice(0, limit)
    .map((c) => ({
      id: c.task.id,
      title: c.task.title,
      description: c.task.description,
      type: c.task.type as TaskType,
      priority: c.task.priority as TaskPriority,
      status: c.task.status,
      similarity: c.score,
      createdAt: c.task.createdAt,
      completedAt: c.task.completedAt,
      pullRequestUrl: c.task.pullRequestUrl,
      affectedFiles: (c.task.affectedFiles as string[]) || [],
    }));

  return results;
}

/**
 * Find tasks that were resolved similarly (for "fix it like we did in X" queries)
 */
export async function findSimilarResolutions(
  userId: string,
  repositoryId: string,
  description: string,
  referencedTaskId?: string,
  options: TaskSearchOptions = {}
): Promise<SimilarTask[]> {
  // If we have a specific task reference, get that task first
  if (referencedTaskId) {
    const referencedTask = await prisma.task.findFirst({
      where: { id: referencedTaskId, userId, repositoryId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        createdAt: true,
        completedAt: true,
        pullRequestUrl: true,
        affectedFiles: true,
        enhancedPlan: true,
      },
    });

    if (referencedTask && referencedTask.status === "completed") {
      // Use the referenced task's approach to find similar completed tasks
      const similarOptions: TaskSearchOptions = {
        ...options,
        includeCompleted: true,
        taskType: referencedTask.type as TaskType,
        excludeIds: [referencedTask.id],
      };

      const searchDescription = referencedTask.description + " " + (referencedTask.enhancedPlan || "");
      return findSimilarTasks(userId, repositoryId, searchDescription, undefined, similarOptions);
    }
  }

  // Otherwise, find completed tasks similar to the description
  return findSimilarTasks(userId, repositoryId, description, undefined, {
    ...options,
    includeCompleted: true,
  });
}

/**
 * Find potentially related issues that might be caused by the same root problem
 */
export async function findRelatedIssues(
  userId: string,
  repositoryId: string,
  description: string,
  affectedFiles: string[],
  options: TaskSearchOptions = {}
): Promise<SimilarTask[]> {
  // First, find tasks with overlapping affected files
  const tasksWithSameFiles = await prisma.task.findMany({
    where: {
      userId,
      repositoryId,
      type: "bugfix",
      status: { notIn: ["cancelled"] },
      // Check for file overlap using JSON array contains
      ...(affectedFiles.length > 0 && {
        OR: affectedFiles.slice(0, 5).map((file) => ({
          affectedFiles: { array_contains: file as any },
        })),
      }),
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      createdAt: true,
      completedAt: true,
      pullRequestUrl: true,
      affectedFiles: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Score by file overlap and description similarity
  const searchTokens = tokenize(description);
  const results: SimilarTask[] = [];

  for (const task of tasksWithSameFiles) {
    const taskAffectedFiles = (task.affectedFiles as string[]) || [];
    const fileOverlap = calculateFileOverlap(affectedFiles, taskAffectedFiles);
    const taskTokens = tokenize(task.title + " " + task.description);
    const textSimilarity = calculateTextSimilarity(searchTokens, taskTokens);

    // Higher weight on file overlap for related issues
    const overallScore = fileOverlap * 0.6 + textSimilarity * 0.4;

    if (overallScore >= (options.minSimilarity || 0.2)) {
      results.push({
        id: task.id,
        title: task.title,
        description: task.description,
        type: task.type as TaskType,
        priority: task.priority as TaskPriority,
        status: task.status,
        similarity: {
          overall: overallScore,
          textual: textSimilarity,
          component: fileOverlap,
          semantic: 0,
          temporal: 0,
          type: 1,
        },
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        pullRequestUrl: task.pullRequestUrl,
        affectedFiles: taskAffectedFiles,
      });
    }
  }

  return results
    .sort((a, b) => b.similarity.overall - a.similarity.overall)
    .slice(0, options.limit || DEFAULT_LIMIT);
}

/**
 * Search tasks by text query
 */
export async function searchTasks(
  userId: string,
  query: string,
  options: {
    repositoryId?: string;
    projectId?: string;
    limit?: number;
    status?: string[];
    type?: TaskType[];
  } = {}
): Promise<SimilarTask[]> {
  const { repositoryId, projectId, limit = 10, status, type } = options;

  // Build search query with proper status typing
  type TaskStatusValue = "pending" | "planning" | "in_progress" | "awaiting_input" | "planned" | "completed" | "failed" | "cancelled" | "partial_success";
  const statusValues = status as TaskStatusValue[] | undefined;

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      ...(repositoryId && { repositoryId }),
      ...(projectId && { projectId }),
      ...(statusValues && { status: { in: statusValues } }),
      ...(type && { type: { in: type } }),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      createdAt: true,
      completedAt: true,
      pullRequestUrl: true,
      affectedFiles: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Score results by relevance
  const searchTokens = tokenize(query);

  return tasks.map((task) => {
    const taskTokens = tokenize(task.title + " " + task.description);
    const textSimilarity = calculateTextSimilarity(searchTokens, taskTokens);

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type as TaskType,
      priority: task.priority as TaskPriority,
      status: task.status,
      similarity: {
        overall: textSimilarity,
        textual: textSimilarity,
        component: 0,
        semantic: 0,
        temporal: 0,
        type: 0,
      },
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      pullRequestUrl: task.pullRequestUrl,
      affectedFiles: (task.affectedFiles as string[]) || [],
    };
  }).sort((a, b) => b.similarity.overall - a.similarity.overall);
}

// ============================================================================
// Text Similarity Functions
// ============================================================================

function tokenize(text: string): TokenizedText {
  // Lowercase and split into tokens
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

  // Calculate frequencies
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  return { tokens, frequencies, length: tokens.length };
}

function calculateTextSimilarity(a: TokenizedText, b: TokenizedText): number {
  if (a.length === 0 || b.length === 0) return 0;

  // Calculate Jaccard similarity
  const setA = new Set(a.tokens);
  const setB = new Set(b.tokens);

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Calculate cosine similarity using term frequencies
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  const allTokens = new Set([...a.tokens, ...b.tokens]);
  for (const token of allTokens) {
    const freqA = a.frequencies.get(token) || 0;
    const freqB = b.frequencies.get(token) || 0;
    dotProduct += freqA * freqB;
    magnitudeA += freqA * freqA;
    magnitudeB += freqB * freqB;
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  const cosine = magnitude > 0 ? dotProduct / magnitude : 0;

  // Combine Jaccard and Cosine
  return jaccard * 0.5 + cosine * 0.5;
}

function calculateComponentSimilarity(description: string, affectedFiles: string[]): number {
  if (affectedFiles.length === 0) return 0;

  const lowerDescription = description.toLowerCase();
  let matchCount = 0;

  for (const file of affectedFiles) {
    // Extract filename and path components
    const parts = file.toLowerCase().split(/[/\\]/);
    const filename = parts[parts.length - 1]?.replace(/\.[^.]+$/, "") || "";

    // Check if any part is mentioned in the description
    if (parts.some((part) => part.length > 2 && lowerDescription.includes(part))) {
      matchCount++;
    } else if (filename && lowerDescription.includes(filename)) {
      matchCount++;
    }
  }

  return Math.min(matchCount / affectedFiles.length, 1);
}

function calculateFileOverlap(filesA: string[], filesB: string[]): number {
  if (filesA.length === 0 || filesB.length === 0) return 0;

  const setA = new Set(filesA.map((f) => f.toLowerCase()));
  const setB = new Set(filesB.map((f) => f.toLowerCase()));

  let intersection = 0;
  for (const file of setA) {
    if (setB.has(file)) {
      intersection++;
    }
  }

  // Use min-based overlap to handle cases where one set is much larger
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? intersection / minSize : 0;
}

// ============================================================================
// AI Semantic Similarity
// ============================================================================

async function calculateSemanticSimilarity(
  query: string,
  candidates: Array<{ id: string; title: string; description: string }>
): Promise<Record<string, number>> {
  if (candidates.length === 0) return {};

  const systemPrompt = `You are an AI assistant that evaluates semantic similarity between software development tasks.
Given a query task description and a list of candidate tasks, rate how semantically similar each candidate is to the query.
Consider:
- Similar intent (what the task is trying to accomplish)
- Similar domain/area (same part of the codebase)
- Similar problem type (bug vs feature vs refactor)
- Related technical concerns

Respond with a JSON object mapping task IDs to similarity scores (0-1):
{"taskId1": 0.85, "taskId2": 0.4, ...}

Only return the JSON object, no other text.`;

  const candidateList = candidates
    .map((c) => `ID: ${c.id}\nTitle: ${c.title}\nDescription: ${c.description.slice(0, 200)}`)
    .join("\n\n---\n\n");

  const userPrompt = `Query task description:
${query}

---

Candidate tasks:
${candidateList}`;

  try {
    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const scores = JSON.parse(jsonMatch[0]) as Record<string, number>;
      // Normalize scores to 0-1 range
      for (const key of Object.keys(scores)) {
        scores[key] = Math.max(0, Math.min(1, scores[key]));
      }
      return scores;
    }
  } catch (err) {
    console.error("Failed to parse semantic similarity scores:", err);
  }

  return {};
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateOverallScore(score: SimilarityScore): number {
  return (
    score.textual * SIMILARITY_WEIGHTS.textual +
    score.component * SIMILARITY_WEIGHTS.component +
    score.semantic * SIMILARITY_WEIGHTS.semantic +
    score.temporal * SIMILARITY_WEIGHTS.temporal +
    score.type * SIMILARITY_WEIGHTS.type
  );
}

function inferTaskType(description: string): TaskType {
  const lowerDescription = description.toLowerCase();

  const typeIndicators: Record<TaskType, string[]> = {
    bugfix: ["bug", "fix", "broken", "error", "crash", "failing", "issue"],
    feature: ["feature", "add", "new", "implement", "create", "build"],
    improvement: ["improve", "enhance", "better", "optimize", "update"],
    refactor: ["refactor", "restructure", "reorganize", "cleanup"],
    security: ["security", "vulnerability", "secure", "auth", "permission"],
  };

  let maxScore = 0;
  let inferredType: TaskType = "improvement";

  for (const [type, indicators] of Object.entries(typeIndicators)) {
    let score = 0;
    for (const indicator of indicators) {
      if (lowerDescription.includes(indicator)) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      inferredType = type as TaskType;
    }
  }

  return inferredType;
}

// ============================================================================
// Linking Functions
// ============================================================================

/**
 * Automatically find and suggest related tasks when creating a new task
 */
export async function suggestRelatedTasks(
  userId: string,
  repositoryId: string,
  title: string,
  description: string,
  projectId?: string
): Promise<{
  similarTasks: SimilarTask[];
  potentialDuplicates: SimilarTask[];
  relatedBugs: SimilarTask[];
}> {
  const fullDescription = `${title} ${description}`;

  // Find similar tasks
  const similarTasks = await findSimilarTasks(userId, repositoryId, fullDescription, projectId, {
    limit: 5,
    minSimilarity: 0.3,
    useAI: true,
  });

  // Filter potential duplicates (very high similarity)
  const potentialDuplicates = similarTasks.filter((t) => t.similarity.overall >= 0.7);

  // Find related bugs (for feature/improvement tasks)
  let relatedBugs: SimilarTask[] = [];
  const inferredType = inferTaskType(fullDescription);
  if (inferredType !== "bugfix") {
    relatedBugs = await findSimilarTasks(userId, repositoryId, fullDescription, projectId, {
      limit: 3,
      minSimilarity: 0.25,
      taskType: "bugfix",
      useAI: false, // Faster, rule-based
    });
  }

  return {
    similarTasks: similarTasks.filter((t) => t.similarity.overall < 0.7),
    potentialDuplicates,
    relatedBugs,
  };
}

/**
 * Get task context for "like we did in X" references
 */
export async function getTaskContext(
  userId: string,
  taskId: string
): Promise<{
  task: SimilarTask | null;
  approach: string | null;
  resolution: string | null;
}> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      createdAt: true,
      completedAt: true,
      pullRequestUrl: true,
      affectedFiles: true,
      enhancedPlan: true,
      approaches: true,
      selectedApproach: true,
    },
  });

  if (!task) {
    return { task: null, approach: null, resolution: null };
  }

  // Extract approach information
  let approach: string | null = null;
  if (task.approaches && task.selectedApproach !== null) {
    const approaches = task.approaches as any[];
    if (approaches[task.selectedApproach]) {
      const selected = approaches[task.selectedApproach];
      approach = `${selected.name}: ${selected.description}`;
    }
  }

  // Extract resolution information
  const resolution = task.status === "completed" && task.enhancedPlan
    ? task.enhancedPlan.slice(0, 500)
    : null;

  return {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type as TaskType,
      priority: task.priority as TaskPriority,
      status: task.status,
      similarity: {
        overall: 1,
        textual: 1,
        component: 1,
        semantic: 1,
        temporal: 1,
        type: 1,
      },
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      pullRequestUrl: task.pullRequestUrl,
      affectedFiles: (task.affectedFiles as string[]) || [],
    },
    approach,
    resolution,
  };
}
