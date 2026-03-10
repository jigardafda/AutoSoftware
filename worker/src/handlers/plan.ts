import { prisma } from "../db.js";
import { simpleGit } from "simple-git";
import { cloneOrPullRepo } from "../services/repo-manager.js";
import { config } from "../config.js";
import { getProjectContext } from "../services/project-context.js";
import { resolveAuth, setupAgentSdkAuth, isValidAuth } from "../services/api-key-resolver.js";
import { agentQueryWithUsage } from "../services/claude-query.js";
import { getInstalledPluginPaths } from "../services/plugin-manager.js";
import { getBoss } from "../boss.js";
import { JOB_NAMES } from "@autosoftware/shared";

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

interface PlanningQuestion {
  questionKey: string;
  label: string;
  type: "select" | "multi_select" | "confirm";
  options: { value: string; label: string }[];
  required: boolean;
}

interface NeedsInputResponse {
  status: "needs_input";
  questions: PlanningQuestion[];
}

interface ReadyResponse {
  status: "ready";
  plan: string;
  affectedFiles: string[];
}

type PlanningResponse = NeedsInputResponse | ReadyResponse;

export async function handleTaskPlanning(jobs: { data: { taskId: string } }[]) {
  const job = jobs[0];
  const { taskId } = job.data;
  console.log(`Starting planning for task ${taskId}`);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      repository: {
        include: {
          user: { select: { id: true, settings: true, accounts: true } },
        },
      },
      planningQuestions: {
        orderBy: [{ round: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!task || task.status === "cancelled") {
    console.log(`Task ${taskId} not found or cancelled`);
    return;
  }

  const repo = task.repository;
  const userBudgets = getUserBudgets(repo.user?.settings as UserSettings);

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
    console.error("Planning aborted: No authentication configured");
    return;
  }

  // Set up auth for Agent SDK
  setupAgentSdkAuth(auth);
  console.log(`Using ${auth.authType === "oauth" ? "OAuth token" : "API key"} for planning`);

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

  try {
    // Clone/pull repo (read-only, no worktree needed for planning)
    const repoDir = await cloneOrPullRepo(repo.id, repo.cloneUrl, account.accessToken, repo.provider);

    // Checkout the target branch so planning sees the correct code state
    const targetBranch = task.targetBranch || repo.defaultBranch;
    const git = simpleGit(repoDir);
    try {
      await git.fetch("origin", targetBranch);
      await git.checkout(`origin/${targetBranch}`);
      console.log(`Planning: checked out origin/${targetBranch}`);
    } catch (err) {
      console.warn(`Failed to checkout ${targetBranch}, falling back to current HEAD:`, err);
    }

    const projectContext = await getProjectContext(repo.id, task.projectId);

    // Get installed plugins for this user/project
    const pluginPaths = await getInstalledPluginPaths(repo.userId, task.projectId);
    if (pluginPaths.length > 0) {
      console.log(`Loaded ${pluginPaths.length} plugins for planning task ${taskId}`);
    }

    // Build previous answers context from all rounds
    let previousAnswersContext = "";
    if (task.planningQuestions.length > 0) {
      previousAnswersContext = "\n\n## Previous Clarification Rounds\n\n";
      const rounds = new Map<number, typeof task.planningQuestions>();
      for (const q of task.planningQuestions) {
        if (!rounds.has(q.round)) rounds.set(q.round, []);
        rounds.get(q.round)!.push(q);
      }
      for (const [round, questions] of rounds) {
        previousAnswersContext += `### Round ${round}\n\n`;
        for (const q of questions) {
          previousAnswersContext += `**${q.label}**\n`;
          if (q.answer !== null && q.answer !== undefined) {
            previousAnswersContext += `Answer: ${JSON.stringify(q.answer)}\n\n`;
          } else {
            previousAnswersContext += `Answer: (not answered)\n\n`;
          }
        }
      }
    }

    const currentRound = task.planningRound;
    const maxRounds = 3;
    const canAskMore = currentRound < maxRounds;

    const prompt = `${projectContext ? projectContext + "\n---\n\n" : ""}You are an expert software engineer planning a task implementation.

## Task: ${task.title}

${task.description}
${previousAnswersContext}
## Instructions

Analyze the codebase to understand the architecture, patterns, and relevant files for this task. Then decide:

${canAskMore ? `1. If you need clarification from the user to create a good plan, respond with a JSON object with \`status: "needs_input"\` and up to 5 questions. Each question must have predefined options (no free text). Use "select" for single-choice, "multi_select" for multi-choice, or "confirm" for yes/no.

2. If you have enough information, respond with a JSON object with \`status: "ready"\` and a detailed implementation plan.` : `You have already had ${maxRounds} rounds of clarification. You MUST now produce a final implementation plan. Respond with a JSON object with \`status: "ready"\` and a detailed implementation plan.`}

## Response Format

Respond with ONLY a JSON object in one of these formats:

### Format A: Need more information
\`\`\`json
{
  "status": "needs_input",
  "questions": [
    {
      "questionKey": "unique_key",
      "label": "Human-readable question text",
      "type": "select",
      "options": [
        { "value": "option_a", "label": "Option A description" },
        { "value": "option_b", "label": "Option B description" }
      ],
      "required": true
    }
  ]
}
\`\`\`

### Format B: Ready to implement
\`\`\`json
{
  "status": "ready",
  "plan": "# Implementation Plan\\n\\n## Overview\\n...\\n\\n## Step-by-step Changes\\n...\\n\\n## Testing Strategy\\n...",
  "affectedFiles": ["src/components/Example.tsx", "src/lib/utils.ts"]
}
\`\`\`

The plan should be detailed enough for another AI agent to implement it without ambiguity. Include specific file paths, function names, and code patterns to follow.

The \`affectedFiles\` array MUST list every file that will likely be created, modified, or deleted during implementation. Use relative paths from the repository root.`;

    await emitTaskLog(taskId, "plan", "step", "Starting planning analysis...");

    const { result: resultText, usage: planUsage } = await agentQueryWithUsage(
      {
        prompt,
        options: {
          allowedTools: ["Read", "Glob", "Grep", "Bash", "Skill"],
          permissionMode: "bypassPermissions",
          maxTurns: 20,
          maxBudgetUsd: userBudgets.planBudget,
          cwd: repoDir,
          // Load installed plugins
          ...(pluginPaths.length > 0 && { plugins: pluginPaths }),
        },
      },
      {
        apiKeyId,
        source: "plan",
        sourceId: taskId,
        onLog: (level, message, metadata) =>
          emitTaskLog(taskId, "plan", level, message, metadata || {}),
      }
    );

    console.log(`Plan usage: ~${planUsage.inputTokens} input, ~${planUsage.outputTokens} output, ~$${planUsage.costUsd.toFixed(4)}`);

    // Parse the JSON response
    let response: PlanningResponse;
    try {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON object found in planning response");
      }
      response = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("Failed to parse planning response:", parseErr);
      // Treat unparseable response as a ready plan with the raw text
      response = { status: "ready", plan: resultText, affectedFiles: [] };
    }

    // Always update usage counters (increment to accumulate across rounds)
    await prisma.task.update({
      where: { id: taskId },
      data: {
        inputTokens: { increment: planUsage.inputTokens },
        outputTokens: { increment: planUsage.outputTokens },
        estimatedCostUsd: { increment: planUsage.costUsd },
      },
    });

    if (response.status === "needs_input" && currentRound < maxRounds) {
      // Create planning questions and await user input
      const newRound = currentRound + 1;
      const questions = response.questions.slice(0, 5); // Max 5 questions

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await prisma.planningQuestion.create({
          data: {
            taskId,
            round: newRound,
            questionKey: q.questionKey,
            label: q.label,
            type: q.type,
            options: q.options as any,
            required: q.required !== false,
            sortOrder: i,
          },
        });
      }

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "awaiting_input",
          planningRound: newRound,
        },
      });

      console.log(`Task ${taskId} awaiting input (round ${newRound}, ${questions.length} questions)`);
    } else {
      // Planning complete - set enhanced plan and queue execution
      const plan = response.status === "ready" ? response.plan : resultText;
      const affectedFiles = response.status === "ready" && Array.isArray(response.affectedFiles)
        ? response.affectedFiles
        : [];

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: "planned",
          enhancedPlan: plan,
          affectedFiles: affectedFiles as any,
          planningRound: response.status === "needs_input" ? currentRound + 1 : currentRound,
        },
      });

      // Queue task execution
      const boss = getBoss();
      await boss.send(JOB_NAMES.TASK_EXECUTE, { taskId }, {
        retryLimit: 3,
        retryBackoff: true,
        expireInSeconds: 60 * 60,
      });

      console.log(`Task ${taskId} planning complete, queued for execution`);
    }
  } catch (err) {
    console.error(`Planning failed for task ${taskId}:`, err);

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
        },
      },
    });

    throw err;
  }
}
