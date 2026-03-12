/**
 * Code Health Service (Worker)
 *
 * Triggers code health analysis after scans complete.
 * This is a simplified version focused on post-scan health calculation.
 */

import { prisma } from "../db.js";

interface HealthScores {
  overall: number;
  complexity: number;
  duplication: number;
  coverage: number;
  maintainability: number;
  security: number;
  dependencies: number;
}

/**
 * Convert complexity value to a 0-100 score (higher = better)
 */
function complexityToScore(avgComplexity: number): number {
  if (avgComplexity <= 1) return 100;
  if (avgComplexity <= 5) return Math.round(100 - ((avgComplexity - 1) * 5));
  if (avgComplexity <= 10) return Math.round(80 - ((avgComplexity - 5) * 4));
  if (avgComplexity <= 20) return Math.round(60 - ((avgComplexity - 10) * 3));
  return Math.max(0, Math.round(30 - ((avgComplexity - 20) * 1.5)));
}

/**
 * Convert duplication percentage to a 0-100 score (higher = better)
 */
function duplicationToScore(duplicationPct: number): number {
  if (duplicationPct <= 0) return 100;
  if (duplicationPct <= 5) return Math.round(100 - (duplicationPct * 2));
  if (duplicationPct <= 15) return Math.round(90 - ((duplicationPct - 5) * 3));
  if (duplicationPct <= 30) return Math.round(60 - ((duplicationPct - 15) * 2));
  return Math.max(0, Math.round(30 - (duplicationPct - 30)));
}

/**
 * Calculate maintainability score
 */
function calculateMaintainabilityScore(
  avgComplexity: number,
  avgLinesPerFile: number,
  duplicationPct: number
): number {
  const complexityFactor = Math.max(0, 100 - (avgComplexity * 3));
  const sizeFactor = avgLinesPerFile <= 300 ? 100 : Math.max(0, 100 - ((avgLinesPerFile - 300) * 0.1));
  const duplicationFactor = Math.max(0, 100 - (duplicationPct * 2));
  return Math.round((complexityFactor * 0.4 + sizeFactor * 0.3 + duplicationFactor * 0.3));
}

/**
 * Calculate overall health score from individual metrics
 */
function calculateOverallScore(scores: Omit<HealthScores, "overall">): number {
  const weights = {
    complexity: 0.20,
    duplication: 0.15,
    coverage: 0.25,
    maintainability: 0.20,
    security: 0.10,
    dependencies: 0.10,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = scores[key as keyof typeof scores];
    if (score !== null && score !== undefined) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Calculate code health for a repository after scan
 */
export async function calculateRepositoryHealth(
  repositoryId: string,
  scanResultId: string,
  branch?: string
): Promise<void> {
  try {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        dependencyAlerts: {
          where: { status: "active" },
        },
      },
    });

    if (!repository) {
      console.warn(`Repository ${repositoryId} not found for health calculation`);
      return;
    }

    // Get the scan result with code analysis
    const scanResult = await prisma.scanResult.findUnique({
      where: { id: scanResultId },
      include: { codeAnalysis: true },
    });

    if (!scanResult) {
      console.warn(`Scan result ${scanResultId} not found for health calculation`);
      return;
    }

    // Extract data from scan result
    const codeAnalysis = scanResult.codeAnalysis;
    const duplications = (codeAnalysis?.duplications as any[]) || [];
    const performanceIssues = (codeAnalysis?.performanceIssues as any[]) || [];

    // Parse language profile - it contains { languages: [{fileCount, lineCount, ...}], ... }
    const languageProfileData = scanResult.languageProfile as {
      languages?: Array<{ language: string; fileCount: number; lineCount: number; percentage: number }>;
      frameworkHints?: string[];
    } | null;

    // Calculate duplication percentage
    const duplicationCount = duplications.reduce((sum, d) => sum + (d.lineCount || d.similarity * 10 || 5), 0);

    // Calculate real file and line counts from language profile
    let totalFiles = 0;
    let totalLines = 0;

    // Extract from language profile languages array (most accurate)
    if (languageProfileData?.languages && Array.isArray(languageProfileData.languages)) {
      for (const lang of languageProfileData.languages) {
        if (lang.fileCount) totalFiles += lang.fileCount;
        if (lang.lineCount) totalLines += lang.lineCount;
      }
    }

    // Fallback: Estimate from tasks created
    if (totalFiles === 0 && scanResult.tasksCreated) {
      totalFiles = Math.max(10, scanResult.tasksCreated * 4);
    }

    // Fallback: Estimate lines from files
    if (totalLines === 0 && totalFiles > 0) {
      totalLines = totalFiles * 80;
    }

    // Calculate complexity from performance issues
    const avgComplexity = performanceIssues.length > 0
      ? Math.min(15, 5 + performanceIssues.length)
      : 5;

    // Calculate duplication percentage
    const duplicationPct = totalLines > 0
      ? Math.min(30, (duplicationCount / totalLines) * 100)
      : (duplications.length > 0 ? Math.min(30, duplications.length * 2) : 0);

    const testCoveragePct: number | null = null; // Would need test coverage analysis

    // Calculate scores
    const complexityScore = complexityToScore(avgComplexity);
    const duplicationScore = duplicationToScore(duplicationPct);
    const coverageScore = testCoveragePct !== null ? testCoveragePct : 50;
    const maintainabilityScore = calculateMaintainabilityScore(
      avgComplexity,
      totalFiles > 0 ? totalLines / totalFiles : 100,
      duplicationPct
    );
    const securityScore = Math.max(0, 85 - performanceIssues.length * 5);

    // Dependency score based on alerts
    const criticalAlerts = repository.dependencyAlerts.filter(a => a.severity === "critical").length;
    const highAlerts = repository.dependencyAlerts.filter(a => a.severity === "high").length;
    const dependencyScore = Math.max(0, 100 - (criticalAlerts * 20) - (highAlerts * 10));

    // Calculate overall score
    const overallScore = calculateOverallScore({
      complexity: complexityScore,
      duplication: duplicationScore,
      coverage: coverageScore,
      maintainability: maintainabilityScore,
      security: securityScore,
      dependencies: dependencyScore,
    });

    // Estimate technical debt
    const technicalDebtHours = Math.round(
      (100 - overallScore) * 0.5 * (totalFiles / 100)
    );

    // Count code smells
    const codeSmellCount = Math.round(
      (100 - complexityScore) / 10 +
      (100 - duplicationScore) / 10 +
      (100 - maintainabilityScore) / 10
    );

    const targetBranch = branch || repository.defaultBranch || "main";

    // Create or update snapshot
    await prisma.codeHealthSnapshot.create({
      data: {
        repositoryId,
        branch: targetBranch,
        overallScore,
        complexityScore,
        duplicationScore,
        coverageScore,
        maintainabilityScore,
        securityScore,
        dependencyScore,
        totalFiles,
        totalLines,
        avgComplexity,
        duplicationPct,
        testCoveragePct,
        docCoveragePct: null,
        technicalDebtHours,
        codeSmellCount,
        bugRiskCount: 0,
        metadata: {
          scanId: scanResultId,
          languageProfile: scanResult.languageProfile,
          primaryLanguage: scanResult.primaryLanguage,
        },
      },
    });

    // Update quality trends
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const previousSnapshot = await prisma.codeHealthSnapshot.findFirst({
      where: {
        repositoryId,
        branch: targetBranch,
        analyzedAt: { lt: today },
      },
      orderBy: { analyzedAt: "desc" },
    });

    const metrics = [
      { type: "complexity" as const, value: complexityScore, prev: previousSnapshot?.complexityScore },
      { type: "duplication" as const, value: duplicationScore, prev: previousSnapshot?.duplicationScore },
      { type: "test_coverage" as const, value: coverageScore, prev: previousSnapshot?.coverageScore },
      { type: "maintainability" as const, value: maintainabilityScore, prev: previousSnapshot?.maintainabilityScore },
      { type: "security" as const, value: securityScore, prev: previousSnapshot?.securityScore },
      { type: "dependencies" as const, value: dependencyScore, prev: previousSnapshot?.dependencyScore },
    ];

    for (const metric of metrics) {
      const changePercent = metric.prev ? ((metric.value - metric.prev) / metric.prev) * 100 : null;

      await prisma.codeQualityTrend.upsert({
        where: {
          repositoryId_branch_metricType_date: {
            repositoryId,
            branch: targetBranch,
            metricType: metric.type,
            date: today,
          },
        },
        update: {
          value: metric.value,
          previousValue: metric.prev,
          changePercent,
        },
        create: {
          repositoryId,
          branch: targetBranch,
          metricType: metric.type,
          date: today,
          value: metric.value,
          previousValue: metric.prev,
          changePercent,
        },
      });
    }

    console.log(`Code health calculated for ${repository.fullName}: overall score ${overallScore}`);
  } catch (error) {
    console.error("Failed to calculate repository health:", error);
    // Don't throw - health calculation is non-critical
  }
}

export const codeHealthService = {
  calculateRepositoryHealth,
};
