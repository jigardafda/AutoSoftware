/**
 * Proactive Suggestions Service
 *
 * Provides intelligent, proactive code improvement suggestions:
 * - "Consider refactoring X before adding Y" recommendations
 * - Optimization opportunities detection
 * - "Other projects solved this with..." cross-project insights
 * - Scheduled periodic improvement recommendations
 * - Pre-task analysis for potential issues
 */

import { prisma } from "../db.js";
import {
  resolveAuth,
  setupAgentSdkAuth,
  isValidAuth,
  simpleQuery,
} from "./claude-query.js";
import { predictiveAnalysisService } from "./predictive-analysis.js";
import { findSimilarTasks, type SimilarTask } from "./task-similarity.js";

// ============================================================================
// Types
// ============================================================================

export type SuggestionType =
  | "refactor_first"
  | "optimization"
  | "pattern_match"
  | "scheduled_improvement"
  | "pre_task_warning"
  | "dependency_update"
  | "test_coverage"
  | "documentation";

export type SuggestionPriority = "low" | "medium" | "high" | "critical";

export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "applied" | "expired";

export interface ProactiveSuggestion {
  id: string;
  type: SuggestionType;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  title: string;
  description: string;
  rationale: string;
  affectedFiles: string[];
  suggestedActions: SuggestedAction[];
  relatedTaskId?: string;
  relatedPatternId?: string;
  confidence: number;
  estimatedImpact: ImpactEstimate;
  metadata: Record<string, any>;
  createdAt: Date;
  expiresAt?: Date;
  dismissedAt?: Date;
  appliedAt?: Date;
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  actionType: "create_task" | "apply_fix" | "review" | "ignore" | "defer";
  payload?: Record<string, any>;
}

export interface ImpactEstimate {
  codeQuality: number; // 0-100
  performance: number; // 0-100
  maintainability: number; // 0-100
  timeToFix: number; // minutes
  riskLevel: "low" | "medium" | "high";
}

export interface RefactoringOpportunity {
  filePath: string;
  type: "extract_method" | "extract_component" | "simplify_logic" | "reduce_duplication" | "split_file";
  complexity: number;
  description: string;
  codeSnippet?: string;
  suggestedRefactoring: string;
}

export interface OptimizationOpportunity {
  type: "performance" | "bundle_size" | "query_optimization" | "caching" | "lazy_loading";
  severity: "low" | "medium" | "high";
  location: string;
  currentIssue: string;
  suggestedOptimization: string;
  estimatedImprovement: string;
}

export interface PatternMatch {
  patternName: string;
  projectSource: string;
  description: string;
  applicability: number; // 0-1
  codeExample?: string;
  adaptationSteps: string[];
  relatedTasks: SimilarTask[];
}

export interface ScheduledRecommendation {
  id: string;
  category: "weekly_cleanup" | "monthly_audit" | "quarterly_review" | "custom";
  title: string;
  description: string;
  checkType: string;
  lastRun?: Date;
  nextRun: Date;
  findings: ScheduledFinding[];
}

export interface ScheduledFinding {
  severity: SuggestionPriority;
  title: string;
  description: string;
  affectedAreas: string[];
}

export interface SuggestionGenerationContext {
  repositoryId: string;
  projectId?: string;
  taskId?: string;
  taskDescription?: string;
  affectedFiles?: string[];
  taskType?: string;
}

export interface SuggestionSummary {
  total: number;
  byType: Record<SuggestionType, number>;
  byPriority: Record<SuggestionPriority, number>;
  pendingCount: number;
  recentlyDismissed: number;
  recentlyApplied: number;
}

// ============================================================================
// Constants
// ============================================================================

const COMPLEXITY_THRESHOLDS = {
  refactorWarning: 40,
  refactorCritical: 60,
};

const SUGGESTION_EXPIRY_DAYS = 30;

const COMMON_PATTERNS: Record<string, { name: string; description: string; indicators: string[] }> = {
  singleton: {
    name: "Singleton Pattern",
    description: "Use a single instance shared across the application",
    indicators: ["getInstance", "static instance", "private constructor"],
  },
  factory: {
    name: "Factory Pattern",
    description: "Create objects without specifying exact class",
    indicators: ["create", "factory", "build", "make"],
  },
  observer: {
    name: "Observer Pattern",
    description: "Subscribe to and react to state changes",
    indicators: ["subscribe", "publish", "emit", "listener", "observer"],
  },
  repository: {
    name: "Repository Pattern",
    description: "Abstract data layer for clean separation",
    indicators: ["repository", "findById", "findAll", "save", "delete"],
  },
  strategy: {
    name: "Strategy Pattern",
    description: "Define family of algorithms, encapsulate each",
    indicators: ["strategy", "execute", "process", "handle"],
  },
};

// ============================================================================
// Main Service Class
// ============================================================================

class ProactiveSuggestionsService {
  /**
   * Generate pre-task suggestions before starting work
   */
  async generatePreTaskSuggestions(
    userId: string,
    context: SuggestionGenerationContext
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    const { repositoryId, taskDescription, affectedFiles, taskType } = context;

    // 1. Analyze affected files for refactoring needs
    if (affectedFiles && affectedFiles.length > 0) {
      const refactoringSuggestions = await this.analyzeRefactoringNeeds(
        userId,
        repositoryId,
        affectedFiles,
        taskDescription || ""
      );
      suggestions.push(...refactoringSuggestions);
    }

    // 2. Check for complexity issues before adding more code
    const complexityWarnings = await this.checkComplexityBeforeTask(
      userId,
      repositoryId,
      affectedFiles || [],
      taskType || "improvement"
    );
    suggestions.push(...complexityWarnings);

    // 3. Find similar patterns from other tasks
    if (taskDescription) {
      const patternMatches = await this.findApplicablePatterns(
        userId,
        repositoryId,
        taskDescription,
        context.projectId
      );
      suggestions.push(...patternMatches);
    }

    // 4. Check for optimization opportunities
    const optimizations = await this.detectOptimizationOpportunities(
      userId,
      repositoryId,
      affectedFiles || []
    );
    suggestions.push(...optimizations);

    return suggestions;
  }

  /**
   * Analyze files that need refactoring before adding new features
   */
  async analyzeRefactoringNeeds(
    userId: string,
    repositoryId: string,
    affectedFiles: string[],
    taskDescription: string
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Get complexity data for affected files
    const complexityAlerts = await predictiveAnalysisService.detectComplexityGrowth(
      repositoryId,
      userId
    );

    // Filter to affected files
    const relevantAlerts = complexityAlerts.filter((alert) =>
      affectedFiles.some((f) => f.includes(alert.name) || alert.path.includes(f))
    );

    for (const alert of relevantAlerts) {
      if (alert.currentComplexity > COMPLEXITY_THRESHOLDS.refactorWarning) {
        const isCritical = alert.currentComplexity > COMPLEXITY_THRESHOLDS.refactorCritical;

        suggestions.push({
          id: `refactor-${alert.id}-${Date.now()}`,
          type: "refactor_first",
          priority: isCritical ? "high" : "medium",
          status: "pending",
          title: `Consider refactoring ${alert.name} before modifying`,
          description: `This file has complexity score of ${alert.currentComplexity} (${alert.trend} trend). Adding more code may make it harder to maintain.`,
          rationale: `Files with high complexity are more prone to bugs and harder to understand. Refactoring first will make your changes safer and easier to implement.`,
          affectedFiles: [alert.path],
          suggestedActions: [
            {
              id: "create-refactor-task",
              title: "Create Refactoring Task",
              description: "Create a task to refactor this file first",
              actionType: "create_task",
              payload: {
                title: `Refactor ${alert.name} to reduce complexity`,
                type: "refactor",
                description: alert.recommendations.join("\n"),
              },
            },
            {
              id: "proceed-anyway",
              title: "Proceed Anyway",
              description: "Continue with the current task without refactoring",
              actionType: "ignore",
            },
          ],
          confidence: 0.85,
          estimatedImpact: {
            codeQuality: 30,
            performance: 10,
            maintainability: 40,
            timeToFix: 60,
            riskLevel: isCritical ? "high" : "medium",
          },
          metadata: {
            complexityScore: alert.currentComplexity,
            growthRate: alert.growthRate,
            trend: alert.trend,
            recommendations: alert.recommendations,
          },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + SUGGESTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        });
      }
    }

    // Use AI to analyze code patterns if available
    if (affectedFiles.length > 0 && suggestions.length === 0) {
      const aiSuggestions = await this.analyzeWithAI(
        userId,
        repositoryId,
        affectedFiles,
        taskDescription,
        "refactoring"
      );
      suggestions.push(...aiSuggestions);
    }

    return suggestions;
  }

  /**
   * Check complexity before adding more code
   */
  async checkComplexityBeforeTask(
    userId: string,
    repositoryId: string,
    affectedFiles: string[],
    taskType: string
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Get technical debt forecast
    const debtForecast = await predictiveAnalysisService.forecastTechnicalDebt(
      repositoryId,
      userId
    );

    // If debt is increasing and this is a feature task, warn
    if (
      debtForecast.trend === "degrading" &&
      taskType === "feature" &&
      debtForecast.currentScore > 50
    ) {
      suggestions.push({
        id: `debt-warning-${Date.now()}`,
        type: "pre_task_warning",
        priority: "medium",
        status: "pending",
        title: "Technical debt is increasing",
        description: `Technical debt score is ${debtForecast.currentScore} and trending upward. Adding new features may accelerate this.`,
        rationale: "Consider addressing some technical debt before or alongside this feature to maintain code health.",
        affectedFiles,
        suggestedActions: [
          {
            id: "address-debt",
            title: "Address Debt First",
            description: "Create tasks from debt recommendations",
            actionType: "create_task",
            payload: {
              recommendations: debtForecast.recommendations,
            },
          },
          {
            id: "acknowledge",
            title: "Acknowledge and Proceed",
            description: "Continue with awareness of debt impact",
            actionType: "ignore",
          },
        ],
        confidence: 0.75,
        estimatedImpact: {
          codeQuality: 20,
          performance: 5,
          maintainability: 30,
          timeToFix: 120,
          riskLevel: "medium",
        },
        metadata: {
          currentDebt: debtForecast.currentScore,
          projectedDebt30Days: debtForecast.projectedScore30Days,
          trend: debtForecast.trend,
          recommendations: debtForecast.recommendations,
        },
        createdAt: new Date(),
      });
    }

    return suggestions;
  }

  /**
   * Find applicable patterns from similar tasks/projects
   */
  async findApplicablePatterns(
    userId: string,
    repositoryId: string,
    taskDescription: string,
    projectId?: string
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Find similar completed tasks
    const similarTasks = await findSimilarTasks(
      userId,
      repositoryId,
      taskDescription,
      projectId,
      {
        limit: 5,
        minSimilarity: 0.4,
        includeCompleted: true,
        useAI: true,
      }
    );

    // Filter to high-quality completed tasks
    const successfulSimilar = similarTasks.filter(
      (t) =>
        t.status === "completed" &&
        t.similarity.overall >= 0.5 &&
        t.pullRequestUrl
    );

    if (successfulSimilar.length > 0) {
      const topMatch = successfulSimilar[0];

      suggestions.push({
        id: `pattern-${topMatch.id}-${Date.now()}`,
        type: "pattern_match",
        priority: topMatch.similarity.overall > 0.7 ? "high" : "medium",
        status: "pending",
        title: `Similar task completed: "${topMatch.title}"`,
        description: `A similar task was completed successfully. You might find the approach useful.`,
        rationale: `This task has ${Math.round(topMatch.similarity.overall * 100)}% similarity to your current task. Learning from past solutions can save time.`,
        affectedFiles: topMatch.affectedFiles,
        relatedTaskId: topMatch.id,
        suggestedActions: [
          {
            id: "view-task",
            title: "View Similar Task",
            description: "See how this task was approached",
            actionType: "review",
            payload: { taskId: topMatch.id },
          },
          {
            id: "apply-approach",
            title: "Apply Similar Approach",
            description: "Use a similar approach for this task",
            actionType: "apply_fix",
            payload: {
              sourceTaskId: topMatch.id,
              copyApproach: true,
            },
          },
        ],
        confidence: topMatch.similarity.overall,
        estimatedImpact: {
          codeQuality: 10,
          performance: 5,
          maintainability: 15,
          timeToFix: -30, // Negative = time saved
          riskLevel: "low",
        },
        metadata: {
          similarTask: {
            id: topMatch.id,
            title: topMatch.title,
            similarity: topMatch.similarity,
            pullRequestUrl: topMatch.pullRequestUrl,
          },
          allSimilarTasks: successfulSimilar.map((t) => ({
            id: t.id,
            title: t.title,
            similarity: t.similarity.overall,
          })),
        },
        createdAt: new Date(),
      });
    }

    // Also check for common design patterns in the description
    const patternSuggestions = await this.detectDesignPatterns(
      userId,
      taskDescription
    );
    suggestions.push(...patternSuggestions);

    return suggestions;
  }

  /**
   * Detect applicable design patterns
   */
  async detectDesignPatterns(
    userId: string,
    taskDescription: string
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];
    const lowerDesc = taskDescription.toLowerCase();

    for (const [patternId, pattern] of Object.entries(COMMON_PATTERNS)) {
      const matchScore = pattern.indicators.filter((indicator) =>
        lowerDesc.includes(indicator.toLowerCase())
      ).length;

      if (matchScore >= 2) {
        suggestions.push({
          id: `pattern-${patternId}-${Date.now()}`,
          type: "pattern_match",
          priority: "low",
          status: "pending",
          title: `Consider using ${pattern.name}`,
          description: pattern.description,
          rationale: `Based on your task description, the ${pattern.name} might be applicable here.`,
          affectedFiles: [],
          relatedPatternId: patternId,
          suggestedActions: [
            {
              id: "learn-more",
              title: "Learn More",
              description: `Read about ${pattern.name}`,
              actionType: "review",
              payload: { patternId },
            },
            {
              id: "dismiss",
              title: "Not Applicable",
              description: "This pattern doesn't fit my use case",
              actionType: "ignore",
            },
          ],
          confidence: Math.min(matchScore / 3, 1),
          estimatedImpact: {
            codeQuality: 20,
            performance: 5,
            maintainability: 30,
            timeToFix: 15,
            riskLevel: "low",
          },
          metadata: {
            patternName: pattern.name,
            matchedIndicators: pattern.indicators.filter((i) =>
              lowerDesc.includes(i.toLowerCase())
            ),
          },
          createdAt: new Date(),
        });
      }
    }

    return suggestions;
  }

  /**
   * Detect optimization opportunities in affected files
   */
  async detectOptimizationOpportunities(
    userId: string,
    repositoryId: string,
    affectedFiles: string[]
  ): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // Get recent code analysis for hints
    const latestScan = await prisma.scanResult.findFirst({
      where: { repositoryId },
      include: { codeAnalysis: true },
      orderBy: { scannedAt: "desc" },
    });

    if (!latestScan?.codeAnalysis) {
      return suggestions;
    }

    const perfIssues = (latestScan.codeAnalysis.performanceIssues as any[]) || [];

    // Filter to affected files
    const relevantIssues = perfIssues.filter((issue) =>
      affectedFiles.some((f) => issue.file?.includes(f) || f.includes(issue.file || ""))
    );

    for (const issue of relevantIssues.slice(0, 3)) {
      suggestions.push({
        id: `optimization-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "optimization",
        priority: issue.severity === "high" ? "high" : "medium",
        status: "pending",
        title: `Optimization opportunity: ${issue.title || issue.type}`,
        description: issue.description || "Performance improvement available",
        rationale: "Addressing this optimization while you're working in this area can improve overall performance.",
        affectedFiles: issue.file ? [issue.file] : [],
        suggestedActions: [
          {
            id: "fix-now",
            title: "Fix While Working Here",
            description: "Include this optimization in your current work",
            actionType: "apply_fix",
            payload: { issue },
          },
          {
            id: "create-task",
            title: "Create Separate Task",
            description: "Create a task to address this later",
            actionType: "create_task",
            payload: {
              title: `Optimize: ${issue.title || issue.type}`,
              type: "improvement",
              description: issue.description,
            },
          },
          {
            id: "defer",
            title: "Defer",
            description: "Not a priority right now",
            actionType: "defer",
          },
        ],
        confidence: 0.7,
        estimatedImpact: {
          codeQuality: 15,
          performance: 30,
          maintainability: 10,
          timeToFix: 20,
          riskLevel: "low",
        },
        metadata: {
          issueType: issue.type,
          severity: issue.severity,
          location: issue.file,
        },
        createdAt: new Date(),
      });
    }

    return suggestions;
  }

  /**
   * Generate scheduled improvement recommendations
   */
  async generateScheduledRecommendations(
    userId: string,
    repositoryId: string
  ): Promise<ScheduledRecommendation[]> {
    const recommendations: ScheduledRecommendation[] = [];
    const now = new Date();

    // Weekly cleanup recommendation
    const weeklyCleanup = await this.generateWeeklyCleanupRecommendation(
      userId,
      repositoryId
    );
    if (weeklyCleanup) {
      recommendations.push(weeklyCleanup);
    }

    // Monthly audit recommendation
    const monthlyAudit = await this.generateMonthlyAuditRecommendation(
      userId,
      repositoryId
    );
    if (monthlyAudit) {
      recommendations.push(monthlyAudit);
    }

    return recommendations;
  }

  /**
   * Generate weekly cleanup recommendation
   */
  async generateWeeklyCleanupRecommendation(
    userId: string,
    repositoryId: string
  ): Promise<ScheduledRecommendation | null> {
    const findings: ScheduledFinding[] = [];

    // Check for stale tasks
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const staleTasks = await prisma.task.count({
      where: {
        repositoryId,
        userId,
        status: "pending",
        createdAt: { lt: oneWeekAgo },
      },
    });

    if (staleTasks > 0) {
      findings.push({
        severity: staleTasks > 5 ? "medium" : "low",
        title: `${staleTasks} stale pending tasks`,
        description: "These tasks have been pending for over a week. Consider reviewing or closing them.",
        affectedAreas: ["Task Queue"],
      });
    }

    // Check for failed tasks needing attention
    const failedTasks = await prisma.task.count({
      where: {
        repositoryId,
        userId,
        status: "failed",
        createdAt: { gte: oneWeekAgo },
      },
    });

    if (failedTasks > 0) {
      findings.push({
        severity: failedTasks > 3 ? "high" : "medium",
        title: `${failedTasks} failed tasks this week`,
        description: "Review failed tasks to identify patterns or recurring issues.",
        affectedAreas: ["Task Execution"],
      });
    }

    // Check for dependency alerts
    const dependencyAlerts = await prisma.dependencyAlert.count({
      where: {
        repositoryId,
        userId,
        status: "active",
      },
    });

    if (dependencyAlerts > 0) {
      findings.push({
        severity: dependencyAlerts > 10 ? "high" : "medium",
        title: `${dependencyAlerts} active dependency alerts`,
        description: "Review security and update alerts for project dependencies.",
        affectedAreas: ["Dependencies"],
      });
    }

    if (findings.length === 0) {
      return null;
    }

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    return {
      id: `weekly-${Date.now()}`,
      category: "weekly_cleanup",
      title: "Weekly Code Health Review",
      description: "Regular weekly check for maintaining code health and addressing outstanding issues.",
      checkType: "cleanup",
      nextRun: nextWeek,
      findings,
    };
  }

  /**
   * Generate monthly audit recommendation
   */
  async generateMonthlyAuditRecommendation(
    userId: string,
    repositoryId: string
  ): Promise<ScheduledRecommendation | null> {
    const findings: ScheduledFinding[] = [];

    // Get technical debt trend
    const debtForecast = await predictiveAnalysisService.forecastTechnicalDebt(
      repositoryId,
      userId
    );

    if (debtForecast.trend === "degrading" || debtForecast.trend === "critical") {
      findings.push({
        severity: debtForecast.trend === "critical" ? "critical" : "high",
        title: "Technical debt is increasing",
        description: `Current score: ${debtForecast.currentScore}, projected in 30 days: ${debtForecast.projectedScore30Days}`,
        affectedAreas: ["Code Quality"],
      });
    }

    // Check for growing complexity
    const complexityAlerts = await predictiveAnalysisService.detectComplexityGrowth(
      repositoryId,
      userId
    );

    const criticalComplexity = complexityAlerts.filter(
      (a) => a.trend === "critical" || a.trend === "rapid_growth"
    );

    if (criticalComplexity.length > 0) {
      findings.push({
        severity: "high",
        title: `${criticalComplexity.length} files with concerning complexity growth`,
        description: "These files may need refactoring to maintain code health.",
        affectedAreas: criticalComplexity.map((a) => a.path).slice(0, 5),
      });
    }

    if (findings.length === 0) {
      return null;
    }

    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    return {
      id: `monthly-${Date.now()}`,
      category: "monthly_audit",
      title: "Monthly Code Health Audit",
      description: "Comprehensive monthly review of code quality, technical debt, and complexity trends.",
      checkType: "audit",
      nextRun: nextMonth,
      findings,
    };
  }

  /**
   * Use AI to analyze code and generate suggestions
   */
  async analyzeWithAI(
    userId: string,
    repositoryId: string,
    affectedFiles: string[],
    taskDescription: string,
    analysisType: "refactoring" | "optimization" | "patterns"
  ): Promise<ProactiveSuggestion[]> {
    const auth = await resolveAuth(userId);
    if (!isValidAuth(auth)) {
      return [];
    }

    setupAgentSdkAuth(auth);

    const systemPrompt = `You are a code analysis assistant. Analyze the given context and suggest improvements.
Focus on ${analysisType} opportunities.

Return a JSON array of suggestions with this structure:
[{
  "type": "${analysisType === "refactoring" ? "refactor_first" : analysisType === "optimization" ? "optimization" : "pattern_match"}",
  "priority": "low" | "medium" | "high",
  "title": "Brief title",
  "description": "What should be done",
  "rationale": "Why this is important",
  "affectedFiles": ["file paths"],
  "confidence": 0.0-1.0,
  "impact": {
    "codeQuality": 0-100,
    "performance": 0-100,
    "maintainability": 0-100,
    "timeToFix": minutes
  }
}]

Return only the JSON array, no other text.`;

    const userPrompt = `Task Description: ${taskDescription}

Affected Files: ${affectedFiles.join(", ")}

Analyze this ${analysisType} and provide suggestions.`;

    try {
      const { result } = await simpleQuery(systemPrompt, userPrompt, {
        model: "claude-sonnet-4-20250514",
      });

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as any[];
        return parsed.map((s, i) => ({
          id: `ai-${analysisType}-${Date.now()}-${i}`,
          type: s.type as SuggestionType,
          priority: s.priority as SuggestionPriority,
          status: "pending" as SuggestionStatus,
          title: s.title,
          description: s.description,
          rationale: s.rationale,
          affectedFiles: s.affectedFiles || [],
          suggestedActions: [
            {
              id: "apply",
              title: "Apply Suggestion",
              description: "Implement this suggestion",
              actionType: "apply_fix" as const,
            },
            {
              id: "dismiss",
              title: "Dismiss",
              description: "Not applicable",
              actionType: "ignore" as const,
            },
          ],
          confidence: s.confidence || 0.6,
          estimatedImpact: {
            codeQuality: s.impact?.codeQuality || 10,
            performance: s.impact?.performance || 5,
            maintainability: s.impact?.maintainability || 15,
            timeToFix: s.impact?.timeToFix || 30,
            riskLevel: "medium" as const,
          },
          metadata: { source: "ai", analysisType },
          createdAt: new Date(),
        }));
      }
    } catch (err) {
      console.error("AI suggestion analysis failed:", err);
    }

    return [];
  }

  /**
   * Get suggestions for a repository
   */
  async getSuggestions(
    userId: string,
    repositoryId: string,
    options?: {
      type?: SuggestionType;
      priority?: SuggestionPriority;
      status?: SuggestionStatus;
      limit?: number;
    }
  ): Promise<ProactiveSuggestion[]> {
    const where: any = { repositoryId, userId };
    if (options?.type) where.type = options.type;
    if (options?.priority) where.priority = options.priority;
    if (options?.status) where.status = options.status;

    const stored = await prisma.proactiveSuggestion.findMany({
      where,
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      take: options?.limit || 50,
    });

    return stored.map(this.mapStoredSuggestion);
  }

  /**
   * Get suggestion summary for a repository
   */
  async getSuggestionSummary(
    userId: string,
    repositoryId: string
  ): Promise<SuggestionSummary> {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [all, pending, recentDismissed, recentApplied] = await Promise.all([
      prisma.proactiveSuggestion.findMany({
        where: { repositoryId, userId },
        select: { type: true, priority: true },
      }),
      prisma.proactiveSuggestion.count({
        where: { repositoryId, userId, status: "pending" },
      }),
      prisma.proactiveSuggestion.count({
        where: {
          repositoryId,
          userId,
          status: "dismissed",
          dismissedAt: { gte: oneWeekAgo },
        },
      }),
      prisma.proactiveSuggestion.count({
        where: {
          repositoryId,
          userId,
          status: "applied",
          appliedAt: { gte: oneWeekAgo },
        },
      }),
    ]);

    const byType: Record<SuggestionType, number> = {
      refactor_first: 0,
      optimization: 0,
      pattern_match: 0,
      scheduled_improvement: 0,
      pre_task_warning: 0,
      dependency_update: 0,
      test_coverage: 0,
      documentation: 0,
    };

    const byPriority: Record<SuggestionPriority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const s of all) {
      byType[s.type as SuggestionType] = (byType[s.type as SuggestionType] || 0) + 1;
      byPriority[s.priority as SuggestionPriority] = (byPriority[s.priority as SuggestionPriority] || 0) + 1;
    }

    return {
      total: all.length,
      byType,
      byPriority,
      pendingCount: pending,
      recentlyDismissed: recentDismissed,
      recentlyApplied: recentApplied,
    };
  }

  /**
   * Store a suggestion in the database
   */
  async storeSuggestion(
    userId: string,
    repositoryId: string,
    suggestion: Omit<ProactiveSuggestion, "id" | "createdAt">
  ): Promise<ProactiveSuggestion> {
    const stored = await prisma.proactiveSuggestion.create({
      data: {
        userId,
        repositoryId,
        type: suggestion.type,
        priority: suggestion.priority,
        status: suggestion.status,
        title: suggestion.title,
        description: suggestion.description,
        rationale: suggestion.rationale,
        affectedFiles: suggestion.affectedFiles,
        suggestedActions: suggestion.suggestedActions as any,
        relatedTaskId: suggestion.relatedTaskId,
        confidence: suggestion.confidence,
        estimatedImpact: suggestion.estimatedImpact as any,
        metadata: suggestion.metadata,
        expiresAt: suggestion.expiresAt,
      },
    });

    return this.mapStoredSuggestion(stored);
  }

  /**
   * Update suggestion status
   */
  async updateSuggestionStatus(
    suggestionId: string,
    userId: string,
    status: SuggestionStatus,
    metadata?: Record<string, any>
  ): Promise<void> {
    const updateData: any = { status };

    if (status === "dismissed") {
      updateData.dismissedAt = new Date();
    } else if (status === "applied") {
      updateData.appliedAt = new Date();
    }

    if (metadata) {
      updateData.metadata = metadata;
    }

    await prisma.proactiveSuggestion.update({
      where: { id: suggestionId },
      data: updateData,
    });
  }

  /**
   * Dismiss a suggestion
   */
  async dismissSuggestion(
    suggestionId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    await this.updateSuggestionStatus(suggestionId, userId, "dismissed", {
      dismissedReason: reason,
    });
  }

  /**
   * Apply a suggestion
   */
  async applySuggestion(
    suggestionId: string,
    userId: string,
    actionId: string
  ): Promise<{ success: boolean; result?: any }> {
    const suggestion = await prisma.proactiveSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      return { success: false };
    }

    const actions = (suggestion.suggestedActions as any[]) || [];
    const action = actions.find((a) => a.id === actionId);

    if (!action) {
      return { success: false };
    }

    // Handle different action types
    let result: any = null;

    switch (action.actionType) {
      case "create_task":
        if (action.payload) {
          result = await prisma.task.create({
            data: {
              userId,
              repositoryId: suggestion.repositoryId,
              title: action.payload.title || suggestion.title,
              description: action.payload.description || suggestion.description,
              type: action.payload.type || "improvement",
              priority: "medium",
              status: "pending",
              metadata: {
                createdFromSuggestion: suggestionId,
              },
            },
          });
        }
        break;

      case "ignore":
      case "defer":
        // Just mark as dismissed
        break;

      default:
        break;
    }

    await this.updateSuggestionStatus(suggestionId, userId, "applied", {
      appliedAction: actionId,
      result,
    });

    return { success: true, result };
  }

  /**
   * Map stored suggestion to ProactiveSuggestion type
   */
  private mapStoredSuggestion(stored: any): ProactiveSuggestion {
    return {
      id: stored.id,
      type: stored.type as SuggestionType,
      priority: stored.priority as SuggestionPriority,
      status: stored.status as SuggestionStatus,
      title: stored.title,
      description: stored.description,
      rationale: stored.rationale || "",
      affectedFiles: (stored.affectedFiles as string[]) || [],
      suggestedActions: (stored.suggestedActions as SuggestedAction[]) || [],
      relatedTaskId: stored.relatedTaskId,
      confidence: stored.confidence,
      estimatedImpact: (stored.estimatedImpact as ImpactEstimate) || {
        codeQuality: 0,
        performance: 0,
        maintainability: 0,
        timeToFix: 0,
        riskLevel: "low",
      },
      metadata: (stored.metadata as Record<string, any>) || {},
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      dismissedAt: stored.dismissedAt,
      appliedAt: stored.appliedAt,
    };
  }

  /**
   * Clean up expired suggestions
   */
  async cleanupExpiredSuggestions(): Promise<number> {
    const result = await prisma.proactiveSuggestion.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: new Date() },
      },
      data: {
        status: "expired",
      },
    });
    return result.count;
  }
}

export const proactiveSuggestionsService = new ProactiveSuggestionsService();
