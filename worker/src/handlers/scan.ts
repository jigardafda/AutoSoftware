import { query } from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db.js";
import { cloneOrPullRepo } from "../services/repo-manager.js";
import { config } from "../config.js";
import { estimateCost } from "@autosoftware/shared";
import { getProjectContext } from "../services/project-context.js";
import { resolveApiKey } from "../services/api-key-resolver.js";

interface ScanTask {
  title: string;
  description: string;
  type: "improvement" | "bugfix" | "feature" | "refactor" | "security";
  priority: "low" | "medium" | "high" | "critical";
}

async function emitLog(scanResultId: string, level: string, message: string, metadata: Record<string, any> = {}) {
  await prisma.scanLog.create({ data: { scanResultId, level, message, metadata } });
}

export async function handleRepoScan(jobs: { data: { repoId: string; projectId?: string } }[]) {
  const job = jobs[0];
  const { repoId, projectId } = job.data;
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

  // Resolve API key from DB or env
  const { key: resolvedKey, apiKeyId } = await resolveApiKey(repo.userId);

  if (!resolvedKey || resolvedKey === "sk-ant-xxx") {
    await prisma.scanResult.create({
      data: {
        repositoryId: repoId,
        status: "failed",
        summary: "No API key available. Add one in Settings or set ANTHROPIC_API_KEY in .env.",
        analysisData: {},
      },
    });
    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "error" },
    });
    console.error("Scan aborted: No API key available");
    return;
  }

  // Set env for Agent SDK
  process.env.ANTHROPIC_API_KEY = resolvedKey;

  await prisma.repository.update({
    where: { id: repoId },
    data: { status: "scanning" },
  });

  const scanResult = await prisma.scanResult.create({
    data: { repositoryId: repoId, status: "in_progress", analysisData: {} },
  });
  await emitLog(scanResult.id, "step", "Scan started");

  try {
    await emitLog(scanResult.id, "step", "Cloning repository...");
    const repoDir = await cloneOrPullRepo(
      repoId,
      repo.cloneUrl,
      account.accessToken,
      repo.provider
    );
    await emitLog(scanResult.id, "info", "Repository ready");

    const projectContext = await getProjectContext(repoId, projectId);

    let analysisText = "";
    await emitLog(scanResult.id, "step", "Analyzing codebase with AI agent...");

    for await (const message of query({
      prompt: `${projectContext ? projectContext + "\n---\n\n" : ""}You are a senior software engineer performing a code review and analysis of this repository.

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

    await emitLog(scanResult.id, "info", "Analysis complete");
    await emitLog(scanResult.id, "step", "Parsing analysis results...");

    let tasks: ScanTask[] = [];
    try {
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        tasks = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("Failed to parse scan results:", parseErr);
    }

    await emitLog(scanResult.id, "info", `Found ${tasks.length} potential improvements`);

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
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const client = new Anthropic({ apiKey });
        const dedupResponse = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: `You are a deduplication engine. Given a list of EXISTING tasks and NEW tasks for a code repository, identify which new tasks are semantically duplicates of existing ones — i.e. they address the same underlying issue, even if worded differently.

Return ONLY a JSON array of indices (0-based) of NEW tasks that are NOT duplicates and should be created. Example: [0, 2, 4]

If all new tasks are duplicates, return []. If none are duplicates, return all indices.`,
          messages: [{
            role: "user",
            content: `EXISTING TASKS:\n${existingTasks.map((t, i) => `${i}. [${t.type}] ${t.title}: ${t.description.slice(0, 200)}`).join("\n")}\n\nNEW TASKS:\n${tasks.map((t, i) => `${i}. [${t.type}] ${t.title}: ${t.description.slice(0, 200)}`).join("\n")}`,
          }],
        });

        const text = dedupResponse.content[0];
        if (text.type === "text") {
          const match = text.text.match(/\[[\d\s,]*\]/);
          if (match) {
            const keepIndices: number[] = JSON.parse(match[0]);
            const kept = keepIndices.filter((i) => i >= 0 && i < tasks.length);
            const skipped = tasks.length - kept.length;
            if (skipped > 0) {
              console.log(`Dedup: skipping ${skipped} duplicate tasks for ${repo.fullName}`);
            }
            newTasks = kept.map((i) => tasks[i]);
          }
        }

        // Record usage for the dedup call
        if (apiKeyId) {
          const cost = estimateCost(
            "claude-sonnet-4-20250514",
            dedupResponse.usage.input_tokens,
            dedupResponse.usage.output_tokens
          );
          await prisma.apiKeyUsage.create({
            data: {
              apiKeyId,
              model: "claude-sonnet-4-20250514",
              inputTokens: dedupResponse.usage.input_tokens,
              outputTokens: dedupResponse.usage.output_tokens,
              estimatedCostUsd: cost,
              source: "scan",
              sourceId: repoId,
            },
          });
        }
      } catch (dedupErr) {
        console.error("Dedup check failed, creating all tasks:", dedupErr);
        // Fall through — create all tasks if dedup fails
      }
      await emitLog(scanResult.id, "info", `Deduplication complete: ${tasks.length - newTasks.length} duplicates removed`);
    }

    await emitLog(scanResult.id, "step", `Creating ${newTasks.length} tasks...`);

    let tasksCreated = 0;
    for (const task of newTasks) {
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
        },
      });
      tasksCreated++;
    }

    await prisma.scanResult.update({
      where: { id: scanResult.id },
      data: {
        status: "completed",
        summary: `Found ${newTasks.length} potential improvements`,
        tasksCreated: newTasks.length,
        analysisData: { rawAnalysis: analysisText, tasks } as any,
      },
    });
    await emitLog(scanResult.id, "success", `Scan completed: ${tasksCreated} tasks created`);

    await prisma.repository.update({
      where: { id: repoId },
      data: { status: "idle", lastScannedAt: new Date() },
    });

    // Record usage if using a DB key (rough estimate for agent SDK usage)
    if (apiKeyId) {
      // Agent SDK doesn't give us exact token counts, so we estimate based on budget
      // We record a placeholder — the actual cost is tracked by the SDK budget
      await prisma.apiKeyUsage.create({
        data: {
          apiKeyId,
          model: "claude-sonnet-4-20250514",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          source: "scan",
          sourceId: repoId,
        },
      });
      await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date(), lastError: null },
      });
    }

    console.log(`Scan complete for ${repo.fullName}: ${tasksCreated} tasks created`);
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
