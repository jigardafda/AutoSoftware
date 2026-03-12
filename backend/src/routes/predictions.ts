/**
 * Predictions API Routes
 *
 * Provides endpoints for predictive analysis features:
 * - Breaking change warnings
 * - Regression risk scoring
 * - Technical debt forecasting
 * - Complexity growth alerts
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import {
  predictiveAnalysisService,
  type BreakingChangeWarning,
  type RegressionRiskScore,
  type TechnicalDebtForecast,
  type ComplexityAlert,
  type PredictiveInsightsSummary,
  type FileComplexityHistory,
} from "../services/predictive-analysis.js";

interface PredictionsQuery {
  repositoryId?: string;
  projectId?: string;
  taskId?: string;
}

interface FileQuery {
  repositoryId: string;
  filePath: string;
}

export const predictionRoutes: FastifyPluginAsync = async (app) => {
  // Require authentication for all routes
  app.addHook("preHandler", (app as any).requireAuth);

  // GET /api/predictions/insights
  // Returns comprehensive predictive insights summary
  app.get<{ Querystring: PredictionsQuery }>(
    "/insights",
    async (request, reply) => {
      const { repositoryId, projectId, taskId } = request.query;
      const userId = request.userId;

      // If projectId provided, get repositories from project
      let repoId = repositoryId;
      if (!repoId && projectId) {
        const projectRepos = await prisma.projectRepository.findMany({
          where: { projectId },
          select: { repositoryId: true },
        });
        repoId = projectRepos[0]?.repositoryId;
      }

      if (!repoId) {
        // Get user's first repository as default
        const defaultRepo = await prisma.repository.findFirst({
          where: { userId },
          select: { id: true },
        });
        repoId = defaultRepo?.id;
      }

      if (!repoId) {
        return reply.code(400).send({
          error: { message: "No repository found" },
        });
      }

      const insights = await predictiveAnalysisService.getPredictiveInsights(
        repoId,
        userId,
        taskId
      );

      return { data: insights };
    }
  );

  // GET /api/predictions/breaking-changes/:taskId
  // Analyzes a specific task for breaking change warnings
  app.get<{ Params: { taskId: string } }>(
    "/breaking-changes/:taskId",
    async (request, reply) => {
      const { taskId } = request.params;
      const userId = request.userId;

      // Verify task belongs to user
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        select: { id: true },
      });

      if (!task) {
        return reply.code(404).send({
          error: { message: "Task not found" },
        });
      }

      const warnings = await predictiveAnalysisService.analyzeBreakingChanges(
        taskId,
        userId
      );

      return {
        data: {
          taskId,
          warnings,
          summary: {
            total: warnings.length,
            critical: warnings.filter((w) => w.severity === "critical").length,
            high: warnings.filter((w) => w.severity === "high").length,
            medium: warnings.filter((w) => w.severity === "medium").length,
            low: warnings.filter((w) => w.severity === "low").length,
          },
        },
      };
    }
  );

  // GET /api/predictions/regression-risk/:taskId
  // Calculates regression risk score for a task/PR
  app.get<{ Params: { taskId: string } }>(
    "/regression-risk/:taskId",
    async (request, reply) => {
      const { taskId } = request.params;
      const userId = request.userId;

      // Verify task belongs to user
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        select: { id: true, title: true, status: true },
      });

      if (!task) {
        return reply.code(404).send({
          error: { message: "Task not found" },
        });
      }

      const riskScore = await predictiveAnalysisService.calculateRegressionRisk(
        taskId,
        userId
      );

      return {
        data: {
          task: {
            id: task.id,
            title: task.title,
            status: task.status,
          },
          risk: riskScore,
          riskLevel:
            riskScore.overallScore > 70
              ? "critical"
              : riskScore.overallScore > 50
                ? "high"
                : riskScore.overallScore > 30
                  ? "medium"
                  : "low",
        },
      };
    }
  );

  // GET /api/predictions/technical-debt
  // Returns technical debt forecast for a repository
  app.get<{ Querystring: { repositoryId: string } }>(
    "/technical-debt",
    async (request, reply) => {
      const { repositoryId } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true, fullName: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const forecast = await predictiveAnalysisService.forecastTechnicalDebt(
        repositoryId,
        userId
      );

      return {
        data: {
          repository: {
            id: repo.id,
            name: repo.fullName,
          },
          forecast,
        },
      };
    }
  );

  // GET /api/predictions/complexity-alerts
  // Returns complexity growth alerts for a repository
  app.get<{ Querystring: { repositoryId: string; limit?: string } }>(
    "/complexity-alerts",
    async (request, reply) => {
      const { repositoryId, limit = "20" } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true, fullName: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const alerts = await predictiveAnalysisService.detectComplexityGrowth(
        repositoryId,
        userId
      );

      const limitNum = parseInt(limit);
      const limitedAlerts = alerts.slice(0, limitNum);

      return {
        data: {
          repository: {
            id: repo.id,
            name: repo.fullName,
          },
          alerts: limitedAlerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter((a) => a.trend === "critical").length,
            rapidGrowth: alerts.filter((a) => a.trend === "rapid_growth").length,
            growing: alerts.filter((a) => a.trend === "growing").length,
            stable: alerts.filter((a) => a.trend === "stable").length,
          },
        },
      };
    }
  );

  // GET /api/predictions/file-complexity-history
  // Returns complexity history for a specific file
  app.get<{ Querystring: FileQuery }>(
    "/file-complexity-history",
    async (request, reply) => {
      const { repositoryId, filePath } = request.query;
      const userId = request.userId;

      if (!repositoryId || !filePath) {
        return reply.code(400).send({
          error: { message: "repositoryId and filePath are required" },
        });
      }

      // Verify repository belongs to user
      const repo = await prisma.repository.findFirst({
        where: { id: repositoryId, userId },
        select: { id: true },
      });

      if (!repo) {
        return reply.code(404).send({
          error: { message: "Repository not found" },
        });
      }

      const history = await predictiveAnalysisService.getFileComplexityHistory(
        repositoryId,
        filePath
      );

      return { data: history };
    }
  );

  // GET /api/predictions/health-score
  // Returns overall code health score
  app.get<{ Querystring: { repositoryId?: string; projectId?: string } }>(
    "/health-score",
    async (request, reply) => {
      const { repositoryId, projectId } = request.query;
      const userId = request.userId;

      let repoId = repositoryId;
      if (!repoId && projectId) {
        const projectRepos = await prisma.projectRepository.findMany({
          where: { projectId },
          select: { repositoryId: true },
        });
        repoId = projectRepos[0]?.repositoryId;
      }

      if (!repoId) {
        const defaultRepo = await prisma.repository.findFirst({
          where: { userId },
          select: { id: true },
        });
        repoId = defaultRepo?.id;
      }

      if (!repoId) {
        return reply.code(400).send({
          error: { message: "No repository found" },
        });
      }

      const insights = await predictiveAnalysisService.getPredictiveInsights(
        repoId,
        userId
      );

      return {
        data: {
          overallScore: insights.overallHealthScore,
          trends: insights.trends,
          summary: {
            breakingChangeWarnings: insights.breakingChangeWarnings.length,
            highRiskTasks: insights.regressionRiskScores.filter(
              (r) => r.overallScore > 50
            ).length,
            complexityAlerts: insights.complexityAlerts.filter(
              (a) => a.trend === "critical" || a.trend === "rapid_growth"
            ).length,
            debtScore: insights.technicalDebtForecast.currentScore,
          },
        },
      };
    }
  );

  // POST /api/predictions/analyze-pr
  // Comprehensive analysis for a PR/task before merge
  app.post<{ Body: { taskId: string } }>(
    "/analyze-pr",
    async (request, reply) => {
      const { taskId } = request.body;
      const userId = request.userId;

      if (!taskId) {
        return reply.code(400).send({
          error: { message: "taskId is required" },
        });
      }

      // Get task with repository
      const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
        include: {
          repository: true,
          codeChangeMetrics: true,
        },
      });

      if (!task) {
        return reply.code(404).send({
          error: { message: "Task not found" },
        });
      }

      // Run all analyses in parallel
      const [breakingChanges, regressionRisk, debtForecast, complexityAlerts] =
        await Promise.all([
          predictiveAnalysisService.analyzeBreakingChanges(taskId, userId),
          predictiveAnalysisService.calculateRegressionRisk(taskId, userId),
          predictiveAnalysisService.forecastTechnicalDebt(
            task.repositoryId,
            userId
          ),
          predictiveAnalysisService.detectComplexityGrowth(
            task.repositoryId,
            userId
          ),
        ]);

      // Calculate overall PR readiness score
      const breakingScore =
        100 -
        breakingChanges.filter((w) => w.severity === "critical").length * 30 -
        breakingChanges.filter((w) => w.severity === "high").length * 15 -
        breakingChanges.filter((w) => w.severity === "medium").length * 5;

      const regressionScore = 100 - regressionRisk.overallScore;

      const complexityScore =
        100 -
        complexityAlerts.filter((a) => a.trend === "critical").length * 20 -
        complexityAlerts.filter((a) => a.trend === "rapid_growth").length * 10;

      const readinessScore = Math.max(
        0,
        Math.round(
          breakingScore * 0.4 + regressionScore * 0.4 + complexityScore * 0.2
        )
      );

      // Generate recommendation
      let recommendation: "merge" | "review" | "hold" | "block" = "merge";
      const blockers: string[] = [];

      if (
        breakingChanges.some((w) => w.severity === "critical") ||
        regressionRisk.overallScore > 80
      ) {
        recommendation = "block";
        blockers.push("Critical breaking changes or high regression risk detected");
      } else if (
        breakingChanges.some((w) => w.severity === "high") ||
        regressionRisk.overallScore > 60
      ) {
        recommendation = "hold";
        blockers.push("Significant risks require thorough review");
      } else if (
        breakingChanges.length > 0 ||
        regressionRisk.overallScore > 40
      ) {
        recommendation = "review";
      }

      return {
        data: {
          task: {
            id: task.id,
            title: task.title,
            status: task.status,
            pullRequestUrl: task.pullRequestUrl,
          },
          analysis: {
            breakingChanges: {
              warnings: breakingChanges,
              count: breakingChanges.length,
              hasCritical: breakingChanges.some((w) => w.severity === "critical"),
            },
            regressionRisk,
            technicalDebt: {
              currentScore: debtForecast.currentScore,
              trend: debtForecast.trend,
              projected30Days: debtForecast.projectedScore30Days,
            },
            complexityAlerts: {
              alerts: complexityAlerts.slice(0, 5), // Top 5
              total: complexityAlerts.length,
              criticalCount: complexityAlerts.filter(
                (a) => a.trend === "critical"
              ).length,
            },
          },
          readiness: {
            score: readinessScore,
            recommendation,
            blockers,
            checklistItems: [
              {
                item: "No critical breaking changes",
                passed: !breakingChanges.some((w) => w.severity === "critical"),
              },
              {
                item: "Regression risk under threshold",
                passed: regressionRisk.overallScore < 60,
              },
              {
                item: "No critical complexity alerts",
                passed: !complexityAlerts.some((a) => a.trend === "critical"),
              },
              {
                item: "Technical debt stable or improving",
                passed:
                  debtForecast.trend === "stable" ||
                  debtForecast.trend === "improving",
              },
            ],
          },
        },
      };
    }
  );

  // GET /api/predictions/trending
  // Returns trending risk patterns across repositories
  app.get("/trending", async (request, reply) => {
    const userId = request.userId;

    // Get all user repositories
    const repos = await prisma.repository.findMany({
      where: { userId },
      select: { id: true, fullName: true },
    });

    const trendingData = await Promise.all(
      repos.slice(0, 5).map(async (repo) => {
        const insights = await predictiveAnalysisService.getPredictiveInsights(
          repo.id,
          userId
        );

        return {
          repositoryId: repo.id,
          repositoryName: repo.fullName,
          healthScore: insights.overallHealthScore,
          trends: insights.trends,
          criticalIssues:
            insights.breakingChangeWarnings.filter(
              (w) => w.severity === "critical"
            ).length +
            insights.complexityAlerts.filter((a) => a.trend === "critical")
              .length,
          highRiskTasks: insights.regressionRiskScores.filter(
            (r) => r.overallScore > 70
          ).length,
        };
      })
    );

    // Sort by health score (lowest first - needs attention)
    const sorted = trendingData.sort((a, b) => a.healthScore - b.healthScore);

    return {
      data: {
        repositories: sorted,
        overallHealth:
          sorted.length > 0
            ? Math.round(
                sorted.reduce((sum, r) => sum + r.healthScore, 0) / sorted.length
              )
            : 100,
        needsAttention: sorted.filter((r) => r.healthScore < 60).length,
      },
    };
  });
};
