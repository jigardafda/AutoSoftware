import { prisma } from "../db.js";
import { cloneOrPullRepo } from "../services/repo-manager.js";
import { config } from "../config.js";
import { getProjectContext } from "../services/project-context.js";
import { resolveAuth, setupAgentSdkAuth, isValidAuth } from "../services/api-key-resolver.js";
import { simpleQueryWithUsage, agentQueryWithUsage } from "../services/claude-query.js";
import { detectLanguages, formatLanguageProfilePrompt, getLanguageRules, type LanguageProfile } from "../services/language-detector.js";
import { batchAnalyzeFalsePositiveRisk, type FindingForAnalysis, type FalsePositiveAnalysis } from "../services/false-positive-detector.js";
import { codeHealthService } from "../services/code-health.js";

interface ScanTask {
  title: string;
  description: string;
  type: "improvement" | "bugfix" | "feature" | "refactor" | "security";
  priority: "low" | "medium" | "high" | "critical";
  confidenceScore?: number; // 1-10 scale
  severityLevel?: "critical" | "major" | "minor" | "nitpick";
  falsePositiveRisk?: number; // 0-1 scale, calculated from context analysis
}

interface DependencyNode {
  name: string;
  version?: string;
  type: "internal" | "external";
  dependsOn: string[];
  usedBy: string[];
}

interface DeadCodePath {
  filePath: string;
  codeSnippet: string;
  reason: string;
  confidenceScore: number;
}

interface CodeDuplication {
  locations: { filePath: string; startLine: number; endLine: number }[];
  codeSnippet: string;
  similarity: number;
  confidenceScore: number;
}

interface PerformanceIssue {
  type: "n_plus_one" | "memory_leak" | "inefficient_algorithm" | "large_bundle" | "blocking_operation" | "other";
  filePath: string;
  description: string;
  codeSnippet?: string;
  confidenceScore: number;
  severityLevel: "critical" | "major" | "minor" | "nitpick";
}

interface StructuredAnalysis {
  architecturePattern: {
    type: "mvc" | "microservices" | "monolith" | "serverless" | "modular_monolith" | "hexagonal" | "clean_architecture" | "event_driven" | "unknown";
    confidence: number;
    evidence: string[];
  };
  dependencies: DependencyNode[];
  deadCodePaths: DeadCodePath[];
  duplications: CodeDuplication[];
  performanceIssues: PerformanceIssue[];
  tasks: ScanTask[];
}

interface UserSettings {
  scanBudget?: number;
  taskBudget?: number;
  planBudget?: number;
}

function getUserBudgets(userSettings: UserSettings | null | undefined) {
  return {
    scanBudget: userSettings?.scanBudget ?? config.defaultScanBudget,
    taskBudget: userSettings?.taskBudget ?? config.defaultTaskBudget,
    planBudget: userSettings?.planBudget ?? config.defaultPlanBudget,
  };
}

async function emitLog(scanResultId: string, level: string, message: string, metadata: Record<string, any> = {}) {
  await prisma.scanLog.create({ data: { scanResultId, level, message, metadata } });
}

async function isScanCancelled(scanResultId: string): Promise<boolean> {
  const scan = await prisma.scanResult.findUnique({
    where: { id: scanResultId },
    select: { status: true },
  });
  return scan?.status === "cancelled";
}

export async function handleRepoScan(jobs: { data: { repoId: string; projectId?: string; branch?: string; scanResultId?: string; source?: "manual" | "scheduled" } }[]) {
  const job = jobs[0];
  const { repoId, projectId, branch: requestedBranch, scanResultId: existingScanId, source = "manual" } = job.data;
  console.log(`Starting scan for repo ${repoId}${requestedBranch ? ` on branch ${requestedBranch}` : ""}${existingScanId ? ` (scan ${existingScanId})` : ""} [${source}]`);

  let repo: any;
  try {
    repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: {
        user: {
          select: { id: true, settings: true, accounts: true },
        },
      },
    });
  } catch (err) {
    console.error(`Failed to fetch repo ${repoId}:`, err);
    return;
  }

  // Get user budget settings
  const userBudgets = getUserBudgets(repo?.user?.settings as UserSettings);

  if (!repo || !repo.isActive) {
    console.log(`Repo ${repoId} not found or inactive, skipping`);
    return;
  }

  const account = repo.user.accounts.find((a: any) => a.provider === repo.provider);
  if (!account) {
    if (existingScanId) {
      await prisma.scanResult.update({
        where: { id: existingScanId },
        data: {
          status: "failed",
          summary: `No OAuth account found for provider ${repo.provider}`,
        },
      });
    } else {
      await prisma.scanResult.create({
        data: {
          repositoryId: repoId,
          status: "failed",
          source,
          summary: `No OAuth account found for provider ${repo.provider}`,
          analysisData: {},
        },
      });
    }
    console.error(`No account found for provider ${repo.provider}`);
    return;
  }

  // Resolve authentication (OAuth token or API key)
  const auth = await resolveAuth(repo.userId);
  const { apiKeyId } = auth;

  if (!isValidAuth(auth)) {
    const errorSummary = "No authentication configured. Set CLAUDE_CODE_OAUTH_TOKEN (free with Max subscription) or ANTHROPIC_API_KEY in .env.";
    if (existingScanId) {
      await prisma.scanResult.update({
        where: { id: existingScanId },
        data: { status: "failed", summary: errorSummary },
      });
    } else {
      await prisma.scanResult.create({
        data: {
          repositoryId: repoId,
          status: "failed",
          source,
          summary: errorSummary,
          analysisData: {},
        },
      });
    }
    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "error" },
    });
    console.error("Scan aborted: No authentication configured");
    return;
  }

  // Set up auth for Agent SDK (OAuth or API key)
  setupAgentSdkAuth(auth);
  console.log(`Using ${auth.authType === "oauth" ? "OAuth token (Max subscription)" : "API key"} for scan`);

  await prisma.repository.update({
    where: { id: repoId },
    data: { status: "scanning" },
  });

  // Determine the target branch for this scan
  const targetBranch = requestedBranch || repo.defaultBranch;

  // Check for existing active scans on the same repo+branch
  const activeScan = await prisma.scanResult.findFirst({
    where: {
      repositoryId: repoId,
      branch: targetBranch,
      status: { in: ["queued", "in_progress"] },
      id: existingScanId ? { not: existingScanId } : undefined, // Exclude our own scan if we already have one
    },
    select: { id: true, status: true, scannedAt: true },
  });

  // Use existing scan record if provided (created by scheduler for manual scans), otherwise create new one
  const startedAt = new Date();
  let scanResult;
  if (existingScanId) {
    scanResult = await prisma.scanResult.update({
      where: { id: existingScanId },
      data: { status: "in_progress", startedAt, branch: targetBranch },
    });
    console.log(`Using existing scan record ${existingScanId}`);
  } else {
    // For scheduled scans or legacy jobs, create record when processing starts
    scanResult = await prisma.scanResult.create({
      data: { repositoryId: repoId, status: "in_progress", source, startedAt, branch: targetBranch, analysisData: {} },
    });
    console.log(`Created scan record ${scanResult.id} [${source}]`);
  }

  // If another scan is already active for this repo+branch, skip this one
  if (activeScan) {
    const skipMessage = `Scan skipped: another scan (${activeScan.id}) is already ${activeScan.status} for ${repo.fullName} on branch ${targetBranch}`;
    console.log(skipMessage);
    await emitLog(scanResult.id, "info", skipMessage);
    await prisma.scanResult.update({
      where: { id: scanResult.id },
      data: {
        status: "skipped",
        completedAt: new Date(),
        summary: `Skipped: scan ${activeScan.id} already running on this branch`,
      },
    });
    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "idle" },
    });
    return;
  }

  await emitLog(scanResult.id, "step", `Scan started on branch ${targetBranch}`);

  // Track total usage across all AI calls
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  try {
    await emitLog(scanResult.id, "step", "Cloning repository...");
    const repoDir = await cloneOrPullRepo(
      repoId,
      repo.cloneUrl,
      account.accessToken,
      repo.provider
    );
    await emitLog(scanResult.id, "info", "Repository ready");

    // Checkout the requested branch (or default branch)
    const targetBranch = requestedBranch || repo.defaultBranch;
    if (targetBranch) {
      const { default: simpleGit } = await import("simple-git");
      const git = simpleGit(repoDir);
      await emitLog(scanResult.id, "step", `Checking out branch: ${targetBranch}...`);
      try {
        await git.fetch("origin", targetBranch);
        await git.checkout(targetBranch);
        await emitLog(scanResult.id, "info", `On branch ${targetBranch}`);
      } catch (branchErr) {
        await emitLog(scanResult.id, "info", `Branch checkout failed, using current branch`);
        console.warn(`Failed to checkout branch ${targetBranch}:`, branchErr);
      }
    }

    // Check for cancellation before starting AI analysis
    if (await isScanCancelled(scanResult.id)) {
      console.log(`Scan ${scanResult.id} was cancelled, aborting`);
      await prisma.repository.update({
        where: { id: repoId },
        data: { status: "idle" },
      });
      return;
    }

    // Phase 1 AI: Accuracy - Detect programming languages
    await emitLog(scanResult.id, "step", "Detecting programming languages...");
    let languageProfile: LanguageProfile | null = null;
    try {
      languageProfile = await detectLanguages(repoDir);
      await emitLog(scanResult.id, "info", `Primary language: ${languageProfile.primaryLanguage} (${languageProfile.languages.length} language(s) detected)`);
      if (languageProfile.frameworkHints.length > 0) {
        await emitLog(scanResult.id, "info", `Frameworks/tools: ${languageProfile.frameworkHints.join(', ')}`);
      }
      console.log(`Language detection: ${languageProfile.primaryLanguage}, frameworks: ${languageProfile.frameworkHints.join(', ')}`);
    } catch (langErr) {
      console.warn("Language detection failed:", langErr);
      await emitLog(scanResult.id, "info", "Language detection skipped");
    }

    const projectContext = await getProjectContext(repoId, projectId);

    await emitLog(scanResult.id, "step", "Analyzing codebase with AI agent...");

    // Build language-specific context for the prompt
    const languageContext = languageProfile ? formatLanguageProfilePrompt(languageProfile) : "";
    const languageRules = languageProfile ? getLanguageRules(languageProfile.primaryLanguage) : null;

    const scanPrompt = `${projectContext ? projectContext + "\n---\n\n" : ""}${languageContext ? languageContext + "\n---\n\n" : ""}You are a senior software engineer performing a comprehensive code review and architectural analysis of this repository.

## ANALYSIS REQUIREMENTS

Perform a thorough analysis covering the following areas:

### 1. ARCHITECTURE PATTERN DETECTION
Identify the overall architecture pattern used in this codebase:
- MVC (Model-View-Controller)
- Microservices
- Monolith
- Modular Monolith
- Serverless
- Hexagonal/Ports & Adapters
- Clean Architecture
- Event-Driven
- Unknown/Mixed

Provide evidence (file structures, patterns, conventions) supporting your assessment.

### 2. DEPENDENCY GRAPH
Map key dependencies and their relationships:
- Internal module dependencies (how files/modules depend on each other)
- External package dependencies and their roles
- Circular dependency detection
- Tightly coupled components

### 3. DEAD CODE IDENTIFICATION
Find potentially dead or unused code:
- Unused functions/methods
- Unreachable code paths
- Deprecated but not removed code
- Unused imports/exports
- Orphaned files

### 4. CODE DUPLICATION DETECTION
Detect code duplication across files:
- Copy-pasted code blocks
- Similar logic that could be abstracted
- Repeated patterns that violate DRY

### 5. PERFORMANCE ANTI-PATTERNS
Identify performance issues:
- N+1 query patterns in database operations
- Memory leaks (event listeners not cleaned up, growing caches, etc.)
- Inefficient algorithms (nested loops on large datasets, etc.)
- Large bundle imports that could be tree-shaken
- Blocking operations in async contexts
- Unoptimized database queries

### 6. SECURITY VULNERABILITIES
- SQL injection, XSS, hardcoded secrets, insecure dependencies

### 7. BUGS & CODE QUALITY
- Logic errors, race conditions, unhandled edge cases
- Overly complex functions, unclear naming

## RESPONSE FORMAT

IMPORTANT: Respond with ONLY a JSON object (not an array) in this exact format:

{
  "architecturePattern": {
    "type": "mvc|microservices|monolith|modular_monolith|serverless|hexagonal|clean_architecture|event_driven|unknown",
    "confidence": 8,
    "evidence": ["Evidence point 1", "Evidence point 2"]
  },
  "dependencies": [
    {
      "name": "module/file name",
      "version": "1.0.0 or null for internal",
      "type": "internal|external",
      "dependsOn": ["dep1", "dep2"],
      "usedBy": ["consumer1", "consumer2"]
    }
  ],
  "deadCodePaths": [
    {
      "filePath": "src/utils/deprecated.ts",
      "codeSnippet": "function unusedHelper() {...}",
      "reason": "Function not exported or called anywhere",
      "confidenceScore": 9
    }
  ],
  "duplications": [
    {
      "locations": [
        { "filePath": "src/a.ts", "startLine": 10, "endLine": 25 },
        { "filePath": "src/b.ts", "startLine": 50, "endLine": 65 }
      ],
      "codeSnippet": "Similar validation logic",
      "similarity": 0.85,
      "confidenceScore": 8
    }
  ],
  "performanceIssues": [
    {
      "type": "n_plus_one|memory_leak|inefficient_algorithm|large_bundle|blocking_operation|other",
      "filePath": "src/api/users.ts",
      "description": "N+1 query when fetching user posts",
      "codeSnippet": "users.map(u => db.getPosts(u.id))",
      "confidenceScore": 9,
      "severityLevel": "major"
    }
  ],
  "tasks": [
    {
      "title": "Short descriptive title",
      "description": "Detailed description with file paths and specific changes needed",
      "type": "security|bugfix|improvement|refactor|feature",
      "priority": "critical|high|medium|low",
      "confidenceScore": 8,
      "severityLevel": "critical|major|minor|nitpick"
    }
  ]
}

## CONFIDENCE SCORES (1-10)
- 10: Absolute certainty, clear evidence
- 7-9: High confidence, strong indicators
- 4-6: Medium confidence, likely but needs verification
- 1-3: Low confidence, possible false positive

## SEVERITY LEVELS
- critical: Immediate action required, security risk or breaking issue
- major: Significant impact on quality/performance, should fix soon
- minor: Notable improvement opportunity, can be scheduled
- nitpick: Nice-to-have, cosmetic or very minor impact`;

    const { result: analysisText, usage: scanUsage } = await agentQueryWithUsage(
      {
        prompt: scanPrompt,
        options: {
          allowedTools: ["Read", "Glob", "Grep", "Bash", "WebSearch", "WebFetch", "Agent"],
          permissionMode: "bypassPermissions",
          maxTurns: 25,
          maxBudgetUsd: userBudgets.scanBudget,
          cwd: repoDir,
        },
      },
      { apiKeyId, source: "scan", sourceId: repoId }
    );

    totalInputTokens += scanUsage.inputTokens;
    totalOutputTokens += scanUsage.outputTokens;
    totalCostUsd += scanUsage.costUsd;
    console.log(`Scan usage: ~${scanUsage.inputTokens} input, ~${scanUsage.outputTokens} output, ~$${scanUsage.costUsd.toFixed(4)}`);

    await emitLog(scanResult.id, "info", "Analysis complete");

    // Check for cancellation after AI analysis
    if (await isScanCancelled(scanResult.id)) {
      console.log(`Scan ${scanResult.id} was cancelled after analysis, aborting`);
      await prisma.repository.update({
        where: { id: repoId },
        data: { status: "idle" },
      });
      return;
    }

    await emitLog(scanResult.id, "step", "Parsing analysis results...");

    let tasks: ScanTask[] = [];
    let structuredAnalysis: StructuredAnalysis | null = null;

    try {
      // Try to parse as structured analysis (new format)
      const jsonObjectMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        const parsed = JSON.parse(jsonObjectMatch[0]);

        // Check if it's the new structured format
        if (parsed.architecturePattern && parsed.tasks) {
          structuredAnalysis = parsed as StructuredAnalysis;
          tasks = structuredAnalysis.tasks || [];
          console.log(`Parsed structured analysis: architecture=${structuredAnalysis.architecturePattern.type}, ${tasks.length} tasks`);
        } else if (Array.isArray(parsed)) {
          // Legacy array format fallback
          tasks = parsed;
        }
      } else {
        // Fallback: try to parse as array (legacy format)
        const jsonArrayMatch = analysisText.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          tasks = JSON.parse(jsonArrayMatch[0]);
        }
      }
    } catch (parseErr) {
      console.error("Failed to parse scan results:", parseErr);
      // Try legacy array format as last resort
      try {
        const jsonArrayMatch = analysisText.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          tasks = JSON.parse(jsonArrayMatch[0]);
        }
      } catch (legacyErr) {
        console.error("Legacy parse also failed:", legacyErr);
      }
    }

    await emitLog(scanResult.id, "info", `Found ${tasks.length} potential improvements`);

    // Phase 1 AI: Accuracy - False positive analysis for dead code findings
    let falsePositiveAnalysisResults: FalsePositiveAnalysis[] = [];
    if (structuredAnalysis && structuredAnalysis.deadCodePaths.length > 0) {
      await emitLog(scanResult.id, "step", "Analyzing false positive risk for findings...");
      try {
        // Convert dead code paths to findings for analysis
        const findingsToAnalyze: FindingForAnalysis[] = structuredAnalysis.deadCodePaths.map(dcp => ({
          filePath: dcp.filePath,
          codeSnippet: dcp.codeSnippet,
          type: 'dead_code' as const,
        }));

        falsePositiveAnalysisResults = await batchAnalyzeFalsePositiveRisk(findingsToAnalyze, repoDir);

        // Count high-risk false positives (risk > 0.6)
        const highRiskCount = falsePositiveAnalysisResults.filter(r => r.falsePositiveRisk > 0.6).length;
        const lowRiskCount = falsePositiveAnalysisResults.filter(r => r.falsePositiveRisk <= 0.3).length;

        await emitLog(scanResult.id, "info", `False positive analysis: ${lowRiskCount} low-risk, ${highRiskCount} high-risk findings`);
        console.log(`False positive analysis: ${falsePositiveAnalysisResults.length} findings analyzed, ${highRiskCount} high-risk`);
      } catch (fpErr) {
        console.warn("False positive analysis failed:", fpErr);
        await emitLog(scanResult.id, "info", "False positive analysis skipped");
      }
    }

    // Apply language-specific severity adjustments to tasks
    if (languageRules && tasks.length > 0) {
      for (const task of tasks) {
        if (task.confidenceScore && task.type) {
          // Adjust confidence based on language-specific rules
          const adjustment = languageRules.severityAdjustments[task.type];
          if (adjustment !== undefined && adjustment !== 1) {
            const originalScore = task.confidenceScore;
            task.confidenceScore = Math.min(10, Math.max(1, Math.round(task.confidenceScore * adjustment)));
            if (task.confidenceScore !== originalScore) {
              console.log(`Adjusted ${task.type} confidence: ${originalScore} -> ${task.confidenceScore} (${languageProfile?.primaryLanguage})`);
            }
          }
        }
      }
    }

    // Create CodeAnalysisResult if we have structured analysis
    if (structuredAnalysis) {
      await emitLog(scanResult.id, "step", "Storing code analysis results...");
      try {
        await prisma.codeAnalysisResult.create({
          data: {
            scanResultId: scanResult.id,
            architecturePattern: structuredAnalysis.architecturePattern.type,
            dependencies: structuredAnalysis.dependencies as any,
            deadCodePaths: structuredAnalysis.deadCodePaths as any,
            duplications: structuredAnalysis.duplications as any,
            performanceIssues: structuredAnalysis.performanceIssues as any,
            // Phase 1 AI: Accuracy - Store false positive analysis
            falsePositiveAnalysis: falsePositiveAnalysisResults.length > 0
              ? falsePositiveAnalysisResults.map(r => ({
                  filePath: r.finding.filePath,
                  codeSnippet: r.finding.codeSnippet,
                  type: r.finding.type,
                  falsePositiveRisk: r.falsePositiveRisk,
                  reasoning: r.reasoning,
                  context: {
                    isExported: r.context.isExported,
                    isUsedElsewhere: r.context.isUsedElsewhere,
                    hasTestCoverage: r.context.hasTestCoverage,
                    usageCount: r.context.usageCount,
                  },
                })) as any
              : [],
            // Language rule violations will be populated in future iterations
            languageRuleViolations: [],
          },
        });
        await emitLog(scanResult.id, "info", `Architecture detected: ${structuredAnalysis.architecturePattern.type} (confidence: ${structuredAnalysis.architecturePattern.confidence}/10)`);
        await emitLog(scanResult.id, "info", `Dead code paths: ${structuredAnalysis.deadCodePaths.length}, Duplications: ${structuredAnalysis.duplications.length}, Performance issues: ${structuredAnalysis.performanceIssues.length}`);
      } catch (analysisErr) {
        console.error("Failed to create CodeAnalysisResult:", analysisErr);
        await emitLog(scanResult.id, "error", "Failed to store code analysis results");
      }
    }

    // Semantic deduplication: use Claude to compare new tasks against existing open ones
    const existingTasks = await prisma.task.findMany({
      where: {
        repositoryId: repoId,
        status: { in: ["pending", "in_progress"] },
      },
      select: { id: true, title: true, description: true, type: true },
    });

    let newTasks = tasks;
    if (existingTasks.length > 0 && tasks.length > 0) {
      await emitLog(scanResult.id, "step", "Checking for duplicate tasks...");
      try {
        const dedupSystemPrompt = `You are a deduplication engine. Given a list of EXISTING tasks and NEW tasks for a code repository, identify which new tasks are semantically duplicates of existing ones — i.e. they address the same underlying issue, even if worded differently.

Return ONLY a JSON array of indices (0-based) of NEW tasks that are NOT duplicates and should be created. Example: [0, 2, 4]

If all new tasks are duplicates, return []. If none are duplicates, return all indices.`;

        const dedupUserMessage = `EXISTING TASKS:\n${existingTasks.map((t: any, i: number) => `${i}. [${t.type}] ${t.title}: ${t.description.slice(0, 200)}`).join("\n")}\n\nNEW TASKS:\n${tasks.map((t, i) => `${i}. [${t.type}] ${t.title}: ${t.description.slice(0, 200)}`).join("\n")}`;

        // Use Agent SDK for deduplication (supports OAuth!) with usage tracking
        const { result: dedupResult, usage: dedupUsage } = await simpleQueryWithUsage(
          dedupSystemPrompt,
          dedupUserMessage,
          { apiKeyId, source: "scan", sourceId: repoId }
        );
        totalInputTokens += dedupUsage.inputTokens;
        totalOutputTokens += dedupUsage.outputTokens;
        totalCostUsd += dedupUsage.costUsd;

        const match = dedupResult.match(/\[[\d\s,]*\]/);
        if (match) {
          const keepIndices: number[] = JSON.parse(match[0]);
          const kept = keepIndices.filter((i) => i >= 0 && i < tasks.length);
          const skipped = tasks.length - kept.length;
          if (skipped > 0) {
            console.log(`Dedup: skipping ${skipped} duplicate tasks for ${repo.fullName}`);
          }
          newTasks = kept.map((i) => tasks[i]);
        }
      } catch (dedupErr) {
        console.error("Dedup check failed, creating all tasks:", dedupErr);
        // Fall through — create all tasks if dedup fails
      }
      await emitLog(scanResult.id, "info", `Deduplication complete: ${tasks.length - newTasks.length} duplicates removed`);
    }

    await emitLog(scanResult.id, "step", `Creating ${newTasks.length} tasks...`);

    let tasksCreated = 0;
    // Use the branch that was scanned (if different from default)
    const taskTargetBranch = requestedBranch && requestedBranch !== repo.defaultBranch
      ? requestedBranch
      : null; // null means use repo's default branch

    for (const task of newTasks) {
      // Calculate false positive risk for this task based on related findings
      let taskFalsePositiveRisk: number | null = null;
      if (falsePositiveAnalysisResults.length > 0) {
        // Try to match task to a finding by looking for file path mentions in description
        const relatedFindings = falsePositiveAnalysisResults.filter(r =>
          task.description.includes(r.finding.filePath) ||
          task.title.toLowerCase().includes('dead code') ||
          task.title.toLowerCase().includes('unused')
        );
        if (relatedFindings.length > 0) {
          // Use the average false positive risk of related findings
          taskFalsePositiveRisk = relatedFindings.reduce((sum, r) => sum + r.falsePositiveRisk, 0) / relatedFindings.length;
        }
      }

      await prisma.task.create({
        data: {
          repositoryId: repoId,
          userId: repo.userId,
          title: task.title,
          description: task.description,
          type: task.type,
          priority: task.priority,
          source: "auto_scan",
          scanResultId: scanResult.id,
          targetBranch: taskTargetBranch,
          // New structured analysis fields
          confidenceScore: task.confidenceScore ?? null,
          severityLevel: task.severityLevel ?? null,
          // Phase 1 AI: Accuracy - False positive risk
          falsePositiveRisk: task.falsePositiveRisk ?? taskFalsePositiveRisk,
          // Store architecture pattern on tasks if detected
          architecturePattern: structuredAnalysis?.architecturePattern?.type ?? null,
        },
      });
      tasksCreated++;
    }

    const completedAt = new Date();

    // Build enhanced summary with structured analysis info
    let enhancedSummary = `Found ${newTasks.length} potential improvements`;
    if (languageProfile) {
      enhancedSummary += ` | Language: ${languageProfile.primaryLanguage}`;
    }
    if (structuredAnalysis) {
      const { architecturePattern, deadCodePaths, duplications, performanceIssues } = structuredAnalysis;
      enhancedSummary += ` | Architecture: ${architecturePattern.type} (${architecturePattern.confidence}/10)`;
      if (deadCodePaths.length > 0) enhancedSummary += ` | Dead code: ${deadCodePaths.length}`;
      if (duplications.length > 0) enhancedSummary += ` | Duplications: ${duplications.length}`;
      if (performanceIssues.length > 0) enhancedSummary += ` | Performance issues: ${performanceIssues.length}`;
    }
    // Add false positive summary if we have high-risk findings
    if (falsePositiveAnalysisResults.length > 0) {
      const highRiskCount = falsePositiveAnalysisResults.filter(r => r.falsePositiveRisk > 0.6).length;
      if (highRiskCount > 0) {
        enhancedSummary += ` | FP risk: ${highRiskCount} findings`;
      }
    }

    await prisma.scanResult.update({
      where: { id: scanResult.id },
      data: {
        status: "completed",
        completedAt,
        summary: enhancedSummary,
        tasksCreated: newTasks.length,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: totalCostUsd,
        // Phase 1 AI: Accuracy - Store language detection results
        primaryLanguage: languageProfile?.primaryLanguage ?? null,
        languageProfile: (languageProfile ? {
          languages: languageProfile.languages,
          frameworkHints: languageProfile.frameworkHints,
          strictModeEnabled: languageProfile.strictModeEnabled,
          configFiles: languageProfile.configFiles,
        } : {}) as any,
        analysisData: {
          rawAnalysis: analysisText,
          tasks,
          structuredAnalysis: structuredAnalysis ? {
            architecturePattern: structuredAnalysis.architecturePattern,
            dependenciesCount: structuredAnalysis.dependencies.length,
            deadCodePathsCount: structuredAnalysis.deadCodePaths.length,
            duplicationsCount: structuredAnalysis.duplications.length,
            performanceIssuesCount: structuredAnalysis.performanceIssues.length,
          } : null,
          // Phase 1 AI: Accuracy - Include false positive summary in analysis data
          falsePositiveSummary: falsePositiveAnalysisResults.length > 0 ? {
            totalAnalyzed: falsePositiveAnalysisResults.length,
            highRisk: falsePositiveAnalysisResults.filter(r => r.falsePositiveRisk > 0.6).length,
            mediumRisk: falsePositiveAnalysisResults.filter(r => r.falsePositiveRisk > 0.3 && r.falsePositiveRisk <= 0.6).length,
            lowRisk: falsePositiveAnalysisResults.filter(r => r.falsePositiveRisk <= 0.3).length,
          } : null,
        } as any,
      },
    });

    // Record usage to independent table (persists even if scan is deleted)
    await prisma.usageRecord.create({
      data: {
        userId: repo.userId,
        repositoryId: repoId,
        projectId: projectId || null,
        apiKeyId: apiKeyId || null,
        source: "scan",
        sourceId: scanResult.id,
        model: "claude-sonnet-4-20250514", // Agent SDK default
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: totalCostUsd,
        authType: auth.authType === "oauth" ? "oauth" : "api_key",
      },
    });

    await emitLog(scanResult.id, "success", `Scan completed: ${tasksCreated} tasks created`);

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "idle", lastScannedAt: new Date() },
    });

    // Calculate code health after scan completes
    try {
      await codeHealthService.calculateRepositoryHealth(
        repoId,
        scanResult.id,
        requestedBranch || repo.defaultBranch
      );
      await emitLog(scanResult.id, "info", "Code health metrics updated");
    } catch (healthErr) {
      console.warn("Code health calculation failed:", healthErr);
      // Non-critical, don't fail the scan
    }

    const durationSec = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);
    console.log(`Scan complete for ${repo.fullName}: ${tasksCreated} tasks created, ${durationSec}s, ~$${totalCostUsd.toFixed(4)}`);
  } catch (err) {
    console.error(`Scan failed for repo ${repoId}:`, err);

    if (apiKeyId) {
      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastError: err instanceof Error ? err.message : "Unknown error" },
      }).catch(() => {});
    }

    await emitLog(scanResult.id, "error", err instanceof Error ? err.message : "Unknown error");
    await prisma.scanResult.update({
      where: { id: scanResult.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        summary: err instanceof Error ? err.message : "Unknown error",
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: totalCostUsd,
        analysisData: {},
      },
    });

    // Record usage even for failed scans
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      await prisma.usageRecord.create({
        data: {
          userId: repo.userId,
          repositoryId: repoId,
          projectId: projectId || null,
          apiKeyId: apiKeyId || null,
          source: "scan",
          sourceId: scanResult.id,
          model: "claude-sonnet-4-20250514",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          estimatedCostUsd: totalCostUsd,
          authType: auth.authType === "oauth" ? "oauth" : "api_key",
        },
      }).catch(() => {}); // Don't fail if usage record fails
    }

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "error" },
    });

    throw err;
  }
}
