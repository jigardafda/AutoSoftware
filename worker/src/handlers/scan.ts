import { query } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "../db.js";
import { cloneOrPullRepo } from "../services/repo-manager.js";
import { config } from "../config.js";

interface ScanTask {
  title: string;
  description: string;
  type: "improvement" | "bugfix" | "feature" | "refactor" | "security";
  priority: "low" | "medium" | "high" | "critical";
}

export async function handleRepoScan(job: { data: { repoId: string } }) {
  const { repoId } = job.data;
  console.log(`Starting scan for repo ${repoId}`);

  let repo: any;
  try {
    repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: {
        user: {
          include: { accounts: true },
        },
      },
    });
  } catch (err) {
    console.error(`Failed to fetch repo ${repoId}:`, err);
    return;
  }

  if (!repo || !repo.isActive) {
    console.log(`Repo ${repoId} not found or inactive, skipping`);
    return;
  }

  const account = repo.user.accounts.find((a: any) => a.provider === repo.provider);
  if (!account) {
    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "failed",
        summary: `No OAuth account found for provider ${repo.provider}`,
        analysisData: {},
      },
    });
    console.error(`No account found for provider ${repo.provider}`);
    return;
  }

  // Validate API key before starting
  if (!config.anthropicApiKey || config.anthropicApiKey === "sk-ant-xxx") {
    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "failed",
        summary: "ANTHROPIC_API_KEY is not configured. Set a valid API key in .env to enable scanning.",
        analysisData: {},
      },
    });
    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "error" },
    });
    console.error("Scan aborted: ANTHROPIC_API_KEY not configured");
    return;
  }

  await prisma.repository.update({
    where: { id: repoId },
    data: { status: "scanning" },
  });

  try {
    const repoDir = await cloneOrPullRepo(
      repoId,
      repo.cloneUrl,
      account.accessToken,
      repo.provider
    );

    let analysisText = "";

    for await (const message of query({
      prompt: `You are a senior software engineer performing a code review and analysis of this repository.

Analyze the codebase thoroughly and identify actionable improvements. Look for:
1. **Security vulnerabilities** - SQL injection, XSS, hardcoded secrets, insecure dependencies
2. **Bugs** - Logic errors, race conditions, unhandled edge cases
3. **Performance issues** - N+1 queries, memory leaks, unnecessary computations
4. **Code quality** - Dead code, duplicated logic, overly complex functions
5. **Missing tests** - Untested critical paths
6. **Refactoring opportunities** - Functions too long, unclear naming

IMPORTANT: Respond with ONLY a JSON array of tasks:
[
  {
    "title": "Short descriptive title",
    "description": "Detailed description with file paths and specific changes",
    "type": "security|bugfix|improvement|refactor|feature",
    "priority": "critical|high|medium|low"
  }
]`,
      options: {
        allowedTools: ["Read", "Glob", "Grep", "Bash", "WebSearch", "WebFetch", "Agent"],
        permissionMode: "bypassPermissions",
        maxTurns: 25,
        maxBudgetUsd: config.defaultScanBudget,
        cwd: repoDir,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        analysisText = message.result;
      }
    }

    let tasks: ScanTask[] = [];
    try {
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("Failed to parse scan results:", parseErr);
    }

    let tasksCreated = 0;
    for (const task of tasks) {
      await prisma.task.create({
        data: {
          repositoryId: repoId,
          userId: repo.userId,
          title: task.title,
          description: task.description,
          type: task.type,
          priority: task.priority,
          source: "auto_scan",
        },
      });
      tasksCreated++;
    }

    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "completed",
        summary: `Found ${tasksCreated} potential improvements`,
        tasksCreated,
        analysisData: { rawAnalysis: analysisText, tasks },
      },
    });

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "idle", lastScannedAt: new Date() },
    });

    console.log(`Scan complete for ${repo.fullName}: ${tasksCreated} tasks created`);
  } catch (err) {
    console.error(`Scan failed for repo ${repoId}:`, err);

    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "failed",
        summary: err instanceof Error ? err.message : "Unknown error",
        analysisData: {},
      },
    });

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "error" },
    });

    throw err;
  }
}
