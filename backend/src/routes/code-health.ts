/**
 * Code Health API Routes
 *
 * Provides endpoints for:
 * - Health dashboard data
 * - Trend analysis
 * - Hotspot identification
 * - Coverage tracking
 * - Quality metrics
 */

import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../db.js";
import { codeHealthService } from "../services/code-health.js";

interface HealthQuery {
  repositoryId?: string;
  projectId?: string;
  branch?: string;
  days?: string;
}

interface TrendQuery {
  repositoryId: string;
  branch?: string;
  metricType?: string;
  days?: string;
}

interface HotspotQuery {
  repositoryId: string;
  branch?: string;
  limit?: string;
  riskLevel?: string;
}

export const codeHealthRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", (app as any).requireAuth);

  // GET /api/code-health/dashboard
  // Returns full health dashboard for a repository or project
  app.get<{ Querystring: HealthQuery }>(
    "/dashboard",
    async (request, reply) => {
      const { repositoryId, projectId, branch, days = "30" } = request.query;
      const userId = request.userId;

      if (!repositoryId && !projectId) {
        return reply.code(400).send({
          error: { message: "Either repositoryId or projectId is required" },
        });
      }

      try {
        if (repositoryId) {
          // Verify user owns the repository
          const repo = await prisma.repository.findFirst({
            where: { id: repositoryId, userId },
          });

          if (!repo) {
            return reply.code(404).send({
              error: { message: "Repository not found" },
            });
          }

          const dashboard = await codeHealthService.getHealthDashboard(
            repositoryId,
            branch,
            parseInt(days)
          );

          if (!dashboard) {
            // Return empty dashboard for new repos
            return {
              data: {
                scores: {
                  overall: 0,
                  complexity: 0,
                  duplication: 0,
                  coverage: 0,
                  maintainability: 0,
                  security: 0,
                  dependencies: 0,
                },
                trends: { overall: [], complexity: [], coverage: [], duplication: [] },
                hotspots: [],
                summary: {
                  totalFiles: 0,
                  totalLines: 0,
                  avgComplexity: 0,
                  duplicationPct: 0,
                  testCoveragePct: null,
                  technicalDebtHours: 0,
                  codeSmellCount: 0,
                },
                comparison: { lastWeek: null, lastMonth: null },
              },
            };
          }

          return { data: dashboard };
        }

        if (projectId) {
          // Verify user owns the project
          const project = await prisma.project.findFirst({
            where: { id: projectId, userId },
            include: {
              repositories: {
                include: { repository: true },
              },
            },
          });

          if (!project) {
            return reply.code(404).send({
              error: { message: "Project not found" },
            });
          }

          // Get project-level health summary
          const summary = await codeHealthService.calculateProjectHealth(projectId);

          // Get individual repo dashboards
          const repoDashboards = await Promise.all(
            project.repositories.map(async (pr) => {
              const dashboard = await codeHealthService.getHealthDashboard(
                pr.repositoryId,
                undefined,
                parseInt(days)
              );
              return {
                repositoryId: pr.repositoryId,
                repositoryName: pr.repository.fullName,
                ...dashboard,
              };
            })
          );

          return {
            data: {
              projectSummary: summary,
              repositories: repoDashboards.filter(Boolean),
            },
          };
        }
      } catch (error) {
        console.error("Error getting health dashboard:", error);
        return reply.code(500).send({
          error: { message: "Failed to get health dashboard" },
        });
      }
    }
  );

  // GET /api/code-health/scores
  // Returns current health scores for a repository
  app.get<{ Querystring: { repositoryId: string; branch?: string } }>(
    "/scores",
    async (request, reply) => {
      const { repositoryId, branch } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      try {
        // Verify access
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        // Get latest snapshot
        const snapshot = await prisma.codeHealthSnapshot.findFirst({
          where: {
            repositoryId,
            branch: branch || repo.defaultBranch,
          },
          orderBy: { analyzedAt: "desc" },
        });

        if (!snapshot) {
          return {
            data: {
              overall: 0,
              complexity: 0,
              duplication: 0,
              coverage: 0,
              maintainability: 0,
              security: 0,
              dependencies: 0,
              analyzedAt: null,
            },
          };
        }

        return {
          data: {
            overall: snapshot.overallScore,
            complexity: snapshot.complexityScore,
            duplication: snapshot.duplicationScore,
            coverage: snapshot.coverageScore,
            maintainability: snapshot.maintainabilityScore,
            security: snapshot.securityScore,
            dependencies: snapshot.dependencyScore,
            analyzedAt: snapshot.analyzedAt,
          },
        };
      } catch (error) {
        console.error("Error getting health scores:", error);
        return reply.code(500).send({
          error: { message: "Failed to get health scores" },
        });
      }
    }
  );

  // GET /api/code-health/trends
  // Returns historical trend data for metrics
  app.get<{ Querystring: TrendQuery }>(
    "/trends",
    async (request, reply) => {
      const { repositoryId, branch, metricType, days = "30" } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      try {
        // Verify access
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        const trends = await codeHealthService.getHealthHistory(
          repositoryId,
          metricType,
          parseInt(days)
        );

        return { data: trends };
      } catch (error) {
        console.error("Error getting health trends:", error);
        return reply.code(500).send({
          error: { message: "Failed to get health trends" },
        });
      }
    }
  );

  // GET /api/code-health/hotspots
  // Returns high-churn risky files
  app.get<{ Querystring: HotspotQuery }>(
    "/hotspots",
    async (request, reply) => {
      const { repositoryId, branch, limit = "20", riskLevel } = request.query;
      const userId = request.userId;

      if (!repositoryId) {
        return reply.code(400).send({
          error: { message: "repositoryId is required" },
        });
      }

      try {
        // Verify access
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        const whereClause: any = {
          repositoryId,
          branch: branch || repo.defaultBranch,
        };

        if (riskLevel) {
          whereClause.riskLevel = riskLevel;
        }

        const hotspots = await prisma.codeHotspot.findMany({
          where: whereClause,
          orderBy: { riskScore: "desc" },
          take: parseInt(limit),
        });

        return {
          data: hotspots.map((h) => ({
            id: h.id,
            filePath: h.filePath,
            changeCount: h.changeCount,
            additionCount: h.additionCount,
            deletionCount: h.deletionCount,
            authorCount: h.authorCount,
            complexity: h.complexity,
            testCoverage: h.testCoverage,
            riskScore: h.riskScore,
            riskLevel: h.riskLevel,
            firstSeenAt: h.firstSeenAt,
            lastChangedAt: h.lastChangedAt,
          })),
        };
      } catch (error) {
        console.error("Error getting hotspots:", error);
        return reply.code(500).send({
          error: { message: "Failed to get hotspots" },
        });
      }
    }
  );

  // GET /api/code-health/summary
  // Returns aggregated summary metrics
  app.get<{ Querystring: { repositoryId?: string; projectId?: string } }>(
    "/summary",
    async (request, reply) => {
      const { repositoryId, projectId } = request.query;
      const userId = request.userId;

      try {
        if (repositoryId) {
          const repo = await prisma.repository.findFirst({
            where: { id: repositoryId, userId },
          });

          if (!repo) {
            return reply.code(404).send({
              error: { message: "Repository not found" },
            });
          }

          const snapshot = await prisma.codeHealthSnapshot.findFirst({
            where: { repositoryId },
            orderBy: { analyzedAt: "desc" },
          });

          const hotspotCounts = await prisma.codeHotspot.groupBy({
            by: ["riskLevel"],
            where: { repositoryId },
            _count: true,
          });

          const riskCounts = hotspotCounts.reduce(
            (acc, item) => {
              acc[item.riskLevel] = item._count;
              return acc;
            },
            { low: 0, medium: 0, high: 0, critical: 0 } as Record<string, number>
          );

          return {
            data: {
              overallScore: snapshot?.overallScore || 0,
              totalFiles: snapshot?.totalFiles || 0,
              totalLines: snapshot?.totalLines || 0,
              technicalDebtHours: snapshot?.technicalDebtHours || 0,
              codeSmellCount: snapshot?.codeSmellCount || 0,
              hotspots: riskCounts,
              lastAnalyzed: snapshot?.analyzedAt || null,
            },
          };
        }

        if (projectId) {
          const project = await prisma.project.findFirst({
            where: { id: projectId, userId },
          });

          if (!project) {
            return reply.code(404).send({
              error: { message: "Project not found" },
            });
          }

          const summary = await prisma.projectHealthSummary.findUnique({
            where: { projectId },
          });

          return {
            data: summary || {
              overallScore: 0,
              avgComplexity: 0,
              avgCoverage: 0,
              avgMaintainability: 0,
              totalRepositories: 0,
              totalHotspots: 0,
              criticalHotspots: 0,
              scoreTrend: "stable",
              trendPercent: 0,
            },
          };
        }

        return reply.code(400).send({
          error: { message: "Either repositoryId or projectId is required" },
        });
      } catch (error) {
        console.error("Error getting health summary:", error);
        return reply.code(500).send({
          error: { message: "Failed to get health summary" },
        });
      }
    }
  );

  // POST /api/code-health/analyze
  // Triggers a new health analysis for a repository
  app.post<{ Body: { repositoryId: string; branch?: string } }>(
    "/analyze",
    async (request, reply) => {
      const { repositoryId, branch } = request.body;
      const userId = request.userId;

      try {
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        // Trigger analysis
        const snapshot = await codeHealthService.calculateRepositoryHealth(
          repositoryId,
          branch
        );

        if (!snapshot) {
          return reply.code(500).send({
            error: { message: "Failed to analyze repository health" },
          });
        }

        return {
          data: {
            snapshotId: snapshot.id,
            overallScore: snapshot.overallScore,
            analyzedAt: snapshot.analyzedAt,
            message: "Health analysis completed successfully",
          },
        };
      } catch (error) {
        console.error("Error analyzing repository health:", error);
        return reply.code(500).send({
          error: { message: "Failed to analyze repository health" },
        });
      }
    }
  );

  // GET /api/code-health/comparison
  // Returns comparison between two time periods
  app.get<{
    Querystring: {
      repositoryId: string;
      period1Start: string;
      period1End: string;
      period2Start: string;
      period2End: string;
    };
  }>(
    "/comparison",
    async (request, reply) => {
      const { repositoryId, period1Start, period1End, period2Start, period2End } =
        request.query;
      const userId = request.userId;

      try {
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        // Get average scores for each period
        const period1Snapshots = await prisma.codeHealthSnapshot.findMany({
          where: {
            repositoryId,
            analyzedAt: {
              gte: new Date(period1Start),
              lte: new Date(period1End),
            },
          },
        });

        const period2Snapshots = await prisma.codeHealthSnapshot.findMany({
          where: {
            repositoryId,
            analyzedAt: {
              gte: new Date(period2Start),
              lte: new Date(period2End),
            },
          },
        });

        const calculateAvg = (
          snapshots: typeof period1Snapshots,
          key: keyof typeof period1Snapshots[0]
        ) => {
          if (snapshots.length === 0) return 0;
          const sum = snapshots.reduce((acc, s) => acc + (Number(s[key]) || 0), 0);
          return Math.round((sum / snapshots.length) * 10) / 10;
        };

        const period1 = {
          overall: calculateAvg(period1Snapshots, "overallScore"),
          complexity: calculateAvg(period1Snapshots, "complexityScore"),
          duplication: calculateAvg(period1Snapshots, "duplicationScore"),
          coverage: calculateAvg(period1Snapshots, "coverageScore"),
          maintainability: calculateAvg(period1Snapshots, "maintainabilityScore"),
          security: calculateAvg(period1Snapshots, "securityScore"),
          dependencies: calculateAvg(period1Snapshots, "dependencyScore"),
          snapshotCount: period1Snapshots.length,
        };

        const period2 = {
          overall: calculateAvg(period2Snapshots, "overallScore"),
          complexity: calculateAvg(period2Snapshots, "complexityScore"),
          duplication: calculateAvg(period2Snapshots, "duplicationScore"),
          coverage: calculateAvg(period2Snapshots, "coverageScore"),
          maintainability: calculateAvg(period2Snapshots, "maintainabilityScore"),
          security: calculateAvg(period2Snapshots, "securityScore"),
          dependencies: calculateAvg(period2Snapshots, "dependencyScore"),
          snapshotCount: period2Snapshots.length,
        };

        // Calculate changes
        const changes = {
          overall: period1.overall - period2.overall,
          complexity: period1.complexity - period2.complexity,
          duplication: period1.duplication - period2.duplication,
          coverage: period1.coverage - period2.coverage,
          maintainability: period1.maintainability - period2.maintainability,
          security: period1.security - period2.security,
          dependencies: period1.dependencies - period2.dependencies,
        };

        return {
          data: {
            period1,
            period2,
            changes,
            improvement:
              changes.overall > 0
                ? "improving"
                : changes.overall < 0
                ? "degrading"
                : "stable",
          },
        };
      } catch (error) {
        console.error("Error getting comparison:", error);
        return reply.code(500).send({
          error: { message: "Failed to get comparison" },
        });
      }
    }
  );

  // GET /api/code-health/metrics/history
  // Returns historical snapshots
  app.get<{
    Querystring: { repositoryId: string; branch?: string; days?: string };
  }>(
    "/metrics/history",
    async (request, reply) => {
      const { repositoryId, branch, days = "30" } = request.query;
      const userId = request.userId;

      try {
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        const startDate = new Date(
          Date.now() - parseInt(days) * 24 * 60 * 60 * 1000
        );

        const snapshots = await prisma.codeHealthSnapshot.findMany({
          where: {
            repositoryId,
            branch: branch || repo.defaultBranch,
            analyzedAt: { gte: startDate },
          },
          orderBy: { analyzedAt: "asc" },
          select: {
            id: true,
            overallScore: true,
            complexityScore: true,
            duplicationScore: true,
            coverageScore: true,
            maintainabilityScore: true,
            securityScore: true,
            dependencyScore: true,
            totalFiles: true,
            totalLines: true,
            technicalDebtHours: true,
            codeSmellCount: true,
            analyzedAt: true,
          },
        });

        return {
          data: snapshots.map((s) => ({
            ...s,
            date: s.analyzedAt.toISOString().split("T")[0],
          })),
        };
      } catch (error) {
        console.error("Error getting metrics history:", error);
        return reply.code(500).send({
          error: { message: "Failed to get metrics history" },
        });
      }
    }
  );

  // GET /api/code-health/debt
  // Returns technical debt analysis
  app.get<{ Querystring: { repositoryId: string } }>(
    "/debt",
    async (request, reply) => {
      const { repositoryId } = request.query;
      const userId = request.userId;

      try {
        const repo = await prisma.repository.findFirst({
          where: { id: repositoryId, userId },
        });

        if (!repo) {
          return reply.code(404).send({
            error: { message: "Repository not found" },
          });
        }

        const snapshot = await prisma.codeHealthSnapshot.findFirst({
          where: { repositoryId },
          orderBy: { analyzedAt: "desc" },
        });

        const hotspots = await prisma.codeHotspot.findMany({
          where: { repositoryId },
          orderBy: { riskScore: "desc" },
          take: 10,
        });

        // Estimate debt hours by category
        const complexityDebt = snapshot
          ? Math.round((100 - snapshot.complexityScore) * 0.5)
          : 0;
        const duplicationDebt = snapshot
          ? Math.round((100 - snapshot.duplicationScore) * 0.3)
          : 0;
        const testDebt = snapshot
          ? Math.round((100 - snapshot.coverageScore) * 0.4)
          : 0;
        const hotspotDebt = hotspots.reduce(
          (sum, h) => sum + (h.riskScore > 50 ? 2 : 1),
          0
        );

        return {
          data: {
            totalDebtHours: snapshot?.technicalDebtHours || 0,
            byCategory: {
              complexity: complexityDebt,
              duplication: duplicationDebt,
              testCoverage: testDebt,
              hotspots: hotspotDebt,
            },
            codeSmellCount: snapshot?.codeSmellCount || 0,
            topHotspots: hotspots.slice(0, 5).map((h) => ({
              filePath: h.filePath,
              riskScore: h.riskScore,
              riskLevel: h.riskLevel,
              estimatedHours: h.riskScore > 75 ? 4 : h.riskScore > 50 ? 2 : 1,
            })),
            recommendations: generateDebtRecommendations(snapshot, hotspots),
          },
        };
      } catch (error) {
        console.error("Error getting debt analysis:", error);
        return reply.code(500).send({
          error: { message: "Failed to get debt analysis" },
        });
      }
    }
  );
};

// Helper function to generate recommendations
function generateDebtRecommendations(
  snapshot: any,
  hotspots: any[]
): string[] {
  const recommendations: string[] = [];

  if (snapshot) {
    if (snapshot.complexityScore < 60) {
      recommendations.push(
        "Consider refactoring complex functions. Break down functions with high cyclomatic complexity."
      );
    }

    if (snapshot.duplicationScore < 60) {
      recommendations.push(
        "Address code duplication. Extract common patterns into shared utilities or components."
      );
    }

    if (snapshot.coverageScore < 50) {
      recommendations.push(
        "Improve test coverage. Focus on critical paths and business logic."
      );
    }

    if (snapshot.dependencyScore < 70) {
      recommendations.push(
        "Update vulnerable or outdated dependencies. Review security advisories."
      );
    }
  }

  if (hotspots.filter((h) => h.riskLevel === "critical").length > 0) {
    recommendations.push(
      "Prioritize critical hotspots for refactoring. These files have high churn and complexity."
    );
  }

  if (hotspots.filter((h) => h.authorCount > 5).length > 3) {
    recommendations.push(
      "Consider code ownership. Some files are being modified by many authors, which can lead to inconsistencies."
    );
  }

  return recommendations;
}
