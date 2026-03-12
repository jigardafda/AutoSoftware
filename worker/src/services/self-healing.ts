import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { agentQueryWithUsage } from "./claude-query.js";
import { detectTestFramework } from "./test-generator.js";

const execAsync = promisify(exec);

export interface SelfHealingOptions {
  workDir: string;
  apiKeyId?: string | null;
  taskId?: string;
  maxAttempts?: number;
  maxBudgetUsd?: number;
  onLog?: (level: string, message: string, metadata?: Record<string, unknown>) => Promise<void>;
}

export interface HealingAttempt {
  attemptNumber: number;
  buildCommand: string;
  errorOutput: string;
  fixApproach: string;
  success: boolean;
  timestamp: Date;
}

export interface SelfHealingResult {
  success: boolean;
  attempts: HealingAttempt[];
  finalError?: string;
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

interface BuildCommandInfo {
  command: string;
  testCommand?: string;
  lintCommand?: string;
}

/**
 * Detect the build/test commands for a project
 */
async function detectBuildCommands(workDir: string): Promise<BuildCommandInfo> {
  const commands: BuildCommandInfo = {
    command: "",
  };

  // Check for package.json (Node.js projects)
  try {
    const packageJsonPath = path.join(workDir, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

    if (packageJson.scripts) {
      // Build command
      if (packageJson.scripts.build) {
        commands.command = "npm run build";
      } else if (packageJson.scripts.compile) {
        commands.command = "npm run compile";
      } else if (packageJson.scripts.tsc) {
        commands.command = "npm run tsc";
      }

      // Test command
      if (packageJson.scripts.test) {
        commands.testCommand = "npm test";
      }

      // Lint command
      if (packageJson.scripts.lint) {
        commands.lintCommand = "npm run lint";
      } else if (packageJson.scripts.eslint) {
        commands.lintCommand = "npm run eslint";
      }
    }

    // Fallback for TypeScript projects
    if (!commands.command) {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.typescript) {
        commands.command = "npx tsc --noEmit";
      }
    }
  } catch {
    // Not a Node.js project
  }

  // Check for Makefile
  if (!commands.command) {
    try {
      const makefile = await readFile(path.join(workDir, "Makefile"), "utf-8");
      if (makefile.includes("build:")) {
        commands.command = "make build";
      }
      if (makefile.includes("test:")) {
        commands.testCommand = "make test";
      }
    } catch {
      // No Makefile
    }
  }

  // Check for Cargo.toml (Rust projects)
  if (!commands.command) {
    try {
      await readFile(path.join(workDir, "Cargo.toml"), "utf-8");
      commands.command = "cargo build";
      commands.testCommand = "cargo test";
    } catch {
      // Not a Rust project
    }
  }

  // Check for go.mod (Go projects)
  if (!commands.command) {
    try {
      await readFile(path.join(workDir, "go.mod"), "utf-8");
      commands.command = "go build ./...";
      commands.testCommand = "go test ./...";
    } catch {
      // Not a Go project
    }
  }

  // Check for requirements.txt or pyproject.toml (Python projects)
  if (!commands.command) {
    try {
      await readFile(path.join(workDir, "pyproject.toml"), "utf-8");
      commands.command = "python -m py_compile *.py";
      commands.testCommand = "pytest";
    } catch {
      try {
        await readFile(path.join(workDir, "requirements.txt"), "utf-8");
        commands.command = "python -m py_compile *.py";
        commands.testCommand = "pytest";
      } catch {
        // Not a Python project
      }
    }
  }

  return commands;
}

/**
 * Run a command and capture output
 */
async function runCommand(
  command: string,
  workDir: string,
  timeoutMs: number = 60000
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      env: {
        ...process.env,
        CI: "true", // Hint to tools that we're in CI-like environment
        FORCE_COLOR: "0", // Disable colored output for cleaner error parsing
      },
    });

    return {
      success: true,
      stdout,
      stderr,
    };
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; message: string };
    return {
      success: false,
      stdout: execError.stdout || "",
      stderr: execError.stderr || execError.message,
    };
  }
}

/**
 * Extract relevant error information from build output
 */
function extractErrorContext(stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split("\n");

  // Find lines with error indicators
  const errorLines: string[] = [];
  let captureContext = false;
  let contextLines = 0;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Start capturing on error indicators
    if (
      lowerLine.includes("error") ||
      lowerLine.includes("failed") ||
      lowerLine.includes("cannot find") ||
      lowerLine.includes("undefined") ||
      lowerLine.includes("not found") ||
      lowerLine.includes("unexpected") ||
      lowerLine.includes("syntaxerror") ||
      lowerLine.includes("typeerror")
    ) {
      captureContext = true;
      contextLines = 0;
    }

    if (captureContext) {
      errorLines.push(line);
      contextLines++;

      // Capture up to 5 lines of context after error
      if (contextLines >= 10 && errorLines.length >= 50) {
        break;
      }
    }
  }

  // If no specific errors found, return last 30 lines
  if (errorLines.length === 0) {
    return lines.slice(-30).join("\n");
  }

  return errorLines.join("\n");
}

/**
 * Run the self-healing process
 */
export async function runSelfHealing(
  options: SelfHealingOptions
): Promise<SelfHealingResult> {
  const {
    workDir,
    apiKeyId,
    taskId,
    maxAttempts = 3,
    maxBudgetUsd = 2.0,
    onLog,
  } = options;

  const attempts: HealingAttempt[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  // Detect build commands
  const buildCommands = await detectBuildCommands(workDir);

  if (!buildCommands.command) {
    await onLog?.("error", "Could not detect build command for this project");
    return {
      success: false,
      attempts: [],
      finalError: "Could not detect build command. Please configure a build script.",
      totalUsage,
    };
  }

  await onLog?.("info", `Using build command: ${buildCommands.command}`);

  // Run initial build
  let buildResult = await runCommand(buildCommands.command, workDir);

  if (buildResult.success) {
    await onLog?.("success", "Build succeeded on first attempt");

    // Optionally run tests too
    if (buildCommands.testCommand) {
      await onLog?.("info", `Running tests: ${buildCommands.testCommand}`);
      const testResult = await runCommand(buildCommands.testCommand, workDir, 120000);
      if (!testResult.success) {
        buildResult = testResult;
        await onLog?.("error", "Tests failed, initiating self-healing");
      }
    }
  }

  if (buildResult.success) {
    return {
      success: true,
      attempts: [],
      totalUsage,
    };
  }

  // Begin self-healing attempts
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await onLog?.(
      "info",
      `Self-healing attempt ${attempt}/${maxAttempts}`,
      { attempt }
    );

    const errorContext = extractErrorContext(buildResult.stdout, buildResult.stderr);

    // Different approaches for each attempt
    const approaches = [
      "direct_fix", // Attempt 1: Direct fix based on error
      "alternative_approach", // Attempt 2: Try alternative implementation
      "minimal_fix", // Attempt 3: Minimal changes to make it compile
    ];

    const approach = approaches[attempt - 1] || "direct_fix";

    const systemPrompt = `You are an expert software engineer tasked with fixing build/test failures.

Approach: ${approach}
${approach === "direct_fix" ? "Fix the errors directly based on the error messages." : ""}
${approach === "alternative_approach" ? "Try an alternative implementation approach that avoids the previous errors." : ""}
${approach === "minimal_fix" ? "Make the minimal possible changes to make the code compile and tests pass. Comment out problematic code if necessary with TODO markers." : ""}

Guidelines:
1. Analyze the error messages carefully
2. Make targeted fixes - don't rewrite large portions of code
3. Preserve the original intent of the code
4. If a fix introduces new errors, consider rolling back
5. Add comments explaining non-obvious fixes

You have access to read files, edit files, and run commands.
After making fixes, run the build command to verify: ${buildCommands.command}
${buildCommands.testCommand ? `Also run tests: ${buildCommands.testCommand}` : ""}`;

    const userPrompt = `The following build/test command failed:
\`\`\`
${buildCommands.command}
\`\`\`

Error output:
\`\`\`
${errorContext}
\`\`\`

${attempt > 1 ? `\nPrevious fix attempts:\n${attempts.map((a) => `- Attempt ${a.attemptNumber}: ${a.fixApproach} - ${a.success ? "Succeeded" : "Failed"}`).join("\n")}` : ""}

Please analyze the errors and fix them. After fixing, run the build command to verify the fix works.`;

    try {
      const { result, usage } = await agentQueryWithUsage(
        {
          prompt: userPrompt,
          options: {
            allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
            permissionMode: "bypassPermissions",
            maxTurns: 20,
            maxBudgetUsd: maxBudgetUsd / maxAttempts,
            cwd: workDir,
            systemPrompt,
          },
        },
        {
          apiKeyId,
          source: "self_healing",
          sourceId: taskId,
          onLog: async (level, message, metadata) => {
            await onLog?.(level, `[Healing] ${message}`, metadata);
          },
        }
      );

      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.costUsd += usage.costUsd;

      // Verify the fix by running build again
      buildResult = await runCommand(buildCommands.command, workDir);

      let testsPassing = true;
      if (buildResult.success && buildCommands.testCommand) {
        const testResult = await runCommand(buildCommands.testCommand, workDir, 120000);
        testsPassing = testResult.success;
        if (!testsPassing) {
          buildResult = testResult;
        }
      }

      const attemptRecord: HealingAttempt = {
        attemptNumber: attempt,
        buildCommand: buildCommands.command,
        errorOutput: errorContext,
        fixApproach: approach,
        success: buildResult.success && testsPassing,
        timestamp: new Date(),
      };

      attempts.push(attemptRecord);

      if (attemptRecord.success) {
        await onLog?.("success", `Self-healing succeeded on attempt ${attempt}`);
        return {
          success: true,
          attempts,
          totalUsage,
        };
      }

      await onLog?.(
        "error",
        `Attempt ${attempt} failed, ${attempt < maxAttempts ? "trying again" : "no more attempts"}`
      );
    } catch (err) {
      console.error(`Self-healing attempt ${attempt} threw error:`, err);

      attempts.push({
        attemptNumber: attempt,
        buildCommand: buildCommands.command,
        errorOutput: err instanceof Error ? err.message : "Unknown error",
        fixApproach: approach,
        success: false,
        timestamp: new Date(),
      });

      await onLog?.("error", `Attempt ${attempt} threw exception: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  return {
    success: false,
    attempts,
    finalError: extractErrorContext(buildResult.stdout, buildResult.stderr),
    totalUsage,
  };
}

/**
 * Track healing metadata in task
 */
export interface HealingMetadata {
  healingAttempts: HealingAttempt[];
  lastHealingAt?: string;
  totalHealingCost: number;
  healingSuccess: boolean;
}

/**
 * Create healing metadata from result
 */
export function createHealingMetadata(result: SelfHealingResult): HealingMetadata {
  return {
    healingAttempts: result.attempts,
    lastHealingAt: new Date().toISOString(),
    totalHealingCost: result.totalUsage.costUsd,
    healingSuccess: result.success,
  };
}
