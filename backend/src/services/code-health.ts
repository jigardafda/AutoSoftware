/**
 * Code Health Monitoring Service
 *
 * Provides comprehensive code health analysis including:
 * - Overall health score calculation (0-100)
 * - Complexity analysis
 * - Code duplication detection
 * - Test coverage tracking
 * - Hotspot identification (high-churn risky files)
 * - Trend analysis over time
 */

import { prisma } from "../db.js";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// Define types inline since they're new models that may not be generated yet
type CodeHealthSnapshotData = {
  id: string;
  repositoryId: string;
  branch: string | null;
  overallScore: number;
  complexityScore: number;
  duplicationScore: number;
  coverageScore: number;
  maintainabilityScore: number;
  securityScore: number;
  dependencyScore: number;
  totalFiles: number;
  totalLines: number;
  avgComplexity: number;
  duplicationPct: number;
  testCoveragePct: number | null;
  docCoveragePct: number | null;
  technicalDebtHours: number;
  codeSmellCount: number;
  bugRiskCount: number;
  analyzedAt: Date;
  analysisVersion: string;
  metadata: any;
};

type ProjectHealthSummaryData = {
  id: string;
  projectId: string;
  overallScore: number;
  avgComplexity: number;
  avgCoverage: number;
  avgMaintainability: number;
  totalRepositories: number;
  totalHotspots: number;
  criticalHotspots: number;
  scoreTrend: string;
  trendPercent: number;
  calculatedAt: Date;
};

// Types for code health analysis
interface FileMetrics {
  path: string;
  lines: number;
  complexity: number;
  functions: number;
  duplicateLines: number;
}

interface HealthScores {
  overall: number;
  complexity: number;
  duplication: number;
  coverage: number;
  maintainability: number;
  security: number;
  dependencies: number;
}

interface HotspotData {
  filePath: string;
  changeCount: number;
  additionCount: number;
  deletionCount: number;
  authorCount: number;
  complexity: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

interface TrendData {
  date: string;
  value: number;
  change: number;
}

interface HealthDashboardData {
  scores: HealthScores;
  trends: {
    overall: TrendData[];
    complexity: TrendData[];
    coverage: TrendData[];
    duplication: TrendData[];
  };
  hotspots: HotspotData[];
  summary: {
    totalFiles: number;
    totalLines: number;
    avgComplexity: number;
    duplicationPct: number;
    testCoveragePct: number | null;
    technicalDebtHours: number;
    codeSmellCount: number;
  };
  comparison: {
    lastWeek: HealthScores | null;
    lastMonth: HealthScores | null;
  };
}

/**
 * Calculate overall health score from individual metrics
 */
function calculateOverallScore(scores: Omit<HealthScores, "overall">): number {
  // Weighted average of all scores
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
 * Convert complexity value to a 0-100 score (higher = better)
 * Low complexity is good, high complexity is bad
 */
function complexityToScore(avgComplexity: number): number {
  // Score curve: 1-5 = 100-80, 5-10 = 80-60, 10-20 = 60-30, 20+ = 30-0
  if (avgComplexity <= 1) return 100;
  if (avgComplexity <= 5) return Math.round(100 - ((avgComplexity - 1) * 5));
  if (avgComplexity <= 10) return Math.round(80 - ((avgComplexity - 5) * 4));
  if (avgComplexity <= 20) return Math.round(60 - ((avgComplexity - 10) * 3));
  return Math.max(0, Math.round(30 - ((avgComplexity - 20) * 1.5)));
}

/**
 * Convert duplication percentage to a 0-100 score (higher = better)
 * Low duplication is good, high duplication is bad
 */
function duplicationToScore(duplicationPct: number): number {
  // Score: 0-5% = 100-90, 5-15% = 90-60, 15-30% = 60-30, 30%+ = 30-0
  if (duplicationPct <= 0) return 100;
  if (duplicationPct <= 5) return Math.round(100 - (duplicationPct * 2));
  if (duplicationPct <= 15) return Math.round(90 - ((duplicationPct - 5) * 3));
  if (duplicationPct <= 30) return Math.round(60 - ((duplicationPct - 15) * 2));
  return Math.max(0, Math.round(30 - (duplicationPct - 30)));
}

/**
 * Calculate maintainability index (0-100)
 * Based on Halstead volume, cyclomatic complexity, and lines of code
 */
function calculateMaintainabilityScore(
  avgComplexity: number,
  avgLinesPerFile: number,
  duplicationPct: number
): number {
  // Simplified maintainability formula
  const complexityFactor = Math.max(0, 100 - (avgComplexity * 3));
  const sizeFactor = avgLinesPerFile <= 300 ? 100 : Math.max(0, 100 - ((avgLinesPerFile - 300) * 0.1));
  const duplicationFactor = Math.max(0, 100 - (duplicationPct * 2));

  return Math.round((complexityFactor * 0.4 + sizeFactor * 0.3 + duplicationFactor * 0.3));
}

/**
 * Calculate risk score for a file based on multiple factors
 */
function calculateRiskScore(
  changeCount: number,
  authorCount: number,
  complexity: number,
  bugFixCount: number
): { score: number; level: "low" | "medium" | "high" | "critical" } {
  // Risk factors with weights
  const churnFactor = Math.min(changeCount / 10, 1) * 30; // Max 30 points
  const authorFactor = Math.min(authorCount / 5, 1) * 15; // Max 15 points
  const complexityFactor = Math.min(complexity / 20, 1) * 35; // Max 35 points
  const bugFactor = Math.min(bugFixCount / 5, 1) * 20; // Max 20 points

  const score = Math.round(churnFactor + authorFactor + complexityFactor + bugFactor);

  let level: "low" | "medium" | "high" | "critical";
  if (score >= 75) level = "critical";
  else if (score >= 50) level = "high";
  else if (score >= 25) level = "medium";
  else level = "low";

  return { score, level };
}

/**
 * Analyze git history to identify high-churn files
 */
async function analyzeGitChurn(
  repoPath: string,
  days: number = 30
): Promise<Map<string, { changes: number; authors: Set<string>; additions: number; deletions: number }>> {
  const churnMap = new Map<string, { changes: number; authors: Set<string>; additions: number; deletions: number }>();

  try {
    // Get file changes in the last N days
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const logOutput = execSync(
      `git log --since="${since}" --pretty=format:"%H|%an" --numstat --no-renames`,
      { cwd: repoPath, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = logOutput.split("\n");
    let currentAuthor = "";

    for (const line of lines) {
      if (line.includes("|")) {
        const parts = line.split("|");
        currentAuthor = parts[1] || "unknown";
      } else if (line.trim() && !line.startsWith("-")) {
        const parts = line.split("\t");
        if (parts.length >= 3) {
          const additions = parseInt(parts[0]) || 0;
          const deletions = parseInt(parts[1]) || 0;
          const filePath = parts[2];

          if (filePath && !filePath.includes("node_modules") && !filePath.includes(".lock")) {
            const existing = churnMap.get(filePath) || { changes: 0, authors: new Set(), additions: 0, deletions: 0 };
            existing.changes++;
            existing.authors.add(currentAuthor);
            existing.additions += additions;
            existing.deletions += deletions;
            churnMap.set(filePath, existing);
          }
        }
      }
    }
  } catch (error) {
    console.warn("Failed to analyze git churn:", error);
  }

  return churnMap;
}

/**
 * Estimate code complexity using simple heuristics
 * (In production, use tools like eslint-plugin-complexity or similar)
 */
function estimateComplexity(content: string, filePath: string): number {
  // Simple complexity estimation based on control flow statements
  const ext = path.extname(filePath).toLowerCase();
  if (![".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs"].includes(ext)) {
    return 1; // Default low complexity for non-code files
  }

  let complexity = 1; // Base complexity

  // Count control flow statements
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bswitch\s*\(/g,
    /\bcase\s+/g,
    /\bcatch\s*\(/g,
    /\b\?\s*[^:]+:/g, // Ternary
    /&&/g,
    /\|\|/g,
  ];

  for (const pattern of patterns) {
    const matches = content.match(pattern);
    complexity += matches ? matches.length : 0;
  }

  // Normalize by line count (complexity per 100 lines)
  const lineCount = content.split("\n").length;
  return lineCount > 0 ? Math.round((complexity / lineCount) * 100) / 10 : complexity;
}

/**
 * Detect code duplication (simplified)
 * Returns percentage of duplicated lines
 */
function detectDuplication(files: { path: string; content: string }[]): number {
  const lineHashes = new Map<string, number>();
  let totalLines = 0;
  let duplicateLines = 0;

  for (const file of files) {
    const lines = file.content.split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 10 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("#"));

    totalLines += lines.length;

    for (const line of lines) {
      const count = lineHashes.get(line) || 0;
      if (count > 0) {
        duplicateLines++;
      }
      lineHashes.set(line, count + 1);
    }
  }

  return totalLines > 0 ? Math.round((duplicateLines / totalLines) * 100) : 0;
}

/**
 * Get security score based on patterns in code
 */
function analyzeSecurityPatterns(files: { path: string; content: string }[]): number {
  let issueCount = 0;
  const securityPatterns = [
    /eval\s*\(/gi,
    /innerHTML\s*=/gi,
    /dangerouslySetInnerHTML/gi,
    /exec\s*\(/gi,
    /password\s*=\s*['"][^'"]+['"]/gi,
    /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
    /secret\s*=\s*['"][^'"]+['"]/gi,
    /TODO:\s*security/gi,
    /FIXME:\s*security/gi,
  ];

  for (const file of files) {
    for (const pattern of securityPatterns) {
      const matches = file.content.match(pattern);
      if (matches) {
        issueCount += matches.length;
      }
    }
  }

  // Convert to score: 0 issues = 100, each issue reduces score
  return Math.max(0, 100 - (issueCount * 5));
}

/**
 * Calculate code health for a repository
 */
export async function calculateRepositoryHealth(
  repositoryId: string,
  branch?: string
): Promise<CodeHealthSnapshotData | null> {
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
      return null;
    }

    // Get latest scan result for code analysis
    const latestScan = await prisma.scanResult.findFirst({
      where: { repositoryId, status: "completed" },
      orderBy: { completedAt: "desc" },
      include: { codeAnalysis: true },
    });

    // Calculate scores based on available data
    const codeAnalysis = latestScan?.codeAnalysis;
    const duplications = (codeAnalysis?.duplications as any[]) || [];
    const performanceIssues = (codeAnalysis?.performanceIssues as any[]) || [];

    // Parse language profile - it contains { languages: [{fileCount, lineCount, ...}], ... }
    const languageProfileData = latestScan?.languageProfile as {
      languages?: Array<{ language: string; fileCount: number; lineCount: number; percentage: number }>;
      frameworkHints?: string[];
    } | null;

    // Calculate duplication percentage from duplications array
    const duplicationCount = duplications.reduce((sum, d) => sum + (d.lineCount || d.similarity * 10 || 5), 0);

    // Get actual counts from scan analysis or code analysis
    const analysisMetrics = codeAnalysis as any;

    // Calculate real file and line counts from available data
    let totalFiles = 0;
    let totalLines = 0;

    // Priority 1: Extract from language profile languages array (most accurate)
    if (languageProfileData?.languages && Array.isArray(languageProfileData.languages)) {
      for (const lang of languageProfileData.languages) {
        if (lang.fileCount) totalFiles += lang.fileCount;
        if (lang.lineCount) totalLines += lang.lineCount;
      }
    }

    // Priority 2: Use code analysis metrics if available
    if (totalFiles === 0 && analysisMetrics?.fileCount) {
      totalFiles = analysisMetrics.fileCount;
    } else if (totalFiles === 0 && analysisMetrics?.files?.length) {
      totalFiles = analysisMetrics.files.length;
    }

    if (totalLines === 0 && analysisMetrics?.totalLines) {
      totalLines = analysisMetrics.totalLines;
    } else if (totalLines === 0 && analysisMetrics?.lineCount) {
      totalLines = analysisMetrics.lineCount;
    }

    // Priority 3: Estimate from tasks created (rough heuristic)
    if (totalFiles === 0 && latestScan?.tasksCreated) {
      // Each task typically covers ~3-5 files
      totalFiles = Math.max(10, latestScan.tasksCreated * 4);
    }

    // Priority 4: Estimate from language count
    if (totalFiles === 0 && languageProfileData?.languages?.length) {
      // Use language count as a minimum baseline, scaled up
      totalFiles = Math.max(20, languageProfileData.languages.length * 15);
    }

    // Estimate lines if we have files but no line count
    if (totalLines === 0 && totalFiles > 0) {
      // Average ~80 lines per file for typical projects
      totalLines = totalFiles * 80;
    }

    // Calculate complexity from performance issues and code patterns
    let avgComplexity = 5; // Default moderate
    if (performanceIssues.length > 0) {
      // More issues = higher complexity
      avgComplexity = Math.min(20, 3 + performanceIssues.length * 0.5);
    }
    if (analysisMetrics?.avgComplexity) {
      avgComplexity = analysisMetrics.avgComplexity;
    }

    // Calculate duplication percentage
    let duplicationPct = 0;
    if (totalLines > 0 && duplicationCount > 0) {
      duplicationPct = Math.min(50, (duplicationCount / totalLines) * 100);
    } else if (duplications.length > 0) {
      // Estimate from number of duplications found
      duplicationPct = Math.min(30, duplications.length * 2);
    }

    let testCoveragePct: number | null = analysisMetrics?.testCoverage ?? null;
    let docCoveragePct: number | null = analysisMetrics?.docCoverage ?? null;

    // Calculate individual scores
    const complexityScore = complexityToScore(avgComplexity);
    const duplicationScore = duplicationToScore(duplicationPct);
    const coverageScore = testCoveragePct !== null ? testCoveragePct : 50; // Default 50 if no coverage data
    const maintainabilityScore = calculateMaintainabilityScore(
      avgComplexity,
      totalFiles > 0 ? totalLines / totalFiles : 100,
      duplicationPct
    );
    // Calculate security score based on code analysis results
    const securityScore = Math.max(0, 85 - performanceIssues.length * 5); // Base 85, reduce for issues

    // Calculate dependency score based on alerts
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

    // Estimate technical debt (simplified)
    const technicalDebtHours = Math.round(
      (100 - overallScore) * 0.5 * (totalFiles / 100)
    );

    // Count code smells (based on various factors)
    const codeSmellCount = Math.round(
      (100 - complexityScore) / 10 +
      (100 - duplicationScore) / 10 +
      (100 - maintainabilityScore) / 10
    );

    // Save snapshot
    const snapshot = await prisma.codeHealthSnapshot.create({
      data: {
        repositoryId,
        branch: branch || repository.defaultBranch,
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
        docCoveragePct,
        technicalDebtHours,
        codeSmellCount,
        bugRiskCount: 0,
        metadata: {
          scanId: latestScan?.id,
          languageProfile: latestScan?.languageProfile,
        },
      },
    });

    // Update quality trends
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get previous day's scores for trend calculation
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const previousSnapshot = await prisma.codeHealthSnapshot.findFirst({
      where: {
        repositoryId,
        branch: branch || repository.defaultBranch,
        analyzedAt: { lt: today },
      },
      orderBy: { analyzedAt: "desc" },
    });

    // Save individual metric trends
    const metrics = [
      { type: "complexity" as const, value: complexityScore, prev: previousSnapshot?.complexityScore },
      { type: "duplication" as const, value: duplicationScore, prev: previousSnapshot?.duplicationScore },
      { type: "test_coverage" as const, value: coverageScore, prev: previousSnapshot?.coverageScore },
      { type: "maintainability" as const, value: maintainabilityScore, prev: previousSnapshot?.maintainabilityScore },
      { type: "security" as const, value: securityScore, prev: previousSnapshot?.securityScore },
      { type: "dependencies" as const, value: dependencyScore, prev: previousSnapshot?.dependencyScore },
    ];

    const targetBranch = branch || repository.defaultBranch || "main";

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

    return snapshot;
  } catch (error) {
    console.error("Failed to calculate repository health:", error);
    return null;
  }
}

/**
 * Identify and update code hotspots for a repository
 */
export async function identifyHotspots(
  repositoryId: string,
  repoPath: string,
  branch?: string
): Promise<HotspotData[]> {
  try {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return [];
    }

    const targetBranch = branch || repository.defaultBranch;

    // Analyze git churn
    const churnData = await analyzeGitChurn(repoPath, 30);

    const hotspots: HotspotData[] = [];

    // Process top churning files
    const sortedFiles = Array.from(churnData.entries())
      .sort((a, b) => b[1].changes - a[1].changes)
      .slice(0, 50); // Top 50 files

    for (const [filePath, data] of sortedFiles) {
      // Skip non-code files
      const ext = path.extname(filePath).toLowerCase();
      if (![".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs", ".rb", ".php", ".cs"].includes(ext)) {
        continue;
      }

      // Read file content for complexity analysis
      let complexity = 5; // Default
      try {
        const fullPath = path.join(repoPath, filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          complexity = estimateComplexity(content, filePath);
        }
      } catch (e) {
        // Ignore file read errors
      }

      // Calculate risk score
      const { score, level } = calculateRiskScore(
        data.changes,
        data.authors.size,
        complexity,
        0 // Bug fix count would require more analysis
      );

      // Only include files with meaningful risk
      if (data.changes >= 3 || score >= 25) {
        const hotspot: HotspotData = {
          filePath,
          changeCount: data.changes,
          additionCount: data.additions,
          deletionCount: data.deletions,
          authorCount: data.authors.size,
          complexity,
          riskScore: score,
          riskLevel: level,
        };

        hotspots.push(hotspot);

        // Upsert hotspot in database
        await prisma.codeHotspot.upsert({
          where: {
            repositoryId_branch_filePath: {
              repositoryId,
              branch: targetBranch,
              filePath,
            },
          },
          update: {
            changeCount: data.changes,
            additionCount: data.additions,
            deletionCount: data.deletions,
            authorCount: data.authors.size,
            complexity,
            riskScore: score,
            riskLevel: level,
            lastChangedAt: new Date(),
            analyzedAt: new Date(),
          },
          create: {
            repositoryId,
            branch: targetBranch,
            filePath,
            changeCount: data.changes,
            additionCount: data.additions,
            deletionCount: data.deletions,
            authorCount: data.authors.size,
            complexity,
            riskScore: score,
            riskLevel: level,
          },
        });
      }
    }

    // Clean up old hotspots that are no longer active
    await prisma.codeHotspot.deleteMany({
      where: {
        repositoryId,
        branch: targetBranch,
        analyzedAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
        },
      },
    });

    return hotspots.sort((a, b) => b.riskScore - a.riskScore);
  } catch (error) {
    console.error("Failed to identify hotspots:", error);
    return [];
  }
}

/**
 * Get health dashboard data for a repository
 */
export async function getHealthDashboard(
  repositoryId: string,
  branch?: string,
  days: number = 30
): Promise<HealthDashboardData | null> {
  try {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return null;
    }

    const targetBranch = branch || repository.defaultBranch;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get latest snapshot
    const latestSnapshot = await prisma.codeHealthSnapshot.findFirst({
      where: { repositoryId, branch: targetBranch },
      orderBy: { analyzedAt: "desc" },
    });

    // Get trend data
    const trends = await prisma.codeQualityTrend.findMany({
      where: {
        repositoryId,
        branch: targetBranch,
        date: { gte: startDate },
      },
      orderBy: { date: "asc" },
    });

    // Organize trends by metric type
    const trendsByType: Record<string, TrendData[]> = {};
    for (const trend of trends) {
      const type = trend.metricType;
      if (!trendsByType[type]) {
        trendsByType[type] = [];
      }
      trendsByType[type].push({
        date: trend.date.toISOString().split("T")[0],
        value: trend.value,
        change: trend.changePercent || 0,
      });
    }

    // Get hotspots
    const hotspots = await prisma.codeHotspot.findMany({
      where: { repositoryId, branch: targetBranch },
      orderBy: { riskScore: "desc" },
      take: 20,
    });

    // Get comparison data
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const lastWeekSnapshot = await prisma.codeHealthSnapshot.findFirst({
      where: {
        repositoryId,
        branch: targetBranch,
        analyzedAt: { lte: oneWeekAgo },
      },
      orderBy: { analyzedAt: "desc" },
    });

    const lastMonthSnapshot = await prisma.codeHealthSnapshot.findFirst({
      where: {
        repositoryId,
        branch: targetBranch,
        analyzedAt: { lte: oneMonthAgo },
      },
      orderBy: { analyzedAt: "desc" },
    });

    const scores: HealthScores = latestSnapshot ? {
      overall: latestSnapshot.overallScore,
      complexity: latestSnapshot.complexityScore,
      duplication: latestSnapshot.duplicationScore,
      coverage: latestSnapshot.coverageScore,
      maintainability: latestSnapshot.maintainabilityScore,
      security: latestSnapshot.securityScore,
      dependencies: latestSnapshot.dependencyScore,
    } : {
      overall: 0,
      complexity: 0,
      duplication: 0,
      coverage: 0,
      maintainability: 0,
      security: 0,
      dependencies: 0,
    };

    return {
      scores,
      trends: {
        overall: trendsByType["maintainability"] || [],
        complexity: trendsByType["complexity"] || [],
        coverage: trendsByType["test_coverage"] || [],
        duplication: trendsByType["duplication"] || [],
      },
      hotspots: hotspots.map(h => ({
        filePath: h.filePath,
        changeCount: h.changeCount,
        additionCount: h.additionCount,
        deletionCount: h.deletionCount,
        authorCount: h.authorCount,
        complexity: h.complexity,
        riskScore: h.riskScore,
        riskLevel: h.riskLevel as "low" | "medium" | "high" | "critical",
      })),
      summary: {
        totalFiles: latestSnapshot?.totalFiles || 0,
        totalLines: latestSnapshot?.totalLines || 0,
        avgComplexity: latestSnapshot?.avgComplexity || 0,
        duplicationPct: latestSnapshot?.duplicationPct || 0,
        testCoveragePct: latestSnapshot?.testCoveragePct || null,
        technicalDebtHours: latestSnapshot?.technicalDebtHours || 0,
        codeSmellCount: latestSnapshot?.codeSmellCount || 0,
      },
      comparison: {
        lastWeek: lastWeekSnapshot ? {
          overall: lastWeekSnapshot.overallScore,
          complexity: lastWeekSnapshot.complexityScore,
          duplication: lastWeekSnapshot.duplicationScore,
          coverage: lastWeekSnapshot.coverageScore,
          maintainability: lastWeekSnapshot.maintainabilityScore,
          security: lastWeekSnapshot.securityScore,
          dependencies: lastWeekSnapshot.dependencyScore,
        } : null,
        lastMonth: lastMonthSnapshot ? {
          overall: lastMonthSnapshot.overallScore,
          complexity: lastMonthSnapshot.complexityScore,
          duplication: lastMonthSnapshot.duplicationScore,
          coverage: lastMonthSnapshot.coverageScore,
          maintainability: lastMonthSnapshot.maintainabilityScore,
          security: lastMonthSnapshot.securityScore,
          dependencies: lastMonthSnapshot.dependencyScore,
        } : null,
      },
    };
  } catch (error) {
    console.error("Failed to get health dashboard:", error);
    return null;
  }
}

/**
 * Calculate project-level health summary
 */
export async function calculateProjectHealth(projectId: string): Promise<ProjectHealthSummaryData | null> {
  try {
    // Get all repositories in the project
    const projectRepos = await prisma.projectRepository.findMany({
      where: { projectId },
      include: {
        repository: true,
      },
    });

    if (projectRepos.length === 0) {
      return null;
    }

    const repositoryIds = projectRepos.map(pr => pr.repositoryId);

    // Get latest snapshots for all repositories
    const snapshots = await prisma.codeHealthSnapshot.findMany({
      where: {
        repositoryId: { in: repositoryIds },
      },
      orderBy: { analyzedAt: "desc" },
      distinct: ["repositoryId"],
    });

    if (snapshots.length === 0) {
      return null;
    }

    // Calculate aggregated metrics
    const overallScore = snapshots.reduce((sum, s) => sum + s.overallScore, 0) / snapshots.length;
    const avgComplexity = snapshots.reduce((sum, s) => sum + s.avgComplexity, 0) / snapshots.length;
    const avgMaintainability = snapshots.reduce((sum, s) => sum + s.maintainabilityScore, 0) / snapshots.length;

    // Calculate coverage (only from repos that have it)
    const snapshotsWithCoverage = snapshots.filter(s => s.testCoveragePct !== null);
    const avgCoverage = snapshotsWithCoverage.length > 0
      ? snapshotsWithCoverage.reduce((sum, s) => sum + (s.testCoveragePct || 0), 0) / snapshotsWithCoverage.length
      : 0;

    // Get hotspot counts
    const allHotspots = await prisma.codeHotspot.findMany({
      where: { repositoryId: { in: repositoryIds } },
    });

    const totalHotspots = allHotspots.length;
    const criticalHotspots = allHotspots.filter(h => h.riskLevel === "critical").length;

    // Determine trend by comparing with previous week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const previousSnapshots = await prisma.codeHealthSnapshot.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        analyzedAt: { lte: oneWeekAgo },
      },
      orderBy: { analyzedAt: "desc" },
      distinct: ["repositoryId"],
    });

    let scoreTrend: "improving" | "stable" | "degrading" = "stable";
    let trendPercent = 0;

    if (previousSnapshots.length > 0) {
      const previousOverall = previousSnapshots.reduce((sum, s) => sum + s.overallScore, 0) / previousSnapshots.length;
      trendPercent = ((overallScore - previousOverall) / previousOverall) * 100;

      if (trendPercent > 2) scoreTrend = "improving";
      else if (trendPercent < -2) scoreTrend = "degrading";
    }

    // Upsert project health summary
    const summary = await prisma.projectHealthSummary.upsert({
      where: { projectId },
      update: {
        overallScore: Math.round(overallScore),
        avgComplexity: Math.round(avgComplexity * 10) / 10,
        avgCoverage: Math.round(avgCoverage),
        avgMaintainability: Math.round(avgMaintainability),
        totalRepositories: snapshots.length,
        totalHotspots,
        criticalHotspots,
        scoreTrend,
        trendPercent: Math.round(trendPercent * 10) / 10,
        calculatedAt: new Date(),
      },
      create: {
        projectId,
        overallScore: Math.round(overallScore),
        avgComplexity: Math.round(avgComplexity * 10) / 10,
        avgCoverage: Math.round(avgCoverage),
        avgMaintainability: Math.round(avgMaintainability),
        totalRepositories: snapshots.length,
        totalHotspots,
        criticalHotspots,
        scoreTrend,
        trendPercent: Math.round(trendPercent * 10) / 10,
      },
    });

    return summary;
  } catch (error) {
    console.error("Failed to calculate project health:", error);
    return null;
  }
}

/**
 * Get health history for trend charts
 */
export async function getHealthHistory(
  repositoryId: string,
  metricType?: string,
  days: number = 30
): Promise<TrendData[]> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (metricType) {
      const trends = await prisma.codeQualityTrend.findMany({
        where: {
          repositoryId,
          metricType: metricType as any,
          date: { gte: startDate },
        },
        orderBy: { date: "asc" },
      });

      return trends.map(t => ({
        date: t.date.toISOString().split("T")[0],
        value: t.value,
        change: t.changePercent || 0,
      }));
    }

    // Return overall scores from snapshots
    const snapshots = await prisma.codeHealthSnapshot.findMany({
      where: {
        repositoryId,
        analyzedAt: { gte: startDate },
      },
      orderBy: { analyzedAt: "asc" },
    });

    return snapshots.map((s, index) => ({
      date: s.analyzedAt.toISOString().split("T")[0],
      value: s.overallScore,
      change: index > 0 ? ((s.overallScore - snapshots[index - 1].overallScore) / snapshots[index - 1].overallScore) * 100 : 0,
    }));
  } catch (error) {
    console.error("Failed to get health history:", error);
    return [];
  }
}

export const codeHealthService = {
  calculateRepositoryHealth,
  identifyHotspots,
  getHealthDashboard,
  calculateProjectHealth,
  getHealthHistory,
  calculateRiskScore,
  complexityToScore,
  duplicationToScore,
};
