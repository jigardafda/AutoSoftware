/**
 * Feedback Learning Service
 *
 * Implements Phase 5 Feedback Loops:
 * 1. Learn from PR review comments
 * 2. "This fix was rejected because..." memory
 * 3. User thumbs up/down on suggestions
 * 4. A/B test different approaches, measure success
 */

import { prisma } from "../db.js";
import { simpleQuery } from "./claude-query.js";

// ============================================================================
// Types
// ============================================================================

export interface FeedbackSignal {
  id: string;
  type: FeedbackType;
  rating: "positive" | "negative" | "neutral";
  context: FeedbackContext;
  metadata: Record<string, unknown>;
  learnedPattern?: LearnedPattern;
  createdAt: Date;
}

export type FeedbackType =
  | "thumbs_up"
  | "thumbs_down"
  | "pr_approved"
  | "pr_rejected"
  | "pr_comment"
  | "task_success"
  | "task_failure"
  | "approach_selected"
  | "approach_rejected";

export interface FeedbackContext {
  taskId?: string;
  repositoryId: string;
  projectId?: string;
  pullRequestUrl?: string;
  approachIndex?: number;
  suggestionType?: string;
  codeContext?: string;
  filePath?: string;
}

export interface LearnedPattern {
  id: string;
  pattern: string;
  category: PatternCategory;
  confidence: number;
  usageCount: number;
  lastUsed: Date;
  projectId?: string;
  repositoryId?: string;
}

export type PatternCategory =
  | "coding_style"
  | "architecture"
  | "naming_convention"
  | "error_handling"
  | "testing_preference"
  | "documentation"
  | "rejection_reason"
  | "approach_preference";

export interface RejectionMemory {
  id: string;
  repositoryId: string;
  projectId?: string;
  rejectionReason: string;
  context: string;
  fixAttempted: string;
  learnedAction: string;
  confidence: number;
  occurrences: number;
  lastOccurred: Date;
  createdAt: Date;
}

export interface ABTestResult {
  id: string;
  experimentId: string;
  variant: "A" | "B";
  approachName: string;
  metrics: ABTestMetrics;
  isWinner: boolean;
  createdAt: Date;
}

export interface ABTestMetrics {
  successRate: number;
  averageExecutionTime: number;
  prApprovalRate: number;
  userSatisfactionScore: number;
  codeQualityScore: number;
  revisionCount: number;
}

export interface ABExperiment {
  id: string;
  name: string;
  description: string;
  repositoryId?: string;
  projectId?: string;
  status: "active" | "completed" | "cancelled";
  variantA: ExperimentVariant;
  variantB: ExperimentVariant;
  results: {
    variantA: ABTestMetrics;
    variantB: ABTestMetrics;
  };
  winner?: "A" | "B" | "tie";
  sampleSize: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface ExperimentVariant {
  name: string;
  description: string;
  configuration: Record<string, unknown>;
}

export interface PRReviewComment {
  id: string;
  pullRequestUrl: string;
  author: string;
  body: string;
  path?: string;
  line?: number;
  sentiment: "positive" | "negative" | "neutral" | "suggestion";
  category?: string;
  createdAt: Date;
}

export interface FeedbackSummary {
  totalFeedback: number;
  positiveRate: number;
  topPatterns: LearnedPattern[];
  recentRejections: RejectionMemory[];
  activeExperiments: ABExperiment[];
  improvementSuggestions: string[];
}

// ============================================================================
// Feedback Recording
// ============================================================================

/**
 * Record user feedback (thumbs up/down) on a suggestion
 */
export async function recordUserFeedback(
  userId: string,
  feedback: {
    type: "thumbs_up" | "thumbs_down";
    taskId?: string;
    messageId?: string;
    repositoryId: string;
    projectId?: string;
    suggestionType: string;
    context?: string;
    note?: string;
  }
): Promise<FeedbackSignal> {
  const signal = await prisma.feedbackSignal.create({
    data: {
      userId,
      type: feedback.type,
      rating: feedback.type === "thumbs_up" ? "positive" : "negative",
      taskId: feedback.taskId,
      messageId: feedback.messageId,
      repositoryId: feedback.repositoryId,
      projectId: feedback.projectId,
      suggestionType: feedback.suggestionType,
      context: feedback.context || "",
      note: feedback.note,
      metadata: {},
    },
  });

  // Trigger learning from this feedback
  await learnFromFeedback(signal);

  return {
    id: signal.id,
    type: signal.type as FeedbackType,
    rating: signal.rating as "positive" | "negative" | "neutral",
    context: {
      taskId: signal.taskId || undefined,
      repositoryId: signal.repositoryId,
      projectId: signal.projectId || undefined,
      suggestionType: signal.suggestionType,
    },
    metadata: signal.metadata as Record<string, unknown>,
    createdAt: signal.createdAt,
  };
}

/**
 * Record PR review result (approved, rejected, or with comments)
 */
export async function recordPRReviewResult(
  userId: string,
  feedback: {
    taskId: string;
    pullRequestUrl: string;
    repositoryId: string;
    projectId?: string;
    result: "approved" | "rejected" | "changes_requested";
    comments?: PRReviewComment[];
    reviewerNotes?: string;
  }
): Promise<FeedbackSignal> {
  const type: FeedbackType =
    feedback.result === "approved" ? "pr_approved" : "pr_rejected";
  const rating =
    feedback.result === "approved"
      ? "positive"
      : feedback.result === "rejected"
        ? "negative"
        : "neutral";

  const signal = await prisma.feedbackSignal.create({
    data: {
      userId,
      type,
      rating,
      taskId: feedback.taskId,
      repositoryId: feedback.repositoryId,
      projectId: feedback.projectId,
      pullRequestUrl: feedback.pullRequestUrl,
      context: feedback.reviewerNotes || "",
      metadata: {
        result: feedback.result,
        commentCount: feedback.comments?.length || 0,
        comments: feedback.comments || [],
      } as any,
    },
  });

  // Store rejection reason if rejected
  if (feedback.result !== "approved" && feedback.comments) {
    await storeRejectionReason(userId, {
      repositoryId: feedback.repositoryId,
      projectId: feedback.projectId,
      taskId: feedback.taskId,
      comments: feedback.comments,
      reviewerNotes: feedback.reviewerNotes,
    });
  }

  // Learn from PR comments
  if (feedback.comments && feedback.comments.length > 0) {
    await learnFromPRComments(userId, feedback.repositoryId, feedback.comments);
  }

  return {
    id: signal.id,
    type: signal.type as FeedbackType,
    rating: signal.rating as "positive" | "negative" | "neutral",
    context: {
      taskId: signal.taskId || undefined,
      repositoryId: signal.repositoryId,
      projectId: signal.projectId || undefined,
      pullRequestUrl: signal.pullRequestUrl || undefined,
    },
    metadata: signal.metadata as Record<string, unknown>,
    createdAt: signal.createdAt,
  };
}

/**
 * Record approach selection/rejection
 */
export async function recordApproachFeedback(
  userId: string,
  feedback: {
    taskId: string;
    repositoryId: string;
    projectId?: string;
    approachIndex: number;
    selected: boolean;
    reason?: string;
    approachDetails: {
      name: string;
      description: string;
      complexity: string;
    };
  }
): Promise<FeedbackSignal> {
  const signal = await prisma.feedbackSignal.create({
    data: {
      userId,
      type: feedback.selected ? "approach_selected" : "approach_rejected",
      rating: feedback.selected ? "positive" : "negative",
      taskId: feedback.taskId,
      repositoryId: feedback.repositoryId,
      projectId: feedback.projectId,
      approachIndex: feedback.approachIndex,
      context: feedback.reason || "",
      metadata: {
        approachDetails: feedback.approachDetails,
      },
    },
  });

  // Learn from approach preference
  await learnFromApproachFeedback(userId, feedback);

  return {
    id: signal.id,
    type: signal.type as FeedbackType,
    rating: signal.rating as "positive" | "negative" | "neutral",
    context: {
      taskId: signal.taskId || undefined,
      repositoryId: signal.repositoryId,
      projectId: signal.projectId || undefined,
      approachIndex: signal.approachIndex || undefined,
    },
    metadata: signal.metadata as Record<string, unknown>,
    createdAt: signal.createdAt,
  };
}

// ============================================================================
// Learning Functions
// ============================================================================

/**
 * Learn patterns from feedback signals
 */
async function learnFromFeedback(signal: any): Promise<void> {
  // Skip if no context
  if (!signal.context && !signal.suggestionType) return;

  // Use AI to extract patterns from feedback
  const systemPrompt = `You are an AI learning system analyzing user feedback to improve code suggestions.
Extract actionable patterns from the feedback that can guide future suggestions.

Respond with a JSON object:
{
  "patterns": [
    {
      "pattern": "Description of what the user prefers/dislikes",
      "category": "coding_style|architecture|naming_convention|error_handling|testing_preference|documentation",
      "confidence": 0.0-1.0,
      "actionable": "What to do differently next time"
    }
  ]
}`;

  const userPrompt = `Feedback type: ${signal.type}
Rating: ${signal.rating}
Suggestion type: ${signal.suggestionType || "general"}
Context: ${signal.context || "none provided"}
Note: ${signal.note || "none"}

Extract patterns from this feedback.`;

  try {
    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.patterns || !Array.isArray(parsed.patterns)) return;

    // Store learned patterns
    for (const pattern of parsed.patterns) {
      await upsertLearnedPattern(
        signal.userId,
        signal.repositoryId,
        signal.projectId,
        {
          pattern: pattern.pattern,
          category: pattern.category as PatternCategory,
          confidence: pattern.confidence,
          actionable: pattern.actionable,
        }
      );
    }
  } catch (error) {
    console.error("Failed to learn from feedback:", error);
  }
}

/**
 * Learn from PR review comments
 */
async function learnFromPRComments(
  userId: string,
  repositoryId: string,
  comments: PRReviewComment[]
): Promise<void> {
  if (comments.length === 0) return;

  const systemPrompt = `You are an AI learning system analyzing PR review comments.
Extract coding patterns, style preferences, and common issues from the comments.

Respond with a JSON object:
{
  "patterns": [
    {
      "pattern": "What the reviewer wants",
      "category": "coding_style|architecture|naming_convention|error_handling|testing_preference|documentation",
      "confidence": 0.0-1.0,
      "fromComment": "The original comment text"
    }
  ],
  "rejectionReasons": [
    {
      "reason": "Why code was rejected",
      "suggestedFix": "What should be done instead",
      "severity": "critical|major|minor"
    }
  ]
}`;

  const commentsText = comments
    .map(
      (c) =>
        `[${c.sentiment}] ${c.path ? `File: ${c.path}` : ""}\n${c.body}`
    )
    .join("\n\n");

  const userPrompt = `PR Review Comments:\n${commentsText}\n\nExtract learning patterns and rejection reasons.`;

  try {
    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);

    // Store patterns
    if (parsed.patterns && Array.isArray(parsed.patterns)) {
      for (const pattern of parsed.patterns) {
        await upsertLearnedPattern(userId, repositoryId, undefined, {
          pattern: pattern.pattern,
          category: pattern.category as PatternCategory,
          confidence: pattern.confidence,
          actionable: pattern.fromComment,
        });
      }
    }

    // Store rejection reasons
    if (parsed.rejectionReasons && Array.isArray(parsed.rejectionReasons)) {
      for (const rejection of parsed.rejectionReasons) {
        await upsertRejectionMemory(userId, repositoryId, undefined, {
          rejectionReason: rejection.reason,
          learnedAction: rejection.suggestedFix,
          severity: rejection.severity,
        });
      }
    }
  } catch (error) {
    console.error("Failed to learn from PR comments:", error);
  }
}

/**
 * Learn from approach selection patterns
 */
async function learnFromApproachFeedback(
  userId: string,
  feedback: {
    repositoryId: string;
    projectId?: string;
    selected: boolean;
    reason?: string;
    approachDetails: {
      name: string;
      description: string;
      complexity: string;
    };
  }
): Promise<void> {
  const pattern = feedback.selected
    ? `Prefer "${feedback.approachDetails.name}" approaches (${feedback.approachDetails.complexity} complexity)`
    : `Avoid "${feedback.approachDetails.name}" approaches`;

  await upsertLearnedPattern(userId, feedback.repositoryId, feedback.projectId, {
    pattern,
    category: "approach_preference",
    confidence: 0.7,
    actionable: feedback.reason || feedback.approachDetails.description,
  });
}

/**
 * Store a rejection reason in memory
 */
async function storeRejectionReason(
  userId: string,
  data: {
    repositoryId: string;
    projectId?: string;
    taskId: string;
    comments: PRReviewComment[];
    reviewerNotes?: string;
  }
): Promise<void> {
  // Get task details for context
  const task = await prisma.task.findUnique({
    where: { id: data.taskId },
    select: {
      title: true,
      description: true,
      enhancedPlan: true,
    },
  });

  const context = task
    ? `Task: ${task.title}\nDescription: ${task.description}`
    : "";
  const fixAttempted = task?.enhancedPlan || "";

  const negativeComments = data.comments.filter((c) => c.sentiment === "negative");
  const rejectionReason = negativeComments.length > 0
    ? negativeComments.map((c) => c.body).join("; ")
    : data.reviewerNotes || "Unknown rejection reason";

  await prisma.rejectionMemory.upsert({
    where: {
      userId_repositoryId_rejectionHash: {
        userId,
        repositoryId: data.repositoryId,
        rejectionHash: hashString(rejectionReason.substring(0, 200)),
      },
    },
    update: {
      occurrences: { increment: 1 },
      lastOccurred: new Date(),
    },
    create: {
      userId,
      repositoryId: data.repositoryId,
      projectId: data.projectId,
      rejectionReason,
      rejectionHash: hashString(rejectionReason.substring(0, 200)),
      context,
      fixAttempted,
      learnedAction: "", // Will be filled by AI analysis
      confidence: 0.5,
      occurrences: 1,
      lastOccurred: new Date(),
    },
  });
}

/**
 * Upsert a learned pattern
 */
async function upsertLearnedPattern(
  userId: string,
  repositoryId: string,
  projectId: string | undefined,
  data: {
    pattern: string;
    category: PatternCategory;
    confidence: number;
    actionable?: string;
  }
): Promise<void> {
  const patternHash = hashString(data.pattern.substring(0, 100));

  await prisma.learnedPattern.upsert({
    where: {
      userId_repositoryId_patternHash: {
        userId,
        repositoryId,
        patternHash,
      },
    },
    update: {
      confidence: {
        // Average with existing confidence
        set: data.confidence,
      },
      usageCount: { increment: 1 },
      lastUsed: new Date(),
    },
    create: {
      userId,
      repositoryId,
      projectId,
      pattern: data.pattern,
      patternHash,
      category: data.category,
      confidence: data.confidence,
      actionable: data.actionable,
      usageCount: 1,
      lastUsed: new Date(),
    },
  });
}

/**
 * Upsert a rejection memory
 */
async function upsertRejectionMemory(
  userId: string,
  repositoryId: string,
  projectId: string | undefined,
  data: {
    rejectionReason: string;
    learnedAction: string;
    severity?: string;
  }
): Promise<void> {
  const rejectionHash = hashString(data.rejectionReason.substring(0, 200));

  await prisma.rejectionMemory.upsert({
    where: {
      userId_repositoryId_rejectionHash: {
        userId,
        repositoryId,
        rejectionHash,
      },
    },
    update: {
      learnedAction: data.learnedAction,
      occurrences: { increment: 1 },
      lastOccurred: new Date(),
    },
    create: {
      userId,
      repositoryId,
      projectId,
      rejectionReason: data.rejectionReason,
      rejectionHash,
      context: "",
      fixAttempted: "",
      learnedAction: data.learnedAction,
      confidence: 0.6,
      occurrences: 1,
      lastOccurred: new Date(),
    },
  });
}

// ============================================================================
// Retrieval Functions
// ============================================================================

/**
 * Get learned patterns for a repository/project
 */
export async function getLearnedPatterns(
  userId: string,
  repositoryId: string,
  options: {
    projectId?: string;
    category?: PatternCategory;
    minConfidence?: number;
    limit?: number;
  } = {}
): Promise<LearnedPattern[]> {
  const { projectId, category, minConfidence = 0.5, limit = 20 } = options;

  const patterns = await prisma.learnedPattern.findMany({
    where: {
      userId,
      repositoryId,
      ...(projectId && { projectId }),
      ...(category && { category }),
      confidence: { gte: minConfidence },
    },
    orderBy: [{ usageCount: "desc" }, { confidence: "desc" }],
    take: limit,
  });

  return patterns.map((p) => ({
    id: p.id,
    pattern: p.pattern,
    category: p.category as PatternCategory,
    confidence: p.confidence,
    usageCount: p.usageCount,
    lastUsed: p.lastUsed,
    projectId: p.projectId || undefined,
    repositoryId: p.repositoryId,
  }));
}

/**
 * Get rejection memories for a repository/project
 */
export async function getRejectionMemories(
  userId: string,
  repositoryId: string,
  options: {
    projectId?: string;
    limit?: number;
  } = {}
): Promise<RejectionMemory[]> {
  const { projectId, limit = 10 } = options;

  const memories = await prisma.rejectionMemory.findMany({
    where: {
      userId,
      repositoryId,
      ...(projectId && { projectId }),
    },
    orderBy: [{ occurrences: "desc" }, { lastOccurred: "desc" }],
    take: limit,
  });

  return memories.map((m) => ({
    id: m.id,
    repositoryId: m.repositoryId,
    projectId: m.projectId || undefined,
    rejectionReason: m.rejectionReason,
    context: m.context,
    fixAttempted: m.fixAttempted,
    learnedAction: m.learnedAction,
    confidence: m.confidence,
    occurrences: m.occurrences,
    lastOccurred: m.lastOccurred,
    createdAt: m.createdAt,
  }));
}

/**
 * Get feedback context for task planning
 * This enriches AI prompts with learned patterns and rejection memories
 */
export async function getFeedbackContextForTask(
  userId: string,
  repositoryId: string,
  projectId?: string
): Promise<string> {
  const [patterns, rejections] = await Promise.all([
    getLearnedPatterns(userId, repositoryId, { projectId, limit: 10 }),
    getRejectionMemories(userId, repositoryId, { projectId, limit: 5 }),
  ]);

  if (patterns.length === 0 && rejections.length === 0) {
    return "";
  }

  let context = "\n## Learned Preferences and Patterns\n";

  if (patterns.length > 0) {
    context += "\n### User Preferences:\n";
    for (const pattern of patterns) {
      context += `- ${pattern.pattern} (confidence: ${Math.round(pattern.confidence * 100)}%)\n`;
    }
  }

  if (rejections.length > 0) {
    context += "\n### Previous Rejection Reasons (AVOID):\n";
    for (const rejection of rejections) {
      context += `- "${rejection.rejectionReason}"\n`;
      if (rejection.learnedAction) {
        context += `  Instead: ${rejection.learnedAction}\n`;
      }
    }
  }

  return context;
}

// ============================================================================
// A/B Testing
// ============================================================================

/**
 * Create a new A/B experiment
 */
export async function createABExperiment(
  userId: string,
  experiment: {
    name: string;
    description: string;
    repositoryId?: string;
    projectId?: string;
    variantA: ExperimentVariant;
    variantB: ExperimentVariant;
    sampleSize: number;
  }
): Promise<ABExperiment> {
  const exp = await prisma.aBExperiment.create({
    data: {
      userId,
      name: experiment.name,
      description: experiment.description,
      repositoryId: experiment.repositoryId,
      projectId: experiment.projectId,
      status: "active",
      variantA: experiment.variantA as any,
      variantB: experiment.variantB as any,
      sampleSize: experiment.sampleSize,
      currentSampleA: 0,
      currentSampleB: 0,
      resultsA: {
        successRate: 0,
        averageExecutionTime: 0,
        prApprovalRate: 0,
        userSatisfactionScore: 0,
        codeQualityScore: 0,
        revisionCount: 0,
      },
      resultsB: {
        successRate: 0,
        averageExecutionTime: 0,
        prApprovalRate: 0,
        userSatisfactionScore: 0,
        codeQualityScore: 0,
        revisionCount: 0,
      },
      startedAt: new Date(),
    },
  });

  return formatExperiment(exp);
}

/**
 * Get variant assignment for a task
 */
export async function getExperimentVariant(
  userId: string,
  repositoryId: string,
  experimentId: string
): Promise<"A" | "B" | null> {
  const experiment = await prisma.aBExperiment.findFirst({
    where: {
      id: experimentId,
      userId,
      status: "active",
    },
  });

  if (!experiment) return null;

  // Check if we've reached sample size
  const totalSamples = experiment.currentSampleA + experiment.currentSampleB;
  if (totalSamples >= experiment.sampleSize) {
    return null;
  }

  // Assign variant (alternate to balance)
  const variant: "A" | "B" =
    experiment.currentSampleA <= experiment.currentSampleB ? "A" : "B";

  // Update sample count
  await prisma.aBExperiment.update({
    where: { id: experimentId },
    data:
      variant === "A"
        ? { currentSampleA: { increment: 1 } }
        : { currentSampleB: { increment: 1 } },
  });

  return variant;
}

/**
 * Record A/B test result
 */
export async function recordABTestResult(
  userId: string,
  experimentId: string,
  result: {
    variant: "A" | "B";
    taskId: string;
    success: boolean;
    executionTimeMs: number;
    prApproved?: boolean;
    userSatisfaction?: number;
    codeQualityScore?: number;
    revisions?: number;
  }
): Promise<void> {
  const experiment = await prisma.aBExperiment.findFirst({
    where: { id: experimentId, userId },
  });

  if (!experiment) return;

  // Store the result
  await prisma.aBTestResult.create({
    data: {
      experimentId,
      userId,
      taskId: result.taskId,
      variant: result.variant,
      success: result.success,
      executionTimeMs: result.executionTimeMs,
      prApproved: result.prApproved,
      userSatisfaction: result.userSatisfaction,
      codeQualityScore: result.codeQualityScore,
      revisions: result.revisions || 0,
    },
  });

  // Recalculate aggregate metrics
  await recalculateExperimentMetrics(experimentId);
}

/**
 * Recalculate experiment metrics from all results
 */
async function recalculateExperimentMetrics(experimentId: string): Promise<void> {
  const results = await prisma.aBTestResult.findMany({
    where: { experimentId },
  });

  const variantAResults = results.filter((r) => r.variant === "A");
  const variantBResults = results.filter((r) => r.variant === "B");

  const calculateMetrics = (
    results: typeof variantAResults
  ): ABTestMetrics => {
    if (results.length === 0) {
      return {
        successRate: 0,
        averageExecutionTime: 0,
        prApprovalRate: 0,
        userSatisfactionScore: 0,
        codeQualityScore: 0,
        revisionCount: 0,
      };
    }

    const successCount = results.filter((r) => r.success).length;
    const prApproved = results.filter((r) => r.prApproved === true).length;
    const prTotal = results.filter((r) => r.prApproved !== null).length;

    return {
      successRate: successCount / results.length,
      averageExecutionTime:
        results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length,
      prApprovalRate: prTotal > 0 ? prApproved / prTotal : 0,
      userSatisfactionScore:
        results
          .filter((r) => r.userSatisfaction !== null)
          .reduce((sum, r) => sum + (r.userSatisfaction || 0), 0) /
          results.filter((r) => r.userSatisfaction !== null).length || 0,
      codeQualityScore:
        results
          .filter((r) => r.codeQualityScore !== null)
          .reduce((sum, r) => sum + (r.codeQualityScore || 0), 0) /
          results.filter((r) => r.codeQualityScore !== null).length || 0,
      revisionCount:
        results.reduce((sum, r) => sum + r.revisions, 0) / results.length,
    };
  };

  const metricsA = calculateMetrics(variantAResults);
  const metricsB = calculateMetrics(variantBResults);

  // Determine winner if we have enough samples
  const experiment = await prisma.aBExperiment.findUnique({
    where: { id: experimentId },
  });

  let winner: "A" | "B" | "tie" | undefined;
  let status = experiment?.status;

  if (experiment && variantAResults.length + variantBResults.length >= experiment.sampleSize) {
    // Calculate composite score (weighted)
    const scoreA =
      metricsA.successRate * 0.3 +
      metricsA.prApprovalRate * 0.3 +
      metricsA.userSatisfactionScore * 0.2 +
      (1 - Math.min(metricsA.revisionCount / 5, 1)) * 0.2;

    const scoreB =
      metricsB.successRate * 0.3 +
      metricsB.prApprovalRate * 0.3 +
      metricsB.userSatisfactionScore * 0.2 +
      (1 - Math.min(metricsB.revisionCount / 5, 1)) * 0.2;

    const diff = Math.abs(scoreA - scoreB);
    if (diff < 0.05) {
      winner = "tie";
    } else {
      winner = scoreA > scoreB ? "A" : "B";
    }
    status = "completed";
  }

  await prisma.aBExperiment.update({
    where: { id: experimentId },
    data: {
      resultsA: metricsA as any,
      resultsB: metricsB as any,
      currentSampleA: variantAResults.length,
      currentSampleB: variantBResults.length,
      ...(winner && { winner }),
      ...(status === "completed" && { status, completedAt: new Date() }),
    },
  });
}

/**
 * Get active experiments
 */
export async function getActiveExperiments(
  userId: string,
  options: {
    repositoryId?: string;
    projectId?: string;
  } = {}
): Promise<ABExperiment[]> {
  const experiments = await prisma.aBExperiment.findMany({
    where: {
      userId,
      status: "active",
      ...(options.repositoryId && { repositoryId: options.repositoryId }),
      ...(options.projectId && { projectId: options.projectId }),
    },
    orderBy: { startedAt: "desc" },
  });

  return experiments.map(formatExperiment);
}

/**
 * Get experiment by ID
 */
export async function getExperiment(
  userId: string,
  experimentId: string
): Promise<ABExperiment | null> {
  const experiment = await prisma.aBExperiment.findFirst({
    where: { id: experimentId, userId },
  });

  return experiment ? formatExperiment(experiment) : null;
}

function formatExperiment(exp: any): ABExperiment {
  return {
    id: exp.id,
    name: exp.name,
    description: exp.description,
    repositoryId: exp.repositoryId,
    projectId: exp.projectId,
    status: exp.status,
    variantA: exp.variantA,
    variantB: exp.variantB,
    results: {
      variantA: exp.resultsA,
      variantB: exp.resultsB,
    },
    winner: exp.winner,
    sampleSize: exp.sampleSize,
    startedAt: exp.startedAt,
    completedAt: exp.completedAt,
  };
}

// ============================================================================
// Summary & Analytics
// ============================================================================

/**
 * Get feedback summary for a repository/project
 */
export async function getFeedbackSummary(
  userId: string,
  repositoryId: string,
  options: {
    projectId?: string;
    since?: Date;
  } = {}
): Promise<FeedbackSummary> {
  const { projectId, since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } = options;

  const [feedbackSignals, patterns, rejections, experiments] = await Promise.all([
    prisma.feedbackSignal.findMany({
      where: {
        userId,
        repositoryId,
        ...(projectId && { projectId }),
        createdAt: { gte: since },
      },
    }),
    getLearnedPatterns(userId, repositoryId, { projectId, limit: 5 }),
    getRejectionMemories(userId, repositoryId, { projectId, limit: 5 }),
    getActiveExperiments(userId, { repositoryId, projectId }),
  ]);

  const positiveCount = feedbackSignals.filter((f) => f.rating === "positive").length;
  const positiveRate =
    feedbackSignals.length > 0 ? positiveCount / feedbackSignals.length : 0;

  // Generate improvement suggestions
  const suggestions: string[] = [];
  if (positiveRate < 0.5) {
    suggestions.push("Consider reviewing recent negative feedback to identify improvement areas");
  }
  if (rejections.length > 3) {
    suggestions.push("Multiple rejection patterns detected - review learned lessons");
  }
  if (patterns.length < 3) {
    suggestions.push("Keep providing feedback to help the system learn your preferences");
  }

  return {
    totalFeedback: feedbackSignals.length,
    positiveRate,
    topPatterns: patterns,
    recentRejections: rejections,
    activeExperiments: experiments,
    improvementSuggestions: suggestions,
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Simple string hash for deduplication
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
