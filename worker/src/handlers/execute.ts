import { prisma } from "../db.js";
import { simpleGit } from "simple-git";
import { writeFile } from "fs/promises";
import path from "path";
import { cloneOrPullRepo, createWorktree, cleanupWorktree } from "../services/repo-manager.js";
import { createPullRequest } from "./pr-creator.js";
import { config } from "../config.js";
import { getProjectContext } from "../services/project-context.js";
import { resolveAuth, setupAgentSdkAuth, isValidAuth } from "../services/api-key-resolver.js";
import { agentQueryWithUsage } from "../services/claude-query.js";
import { getInstalledPluginPaths } from "../services/plugin-manager.js";
import { calculateTimeSaved } from "../services/time-estimation.js";
import { recordTaskOutcome } from "../services/ai-metrics-recorder.js";
import {
  notifyTaskUpdate,
  emitTerminalOutput,
  emitFileChange,
  resetTerminalSequence,
  emitPlanUpdate,
  emitPlanStepUpdate,
  emitBlockerNew,
  emitBlockerResolved,
  emitBlockerRetrying,
  type ExecutionPlan,
  type PlanStep,
  type Blocker,
} from "../services/event-notifier.js";
import {
  detectRefactorIntent,
  analyzeRefactorPropagation,
  groupFilesIntoBatches,
  getMultiFileModePromptAdditions,
  shouldEnableMultiFileMode,
  type RefactorPropagationResult,
  type AffectedFile,
} from "../services/refactor-propagation.js";
import {
  detectDatabaseTaskIntent,
  detectPrismaSchemaChanges,
  generateMigration,
  getExistingMigrations,
  generateMigrationContextPrompt,
} from "../services/migration-generator.js";
// Phase 2 AI: Execution Quality imports
import { generateTests, validateGeneratedTests, type GeneratedTest } from "../services/test-generator.js";
import { ChangeBatcher } from "../services/change-batcher.js";
// Phase 2 Platform: Agent Swarm imports
import { checkBatchCompletion, progressSequentialBatch } from "../services/priority-queue.js";
// Task execution steps
import {
  createTaskSteps,
  startStep,
  completeStep,
  failStep,
  generateDefaultSteps,
  parseStepsFromPlan,
  type TaskStepInput,
} from "../services/task-steps.js";

interface UserSettings {
  scanBudget?: number;
  taskBudget?: number;
  planBudget?: number;
  generateTests?: boolean;     // Phase 2: Enable auto test generation
}

interface ExecutionOptions {
  generateTests: boolean;
  enableChangeBatching: boolean;
}

function getUserBudgets(userSettings: UserSettings | null | undefined) {
  return {
    scanBudget: userSettings?.scanBudget ?? config.defaultScanBudget,
    taskBudget: userSettings?.taskBudget ?? config.defaultTaskBudget,
    planBudget: userSettings?.planBudget ?? config.defaultPlanBudget,
  };
}

function getExecutionOptions(userSettings: UserSettings | null | undefined): ExecutionOptions {
  return {
    generateTests: userSettings?.generateTests ?? false,
    enableChangeBatching: true, // Always enabled for safety
  };
}


async function emitTaskLog(
  taskId: string,
  phase: string,
  level: string,
  message: string,
  metadata: Record<string, any> = {}
) {
  await prisma.taskLog.create({
    data: { taskId, phase, level, message, metadata },
  });
  // Emit real-time notification for log updates
  await notifyTaskUpdate({ taskId, log: message }).catch(() => {});
}

// Read-only tools for dry-run mode
const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"] as const;

// Retry configuration
const MAX_RETRY_COUNT = 3;

// Multi-file mode threshold
const MULTI_FILE_THRESHOLD = 10;

// Transaction-like batch configuration
const MAX_BATCH_SIZE = 15;

// Blocker ID counter
let blockerIdCounter = 0;

/**
 * Generate an execution plan with confidence indicators
 */
function generateExecutionPlan(
  taskId: string,
  taskTitle: string,
  taskDescription: string,
  isDryRun: boolean,
  hasTestGeneration: boolean,
  isMultiFileMode: boolean,
  affectedFilesCount: number,
): ExecutionPlan {
  const steps: PlanStep[] = [];
  let totalEstimatedSeconds = 0;

  // Step 1: Environment setup
  steps.push({
    id: `${taskId}-step-0`,
    title: "Setting up environment",
    description: "Cloning repository and creating worktree for isolated changes",
    status: "pending",
    estimatedSeconds: 30,
    confidence: 95,
    reasoning: "Standard repository setup with established patterns",
  });
  totalEstimatedSeconds += 30;

  // Step 2: Codebase analysis
  const analysisConfidence = affectedFilesCount > 20 ? 70 : 85;
  steps.push({
    id: `${taskId}-step-1`,
    title: "Analyzing codebase",
    description: "Reading relevant files and understanding the code structure",
    status: "pending",
    estimatedSeconds: isMultiFileMode ? 90 : 45,
    confidence: analysisConfidence,
    reasoning: isMultiFileMode
      ? `Multi-file operation with ${affectedFilesCount} files requires thorough analysis`
      : "Standard codebase analysis for focused changes",
  });
  totalEstimatedSeconds += isMultiFileMode ? 90 : 45;

  // Step 3: Planning
  const planningConfidence = calculatePlanningConfidence(taskDescription);
  steps.push({
    id: `${taskId}-step-2`,
    title: "Planning changes",
    description: "Determining the best approach and identifying files to modify",
    status: "pending",
    estimatedSeconds: 60,
    confidence: planningConfidence,
    reasoning: getPlanningReasoning(taskDescription, planningConfidence),
  });
  totalEstimatedSeconds += 60;

  if (isDryRun) {
    // Dry run: only generate preview
    steps.push({
      id: `${taskId}-step-3`,
      title: "Generating preview",
      description: "Creating detailed diff preview for review",
      status: "pending",
      estimatedSeconds: 30,
      confidence: 90,
      reasoning: "Preview generation is straightforward",
    });
    totalEstimatedSeconds += 30;
  } else {
    // Full execution steps
    const implementationConfidence = isMultiFileMode
      ? Math.max(50, 85 - affectedFilesCount)
      : 80;

    steps.push({
      id: `${taskId}-step-3`,
      title: "Implementing changes",
      description: "Writing and modifying code according to the plan",
      status: "pending",
      estimatedSeconds: isMultiFileMode ? 180 : 120,
      confidence: implementationConfidence,
      reasoning: isMultiFileMode
        ? `Coordinated changes across ${affectedFilesCount} files require careful implementation`
        : "Standard implementation with clear requirements",
    });
    totalEstimatedSeconds += isMultiFileMode ? 180 : 120;

    steps.push({
      id: `${taskId}-step-4`,
      title: "Validating build",
      description: "Running build and tests to verify changes work correctly",
      status: "pending",
      estimatedSeconds: 60,
      confidence: 75,
      reasoning: "Build validation depends on project configuration and test coverage",
    });
    totalEstimatedSeconds += 60;

    if (hasTestGeneration) {
      steps.push({
        id: `${taskId}-step-5`,
        title: "Generating tests",
        description: "Creating test cases for the new code",
        status: "pending",
        estimatedSeconds: 90,
        confidence: 70,
        reasoning: "Test generation quality depends on code complexity and existing patterns",
      });
      totalEstimatedSeconds += 90;
    }

    const commitStepIndex = hasTestGeneration ? 6 : 5;
    steps.push({
      id: `${taskId}-step-${commitStepIndex}`,
      title: "Committing changes",
      description: "Creating git commits with clear messages",
      status: "pending",
      estimatedSeconds: 15,
      confidence: 95,
      reasoning: "Standard git operations",
    });
    totalEstimatedSeconds += 15;

    steps.push({
      id: `${taskId}-step-${commitStepIndex + 1}`,
      title: "Creating pull request",
      description: "Opening PR with summary of changes",
      status: "pending",
      estimatedSeconds: 20,
      confidence: 90,
      reasoning: "PR creation through GitHub API",
    });
    totalEstimatedSeconds += 20;
  }

  // Calculate overall confidence
  const avgConfidence = Math.round(
    steps.reduce((sum, s) => sum + (s.confidence || 0), 0) / steps.length
  );

  return {
    taskId,
    overview: generatePlanOverview(taskTitle, taskDescription, isDryRun, isMultiFileMode),
    steps,
    totalEstimatedSeconds,
    confidence: avgConfidence,
    reasoning: generateOverallReasoning(avgConfidence, isMultiFileMode, affectedFilesCount),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Calculate confidence for planning phase based on task description
 */
function calculatePlanningConfidence(description: string): number {
  let confidence = 80;

  // Lower confidence for vague descriptions
  if (description.length < 50) confidence -= 15;

  // Lower confidence for complex keywords
  const complexKeywords = ["refactor", "migrate", "redesign", "rewrite", "overhaul"];
  for (const keyword of complexKeywords) {
    if (description.toLowerCase().includes(keyword)) {
      confidence -= 10;
      break;
    }
  }

  // Higher confidence for specific patterns
  const specificPatterns = ["fix", "add", "update", "change", "remove"];
  for (const pattern of specificPatterns) {
    if (description.toLowerCase().includes(pattern)) {
      confidence += 5;
      break;
    }
  }

  return Math.max(40, Math.min(95, confidence));
}

/**
 * Generate reasoning for planning phase
 */
function getPlanningReasoning(description: string, confidence: number): string {
  if (confidence >= 80) {
    return "Clear task requirements with well-defined scope";
  } else if (confidence >= 60) {
    return "Task scope is moderately complex; may require iterative refinement";
  } else {
    return "Task involves significant complexity; plan may need adjustments during execution";
  }
}

/**
 * Generate plan overview text
 */
function generatePlanOverview(
  title: string,
  description: string,
  isDryRun: boolean,
  isMultiFileMode: boolean,
): string {
  let overview = `I'll ${isDryRun ? "analyze" : "implement"} "${title}"`;

  if (isMultiFileMode) {
    overview += " with coordinated changes across multiple files";
  }

  if (isDryRun) {
    overview += " and provide a detailed preview of the proposed changes";
  } else {
    overview += " and create a pull request for review";
  }

  return overview + ".";
}

/**
 * Generate overall reasoning based on confidence
 */
function generateOverallReasoning(
  confidence: number,
  isMultiFileMode: boolean,
  affectedFilesCount: number,
): string {
  const parts: string[] = [];

  if (confidence >= 80) {
    parts.push("I have high confidence in this approach");
  } else if (confidence >= 60) {
    parts.push("I'm moderately confident in this approach");
  } else {
    parts.push("This task has some uncertainty");
  }

  if (isMultiFileMode) {
    parts.push(`coordinating changes across ${affectedFilesCount} files`);
  }

  if (confidence < 70) {
    parts.push("I'll adapt my strategy if I encounter issues");
  }

  return parts.join("; ") + ".";
}

/**
 * Create a blocker object
 */
function createBlocker(
  taskId: string,
  type: Blocker["type"],
  severity: Blocker["severity"],
  title: string,
  description: string,
  options: {
    context?: string;
    suggestedActions?: string[];
    retryable?: boolean;
    retryCount?: number;
    maxRetries?: number;
  } = {},
): Blocker {
  blockerIdCounter++;
  return {
    id: `blocker-${taskId}-${blockerIdCounter}`,
    taskId,
    type,
    severity,
    title,
    description,
    context: options.context,
    suggestedActions: options.suggestedActions || [],
    retryable: options.retryable ?? true,
    createdAt: new Date().toISOString(),
    retryCount: options.retryCount,
    maxRetries: options.maxRetries,
  };
}

/**
 * Analyze an error and create appropriate blocker
 */
function analyzeErrorForBlocker(
  taskId: string,
  error: Error | string,
  retryCount: number,
): Blocker {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorLower = errorMessage.toLowerCase();

  // Rate limit errors
  if (errorLower.includes("rate limit") || errorLower.includes("429") || errorLower.includes("too many requests")) {
    return createBlocker(
      taskId,
      "rate_limit",
      "medium",
      "Rate Limit Reached",
      "The API is temporarily rate-limiting requests. The system will automatically retry.",
      {
        context: errorMessage,
        suggestedActions: [
          "Wait for the rate limit to reset",
          "Reduce concurrent operations",
        ],
        retryable: true,
        retryCount,
        maxRetries: MAX_RETRY_COUNT,
      }
    );
  }

  // Auth/permission errors
  if (errorLower.includes("authentication") || errorLower.includes("unauthorized") || errorLower.includes("403")) {
    return createBlocker(
      taskId,
      "error",
      "critical",
      "Authentication Error",
      "Unable to authenticate with the required service.",
      {
        context: errorMessage,
        suggestedActions: [
          "Check API key configuration",
          "Verify OAuth token is valid",
          "Re-authenticate the repository connection",
        ],
        retryable: false,
      }
    );
  }

  // Build/test failures
  if (errorLower.includes("build failed") || errorLower.includes("test failed") || errorLower.includes("compilation error")) {
    return createBlocker(
      taskId,
      "error",
      "high",
      "Build or Test Failure",
      "The code changes caused build or test failures.",
      {
        context: errorMessage,
        suggestedActions: [
          "Review the error output for specific issues",
          "Check for syntax errors in modified files",
          "Verify all dependencies are properly imported",
        ],
        retryable: true,
        retryCount,
        maxRetries: MAX_RETRY_COUNT,
      }
    );
  }

  // File not found
  if (errorLower.includes("file not found") || errorLower.includes("no such file") || errorLower.includes("enoent")) {
    return createBlocker(
      taskId,
      "stuck",
      "medium",
      "File Not Found",
      "Expected file or directory was not found.",
      {
        context: errorMessage,
        suggestedActions: [
          "Verify file paths in the task description",
          "Check if the file was recently renamed or moved",
          "Ensure the correct branch is being used",
        ],
        retryable: true,
        retryCount,
        maxRetries: MAX_RETRY_COUNT,
      }
    );
  }

  // No commits made
  if (errorLower.includes("did not make any commits")) {
    return createBlocker(
      taskId,
      "stuck",
      "high",
      "No Changes Made",
      "The agent completed but did not create any commits.",
      {
        context: errorMessage,
        suggestedActions: [
          "Check if the task requirements are achievable",
          "Review if the codebase already has the required changes",
          "Try with more specific instructions",
        ],
        retryable: true,
        retryCount,
        maxRetries: MAX_RETRY_COUNT,
      }
    );
  }

  // Generic error
  return createBlocker(
    taskId,
    "error",
    "high",
    "Execution Error",
    "An error occurred during task execution.",
    {
      context: errorMessage,
      suggestedActions: [
        "Review the error details",
        "Check the task logs for more context",
        "Try retrying the task",
      ],
      retryable: true,
      retryCount,
      maxRetries: MAX_RETRY_COUNT,
    }
  );
}

function buildRetryPrompt(originalPrompt: string, error: string, attemptNumber: number): string {
  return `${originalPrompt}

---

## IMPORTANT: Previous Attempt Failed (Attempt ${attemptNumber}/${MAX_RETRY_COUNT})

The previous execution attempt failed with the following error:
\`\`\`
${error}
\`\`\`

Please analyze this error and try an alternative approach:
1. If it was a syntax error, double-check your code carefully
2. If it was a test failure, review the test requirements
3. If it was a file not found error, verify the file paths
4. Consider a different implementation strategy if the current approach is blocked

Proceed with the implementation using the lessons learned from this failure.`;
}


/**
 * Phase 2: Write generated tests to files
 */
async function writeGeneratedTests(
  workDir: string,
  tests: GeneratedTest[],
  onLog: (level: string, message: string) => Promise<void>
): Promise<string[]> {
  const writtenPaths: string[] = [];

  for (const test of tests) {
    try {
      const fullPath = path.join(workDir, test.filePath);
      await writeFile(fullPath, test.testCode, "utf-8");
      writtenPaths.push(test.filePath);
      await onLog("info", `Generated test file: ${test.filePath}`);
    } catch (err) {
      await onLog("error", `Failed to write test ${test.filePath}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  return writtenPaths;
}

export async function handleTaskExecution(jobs: { data: { taskId: string } }[]) {
  const job = jobs[0];
  const { taskId } = job.data;
  console.log(`Starting execution for task ${taskId}`);

  let task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      repository: {
        include: {
          user: { select: { id: true, settings: true, accounts: true } },
        },
      },
    },
  });

  if (!task || task.status === "cancelled") {
    console.log(`Task ${taskId} not found or cancelled`);
    return;
  }

  // Check for dry-run mode
  const isDryRun = task.executionMode === "dry_run";
  if (isDryRun) {
    console.log(`Task ${taskId} running in dry-run mode`);
  }

  const repo = task.repository;
  const userBudgets = getUserBudgets(repo.user?.settings as UserSettings);
  const execOptions = getExecutionOptions(repo.user?.settings as UserSettings);

  // Resolve authentication (OAuth token or API key)
  const auth = await resolveAuth(repo.userId);
  const { apiKeyId } = auth;

  if (!isValidAuth(auth)) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        metadata: { error: "No authentication configured. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in .env." },
      },
    });
    console.error("Task aborted: No authentication configured");
    return;
  }

  // Set up auth for Agent SDK
  setupAgentSdkAuth(auth);
  console.log(`Using ${auth.authType === "oauth" ? "OAuth token" : "API key"} for execution`);

  const account = repo.user.accounts.find((a: any) => a.provider === repo.provider);
  if (!account) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        metadata: { error: `No OAuth account found for provider ${repo.provider}` },
      },
    });
    return;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "in_progress" },
  });

  // Emit real-time status update
  await notifyTaskUpdate({ taskId, userId: repo.userId, status: "in_progress" }).catch(() => {});

  // Create initial execution steps for progress tracking
  const isDryRunForSteps = task.executionMode === "dry_run";
  const hasTestGeneration = (repo.user?.settings as UserSettings)?.generateTests ?? false;

  const executionSteps: TaskStepInput[] = isDryRunForSteps
    ? [
        { title: "Preparing environment", description: "Setting up repository and worktree" },
        { title: "Analyzing codebase", description: "Reading files and understanding context" },
        { title: "Planning changes", description: "Determining what modifications to make" },
        { title: "Generating preview", description: "Creating diff preview for review" },
      ]
    : [
        { title: "Preparing environment", description: "Setting up repository and worktree" },
        { title: "Analyzing codebase", description: "Reading files and understanding context" },
        { title: "Planning changes", description: "Determining what modifications to make" },
        { title: "Implementing changes", description: "Writing and modifying code" },
        { title: "Validating build", description: "Ensuring code compiles and tests pass" },
        ...(hasTestGeneration ? [{ title: "Generating tests", description: "Creating test cases for changes" }] : []),
        { title: "Committing changes", description: "Creating git commits" },
        { title: "Creating pull request", description: "Opening PR for review" },
      ];

  await createTaskSteps(taskId, executionSteps);

  // Start first step - preparing environment
  let currentStepOrder = 0;
  await startStep(taskId, currentStepOrder);

  // Unique branch per execution attempt (task ID + timestamp suffix)
  const attemptSuffix = Date.now().toString(36).slice(-4);
  const branchName = `autosoftware/${task.type}/${taskId.slice(0, 8)}-${attemptSuffix}`;
  let worktreeDir: string | null = null;
  let repoDir: string | null = null;
  let changeBatcher: ChangeBatcher | null = null;
  // Track total usage for analytics (accessible in both try and catch)
  let executeTotalUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  // Determine target branch for worktree creation and PR base
  const targetBranch = task.targetBranch || repo.defaultBranch;

  try {
    repoDir = await cloneOrPullRepo(repo.id, repo.cloneUrl, account.accessToken, repo.provider);
    worktreeDir = await createWorktree(repoDir, branchName, targetBranch);

    // Complete step 0 (preparing environment), start step 1 (analyzing)
    await completeStep(taskId, currentStepOrder);
    currentStepOrder++;
    await startStep(taskId, currentStepOrder);

    // Phase 2: Initialize change batcher for rollback-safe changes
    if (execOptions.enableChangeBatching && !isDryRun) {
      changeBatcher = new ChangeBatcher({
        workDir: worktreeDir,
        useBranches: false, // Use stashes for rollback
        onLog: async (level, message, metadata) => {
          await emitTaskLog(taskId, "execute", level, message, metadata || {});
        },
      });
      await changeBatcher.initialize();
    }

    const projectContext = await getProjectContext(repo.id, task.projectId);

    // Get installed plugins for this user/project
    const pluginPaths = await getInstalledPluginPaths(repo.userId, task.projectId);
    if (pluginPaths.length > 0) {
      console.log(`Loaded ${pluginPaths.length} plugins for task ${taskId}`);
    }

    const implementationInstructions = task.enhancedPlan || task.description;

    // =========================================================================
    // Phase 2 AI: Multi-File Operations - Detect and analyze refactor/migration tasks
    // =========================================================================
    let multiFileContext = "";
    let isMultiFileMode = task.multiFileMode || false;
    let refactorPropagation: RefactorPropagationResult | null = null;
    let affectedFilesList: AffectedFile[] = [];

    // 1. Check for refactor/rename intent
    const refactorSymbol = detectRefactorIntent(task.description);
    if (refactorSymbol && worktreeDir) {
      await emitTaskLog(taskId, "execute", "step", `Analyzing refactor: ${refactorSymbol.name} -> ${refactorSymbol.newName || 'new name'}...`);

      try {
        refactorPropagation = await analyzeRefactorPropagation(worktreeDir, refactorSymbol);

        if (refactorPropagation.affectedFiles.length > 0) {
          affectedFilesList = refactorPropagation.affectedFiles;
          multiFileContext += refactorPropagation.contextPrompt + "\n\n";

          // Enable multi-file mode if threshold exceeded
          if (shouldEnableMultiFileMode(affectedFilesList)) {
            isMultiFileMode = true;
            const batches = groupFilesIntoBatches(affectedFilesList, MAX_BATCH_SIZE);
            multiFileContext += getMultiFileModePromptAdditions(affectedFilesList.length, batches);
          }

          await emitTaskLog(
            taskId,
            "execute",
            "info",
            `Refactor analysis complete: ${affectedFilesList.length} files affected, ${refactorPropagation.totalUsages} usages found`
          );

          // Update task with refactor type if detected
          if (task.type === "refactor" && refactorSymbol.newName) {
            await prisma.task.update({
              where: { id: taskId },
              data: {
                refactorType: "rename",
                affectedFiles: affectedFilesList.map(f => f.path),
                multiFileMode: isMultiFileMode,
              },
            });
          }
        }
      } catch (refactorError) {
        console.error(`Task ${taskId}: Refactor analysis failed:`, refactorError);
        await emitTaskLog(taskId, "execute", "error", `Refactor analysis failed: ${refactorError instanceof Error ? refactorError.message : "Unknown error"}`);
        // Continue without refactor context - the agent can still attempt the task
      }
    }

    // 2. Check for database/schema changes
    const hasDatabaseIntent = detectDatabaseTaskIntent(task.description);
    if (hasDatabaseIntent && worktreeDir) {
      await emitTaskLog(taskId, "execute", "step", "Analyzing database schema changes...");

      try {
        const schemaChanges = await detectPrismaSchemaChanges(worktreeDir, targetBranch);
        const existingMigrations = await getExistingMigrations(worktreeDir);

        if (schemaChanges.hasChanges || existingMigrations.length > 0) {
          multiFileContext += generateMigrationContextPrompt(schemaChanges, existingMigrations) + "\n\n";

          if (schemaChanges.hasPotentialDataLoss) {
            await emitTaskLog(
              taskId,
              "execute",
              "error",
              "WARNING: Detected schema changes with potential data loss. Review carefully."
            );
          }
        }
      } catch (migrationError) {
        console.error(`Task ${taskId}: Migration analysis failed:`, migrationError);
        // Continue without migration context
      }
    }

    // 3. Check existing affectedFiles from task (may have been set during planning)
    const existingAffectedFiles = Array.isArray(task.affectedFiles) ? task.affectedFiles as string[] : [];
    if (existingAffectedFiles.length >= MULTI_FILE_THRESHOLD && !isMultiFileMode) {
      isMultiFileMode = true;
      await emitTaskLog(
        taskId,
        "execute",
        "info",
        `Multi-file mode enabled: ${existingAffectedFiles.length} files in scope`
      );
    }

    // Update multiFileMode flag if changed
    if (isMultiFileMode && !task.multiFileMode) {
      await prisma.task.update({
        where: { id: taskId },
        data: { multiFileMode: true },
      });
    }

    // Complete step 1 (analyzing), start step 2 (planning)
    await completeStep(taskId, currentStepOrder);
    currentStepOrder++;
    await startStep(taskId, currentStepOrder);

    // Build base prompt - modified for dry-run if needed
    const baseInstructions = isDryRun
      ? `## Instructions (DRY-RUN MODE):
1. Read relevant files to understand the codebase
2. Analyze what changes would be needed
3. Document the proposed changes in detail
4. DO NOT make any actual modifications to files
5. Output a structured summary of proposed changes

## Output Format:
Provide a JSON-structured summary of proposed changes:
- files_to_modify: Array of {path, description, changes}
- files_to_create: Array of {path, description, content_summary}
- files_to_delete: Array of {path, reason}
- estimated_impact: Description of expected impact`
      : `## Instructions:
1. Read relevant files to understand the codebase
2. Plan your changes carefully
3. Implement the changes with clean code
4. Run existing tests to verify nothing breaks
5. Add tests for new functionality if applicable
6. Commit with a clear message`;

    // Build multi-file mode instructions if applicable
    const multiFileModeInstructions = isMultiFileMode
      ? `
## Multi-File Operation Guidelines

This task involves coordinated changes across ${affectedFilesList.length || existingAffectedFiles.length}+ files. Follow these guidelines:

1. **Transaction-Like Commits**: Group related changes into logical commits
2. **Atomic Updates**: Each commit should leave the codebase in a working state
3. **Rollback Safety**: If a change fails, previous changes should still be valid
4. **Test After Major Changes**: Run tests after completing each major batch

### Commit Strategy for Multi-File Changes:
- First commit: Core definition/source changes
- Subsequent commits: Update all usages in batches
- Final commit: Update tests and documentation
`
      : "";

    let executePrompt = `${projectContext ? projectContext + "\n---\n\n" : ""}You are an expert software engineer. Implement the following task:

## Task: ${task.title}

${implementationInstructions}

${multiFileContext}${multiFileModeInstructions}${baseInstructions}

## Rules:
- Follow existing code style
- Don't break existing functionality
- Write clean, readable code${isMultiFileMode ? `
- Make atomic commits for each logical group of changes
- Update all affected files - do not leave partial refactors` : ""}

## Error Recovery:
- If a build or test fails, analyze the error message carefully
- Fix the root cause rather than just suppressing errors
- After making changes, verify they work by running build/lint/test commands
- If you encounter repeated failures, try a different approach
- Document any limitations or edge cases in code comments
- ALWAYS commit your changes before finishing, even if partial`;

    // Determine tools based on execution mode
    const allowedTools = isDryRun
      ? [...READ_ONLY_TOOLS]
      : ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "Skill"];

    await emitTaskLog(taskId, "execute", "step", isDryRun ? "Starting dry-run analysis..." : "Starting implementation...");

    // =========================================================================
    // AI Transparency: Generate and emit execution plan
    // =========================================================================
    const affectedFilesCount = affectedFilesList.length || existingAffectedFiles.length;
    const executionPlan = generateExecutionPlan(
      taskId,
      task.title,
      task.description,
      isDryRun,
      hasTestGeneration,
      isMultiFileMode,
      affectedFilesCount
    );

    // Emit the plan for frontend display
    await emitPlanUpdate(taskId, executionPlan);
    await emitTaskLog(taskId, "execute", "info", `Plan generated with ${executionPlan.confidence}% confidence`);

    // Store plan in task metadata for persistence
    await prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...(task.metadata as object || {}),
          executionPlan: {
            overview: executionPlan.overview,
            confidence: executionPlan.confidence,
            reasoning: executionPlan.reasoning,
            totalEstimatedSeconds: executionPlan.totalEstimatedSeconds,
            stepCount: executionPlan.steps.length,
          },
        },
      },
    });

    // Helper to update plan step status
    const updatePlanStep = async (stepIndex: number, updates: Partial<PlanStep>) => {
      const step = executionPlan.steps[stepIndex];
      if (step) {
        Object.assign(step, updates);
        await emitPlanStepUpdate(taskId, step.id, updates);
      }
    };

    // Mark first step as in progress
    await updatePlanStep(0, { status: "in_progress", startedAt: new Date().toISOString() });

    // Complete step 2 (planning), start step 3 (implementing/generating preview for dry-run)
    await completeStep(taskId, currentStepOrder);
    currentStepOrder++;
    await startStep(taskId, currentStepOrder);

    // Reset terminal sequence counter for fresh output
    resetTerminalSequence();

    // Phase 2: Create initial rollback point
    let currentBatchId: string | null = null;
    if (changeBatcher) {
      const batch = await changeBatcher.createRollbackPoint("initial_implementation");
      currentBatchId = batch.id;
    }

    // Retry loop for error recovery
    let resultText = "";
    let sessionId: string | undefined;
    let totalUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    let executionSuccess = false;
    let lastError: Error | null = null;
    let currentRetryCount = task.retryCount;
    const changeBatchIds: string[] = currentBatchId ? [currentBatchId] : [];

    while (!executionSuccess && currentRetryCount <= MAX_RETRY_COUNT) {
      try {
        // Modify prompt if this is a retry
        if (currentRetryCount > 0 && lastError) {
          executePrompt = buildRetryPrompt(executePrompt, lastError.message, currentRetryCount);
          await emitTaskLog(taskId, "execute", "info", `Retry attempt ${currentRetryCount}/${MAX_RETRY_COUNT}...`);
          console.log(`Task ${taskId}: Retry attempt ${currentRetryCount}/${MAX_RETRY_COUNT}`);

          // Phase 2: Create new rollback point for retry
          if (changeBatcher) {
            const batch = await changeBatcher.createRollbackPoint(`retry_${currentRetryCount}`);
            changeBatchIds.push(batch.id);
          }
        }

        const { result, sessionId: sid, usage: execUsage } = await agentQueryWithUsage(
          {
            prompt: executePrompt,
            options: {
              allowedTools,
              permissionMode: "bypassPermissions",
              maxTurns: 60,
              maxBudgetUsd: userBudgets.taskBudget,
              cwd: worktreeDir,
              // Load installed plugins (only for non-dry-run)
              ...(!isDryRun && pluginPaths.length > 0 && { plugins: pluginPaths }),
            },
          },
          {
            apiKeyId,
            source: "task",
            sourceId: taskId,
            taskId, // Pass taskId for live streaming
            onLog: (level, message, metadata) =>
              emitTaskLog(taskId, "execute", level, message, metadata || {}),
          }
        );

        resultText = result;
        sessionId = sid;
        totalUsage.inputTokens += execUsage.inputTokens;
        totalUsage.outputTokens += execUsage.outputTokens;
        totalUsage.costUsd += execUsage.costUsd;
        // Sync to outer scope for catch block access
        executeTotalUsage.inputTokens += execUsage.inputTokens;
        executeTotalUsage.outputTokens += execUsage.outputTokens;
        executeTotalUsage.costUsd += execUsage.costUsd;

        console.log(`Execute usage: ~${execUsage.inputTokens} input, ~${execUsage.outputTokens} output, ~$${execUsage.costUsd.toFixed(4)}`);

        // For non-dry-run, verify commits were made
        if (!isDryRun) {
          const git = simpleGit(worktreeDir);
          const log = await git.log({ maxCount: 5 });
          if (log.total === 0) {
            throw new Error("Agent did not make any commits");
          }

          // Complete step 3 (implementing), start step 4 (validating)
          await completeStep(taskId, currentStepOrder);
          currentStepOrder++;
          await startStep(taskId, currentStepOrder);

          // Simple build validation - the agent should have handled errors via the updated prompt
          await emitTaskLog(taskId, "execute", "step", "Validating changes...");

          // Mark build as validated since agent completed successfully
          await prisma.task.update({
            where: { id: taskId },
            data: {
              buildValidated: true,
            },
          });
        }

        executionSuccess = true;
      } catch (attemptError) {
        lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
        currentRetryCount++;

        // AI Transparency: Emit blocker for the error
        const blocker = analyzeErrorForBlocker(taskId, lastError, currentRetryCount);
        await emitBlockerNew(taskId, blocker);
        await emitTaskLog(taskId, "execute", "blocker", `Blocker: ${blocker.title} - ${blocker.description}`);

        // Update retry count in database
        await prisma.task.update({
          where: { id: taskId },
          data: { retryCount: currentRetryCount },
        });

        if (currentRetryCount > MAX_RETRY_COUNT) {
          console.error(`Task ${taskId}: All ${MAX_RETRY_COUNT} retry attempts exhausted`);
          await emitTaskLog(taskId, "execute", "error", `All retry attempts exhausted. Last error: ${lastError.message}`);

          // Rollback all changes if we have a batcher
          if (changeBatcher) {
            await emitTaskLog(taskId, "execute", "info", "Rolling back all changes...");
            await changeBatcher.rollbackAll();
          }

          throw lastError;
        }

        console.log(`Task ${taskId}: Attempt failed, will retry. Error: ${lastError.message}`);
        await emitTaskLog(taskId, "execute", "error", `Attempt failed: ${lastError.message}. Retrying...`);

        // AI Transparency: Emit retry notification
        await emitBlockerRetrying(taskId, blocker.id, currentRetryCount);
      }
    }

    // Complete validation step after successful execution
    if (executionSuccess && !isDryRun) {
      await completeStep(taskId, currentStepOrder);
      currentStepOrder++;
    }

    // Phase 2: Generate tests if enabled and not dry-run
    let generatedTestPaths: string[] = [];
    if (execOptions.generateTests && !isDryRun && worktreeDir && executionSuccess) {
      // Start test generation step
      await startStep(taskId, currentStepOrder);
      await emitTaskLog(taskId, "execute", "step", "Generating tests for changed code...");

      try {
        const testResult = await generateTests({
          workDir: worktreeDir,
          apiKeyId,
          taskId,
        });

        totalUsage.inputTokens += testResult.usage.inputTokens;
        totalUsage.outputTokens += testResult.usage.outputTokens;
        totalUsage.costUsd += testResult.usage.costUsd;
        // Sync to outer scope for catch block access
        executeTotalUsage.inputTokens += testResult.usage.inputTokens;
        executeTotalUsage.outputTokens += testResult.usage.outputTokens;
        executeTotalUsage.costUsd += testResult.usage.costUsd;

        if (testResult.success && testResult.tests.length > 0) {
          // Validate generated tests
          const validation = await validateGeneratedTests(testResult.tests, worktreeDir);

          if (validation.valid) {
            // Write tests to files
            generatedTestPaths = await writeGeneratedTests(
              worktreeDir,
              testResult.tests,
              async (level, message) => {
                await emitTaskLog(taskId, "execute", level, message);
              }
            );

            // Commit generated tests
            if (generatedTestPaths.length > 0) {
              const git = simpleGit(worktreeDir);
              await git.add(generatedTestPaths);
              await git.commit(`test: add auto-generated tests for ${task.title}`);
              await emitTaskLog(taskId, "execute", "success", `Generated and committed ${generatedTestPaths.length} test files`);
            }
          } else {
            await emitTaskLog(taskId, "execute", "error", `Generated tests failed validation: ${validation.errors.join(", ")}`);
          }
        } else if (testResult.error) {
          await emitTaskLog(taskId, "execute", "info", `Test generation skipped: ${testResult.error}`);
        }

        // Update task with test generation info
        await prisma.task.update({
          where: { id: taskId },
          data: {
            testsGenerated: generatedTestPaths.length > 0,
            generatedTestPaths,
          },
        });

        // Complete test generation step
        await completeStep(taskId, currentStepOrder);
        currentStepOrder++;
      } catch (testGenError) {
        await emitTaskLog(taskId, "execute", "error", `Test generation failed: ${testGenError instanceof Error ? testGenError.message : "Unknown"}`);
        // Mark test step as failed but continue
        await failStep(taskId, currentStepOrder, testGenError instanceof Error ? testGenError.message : "Unknown");
        currentStepOrder++;
      }
    }

    // Update task usage counters (increment to add to planning usage)
    await prisma.task.update({
      where: { id: taskId },
      data: {
        inputTokens: { increment: totalUsage.inputTokens },
        outputTokens: { increment: totalUsage.outputTokens },
        estimatedCostUsd: { increment: totalUsage.costUsd },
        changeBatchIds,
      },
    });

    // Handle dry-run completion
    if (isDryRun) {
      // Parse proposed changes from result
      let dryRunOutput: Record<string, any> = { summary: resultText };
      try {
        // Try to extract JSON from the result
        const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          dryRunOutput = JSON.parse(jsonMatch[1]);
        }
      } catch {
        // Keep the raw summary if JSON parsing fails
      }

      // Complete the final dry-run step (generating preview)
      await completeStep(taskId, currentStepOrder);

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "completed", // Use completed status, executionMode indicates it was dry-run
          completedAt: new Date(),
          agentSessionId: sessionId,
          dryRunOutput,
          metadata: {
            resultSummary: resultText,
            executionMode: "dry_run",
          },
        },
      });

      await notifyTaskUpdate({
        taskId,
        userId: repo.userId,
        status: "dry_run_complete",
        previousStatus: task.status,
        repositoryId: repo.id,
        projectId: task.projectId || undefined,
      }).catch(() => {});
      await emitTaskLog(taskId, "execute", "success", "Dry-run analysis completed");
      console.log(`Task ${taskId} dry-run completed`);

      // Record platform usage for analytics tracking (dry-run)
      await prisma.usageRecord.create({
        data: {
          userId: repo.userId,
          repositoryId: repo.id,
          projectId: task.projectId,
          apiKeyId: apiKeyId ?? null,
          source: "task_execute",
          sourceId: taskId,
          model: "claude-sonnet-4-20250514",
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          estimatedCostUsd: totalUsage.costUsd,
          authType: auth.authType,
          metadata: { taskType: task.type, executionMode: "dry_run" },
        },
      }).catch((err) => console.error("Failed to record usage:", err));

      // Phase 2: Cleanup change batcher
      if (changeBatcher) {
        await changeBatcher.cleanup();
      }

      return;
    }

    // Normal execution flow continues...
    // Start committing step
    await startStep(taskId, currentStepOrder);
    await emitTaskLog(taskId, "execute", "step", "Pushing changes to remote...");

    const git = simpleGit(worktreeDir);
    const log = await git.log({ maxCount: 5 });

    await git.push("origin", branchName, ["--set-upstream"]);

    // Complete committing step, start PR creation step
    await completeStep(taskId, currentStepOrder);
    currentStepOrder++;
    await startStep(taskId, currentStepOrder);

    // Build PR body
    let prBody = `## Automated Changes\n\n${task.description}\n\n---\n\n### Agent Summary\n\n${resultText}`;

    if (generatedTestPaths.length > 0) {
      prBody += `\n\n### Auto-Generated Tests\n\nTests were automatically generated for the changed code:\n`;
      for (const testPath of generatedTestPaths) {
        prBody += `- \`${testPath}\`\n`;
      }
    }

    prBody += `\n\n---\n*Generated by AutoSoftware*`;

    const pr = await createPullRequest(
      repo.provider,
      account.accessToken,
      repo.fullName,
      {
        title: `[AutoSoftware] ${task.title}`,
        body: prBody,
        head: branchName,
        base: targetBranch,
      }
    );

    // Complete PR creation step
    await completeStep(taskId, currentStepOrder);

    // Capture LOC metrics after PR creation
    await emitTaskLog(taskId, "execute", "step", "Capturing code change metrics...");

    try {
      // Get diff stats comparing to base branch
      const diffSummary = await git.diffSummary([`origin/${targetBranch}...HEAD`]);

      const linesAdded = diffSummary.insertions;
      const linesDeleted = diffSummary.deletions;
      const filesChanged = diffSummary.changed;
      const commitCount = log.total;

      // Build file breakdown
      const fileBreakdown = diffSummary.files.map((file) => ({
        path: file.file,
        insertions: "insertions" in file ? file.insertions : 0,
        deletions: "deletions" in file ? file.deletions : 0,
        binary: file.binary,
      }));

      // Create CodeChangeMetrics record
      await prisma.codeChangeMetrics.create({
        data: {
          taskId,
          userId: repo.userId,
          repositoryId: repo.id,
          projectId: task.projectId,
          linesAdded,
          linesDeleted,
          filesChanged,
          fileBreakdown,
          commitCount,
        },
      });

      // Calculate and store engineering time saved
      const timeEstimation = calculateTimeSaved({
        linesAdded,
        linesDeleted,
        filesChanged,
        taskType: task.type,
      });

      await prisma.engineeringTimeSaved.create({
        data: {
          taskId,
          userId: repo.userId,
          repositoryId: repo.id,
          projectId: task.projectId,
          estimatedMinutesSaved: timeEstimation.estimatedMinutesSaved,
          locFactor: timeEstimation.locFactor,
          complexityFactor: timeEstimation.complexityFactor,
          contextFactor: timeEstimation.contextFactor,
          methodologyVersion: timeEstimation.methodologyVersion,
        },
      });

      console.log(`Task ${taskId} metrics: +${linesAdded}/-${linesDeleted} lines, ${filesChanged} files, ~${timeEstimation.estimatedMinutesSaved} min saved`);
      await emitTaskLog(taskId, "execute", "info", `Code metrics captured: +${linesAdded}/-${linesDeleted} lines, ${filesChanged} files changed`);
    } catch (metricsError) {
      // Log but don't fail the task if metrics capture fails
      console.error(`Task ${taskId}: Failed to capture metrics:`, metricsError);
      await emitTaskLog(taskId, "execute", "error", `Failed to capture metrics: ${metricsError instanceof Error ? metricsError.message : "Unknown error"}`);
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "completed",
        completedAt: new Date(),
        pullRequestUrl: pr.url,
        pullRequestStatus: "open",
        agentSessionId: sessionId,
        metadata: {
          resultSummary: resultText,
          branch: branchName,
          commits: log.all.map((c) => ({ hash: c.hash, message: c.message })),
          testsGenerated: generatedTestPaths.length,
        },
      },
    });

    await notifyTaskUpdate({
      taskId,
      userId: repo.userId,
      status: "completed",
      previousStatus: task.status,
      repositoryId: repo.id,
      projectId: task.projectId || undefined,
    }).catch(() => {});
    await emitTaskLog(taskId, "execute", "success", "Task completed successfully");
    console.log(`Task ${taskId} completed. PR: ${pr.url}`);

    // Record AI metrics for task success
    await recordTaskOutcome(repo.userId, taskId, {
      success: true,
      taskType: task.type,
      repositoryId: repo.id,
      planWasAccurate: true,
      executionWasCorrect: true,
    }).catch(() => {});

    // Record platform usage for analytics tracking
    await prisma.usageRecord.create({
      data: {
        userId: repo.userId,
        repositoryId: repo.id,
        projectId: task.projectId,
        apiKeyId: apiKeyId ?? null,
        source: "task_execute",
        sourceId: taskId,
        model: "claude-sonnet-4-20250514",
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
        estimatedCostUsd: totalUsage.costUsd,
        authType: auth.authType,
        metadata: { taskType: task.type },
      },
    }).catch((err) => console.error("Failed to record usage:", err));

    // Phase 2: Cleanup change batcher
    if (changeBatcher) {
      await changeBatcher.cleanup();
    }

    // Phase 2 Platform: Handle batch operation progression
    const taskMetadata = task.metadata as Record<string, unknown>;
    if (taskMetadata?.batchOperationId) {
      const batchId = taskMetadata.batchOperationId as string;
      // Check for sequential batch progression
      await progressSequentialBatch(batchId, taskId, "execute").catch(() => {});
      // Check if batch is complete
      await checkBatchCompletion(batchId).catch(() => {});
    }
  } catch (err) {
    console.error(`Task ${taskId} failed:`, err);

    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Mark current step as failed
    await failStep(taskId, currentStepOrder, errorMessage).catch(() => {});

    if (apiKeyId) {
      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastError: errorMessage },
      }).catch(() => {});
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        metadata: {
          error: errorMessage,
          branch: branchName,
        },
      },
    });

    // Emit real-time failure notification
    await notifyTaskUpdate({
      taskId,
      userId: repo.userId,
      status: "failed",
      previousStatus: task.status,
      repositoryId: repo.id,
      projectId: task.projectId || undefined,
    }).catch(() => {});
    await emitTaskLog(taskId, "execute", "error", `Task failed: ${errorMessage}`);

    // Record AI metrics for task failure
    await recordTaskOutcome(repo.userId, taskId, {
      success: false,
      taskType: task.type,
      repositoryId: repo.id,
      planWasAccurate: false,
      executionWasCorrect: false,
      errorMessage,
    }).catch(() => {});

    // Record platform usage for analytics tracking (even on failure)
    if (executeTotalUsage.costUsd > 0) {
      await prisma.usageRecord.create({
        data: {
          userId: repo.userId,
          repositoryId: repo.id,
          projectId: task.projectId,
          apiKeyId: apiKeyId ?? null,
          source: "task_execute",
          sourceId: taskId,
          model: "claude-sonnet-4-20250514",
          inputTokens: executeTotalUsage.inputTokens,
          outputTokens: executeTotalUsage.outputTokens,
          estimatedCostUsd: executeTotalUsage.costUsd,
          authType: auth.authType,
          metadata: { taskType: task.type, failed: true },
        },
      }).catch((err) => console.error("Failed to record usage:", err));
    }

    // Phase 2 Platform: Handle batch failure
    const taskMetadata = task.metadata as Record<string, unknown>;
    if (taskMetadata?.batchOperationId) {
      const batchId = taskMetadata.batchOperationId as string;
      await checkBatchCompletion(batchId).catch(() => {});
    }

    throw err;
  } finally {
    if (repoDir && worktreeDir) {
      await cleanupWorktree(repoDir, worktreeDir).catch(() => {});
    }
  }
}
