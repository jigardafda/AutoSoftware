import { execFile, execSync, spawn } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import chalk from "chalk";
import ora from "ora";
import { fetchPrInfo, type PrInfo, type FetchOptions } from "./pr-providers.js";
import { ensureServerRunning } from "./local-server.js";

const execFileAsync = promisify(execFile);

interface AgentInfo {
  id: string;
  name: string;
  command: string;
  available: boolean;
}

const AGENTS: AgentInfo[] = [
  { id: "claude-code", name: "Claude Code", command: "claude", available: false },
  { id: "codex", name: "OpenAI Codex", command: "codex", available: false },
  { id: "gemini", name: "Gemini CLI", command: "gemini", available: false },
  { id: "aider", name: "Aider", command: "aider", available: false },
  { id: "amp", name: "Amp", command: "amp", available: false },
];

function detectAgents(): AgentInfo[] {
  for (const agent of AGENTS) {
    try {
      execSync(`which ${agent.command}`, { stdio: "pipe", timeout: 5000 });
      agent.available = true;
    } catch {
      agent.available = false;
    }
  }
  return AGENTS.filter((a) => a.available);
}

interface ReviewComment {
  file: string;
  line: number | null;
  severity: "critical" | "warning" | "suggestion" | "nitpick" | "praise";
  comment: string;
}

interface ReviewResult {
  summary: string;
  verdict: "approve" | "request_changes" | "comment";
  comments: ReviewComment[];
}

function buildReviewPrompt(pr: PrInfo): string {
  const truncatedDiff = pr.diff.length > 100_000
    ? pr.diff.slice(0, 100_000) + "\n\n... [diff truncated due to size] ..."
    : pr.diff;

  return `You are a senior code reviewer. Review the following pull request and provide a thorough, constructive review.

## Pull Request
- **Title:** ${pr.title}
- **Branch:** ${pr.headBranch} → ${pr.baseBranch}
- **Provider:** ${pr.provider}
- **URL:** ${pr.url}
- **Files changed:** ${pr.files.join(", ")}

## PR Description
${pr.description || "(no description provided)"}

## Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

## Instructions
Provide your review as a JSON object with this exact structure:
{
  "summary": "A narrative overview of what this PR does, key decisions, potential concerns, and overall quality. Write 2-4 paragraphs.",
  "verdict": "approve" | "request_changes" | "comment",
  "comments": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical" | "warning" | "suggestion" | "nitpick" | "praise",
      "comment": "Detailed comment about this specific location"
    }
  ]
}

Guidelines:
- Be constructive and specific
- For "line", use the line number in the new file (from the + lines in the diff), or null if it's a general file comment
- Use "critical" for bugs, security issues, data loss risks
- Use "warning" for potential issues, performance concerns, error handling gaps
- Use "suggestion" for improvements, better patterns, readability
- Use "nitpick" for style, naming, minor preferences
- Use "praise" for well-written code worth highlighting
- Focus on what matters — don't nitpick everything
- The summary should tell the story of the PR, not just list changes

IMPORTANT: Respond with ONLY the JSON object, no markdown fences, no explanation before or after.`;
}

function spawnAgent(command: string, args: string[], env: Record<string, string | undefined>, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("error", (err: Error) => reject(err));
    child.on("close", (code: number) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Agent exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    // Write prompt to stdin and close
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runAgent(agentId: string, prompt: string): Promise<string> {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  switch (agentId) {
    case "claude-code": {
      const claudeEnv: Record<string, string | undefined> = { ...process.env, FORCE_COLOR: "0" };
      delete claudeEnv.CLAUDECODE;
      // Use stdin pipe via -p - (read prompt from stdin)
      return spawnAgent(agent.command, ["-p", "-"], claudeEnv, prompt);
    }
    case "codex": {
      return spawnAgent(agent.command, ["-q", "-"], { ...process.env }, prompt);
    }
    case "gemini": {
      return spawnAgent(agent.command, ["-p", "-"], { ...process.env }, prompt);
    }
    case "aider": {
      // Aider reads from --message, write prompt to a temp file
      const reviewDir = `${homedir()}/.auto-software/reviews`;
      mkdirSync(reviewDir, { recursive: true });
      const tmpFile = `${reviewDir}/auto-review-${Date.now()}.txt`;
      writeFileSync(tmpFile, prompt);
      try {
        const { stdout } = await execFileAsync(agent.command, ["--message-file", tmpFile, "--no-git", "--yes"], {
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        });
        return stdout;
      } finally {
        try { unlinkSync(tmpFile); } catch {}
      }
    }
    case "amp": {
      return spawnAgent(agent.command, ["-p", "-"], { ...process.env }, prompt);
    }
    default:
      throw new Error(`No execution strategy for agent: ${agentId}`);
  }
}

function parseReviewOutput(raw: string): ReviewResult {
  // Try to extract JSON from the output (agent may include extra text)
  const jsonMatch = raw.match(/\{[\s\S]*"summary"[\s\S]*"verdict"[\s\S]*"comments"[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: treat entire output as summary
    return {
      summary: raw.trim(),
      verdict: "comment",
      comments: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary || "",
      verdict: parsed.verdict || "comment",
      comments: (parsed.comments || []).map((c: any) => ({
        file: c.file || "unknown",
        line: c.line ?? null,
        severity: c.severity || "suggestion",
        comment: c.comment || "",
      })),
    };
  } catch {
    return {
      summary: raw.trim(),
      verdict: "comment",
      comments: [],
    };
  }
}

function displayReview(review: ReviewResult, pr: PrInfo): void {
  const verdictColors = {
    approve: chalk.green,
    request_changes: chalk.red,
    comment: chalk.yellow,
  };
  const verdictLabels = {
    approve: "APPROVE",
    request_changes: "CHANGES REQUESTED",
    comment: "COMMENT",
  };

  const severityColors = {
    critical: chalk.red.bold,
    warning: chalk.yellow,
    suggestion: chalk.cyan,
    nitpick: chalk.gray,
    praise: chalk.green,
  };
  const severityIcons = {
    critical: "[!]",
    warning: "[w]",
    suggestion: "[s]",
    nitpick: "[n]",
    praise: "[+]",
  };

  console.log("");
  console.log(chalk.bold("=".repeat(60)));
  console.log(chalk.bold(`  PR Review: ${pr.title}`));
  console.log(chalk.gray(`  ${pr.url}`));
  console.log(chalk.bold("=".repeat(60)));
  console.log("");

  // Verdict
  const verdictColor = verdictColors[review.verdict] || chalk.white;
  console.log(verdictColor(`  ${verdictLabels[review.verdict] || review.verdict}`));
  console.log("");

  // Summary
  console.log(chalk.bold("  Summary"));
  console.log(chalk.gray("  " + "-".repeat(56)));
  const summaryLines = review.summary.split("\n");
  for (const line of summaryLines) {
    console.log(`  ${line}`);
  }
  console.log("");

  // Comments
  if (review.comments.length > 0) {
    console.log(chalk.bold(`  Comments (${review.comments.length})`));
    console.log(chalk.gray("  " + "-".repeat(56)));
    console.log("");

    // Group by file
    const byFile = new Map<string, ReviewComment[]>();
    for (const c of review.comments) {
      const existing = byFile.get(c.file) || [];
      existing.push(c);
      byFile.set(c.file, existing);
    }

    for (const [file, comments] of byFile) {
      console.log(chalk.bold.underline(`  ${file}`));
      for (const c of comments) {
        const color = severityColors[c.severity] || chalk.white;
        const icon = severityIcons[c.severity] || "*";
        const lineStr = c.line ? chalk.gray(`:${c.line}`) : "";
        console.log(`    ${icon} ${color(`[${c.severity}]`)}${lineStr} ${c.comment}`);
      }
      console.log("");
    }
  }

  // Stats
  const counts = { critical: 0, warning: 0, suggestion: 0, nitpick: 0, praise: 0 };
  for (const c of review.comments) {
    if (c.severity in counts) counts[c.severity as keyof typeof counts]++;
  }
  console.log(chalk.gray("  " + "-".repeat(56)));
  console.log(
    `  ${chalk.red(`${counts.critical} critical`)}  ${chalk.yellow(`${counts.warning} warnings`)}  ${chalk.cyan(`${counts.suggestion} suggestions`)}  ${chalk.gray(`${counts.nitpick} nitpicks`)}  ${chalk.green(`${counts.praise} praise`)}`
  );
  console.log(chalk.bold("=".repeat(60)));
  console.log("");
}

export interface ReviewOptions {
  agent?: string;
  gitlabToken?: string;
  bitbucketToken?: string;
  dataDir?: string;
}

export async function runReview(prUrl: string, options: ReviewOptions): Promise<void> {
  // 1. Detect available agents
  const spinner = ora("Detecting available AI agents...").start();
  const available = detectAgents();

  if (available.length === 0) {
    spinner.fail(chalk.red("No AI agents found"));
    console.log(chalk.yellow("\nInstall one of the following:"));
    console.log("  - Claude Code:  npm install -g @anthropic-ai/claude-code");
    console.log("  - Codex:        npm install -g @openai/codex");
    console.log("  - Gemini CLI:   npm install -g @google/gemini-cli");
    console.log("  - Aider:        pip install aider-chat");
    console.log("  - Amp:          npm install -g @anthropic-ai/amp");
    process.exit(1);
  }

  // 2. Select agent
  let selectedAgent: string;
  if (options.agent) {
    const found = available.find((a) => a.id === options.agent);
    if (!found) {
      spinner.fail(chalk.red(`Agent "${options.agent}" not found or not installed`));
      console.log(chalk.yellow(`Available agents: ${available.map((a) => a.id).join(", ")}`));
      process.exit(1);
    }
    selectedAgent = options.agent;
    spinner.succeed(chalk.green(`Using ${found.name}`));
  } else if (available.length === 1) {
    selectedAgent = available[0].id;
    spinner.succeed(chalk.green(`Using ${available[0].name} (only available agent)`));
  } else {
    spinner.succeed(chalk.green(`Found ${available.length} agents: ${available.map((a) => a.name).join(", ")}`));
    // Use first available (prefer claude-code)
    const claude = available.find((a) => a.id === "claude-code");
    selectedAgent = claude ? claude.id : available[0].id;
    console.log(chalk.gray(`  Using ${AGENTS.find((a) => a.id === selectedAgent)?.name} (use --agent to change)`));
  }

  // 3. Fetch PR info
  const fetchSpinner = ora("Fetching PR information...").start();
  const fetchOpts: FetchOptions = {
    gitlabToken: options.gitlabToken || process.env.GITLAB_TOKEN,
    bitbucketToken: options.bitbucketToken || process.env.BITBUCKET_TOKEN,
  };

  let prInfo: PrInfo;
  try {
    prInfo = await fetchPrInfo(prUrl, fetchOpts);
    fetchSpinner.succeed(chalk.green(`Fetched: ${prInfo.title} (${prInfo.files.length} files changed)`));
  } catch (err) {
    fetchSpinner.fail(chalk.red("Failed to fetch PR"));
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // 4. Build prompt and run review
  const reviewSpinner = ora(`Running review with ${AGENTS.find((a) => a.id === selectedAgent)?.name}...`).start();
  const prompt = buildReviewPrompt(prInfo);

  let rawOutput: string;
  try {
    rawOutput = await runAgent(selectedAgent, prompt);
    reviewSpinner.succeed(chalk.green("Review complete"));
  } catch (err) {
    reviewSpinner.fail(chalk.red("Review failed"));
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // 5. Parse and display
  const review = parseReviewOutput(rawOutput);
  displayReview(review, prInfo);

  // 6. Ensure CLI embedded server is running and save the review
  const apiUrl = process.env.AUTO_SOFTWARE_URL || "http://localhost:8002";
  const uiUrl = process.env.AUTO_SOFTWARE_UI_URL || "http://localhost:8001";

  const saveSpinner = ora("Saving review to local server...").start();
  try {
    await ensureServerRunning({ dataDir: options.dataDir });

    const reviewPayload = {
      prUrl: prInfo.url,
      provider: prInfo.provider,
      owner: prInfo.owner,
      repo: prInfo.repo,
      prNumber: prInfo.number,
      title: prInfo.title,
      description: prInfo.description,
      agentId: selectedAgent,
      summary: review.summary,
      verdict: review.verdict,
      comments: review.comments,
      filesChanged: prInfo.files,
      baseBranch: prInfo.baseBranch,
      headBranch: prInfo.headBranch,
    };

    const res = await fetch(`${apiUrl}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reviewPayload),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data = await res.json() as any;
      saveSpinner.succeed(chalk.green("Review saved"));
      console.log(chalk.gray(`  View in UI: ${uiUrl}/reviews/${data.review?.id || ""}`));
    } else {
      const errText = await res.text().catch(() => "");
      saveSpinner.fail(chalk.yellow("Failed to save review to server"));
      console.log(chalk.gray(`  Server responded with ${res.status}: ${errText.slice(0, 200)}`));
    }
  } catch (err) {
    saveSpinner.fail(chalk.yellow("Could not save review to server"));
    console.log(chalk.gray(`  ${err instanceof Error ? err.message : err}`));
  }
}
