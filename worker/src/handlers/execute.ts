import { prisma } from "../db.js";
import { simpleGit } from "simple-git";
import { cloneOrPullRepo, createWorktree, cleanupWorktree } from "../services/repo-manager.js";
import { createPullRequest } from "./pr-creator.js";
import { config } from "../config.js";
import { getProjectContext } from "../services/project-context.js";
import { resolveAuth, setupAgentSdkAuth, isValidAuth } from "../services/api-key-resolver.js";
import { agentQueryWithUsage } from "../services/claude-query.js";

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
}

export async function handleTaskExecution(jobs: { data: { taskId: string } }[]) {
  const job = jobs[0];
  const { taskId } = job.data;
  console.log(`Starting execution for task ${taskId}`);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      repository: {
        include: {
          user: { include: { accounts: true } },
        },
      },
    },
  });

  if (!task || task.status === "cancelled") {
    console.log(`Task ${taskId} not found or cancelled`);
    return;
  }

  const repo = task.repository;

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

  // Unique branch per execution attempt (task ID + timestamp suffix)
  const attemptSuffix = Date.now().toString(36).slice(-4);
  const branchName = `autosoftware/${task.type}/${taskId.slice(0, 8)}-${attemptSuffix}`;
  let worktreeDir: string | null = null;
  let repoDir: string | null = null;

  // Determine target branch for worktree creation and PR base
  const targetBranch = task.targetBranch || repo.defaultBranch;

  try {
    repoDir = await cloneOrPullRepo(repo.id, repo.cloneUrl, account.accessToken, repo.provider);
    worktreeDir = await createWorktree(repoDir, branchName, targetBranch);

    const projectContext = await getProjectContext(repo.id, task.projectId);

    const implementationInstructions = task.enhancedPlan || task.description;

    const executePrompt = `${projectContext ? projectContext + "\n---\n\n" : ""}You are an expert software engineer. Implement the following task:

## Task: ${task.title}

${implementationInstructions}

## Instructions:
1. Read relevant files to understand the codebase
2. Plan your changes carefully
3. Implement the changes with clean code
4. Run existing tests to verify nothing breaks
5. Add tests for new functionality if applicable
6. Commit with a clear message

## Rules:
- Follow existing code style
- Don't break existing functionality
- Write clean, readable code`;

    await emitTaskLog(taskId, "execute", "step", "Starting implementation...");

    const { result: resultText, sessionId, usage: execUsage } = await agentQueryWithUsage(
      {
        prompt: executePrompt,
        options: {
          allowedTools: [
            "Read", "Edit", "Write", "Bash", "Glob", "Grep",
            "WebSearch", "WebFetch", "Agent",
          ],
          permissionMode: "bypassPermissions",
          maxTurns: 60,
          maxBudgetUsd: config.defaultTaskBudget,
          cwd: worktreeDir,
        },
      },
      {
        apiKeyId,
        source: "task",
        sourceId: taskId,
        onLog: (level, message, metadata) =>
          emitTaskLog(taskId, "execute", level, message, metadata || {}),
      }
    );

    console.log(`Execute usage: ~${execUsage.inputTokens} input, ~${execUsage.outputTokens} output, ~$${execUsage.costUsd.toFixed(4)}`);

    // Update task usage counters (increment to add to planning usage)
    await prisma.task.update({
      where: { id: taskId },
      data: {
        inputTokens: { increment: execUsage.inputTokens },
        outputTokens: { increment: execUsage.outputTokens },
        estimatedCostUsd: { increment: execUsage.costUsd },
      },
    });

    await emitTaskLog(taskId, "execute", "step", "Pushing changes to remote...");

    const git = simpleGit(worktreeDir);
    const log = await git.log({ maxCount: 5 });

    if (log.total === 0) {
      throw new Error("Agent did not make any commits");
    }

    await git.push("origin", branchName, ["--set-upstream"]);

    const pr = await createPullRequest(
      repo.provider,
      account.accessToken,
      repo.fullName,
      {
        title: `[AutoSoftware] ${task.title}`,
        body: `## Automated Changes\n\n${task.description}\n\n---\n\n### Agent Summary\n\n${resultText}\n\n---\n*Generated by AutoSoftware*`,
        head: branchName,
        base: targetBranch,
      }
    );

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
        },
      },
    });

    console.log(`Task ${taskId} completed. PR: ${pr.url}`);
  } catch (err) {
    console.error(`Task ${taskId} failed:`, err);

    if (apiKeyId) {
      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastError: err instanceof Error ? err.message : "Unknown error" },
      }).catch(() => {});
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "failed",
        metadata: {
          error: err instanceof Error ? err.message : "Unknown error",
          branch: branchName,
        },
      },
    });

    throw err;
  } finally {
    if (repoDir && worktreeDir) {
      await cleanupWorktree(repoDir, worktreeDir).catch(() => {});
    }
  }
}
