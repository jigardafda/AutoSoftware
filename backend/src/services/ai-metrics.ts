/**
 * AI Metrics Service
 *
 * Implements Phase 5 AI Self-Improvement:
 * 1. Track AI accuracy metrics (correct predictions, false positives, false negatives)
 * 2. Calculate success rates per task type, repository, and time period
 * 3. Store metrics in database
 * 4. Aggregate and trend analysis
 * 5. Automatic prompt refinement suggestions based on failure patterns
 */

import { prisma } from "../db.js";
import { simpleQuery } from "./claude-query.js";

// ============================================================================
// Types
// ============================================================================

export interface AIMetricData {
  id: string;
  metricType: MetricType;
  entityType: EntityType;
  entityId?: string;
  value: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type MetricType =
  | "accuracy"
  | "false_positive"
  | "false_negative"
  | "execution_success"
  | "precision"
  | "recall"
  | "f1_score";

export type EntityType = "task" | "scan" | "finding" | "suggestion" | "plan";

export interface AIFeedbackData {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  feedbackType: FeedbackType;
  comment?: string;
  createdAt: Date;
}

export type FeedbackType = "thumbs_up" | "thumbs_down" | "false_positive" | "helpful" | "not_helpful" | "incorrect";

export interface PromptRefinementData {
  id: string;
  category: PromptCategory;
  originalPattern: string;
  suggestedChange: string;
  reason: string;
  failureCount: number;
  appliedAt?: Date;
  createdAt: Date;
}

export type PromptCategory = "scan" | "plan" | "execute" | "analyze" | "review";

export interface AccuracyMetrics {
  overall: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
}

export interface AccuracyBreakdown {
  byTaskType: Record<string, AccuracyMetrics>;
  byRepository: Record<string, AccuracyMetrics>;
  byFindingType: Record<string, AccuracyMetrics>;
  byTimeperiod: { date: string; metrics: AccuracyMetrics }[];
}

export interface TrendData {
  date: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  executionSuccess: number;
}

export interface PromptSuggestion {
  id: string;
  category: PromptCategory;
  currentIssue: string;
  suggestedFix: string;
  expectedImprovement: number;
  failurePatterns: string[];
  priority: "high" | "medium" | "low";
  createdAt: Date;
}

export interface MetricsOverview {
  overallAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  executionSuccessRate: number;
  totalFeedback: number;
  positiveFeedbackRate: number;
  activeSuggestions: number;
  trend: "improving" | "stable" | "degrading";
  trendPercentage: number;
}

// ============================================================================
// Metric Recording Functions
// ============================================================================

/**
 * Record an AI metric measurement
 */
export async function recordAIMetric(
  userId: string,
  metric: {
    metricType: MetricType;
    entityType: EntityType;
    entityId?: string;
    value: number;
    metadata?: Record<string, unknown>;
  }
): Promise<AIMetricData> {
  const record = await prisma.aIMetric.create({
    data: {
      userId,
      metricType: metric.metricType,
      entityType: metric.entityType,
      entityId: metric.entityId,
      value: metric.value,
      metadata: metric.metadata as any,
    },
  });

  return {
    id: record.id,
    metricType: record.metricType as MetricType,
    entityType: record.entityType as EntityType,
    entityId: record.entityId || undefined,
    value: record.value,
    metadata: record.metadata as Record<string, unknown>,
    createdAt: record.createdAt,
  };
}

/**
 * Record user feedback on AI output
 */
export async function recordAIFeedback(
  userId: string,
  feedback: {
    entityType: string;
    entityId: string;
    feedbackType: FeedbackType;
    comment?: string;
  }
): Promise<AIFeedbackData> {
  const record = await prisma.aIFeedback.create({
    data: {
      userId,
      entityType: feedback.entityType,
      entityId: feedback.entityId,
      feedbackType: feedback.feedbackType,
      comment: feedback.comment,
    },
  });

  // Trigger pattern analysis in background (fire-and-forget)
  // Don't await - let it run asynchronously so feedback returns immediately
  analyzeFailurePatterns(userId, feedback).catch((error) => {
    console.error("Background pattern analysis failed:", error);
  });

  return {
    id: record.id,
    userId: record.userId,
    entityType: record.entityType,
    entityId: record.entityId,
    feedbackType: record.feedbackType as FeedbackType,
    comment: record.comment || undefined,
    createdAt: record.createdAt,
  };
}

/**
 * Record task execution outcome for accuracy tracking
 */
export async function recordTaskOutcome(
  userId: string,
  taskId: string,
  outcome: {
    success: boolean;
    falsePositive?: boolean;
    falseNegative?: boolean;
    taskType: string;
    repositoryId: string;
    planWasAccurate: boolean;
    executionWasCorrect: boolean;
  }
): Promise<void> {
  // Record overall accuracy
  await recordAIMetric(userId, {
    metricType: "accuracy",
    entityType: "task",
    entityId: taskId,
    value: outcome.success ? 1 : 0,
    metadata: {
      taskType: outcome.taskType,
      repositoryId: outcome.repositoryId,
      planWasAccurate: outcome.planWasAccurate,
      executionWasCorrect: outcome.executionWasCorrect,
    },
  });

  // Record false positive if applicable
  if (outcome.falsePositive) {
    await recordAIMetric(userId, {
      metricType: "false_positive",
      entityType: "task",
      entityId: taskId,
      value: 1,
      metadata: { taskType: outcome.taskType, repositoryId: outcome.repositoryId },
    });
  }

  // Record false negative if applicable
  if (outcome.falseNegative) {
    await recordAIMetric(userId, {
      metricType: "false_negative",
      entityType: "task",
      entityId: taskId,
      value: 1,
      metadata: { taskType: outcome.taskType, repositoryId: outcome.repositoryId },
    });
  }

  // Record execution success
  await recordAIMetric(userId, {
    metricType: "execution_success",
    entityType: "task",
    entityId: taskId,
    value: outcome.executionWasCorrect ? 1 : 0,
    metadata: { taskType: outcome.taskType, repositoryId: outcome.repositoryId },
  });
}

/**
 * Record scan finding accuracy
 */
export async function recordScanFindingAccuracy(
  userId: string,
  findingId: string,
  outcome: {
    wasAccurate: boolean;
    falsePositive: boolean;
    findingType: string;
    repositoryId: string;
    scanId: string;
  }
): Promise<void> {
  await recordAIMetric(userId, {
    metricType: outcome.wasAccurate ? "accuracy" : "false_positive",
    entityType: "finding",
    entityId: findingId,
    value: 1,
    metadata: {
      findingType: outcome.findingType,
      repositoryId: outcome.repositoryId,
      scanId: outcome.scanId,
      falsePositive: outcome.falsePositive,
    },
  });
}

// ============================================================================
// Metric Retrieval Functions
// ============================================================================

/**
 * Get overall AI metrics overview
 */
export async function getMetricsOverview(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<MetricsOverview> {
  const dateFilter = buildDateFilter(options.startDate, options.endDate);

  // Get accuracy metrics
  const accuracyMetrics = await prisma.aIMetric.aggregate({
    where: {
      userId,
      metricType: "accuracy",
      ...dateFilter,
    },
    _avg: { value: true },
    _count: true,
  });

  // Get false positive metrics
  const fpMetrics = await prisma.aIMetric.count({
    where: {
      userId,
      metricType: "false_positive",
      ...dateFilter,
    },
  });

  // Get execution success metrics
  const execMetrics = await prisma.aIMetric.aggregate({
    where: {
      userId,
      metricType: "execution_success",
      ...dateFilter,
    },
    _avg: { value: true },
    _count: true,
  });

  // Get feedback stats
  const [totalFeedback, positiveFeedback] = await Promise.all([
    prisma.aIFeedback.count({
      where: { userId, ...dateFilter },
    }),
    prisma.aIFeedback.count({
      where: { userId, feedbackType: { in: ["thumbs_up", "helpful"] }, ...dateFilter },
    }),
  ]);

  // Get active suggestions count
  const activeSuggestions = await prisma.promptRefinement.count({
    where: { appliedAt: null },
  });

  // Calculate precision and recall
  const totalPredictions = accuracyMetrics._count || 1;
  const correctPredictions = (accuracyMetrics._avg.value || 0) * totalPredictions;
  const precision = totalPredictions > 0 ? (correctPredictions / (correctPredictions + fpMetrics)) : 0;
  const recall = accuracyMetrics._avg.value || 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Calculate trend
  const trend = await calculateTrend(userId, dateFilter);

  return {
    overallAccuracy: Math.round((accuracyMetrics._avg.value || 0) * 100),
    precision: Math.round(precision * 100),
    recall: Math.round(recall * 100),
    f1Score: Math.round(f1Score * 100),
    falsePositiveRate: totalPredictions > 0 ? Math.round((fpMetrics / totalPredictions) * 100) : 0,
    executionSuccessRate: Math.round((execMetrics._avg.value || 0) * 100),
    totalFeedback,
    positiveFeedbackRate: totalFeedback > 0 ? Math.round((positiveFeedback / totalFeedback) * 100) : 0,
    activeSuggestions,
    trend: trend.direction,
    trendPercentage: trend.percentage,
  };
}

/**
 * Get accuracy breakdown by type, repository, and time
 */
export async function getAccuracyBreakdown(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<AccuracyBreakdown> {
  const dateFilter = buildDateFilter(options.startDate, options.endDate);

  // Get all accuracy metrics with metadata
  const metrics = await prisma.aIMetric.findMany({
    where: {
      userId,
      metricType: { in: ["accuracy", "false_positive", "false_negative"] },
      ...dateFilter,
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by task type
  const byTaskType = groupMetricsByField(metrics, "taskType");

  // Group by repository
  const byRepository = groupMetricsByField(metrics, "repositoryId");

  // Group by finding type (for scan findings)
  const byFindingType = groupMetricsByField(metrics, "findingType");

  // Group by time period
  const byTimeperiod = groupMetricsByTime(metrics);

  return {
    byTaskType,
    byRepository,
    byFindingType,
    byTimeperiod,
  };
}

/**
 * Get false positive rate tracking
 */
export async function getFalsePositiveTracking(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    groupBy?: "day" | "week" | "month";
  } = {}
): Promise<{ date: string; rate: number; count: number; total: number }[]> {
  const dateFilter = buildDateFilter(options.startDate, options.endDate);
  const groupBy = options.groupBy || "day";

  const [fpMetrics, allMetrics] = await Promise.all([
    prisma.aIMetric.findMany({
      where: { userId, metricType: "false_positive", ...dateFilter },
      select: { createdAt: true, value: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aIMetric.findMany({
      where: { userId, metricType: "accuracy", ...dateFilter },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Group by time period
  const fpGrouped = new Map<string, number>();
  const totalGrouped = new Map<string, number>();

  for (const fp of fpMetrics) {
    const key = formatDateKey(fp.createdAt, groupBy);
    fpGrouped.set(key, (fpGrouped.get(key) || 0) + fp.value);
  }

  for (const metric of allMetrics) {
    const key = formatDateKey(metric.createdAt, groupBy);
    totalGrouped.set(key, (totalGrouped.get(key) || 0) + 1);
  }

  // Combine into rate data
  const allDates = new Set([...fpGrouped.keys(), ...totalGrouped.keys()]);
  const result = Array.from(allDates)
    .sort()
    .map((date) => {
      const fpCount = fpGrouped.get(date) || 0;
      const total = totalGrouped.get(date) || 1;
      return {
        date,
        rate: Math.round((fpCount / total) * 100),
        count: fpCount,
        total,
      };
    });

  return result;
}

/**
 * Get execution success rate by task type
 */
export async function getExecutionSuccessRate(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{ taskType: string; successRate: number; total: number; successful: number }[]> {
  const dateFilter = buildDateFilter(options.startDate, options.endDate);

  const metrics = await prisma.aIMetric.findMany({
    where: { userId, metricType: "execution_success", ...dateFilter },
    select: { value: true, metadata: true },
  });

  // Group by task type
  const byTaskType = new Map<string, { success: number; total: number }>();

  for (const metric of metrics) {
    const metadata = metric.metadata as any;
    const taskType = metadata?.taskType || "unknown";
    const existing = byTaskType.get(taskType) || { success: 0, total: 0 };
    existing.success += metric.value;
    existing.total += 1;
    byTaskType.set(taskType, existing);
  }

  return Array.from(byTaskType.entries())
    .map(([taskType, data]) => ({
      taskType,
      successRate: Math.round((data.success / data.total) * 100),
      total: data.total,
      successful: data.success,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Get time-series trends
 */
export async function getMetricsTrends(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    groupBy?: "day" | "week" | "month";
  } = {}
): Promise<TrendData[]> {
  const dateFilter = buildDateFilter(options.startDate, options.endDate);
  const groupBy = options.groupBy || "day";

  const metrics = await prisma.aIMetric.findMany({
    where: { userId, ...dateFilter },
    select: { metricType: true, value: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group metrics by date and type
  const grouped = new Map<string, Map<string, { sum: number; count: number }>>();

  for (const metric of metrics) {
    const dateKey = formatDateKey(metric.createdAt, groupBy);
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, new Map());
    }
    const typeMap = grouped.get(dateKey)!;
    const existing = typeMap.get(metric.metricType) || { sum: 0, count: 0 };
    existing.sum += metric.value;
    existing.count += 1;
    typeMap.set(metric.metricType, existing);
  }

  // Convert to trend data
  return Array.from(grouped.entries())
    .map(([date, typeMap]) => {
      const accuracyData = typeMap.get("accuracy") || { sum: 0, count: 1 };
      const fpData = typeMap.get("false_positive") || { sum: 0, count: 0 };
      const execData = typeMap.get("execution_success") || { sum: 0, count: 1 };

      const accuracy = accuracyData.sum / accuracyData.count;
      const fpRate = fpData.count > 0 ? fpData.sum / accuracyData.count : 0;
      const precision = accuracy > 0 ? accuracy / (accuracy + fpRate) : 0;
      const recall = accuracy;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      return {
        date,
        accuracy: Math.round(accuracy * 100),
        precision: Math.round(precision * 100),
        recall: Math.round(recall * 100),
        f1Score: Math.round(f1 * 100),
        falsePositiveRate: Math.round(fpRate * 100),
        executionSuccess: Math.round((execData.sum / execData.count) * 100),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get recent feedback
 */
export async function getRecentFeedback(
  userId: string,
  options: {
    limit?: number;
    feedbackType?: FeedbackType;
  } = {}
): Promise<AIFeedbackData[]> {
  const { limit = 20, feedbackType } = options;

  const feedback = await prisma.aIFeedback.findMany({
    where: {
      userId,
      ...(feedbackType && { feedbackType }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return feedback.map((f) => ({
    id: f.id,
    userId: f.userId,
    entityType: f.entityType,
    entityId: f.entityId,
    feedbackType: f.feedbackType as FeedbackType,
    comment: f.comment || undefined,
    createdAt: f.createdAt,
  }));
}

// ============================================================================
// Prompt Refinement Functions
// ============================================================================

/**
 * Get prompt refinement suggestions
 */
export async function getPromptSuggestions(
  options: {
    category?: PromptCategory;
    minFailureCount?: number;
    excludeApplied?: boolean;
  } = {}
): Promise<PromptSuggestion[]> {
  const { category, minFailureCount = 3, excludeApplied = true } = options;

  const refinements = await prisma.promptRefinement.findMany({
    where: {
      ...(category && { category }),
      failureCount: { gte: minFailureCount },
      ...(excludeApplied && { appliedAt: null }),
    },
    orderBy: [{ failureCount: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  return refinements.map((r) => ({
    id: r.id,
    category: r.category as PromptCategory,
    currentIssue: r.originalPattern,
    suggestedFix: r.suggestedChange,
    expectedImprovement: Math.min(30, r.failureCount * 5), // Estimate improvement based on failure frequency
    failurePatterns: [], // Would be populated from metadata
    priority: r.failureCount >= 10 ? "high" : r.failureCount >= 5 ? "medium" : "low",
    createdAt: r.createdAt,
  }));
}

/**
 * Apply a prompt refinement suggestion
 */
export async function applyPromptRefinement(
  refinementId: string
): Promise<PromptRefinementData> {
  const refinement = await prisma.promptRefinement.update({
    where: { id: refinementId },
    data: { appliedAt: new Date() },
  });

  return {
    id: refinement.id,
    category: refinement.category as PromptCategory,
    originalPattern: refinement.originalPattern,
    suggestedChange: refinement.suggestedChange,
    reason: refinement.reason,
    failureCount: refinement.failureCount,
    appliedAt: refinement.appliedAt || undefined,
    createdAt: refinement.createdAt,
  };
}

/**
 * Get applied refinement history
 */
export async function getRefinementHistory(
  options: {
    category?: PromptCategory;
    limit?: number;
  } = {}
): Promise<PromptRefinementData[]> {
  const { category, limit = 20 } = options;

  const refinements = await prisma.promptRefinement.findMany({
    where: {
      ...(category && { category }),
      appliedAt: { not: null },
    },
    orderBy: { appliedAt: "desc" },
    take: limit,
  });

  return refinements.map((r) => ({
    id: r.id,
    category: r.category as PromptCategory,
    originalPattern: r.originalPattern,
    suggestedChange: r.suggestedChange,
    reason: r.reason,
    failureCount: r.failureCount,
    appliedAt: r.appliedAt || undefined,
    createdAt: r.createdAt,
  }));
}

// ============================================================================
// Pattern Analysis Functions
// ============================================================================

/**
 * Analyze failure patterns from feedback and generate refinement suggestions
 */
async function analyzeFailurePatterns(
  userId: string,
  feedback: {
    entityType: string;
    entityId: string;
    feedbackType: FeedbackType;
    comment?: string;
  }
): Promise<void> {
  // Only analyze negative feedback
  if (!["thumbs_down", "false_positive", "not_helpful", "incorrect"].includes(feedback.feedbackType)) {
    return;
  }

  try {
    // Get recent negative feedback for pattern analysis
    const recentNegative = await prisma.aIFeedback.findMany({
      where: {
        userId,
        feedbackType: { in: ["thumbs_down", "false_positive", "not_helpful", "incorrect"] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (recentNegative.length < 3) {
      return; // Not enough data for pattern analysis
    }

    // Get entity details for context
    let entityContext = "";
    if (feedback.entityType === "task") {
      const task = await prisma.task.findUnique({
        where: { id: feedback.entityId },
        select: { title: true, type: true, enhancedPlan: true },
      });
      entityContext = task
        ? `Task: "${task.title}" (${task.type})\nPlan: ${task.enhancedPlan || "N/A"}`
        : "";
    } else if (feedback.entityType === "scan_finding") {
      const finding = await prisma.scanResult.findUnique({
        where: { id: feedback.entityId },
        select: { title: true, description: true, severity: true },
      });
      entityContext = finding
        ? `Finding: "${finding.title}" (${finding.severity})\nDescription: ${finding.description}`
        : "";
    }

    // Use AI to analyze patterns
    const systemPrompt = `You are an AI system analyzer. Analyze patterns in user feedback to identify systematic issues and suggest prompt improvements.

Return a JSON object with:
{
  "patterns": [
    {
      "category": "scan|plan|execute|analyze|review",
      "issue": "Description of the systematic issue",
      "suggestedFix": "Specific prompt change to address this",
      "reason": "Why this fix should help",
      "confidence": 0.0-1.0
    }
  ]
}

Only include patterns with confidence > 0.6.`;

    const userPrompt = `Recent negative feedback (${recentNegative.length} items):
${recentNegative.map((f) => `- ${f.feedbackType}: ${f.comment || "no comment"} (${f.entityType})`).join("\n")}

Current feedback context:
${entityContext}
User comment: ${feedback.comment || "none"}

Identify systematic patterns and suggest improvements.`;

    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.patterns || !Array.isArray(parsed.patterns)) return;

    // Store identified patterns as refinement suggestions
    for (const pattern of parsed.patterns) {
      if (pattern.confidence < 0.6) continue;

      await upsertPromptRefinement({
        category: pattern.category as PromptCategory,
        originalPattern: pattern.issue,
        suggestedChange: pattern.suggestedFix,
        reason: pattern.reason,
      });
    }
  } catch (error) {
    console.error("Failed to analyze failure patterns:", error);
  }
}

/**
 * Upsert a prompt refinement suggestion
 */
async function upsertPromptRefinement(data: {
  category: PromptCategory;
  originalPattern: string;
  suggestedChange: string;
  reason: string;
}): Promise<void> {
  // Look for existing similar refinement
  const existing = await prisma.promptRefinement.findFirst({
    where: {
      category: data.category,
      originalPattern: { contains: data.originalPattern.substring(0, 50) },
      appliedAt: null,
    },
  });

  if (existing) {
    // Increment failure count
    await prisma.promptRefinement.update({
      where: { id: existing.id },
      data: { failureCount: { increment: 1 } },
    });
  } else {
    // Create new refinement suggestion
    await prisma.promptRefinement.create({
      data: {
        category: data.category,
        originalPattern: data.originalPattern,
        suggestedChange: data.suggestedChange,
        reason: data.reason,
        failureCount: 1,
      },
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildDateFilter(startDate?: Date, endDate?: Date): any {
  const filter: any = {};
  if (startDate) filter.createdAt = { ...filter.createdAt, gte: startDate };
  if (endDate) filter.createdAt = { ...filter.createdAt, lte: endDate };
  return Object.keys(filter).length > 0 ? filter : {};
}

function formatDateKey(date: Date, groupBy: string): string {
  const d = new Date(date);
  if (groupBy === "day") {
    return d.toISOString().split("T")[0];
  } else if (groupBy === "week") {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().split("T")[0];
  } else {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
}

function groupMetricsByField(
  metrics: any[],
  field: string
): Record<string, AccuracyMetrics> {
  const grouped = new Map<string, { tp: number; fp: number; fn: number; total: number }>();

  for (const metric of metrics) {
    const metadata = metric.metadata as any;
    const key = metadata?.[field] || "unknown";
    const existing = grouped.get(key) || { tp: 0, fp: 0, fn: 0, total: 0 };

    if (metric.metricType === "accuracy") {
      if (metric.value === 1) existing.tp += 1;
      existing.total += 1;
    } else if (metric.metricType === "false_positive") {
      existing.fp += metric.value;
    } else if (metric.metricType === "false_negative") {
      existing.fn += metric.value;
    }

    grouped.set(key, existing);
  }

  const result: Record<string, AccuracyMetrics> = {};
  for (const [key, data] of grouped) {
    const precision = data.tp > 0 ? data.tp / (data.tp + data.fp) : 0;
    const recall = data.tp > 0 ? data.tp / (data.tp + data.fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    result[key] = {
      overall: data.total > 0 ? Math.round((data.tp / data.total) * 100) : 0,
      precision: Math.round(precision * 100),
      recall: Math.round(recall * 100),
      f1Score: Math.round(f1 * 100),
      falsePositiveRate: data.total > 0 ? Math.round((data.fp / data.total) * 100) : 0,
      falseNegativeRate: data.total > 0 ? Math.round((data.fn / data.total) * 100) : 0,
      totalPredictions: data.total,
      correctPredictions: data.tp,
      incorrectPredictions: data.fp + data.fn,
    };
  }

  return result;
}

function groupMetricsByTime(
  metrics: any[]
): { date: string; metrics: AccuracyMetrics }[] {
  const grouped = new Map<string, { tp: number; fp: number; fn: number; total: number }>();

  for (const metric of metrics) {
    const key = formatDateKey(metric.createdAt, "day");
    const existing = grouped.get(key) || { tp: 0, fp: 0, fn: 0, total: 0 };

    if (metric.metricType === "accuracy") {
      if (metric.value === 1) existing.tp += 1;
      existing.total += 1;
    } else if (metric.metricType === "false_positive") {
      existing.fp += metric.value;
    } else if (metric.metricType === "false_negative") {
      existing.fn += metric.value;
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .map(([date, data]) => {
      const precision = data.tp > 0 ? data.tp / (data.tp + data.fp) : 0;
      const recall = data.tp > 0 ? data.tp / (data.tp + data.fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      return {
        date,
        metrics: {
          overall: data.total > 0 ? Math.round((data.tp / data.total) * 100) : 0,
          precision: Math.round(precision * 100),
          recall: Math.round(recall * 100),
          f1Score: Math.round(f1 * 100),
          falsePositiveRate: data.total > 0 ? Math.round((data.fp / data.total) * 100) : 0,
          falseNegativeRate: data.total > 0 ? Math.round((data.fn / data.total) * 100) : 0,
          totalPredictions: data.total,
          correctPredictions: data.tp,
          incorrectPredictions: data.fp + data.fn,
        },
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function calculateTrend(
  userId: string,
  dateFilter: any
): Promise<{ direction: "improving" | "stable" | "degrading"; percentage: number }> {
  // Get metrics from last 7 days vs previous 7 days
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [recentMetrics, previousMetrics] = await Promise.all([
    prisma.aIMetric.aggregate({
      where: {
        userId,
        metricType: "accuracy",
        createdAt: { gte: weekAgo, lte: now },
      },
      _avg: { value: true },
    }),
    prisma.aIMetric.aggregate({
      where: {
        userId,
        metricType: "accuracy",
        createdAt: { gte: twoWeeksAgo, lt: weekAgo },
      },
      _avg: { value: true },
    }),
  ]);

  const recentAccuracy = recentMetrics._avg.value || 0;
  const previousAccuracy = previousMetrics._avg.value || 0;

  if (previousAccuracy === 0) {
    return { direction: "stable", percentage: 0 };
  }

  const change = ((recentAccuracy - previousAccuracy) / previousAccuracy) * 100;

  if (change > 5) {
    return { direction: "improving", percentage: Math.round(change) };
  } else if (change < -5) {
    return { direction: "degrading", percentage: Math.round(Math.abs(change)) };
  }

  return { direction: "stable", percentage: Math.round(Math.abs(change)) };
}
