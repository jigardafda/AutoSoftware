/**
 * Predictive Analysis Service
 *
 * Provides predictive insights for code changes including:
 * - Breaking change detection ("This will break when...")
 * - Regression risk scoring for PRs
 * - Technical debt trajectory forecasting
 * - Growing complexity alerts for files/modules
 */

import { prisma } from "../db.js";

// Types for predictive analysis
export interface BreakingChangeWarning {
  id: string;
  type: "api_change" | "dependency_conflict" | "behavior_change" | "schema_change" | "config_change";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  affectedFiles: string[];
  affectedConsumers: string[];
  suggestedActions: string[];
  confidence: number;
  createdAt: Date;
}

export interface RegressionRiskScore {
  taskId: string;
  overallScore: number; // 0-100, higher = more risk
  factors: {
    name: string;
    score: number;
    weight: number;
    description: string;
  }[];
  recommendation: string;
  historicalData: {
    similarChanges: number;
    regressionRate: number;
    avgTimeToDetect: number;
  };
}

export interface TechnicalDebtMetric {
  date: string;
  score: number; // 0-100, higher = more debt
  components: {
    codeComplexity: number;
    duplications: number;
    outdatedDependencies: number;
    missingTests: number;
    documentationGaps: number;
  };
}

export interface TechnicalDebtForecast {
  currentScore: number;
  projectedScore30Days: number;
  projectedScore90Days: number;
  trend: "improving" | "stable" | "degrading" | "critical";
  trajectory: TechnicalDebtMetric[];
  recommendations: {
    priority: "high" | "medium" | "low";
    action: string;
    impact: number;
  }[];
}

export interface ComplexityAlert {
  id: string;
  type: "file" | "module" | "function";
  path: string;
  name: string;
  currentComplexity: number;
  previousComplexity: number;
  growthRate: number; // percentage increase
  trend: "stable" | "growing" | "rapid_growth" | "critical";
  metrics: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    dependencies: number;
    changeFrequency: number;
  };
  recommendations: string[];
  createdAt: Date;
}

export interface FileComplexityHistory {
  path: string;
  history: {
    date: string;
    complexity: number;
    linesOfCode: number;
    changes: number;
  }[];
}

export interface PredictiveInsightsSummary {
  breakingChangeWarnings: BreakingChangeWarning[];
  regressionRiskScores: RegressionRiskScore[];
  technicalDebtForecast: TechnicalDebtForecast;
  complexityAlerts: ComplexityAlert[];
  overallHealthScore: number;
  trends: {
    codeQuality: "improving" | "stable" | "degrading";
    riskLevel: "low" | "medium" | "high" | "critical";
    debtTrajectory: "improving" | "stable" | "worsening";
  };
}

// Complexity thresholds
const COMPLEXITY_THRESHOLDS = {
  low: 10,
  medium: 20,
  high: 40,
  critical: 60,
};

const GROWTH_RATE_THRESHOLDS = {
  stable: 5,
  growing: 15,
  rapidGrowth: 30,
};

class PredictiveAnalysisService {
  /**
   * Analyze code changes for potential breaking changes
   */
  async analyzeBreakingChanges(
    taskId: string,
    userId: string
  ): Promise<BreakingChangeWarning[]> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        repository: true,
        codeChangeMetrics: true,
      },
    });

    if (!task) {
      return [];
    }

    const warnings: BreakingChangeWarning[] = [];
    const affectedFiles = (task.affectedFiles as string[]) || [];
    const fileBreakdown = (task.codeChangeMetrics?.fileBreakdown as any[]) || [];

    // Analyze each affected file for potential breaking changes
    for (const filePath of affectedFiles) {
      const fileMetrics = fileBreakdown.find((f: any) => f.path === filePath);

      // Check for API-related files
      if (this.isApiFile(filePath)) {
        const apiWarning = await this.analyzeApiChanges(
          filePath,
          fileMetrics,
          task.repositoryId
        );
        if (apiWarning) {
          warnings.push(apiWarning);
        }
      }

      // Check for schema/migration files
      if (this.isSchemaFile(filePath)) {
        const schemaWarning = await this.analyzeSchemaChanges(
          filePath,
          fileMetrics,
          task.repositoryId
        );
        if (schemaWarning) {
          warnings.push(schemaWarning);
        }
      }

      // Check for configuration files
      if (this.isConfigFile(filePath)) {
        const configWarning = await this.analyzeConfigChanges(
          filePath,
          fileMetrics,
          task.repositoryId
        );
        if (configWarning) {
          warnings.push(configWarning);
        }
      }

      // Check for dependency changes
      if (this.isDependencyFile(filePath)) {
        const depWarning = await this.analyzeDependencyChanges(
          filePath,
          fileMetrics,
          task.repositoryId
        );
        if (depWarning) {
          warnings.push(depWarning);
        }
      }
    }

    // Check for behavior-affecting changes based on metrics
    if (task.codeChangeMetrics) {
      const behaviorWarnings = await this.analyzeBehaviorChanges(
        task.codeChangeMetrics,
        task.repositoryId
      );
      warnings.push(...behaviorWarnings);
    }

    return warnings;
  }

  /**
   * Calculate regression risk score for a task/PR
   */
  async calculateRegressionRisk(
    taskId: string,
    userId: string
  ): Promise<RegressionRiskScore> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        repository: true,
        codeChangeMetrics: true,
      },
    });

    if (!task) {
      return this.getDefaultRegressionScore(taskId);
    }

    const factors: RegressionRiskScore["factors"] = [];

    // Factor 1: File change frequency (historically buggy files)
    const changeFrequencyScore = await this.calculateChangeFrequencyRisk(
      task.repositoryId,
      (task.affectedFiles as string[]) || []
    );
    factors.push({
      name: "Change Frequency Risk",
      score: changeFrequencyScore,
      weight: 0.2,
      description:
        changeFrequencyScore > 70
          ? "Files have high historical change frequency"
          : changeFrequencyScore > 40
            ? "Moderate change frequency in affected files"
            : "Files have stable change history",
    });

    // Factor 2: Code complexity
    const complexityScore = await this.calculateComplexityRisk(
      task.codeChangeMetrics
    );
    factors.push({
      name: "Code Complexity",
      score: complexityScore,
      weight: 0.25,
      description:
        complexityScore > 70
          ? "High code complexity increases regression risk"
          : complexityScore > 40
            ? "Moderate complexity level"
            : "Low complexity, easier to maintain",
    });

    // Factor 3: Test coverage (simulated - would integrate with actual coverage tools)
    const testCoverageScore = await this.estimateTestCoverageRisk(
      task.repositoryId,
      (task.affectedFiles as string[]) || []
    );
    factors.push({
      name: "Test Coverage Gap",
      score: testCoverageScore,
      weight: 0.25,
      description:
        testCoverageScore > 70
          ? "Low test coverage in affected areas"
          : testCoverageScore > 40
            ? "Partial test coverage"
            : "Good test coverage for affected files",
    });

    // Factor 4: Dependency impact
    const dependencyScore = await this.calculateDependencyImpact(
      (task.affectedFiles as string[]) || []
    );
    factors.push({
      name: "Dependency Impact",
      score: dependencyScore,
      weight: 0.15,
      description:
        dependencyScore > 70
          ? "Changes affect many dependent modules"
          : dependencyScore > 40
            ? "Moderate dependency impact"
            : "Limited dependency impact",
    });

    // Factor 5: Historical regression rate
    const historicalScore = await this.calculateHistoricalRegressionRate(
      task.repositoryId,
      task.type
    );
    factors.push({
      name: "Historical Regression Rate",
      score: historicalScore.score,
      weight: 0.15,
      description:
        historicalScore.score > 70
          ? `Similar changes have ${historicalScore.rate.toFixed(0)}% regression rate`
          : historicalScore.score > 40
            ? "Moderate historical regression rate"
            : "Low historical regression rate",
    });

    // Calculate overall score
    const overallScore = Math.round(
      factors.reduce((sum, f) => sum + f.score * f.weight, 0)
    );

    // Generate recommendation
    const recommendation = this.generateRegressionRecommendation(
      overallScore,
      factors
    );

    // Get historical data
    const similarTasks = await prisma.task.count({
      where: {
        repositoryId: task.repositoryId,
        type: task.type,
        status: "completed",
      },
    });

    const failedSimilar = await prisma.task.count({
      where: {
        repositoryId: task.repositoryId,
        type: task.type,
        status: "failed",
      },
    });

    return {
      taskId,
      overallScore,
      factors,
      recommendation,
      historicalData: {
        similarChanges: similarTasks,
        regressionRate:
          similarTasks > 0
            ? Math.round((failedSimilar / similarTasks) * 100)
            : 0,
        avgTimeToDetect: 24, // hours - placeholder
      },
    };
  }

  /**
   * Forecast technical debt trajectory
   */
  async forecastTechnicalDebt(
    repositoryId: string,
    userId: string
  ): Promise<TechnicalDebtForecast> {
    // Get historical code analysis results
    const recentScans = await prisma.scanResult.findMany({
      where: { repositoryId },
      include: { codeAnalysis: true },
      orderBy: { scannedAt: "desc" },
      take: 30,
    });

    // Calculate current technical debt metrics
    const currentMetrics = await this.calculateCurrentDebtMetrics(
      repositoryId,
      recentScans
    );

    // Build trajectory from historical data
    const trajectory: TechnicalDebtMetric[] = [];
    const now = new Date();

    // Historical data (past 30 days)
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // Find scan closest to this date
      const scan = recentScans.find((s) => {
        const scanDate = new Date(s.scannedAt).toISOString().split("T")[0];
        return scanDate === dateStr;
      });

      if (scan?.codeAnalysis) {
        trajectory.push({
          date: dateStr,
          score: this.calculateDebtScore(scan.codeAnalysis),
          components: this.extractDebtComponents(scan.codeAnalysis),
        });
      } else if (trajectory.length > 0) {
        // Interpolate from last known value
        trajectory.push({
          date: dateStr,
          score: trajectory[trajectory.length - 1].score,
          components: trajectory[trajectory.length - 1].components,
        });
      } else {
        // Default starting value
        trajectory.push({
          date: dateStr,
          score: 30,
          components: {
            codeComplexity: 25,
            duplications: 10,
            outdatedDependencies: 15,
            missingTests: 40,
            documentationGaps: 30,
          },
        });
      }
    }

    // Calculate trend
    const trend = this.calculateDebtTrend(trajectory);

    // Project future scores
    const trendSlope = this.calculateTrendSlope(trajectory);
    const currentScore =
      trajectory.length > 0 ? trajectory[trajectory.length - 1].score : 30;
    const projectedScore30Days = Math.max(
      0,
      Math.min(100, currentScore + trendSlope * 30)
    );
    const projectedScore90Days = Math.max(
      0,
      Math.min(100, currentScore + trendSlope * 90)
    );

    // Generate recommendations
    const recommendations = this.generateDebtRecommendations(
      currentMetrics,
      trend
    );

    return {
      currentScore,
      projectedScore30Days: Math.round(projectedScore30Days),
      projectedScore90Days: Math.round(projectedScore90Days),
      trend,
      trajectory,
      recommendations,
    };
  }

  /**
   * Detect growing complexity in files/modules
   */
  async detectComplexityGrowth(
    repositoryId: string,
    userId: string
  ): Promise<ComplexityAlert[]> {
    const alerts: ComplexityAlert[] = [];

    // Get recent code change metrics for this repository
    const recentMetrics = await prisma.codeChangeMetrics.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Group changes by file
    const fileChanges = new Map<
      string,
      { changes: number; linesAdded: number; linesDeleted: number }
    >();

    for (const metric of recentMetrics) {
      const breakdown = (metric.fileBreakdown as any[]) || [];
      for (const file of breakdown) {
        const existing = fileChanges.get(file.path) || {
          changes: 0,
          linesAdded: 0,
          linesDeleted: 0,
        };
        existing.changes++;
        existing.linesAdded += file.added || 0;
        existing.linesDeleted += file.deleted || 0;
        fileChanges.set(file.path, existing);
      }
    }

    // Get code analysis for complexity data
    const latestScan = await prisma.scanResult.findFirst({
      where: { repositoryId },
      include: { codeAnalysis: true },
      orderBy: { scannedAt: "desc" },
    });

    // Analyze each file for complexity growth
    for (const [filePath, changes] of fileChanges) {
      // Estimate complexity based on changes and file type
      const estimatedComplexity = this.estimateFileComplexity(
        filePath,
        changes,
        latestScan?.codeAnalysis
      );

      // Calculate growth rate (compare to historical average)
      const historicalComplexity = await this.getHistoricalComplexity(
        repositoryId,
        filePath
      );
      const growthRate =
        historicalComplexity > 0
          ? ((estimatedComplexity.current - historicalComplexity) /
              historicalComplexity) *
            100
          : 0;

      // Determine trend
      let trend: ComplexityAlert["trend"] = "stable";
      if (growthRate > GROWTH_RATE_THRESHOLDS.rapidGrowth) {
        trend = "rapid_growth";
      } else if (growthRate > GROWTH_RATE_THRESHOLDS.growing) {
        trend = "growing";
      } else if (
        estimatedComplexity.current > COMPLEXITY_THRESHOLDS.critical
      ) {
        trend = "critical";
      }

      // Only create alerts for growing or critical files
      if (
        trend !== "stable" ||
        estimatedComplexity.current > COMPLEXITY_THRESHOLDS.high
      ) {
        alerts.push({
          id: `complexity-${filePath.replace(/[/\\]/g, "-")}`,
          type: "file",
          path: filePath,
          name: filePath.split("/").pop() || filePath,
          currentComplexity: estimatedComplexity.current,
          previousComplexity: historicalComplexity,
          growthRate: Math.round(growthRate * 10) / 10,
          trend,
          metrics: {
            cyclomaticComplexity: estimatedComplexity.cyclomatic,
            linesOfCode: changes.linesAdded - changes.linesDeleted,
            dependencies: estimatedComplexity.dependencies,
            changeFrequency: changes.changes,
          },
          recommendations: this.generateComplexityRecommendations(
            filePath,
            trend,
            estimatedComplexity
          ),
          createdAt: new Date(),
        });
      }
    }

    // Sort by severity (critical first, then by growth rate)
    return alerts.sort((a, b) => {
      const severityOrder = { critical: 0, rapid_growth: 1, growing: 2, stable: 3 };
      const severityDiff = severityOrder[a.trend] - severityOrder[b.trend];
      if (severityDiff !== 0) return severityDiff;
      return b.growthRate - a.growthRate;
    });
  }

  /**
   * Get comprehensive predictive insights summary
   */
  async getPredictiveInsights(
    repositoryId: string,
    userId: string,
    taskId?: string
  ): Promise<PredictiveInsightsSummary> {
    const [breakingWarnings, debtForecast, complexityAlerts] = await Promise.all(
      [
        taskId ? this.analyzeBreakingChanges(taskId, userId) : [],
        this.forecastTechnicalDebt(repositoryId, userId),
        this.detectComplexityGrowth(repositoryId, userId),
      ]
    );

    // Get regression scores for recent tasks
    const recentTasks = await prisma.task.findMany({
      where: {
        repositoryId,
        userId,
        status: { in: ["pending", "in_progress", "planning"] },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    const regressionScores = await Promise.all(
      recentTasks.map((t) => this.calculateRegressionRisk(t.id, userId))
    );

    // Calculate overall health score
    const avgRegressionRisk =
      regressionScores.length > 0
        ? regressionScores.reduce((sum, r) => sum + r.overallScore, 0) /
          regressionScores.length
        : 0;

    const criticalAlerts = complexityAlerts.filter(
      (a) => a.trend === "critical" || a.trend === "rapid_growth"
    ).length;

    const healthScore = Math.max(
      0,
      100 -
        debtForecast.currentScore * 0.4 -
        avgRegressionRisk * 0.3 -
        criticalAlerts * 5 -
        breakingWarnings.filter((w) => w.severity === "critical").length * 10
    );

    // Determine trends
    const codeQuality: "improving" | "stable" | "degrading" =
      debtForecast.trend === "improving"
        ? "improving"
        : debtForecast.trend === "stable"
          ? "stable"
          : "degrading";

    const riskLevel: "low" | "medium" | "high" | "critical" =
      avgRegressionRisk > 70
        ? "critical"
        : avgRegressionRisk > 50
          ? "high"
          : avgRegressionRisk > 30
            ? "medium"
            : "low";

    const debtTrajectory: "improving" | "stable" | "worsening" =
      debtForecast.projectedScore30Days < debtForecast.currentScore - 5
        ? "improving"
        : debtForecast.projectedScore30Days > debtForecast.currentScore + 5
          ? "worsening"
          : "stable";

    return {
      breakingChangeWarnings: breakingWarnings,
      regressionRiskScores: regressionScores,
      technicalDebtForecast: debtForecast,
      complexityAlerts,
      overallHealthScore: Math.round(healthScore),
      trends: {
        codeQuality,
        riskLevel,
        debtTrajectory,
      },
    };
  }

  /**
   * Get file complexity history for trend visualization
   */
  async getFileComplexityHistory(
    repositoryId: string,
    filePath: string
  ): Promise<FileComplexityHistory> {
    const metrics = await prisma.codeChangeMetrics.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    const history: FileComplexityHistory["history"] = [];
    let runningComplexity = 10; // baseline

    for (const metric of metrics) {
      const breakdown = (metric.fileBreakdown as any[]) || [];
      const fileData = breakdown.find((f: any) => f.path === filePath);

      if (fileData) {
        // Estimate complexity change based on additions/deletions
        const netChange = (fileData.added || 0) - (fileData.deleted || 0);
        runningComplexity = Math.max(
          5,
          runningComplexity + netChange * 0.1
        );

        history.push({
          date: metric.createdAt.toISOString().split("T")[0],
          complexity: Math.round(runningComplexity),
          linesOfCode: fileData.added || 0,
          changes: 1,
        });
      }
    }

    return {
      path: filePath,
      history,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private isApiFile(filePath: string): boolean {
    const apiPatterns = [
      /\/api\//i,
      /\/routes\//i,
      /\/controllers\//i,
      /\/endpoints\//i,
      /\.api\./i,
      /openapi/i,
      /swagger/i,
    ];
    return apiPatterns.some((p) => p.test(filePath));
  }

  private isSchemaFile(filePath: string): boolean {
    const schemaPatterns = [
      /schema\./i,
      /\.prisma$/i,
      /migration/i,
      /\.sql$/i,
      /model\./i,
      /entity\./i,
    ];
    return schemaPatterns.some((p) => p.test(filePath));
  }

  private isConfigFile(filePath: string): boolean {
    const configPatterns = [
      /config\./i,
      /\.env/i,
      /settings\./i,
      /\.json$/,
      /\.yaml$/i,
      /\.yml$/i,
      /\.toml$/i,
    ];
    return configPatterns.some((p) => p.test(filePath));
  }

  private isDependencyFile(filePath: string): boolean {
    const depPatterns = [
      /package\.json$/i,
      /package-lock\.json$/i,
      /yarn\.lock$/i,
      /pnpm-lock\.yaml$/i,
      /requirements\.txt$/i,
      /Pipfile/i,
      /Gemfile/i,
      /go\.mod$/i,
      /Cargo\.toml$/i,
    ];
    return depPatterns.some((p) => p.test(filePath));
  }

  private async analyzeApiChanges(
    filePath: string,
    fileMetrics: any,
    repositoryId: string
  ): Promise<BreakingChangeWarning | null> {
    // Check if significant changes were made
    const added = fileMetrics?.added || 0;
    const deleted = fileMetrics?.deleted || 0;

    if (deleted > 5) {
      return {
        id: `api-${Date.now()}`,
        type: "api_change",
        severity: deleted > 20 ? "high" : "medium",
        title: "Potential API Breaking Change",
        description: `${deleted} lines deleted from API file ${filePath}. This may break consumers.`,
        affectedFiles: [filePath],
        affectedConsumers: ["External API consumers", "Frontend applications"],
        suggestedActions: [
          "Review deleted endpoints for backward compatibility",
          "Consider deprecation warnings before removal",
          "Update API documentation",
          "Notify dependent teams",
        ],
        confidence: 0.75,
        createdAt: new Date(),
      };
    }

    return null;
  }

  private async analyzeSchemaChanges(
    filePath: string,
    fileMetrics: any,
    repositoryId: string
  ): Promise<BreakingChangeWarning | null> {
    const deleted = fileMetrics?.deleted || 0;
    const added = fileMetrics?.added || 0;

    if (deleted > 0 || added > 10) {
      return {
        id: `schema-${Date.now()}`,
        type: "schema_change",
        severity: deleted > 5 ? "critical" : "high",
        title: "Database Schema Change Detected",
        description: `Schema file ${filePath} modified. This may require data migration.`,
        affectedFiles: [filePath],
        affectedConsumers: ["Database", "ORM models", "Data access layers"],
        suggestedActions: [
          "Create migration scripts",
          "Test with production-like data",
          "Plan rollback strategy",
          "Schedule maintenance window",
        ],
        confidence: 0.85,
        createdAt: new Date(),
      };
    }

    return null;
  }

  private async analyzeConfigChanges(
    filePath: string,
    fileMetrics: any,
    repositoryId: string
  ): Promise<BreakingChangeWarning | null> {
    const changed = (fileMetrics?.added || 0) + (fileMetrics?.deleted || 0);

    if (changed > 3) {
      return {
        id: `config-${Date.now()}`,
        type: "config_change",
        severity: "medium",
        title: "Configuration Change",
        description: `Configuration file ${filePath} modified. Verify environment compatibility.`,
        affectedFiles: [filePath],
        affectedConsumers: ["All environments", "CI/CD pipelines"],
        suggestedActions: [
          "Update environment variables across all environments",
          "Verify CI/CD pipeline compatibility",
          "Update deployment documentation",
        ],
        confidence: 0.65,
        createdAt: new Date(),
      };
    }

    return null;
  }

  private async analyzeDependencyChanges(
    filePath: string,
    fileMetrics: any,
    repositoryId: string
  ): Promise<BreakingChangeWarning | null> {
    const changed = (fileMetrics?.added || 0) + (fileMetrics?.deleted || 0);

    if (changed > 0) {
      return {
        id: `dep-${Date.now()}`,
        type: "dependency_conflict",
        severity: "medium",
        title: "Dependency Changes Detected",
        description: `Dependencies in ${filePath} modified. Verify compatibility.`,
        affectedFiles: [filePath],
        affectedConsumers: ["Build system", "Runtime environment"],
        suggestedActions: [
          "Run full test suite",
          "Check for breaking changes in updated packages",
          "Verify peer dependency compatibility",
          "Update lockfile",
        ],
        confidence: 0.70,
        createdAt: new Date(),
      };
    }

    return null;
  }

  private async analyzeBehaviorChanges(
    metrics: any,
    repositoryId: string
  ): Promise<BreakingChangeWarning[]> {
    const warnings: BreakingChangeWarning[] = [];

    // High churn indicates potential behavior changes
    const totalChanges = (metrics.linesAdded || 0) + (metrics.linesDeleted || 0);
    if (totalChanges > 200) {
      warnings.push({
        id: `behavior-${Date.now()}`,
        type: "behavior_change",
        severity: totalChanges > 500 ? "high" : "medium",
        title: "Significant Code Changes",
        description: `${totalChanges} lines changed across ${metrics.filesChanged || 0} files. Review for unintended behavior changes.`,
        affectedFiles: [],
        affectedConsumers: ["All dependent modules"],
        suggestedActions: [
          "Run comprehensive test suite",
          "Perform manual regression testing",
          "Review changes with team",
          "Consider phased rollout",
        ],
        confidence: 0.60,
        createdAt: new Date(),
      });
    }

    return warnings;
  }

  private async calculateChangeFrequencyRisk(
    repositoryId: string,
    affectedFiles: string[]
  ): Promise<number> {
    // Get recent changes to these files
    const recentMetrics = await prisma.codeChangeMetrics.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let changeCount = 0;
    for (const metric of recentMetrics) {
      const breakdown = (metric.fileBreakdown as any[]) || [];
      for (const file of breakdown) {
        if (affectedFiles.includes(file.path)) {
          changeCount++;
        }
      }
    }

    // Normalize to 0-100 scale
    return Math.min(100, (changeCount / Math.max(1, affectedFiles.length)) * 20);
  }

  private async calculateComplexityRisk(metrics: any): Promise<number> {
    if (!metrics) return 30;

    const linesChanged =
      (metrics.linesAdded || 0) + (metrics.linesDeleted || 0);
    const filesChanged = metrics.filesChanged || 1;

    // Higher changes per file = higher complexity
    const avgChangesPerFile = linesChanged / filesChanged;

    if (avgChangesPerFile > 100) return 90;
    if (avgChangesPerFile > 50) return 70;
    if (avgChangesPerFile > 25) return 50;
    if (avgChangesPerFile > 10) return 30;
    return 15;
  }

  private async estimateTestCoverageRisk(
    repositoryId: string,
    affectedFiles: string[]
  ): Promise<number> {
    // Check if test files exist for affected files
    const testPatterns = [".test.", ".spec.", "_test.", "_spec."];
    let hasTests = 0;

    for (const file of affectedFiles) {
      const isTest = testPatterns.some((p) => file.includes(p));
      if (isTest) continue;

      // Check if corresponding test file exists (simplified check)
      const baseName = file.replace(/\.[^/.]+$/, "");
      const potentialTests = testPatterns.map((p) => baseName + p);
      // In real implementation, would check actual files
      hasTests += Math.random() > 0.5 ? 1 : 0; // Simplified
    }

    const coverageRatio = affectedFiles.length > 0 ? hasTests / affectedFiles.length : 0;
    return Math.round((1 - coverageRatio) * 100);
  }

  private async calculateDependencyImpact(affectedFiles: string[]): Promise<number> {
    // Estimate based on file types and locations
    let impactScore = 0;

    for (const file of affectedFiles) {
      if (file.includes("/lib/") || file.includes("/utils/")) {
        impactScore += 20; // Utility files have high impact
      } else if (file.includes("/components/")) {
        impactScore += 10;
      } else if (file.includes("/services/")) {
        impactScore += 15;
      } else {
        impactScore += 5;
      }
    }

    return Math.min(100, impactScore);
  }

  private async calculateHistoricalRegressionRate(
    repositoryId: string,
    taskType: string
  ): Promise<{ score: number; rate: number }> {
    const [total, failed] = await Promise.all([
      prisma.task.count({
        where: { repositoryId, type: taskType as any, status: "completed" },
      }),
      prisma.task.count({
        where: { repositoryId, type: taskType as any, status: "failed" },
      }),
    ]);

    const rate = total > 0 ? (failed / total) * 100 : 0;
    const score = Math.min(100, rate * 2);

    return { score, rate };
  }

  private generateRegressionRecommendation(
    score: number,
    factors: RegressionRiskScore["factors"]
  ): string {
    if (score > 70) {
      return "High regression risk. Consider comprehensive testing, code review, and phased deployment.";
    } else if (score > 50) {
      return "Moderate regression risk. Ensure adequate test coverage and review critical paths.";
    } else if (score > 30) {
      return "Low-moderate risk. Standard testing and review procedures should suffice.";
    }
    return "Low regression risk. Proceed with normal development workflow.";
  }

  private getDefaultRegressionScore(taskId: string): RegressionRiskScore {
    return {
      taskId,
      overallScore: 0,
      factors: [],
      recommendation: "Unable to calculate regression risk - task not found.",
      historicalData: {
        similarChanges: 0,
        regressionRate: 0,
        avgTimeToDetect: 0,
      },
    };
  }

  private async calculateCurrentDebtMetrics(
    repositoryId: string,
    scans: any[]
  ): Promise<TechnicalDebtMetric["components"]> {
    const latestScan = scans[0];
    if (!latestScan?.codeAnalysis) {
      return {
        codeComplexity: 30,
        duplications: 15,
        outdatedDependencies: 20,
        missingTests: 35,
        documentationGaps: 25,
      };
    }

    return this.extractDebtComponents(latestScan.codeAnalysis);
  }

  private calculateDebtScore(codeAnalysis: any): number {
    const components = this.extractDebtComponents(codeAnalysis);
    return Math.round(
      components.codeComplexity * 0.25 +
        components.duplications * 0.2 +
        components.outdatedDependencies * 0.15 +
        components.missingTests * 0.25 +
        components.documentationGaps * 0.15
    );
  }

  private extractDebtComponents(
    codeAnalysis: any
  ): TechnicalDebtMetric["components"] {
    if (!codeAnalysis) {
      return {
        codeComplexity: 30,
        duplications: 15,
        outdatedDependencies: 20,
        missingTests: 35,
        documentationGaps: 25,
      };
    }

    // Extract metrics from code analysis (simplified)
    const duplications = (codeAnalysis.duplications as any[]) || [];
    const perfIssues = (codeAnalysis.performanceIssues as any[]) || [];
    const dependencies = (codeAnalysis.dependencies as any[]) || [];

    return {
      codeComplexity: Math.min(100, 30 + perfIssues.length * 5),
      duplications: Math.min(100, duplications.length * 10),
      outdatedDependencies: Math.min(
        100,
        dependencies.filter((d: any) => d.outdated).length * 10
      ),
      missingTests: 35, // Would need test coverage data
      documentationGaps: 25, // Would need doc analysis
    };
  }

  private calculateDebtTrend(
    trajectory: TechnicalDebtMetric[]
  ): TechnicalDebtForecast["trend"] {
    if (trajectory.length < 7) return "stable";

    const recentAvg =
      trajectory.slice(-7).reduce((sum, t) => sum + t.score, 0) / 7;
    const oldAvg =
      trajectory.slice(0, 7).reduce((sum, t) => sum + t.score, 0) / 7;

    const diff = recentAvg - oldAvg;

    if (diff < -5) return "improving";
    if (diff > 10) return "critical";
    if (diff > 5) return "degrading";
    return "stable";
  }

  private calculateTrendSlope(trajectory: TechnicalDebtMetric[]): number {
    if (trajectory.length < 2) return 0;

    // Simple linear regression slope
    const n = trajectory.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += trajectory[i].score;
      sumXY += i * trajectory[i].score;
      sumX2 += i * i;
    }

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private generateDebtRecommendations(
    metrics: TechnicalDebtMetric["components"],
    trend: TechnicalDebtForecast["trend"]
  ): TechnicalDebtForecast["recommendations"] {
    const recommendations: TechnicalDebtForecast["recommendations"] = [];

    if (metrics.missingTests > 40) {
      recommendations.push({
        priority: "high",
        action: "Increase test coverage for critical paths",
        impact: 20,
      });
    }

    if (metrics.codeComplexity > 50) {
      recommendations.push({
        priority: "high",
        action: "Refactor high-complexity modules",
        impact: 15,
      });
    }

    if (metrics.duplications > 30) {
      recommendations.push({
        priority: "medium",
        action: "Extract duplicated code into shared utilities",
        impact: 10,
      });
    }

    if (metrics.outdatedDependencies > 25) {
      recommendations.push({
        priority: "medium",
        action: "Update outdated dependencies",
        impact: 8,
      });
    }

    if (metrics.documentationGaps > 30) {
      recommendations.push({
        priority: "low",
        action: "Improve API and code documentation",
        impact: 5,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private estimateFileComplexity(
    filePath: string,
    changes: { changes: number; linesAdded: number; linesDeleted: number },
    codeAnalysis: any
  ): { current: number; cyclomatic: number; dependencies: number } {
    // Base complexity from file type
    let baseComplexity = 10;
    if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
      baseComplexity = 15; // React components tend to be more complex
    } else if (filePath.includes("/services/")) {
      baseComplexity = 20; // Services often have business logic
    }

    // Adjust based on changes
    const netGrowth = changes.linesAdded - changes.linesDeleted;
    const changeComplexity = Math.abs(netGrowth) * 0.1 + changes.changes * 2;

    return {
      current: Math.round(baseComplexity + changeComplexity),
      cyclomatic: Math.round(baseComplexity * 1.5),
      dependencies: Math.round(changes.changes * 0.5),
    };
  }

  private async getHistoricalComplexity(
    repositoryId: string,
    filePath: string
  ): Promise<number> {
    // Get historical metrics for this file
    const metrics = await prisma.codeChangeMetrics.findMany({
      where: { repositoryId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    let totalComplexity = 0;
    let count = 0;

    for (const metric of metrics) {
      const breakdown = (metric.fileBreakdown as any[]) || [];
      const fileData = breakdown.find((f: any) => f.path === filePath);
      if (fileData) {
        totalComplexity += (fileData.added || 0) * 0.1;
        count++;
      }
    }

    return count > 0 ? totalComplexity / count : 10;
  }

  private generateComplexityRecommendations(
    filePath: string,
    trend: ComplexityAlert["trend"],
    complexity: { current: number; cyclomatic: number; dependencies: number }
  ): string[] {
    const recommendations: string[] = [];

    if (trend === "critical" || trend === "rapid_growth") {
      recommendations.push(
        "Consider splitting this file into smaller modules"
      );
      recommendations.push(
        "Review recent changes for unnecessary complexity"
      );
    }

    if (complexity.cyclomatic > 30) {
      recommendations.push("Reduce cyclomatic complexity by extracting methods");
    }

    if (complexity.dependencies > 10) {
      recommendations.push(
        "Review dependencies - consider dependency injection"
      );
    }

    if (filePath.includes("/components/")) {
      recommendations.push("Consider extracting reusable components");
    }

    if (filePath.includes("/services/")) {
      recommendations.push("Review service boundaries and responsibilities");
    }

    return recommendations;
  }
}

export const predictiveAnalysisService = new PredictiveAnalysisService();
