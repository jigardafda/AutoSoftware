/**
 * Approach Generator Service
 *
 * Generates multiple implementation approaches for a task by analyzing
 * the task description and codebase context using the Agent SDK.
 */

import { agentQueryWithUsage } from "./claude-query.js";

export interface ApproachTradeoff {
  pros: string[];
  cons: string[];
}

export interface ImplementationApproach {
  name: string;
  description: string;
  tradeoffs: ApproachTradeoff;
  complexity: "low" | "medium" | "high";
  estimatedTime: string;
  affectedAreas: string[];
  isRecommended: boolean;
  reasoning: string;
}

export interface ApproachGenerationResult {
  approaches: ImplementationApproach[];
  recommendedIndex: number;
  analysisContext: string;
}

interface GenerateApproachesOptions {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  projectContext: string;
  repoDir: string;
  apiKeyId: string | null;
  onLog?: (level: string, message: string, metadata?: Record<string, any>) => Promise<void>;
}

/**
 * Generate implementation approaches for a task using the Agent SDK.
 * This allows the AI to explore the codebase before suggesting approaches.
 */
export async function generateApproaches(
  options: GenerateApproachesOptions
): Promise<ApproachGenerationResult> {
  const {
    taskId,
    taskTitle,
    taskDescription,
    projectContext,
    repoDir,
    apiKeyId,
    onLog,
  } = options;

  const prompt = `${projectContext ? projectContext + "\n---\n\n" : ""}You are an expert software architect analyzing implementation options for a task.

## Task: ${taskTitle}

${taskDescription}

## Instructions

First, explore the codebase to understand:
1. The relevant existing code patterns and architecture
2. Files that might be affected by this task
3. Dependencies and integrations to consider
4. Testing patterns and requirements

Then, generate 2-3 distinct implementation approaches. Each approach should be meaningfully different, considering:
- Different architectural patterns (e.g., direct implementation vs abstraction layer)
- Different levels of refactoring (minimal changes vs comprehensive restructuring)
- Different tradeoffs between speed, maintainability, and extensibility

## Response Format

After exploring the codebase, respond with ONLY a JSON object in this exact format:

\`\`\`json
{
  "approaches": [
    {
      "name": "Short descriptive name (e.g., 'Minimal Inline Changes')",
      "description": "2-3 sentence description of the approach and what makes it distinct",
      "tradeoffs": {
        "pros": ["Pro 1", "Pro 2", "Pro 3"],
        "cons": ["Con 1", "Con 2"]
      },
      "complexity": "low" | "medium" | "high",
      "estimatedTime": "e.g., 2-4 hours, 1-2 days",
      "affectedAreas": ["src/components/...", "src/lib/..."],
      "isRecommended": true,
      "reasoning": "Why this approach is or isn't recommended given the codebase context"
    }
  ],
  "recommendedIndex": 0,
  "analysisContext": "Brief summary of key codebase observations that informed these approaches"
}
\`\`\`

Requirements:
- Generate exactly 2-3 approaches
- Exactly one approach must have "isRecommended": true
- The "recommendedIndex" must match the index of the recommended approach
- Be specific about affected files based on your codebase exploration
- Consider the existing code patterns you discovered`;

  try {
    await onLog?.("step", "Generating implementation approaches...");

    const { result, usage } = await agentQueryWithUsage(
      {
        prompt,
        options: {
          allowedTools: ["Read", "Glob", "Grep", "Bash"],
          permissionMode: "bypassPermissions",
          maxTurns: 15,
          maxBudgetUsd: 0.5, // Limit budget for approach generation
          cwd: repoDir,
        },
      },
      {
        apiKeyId,
        source: "approach_generation",
        sourceId: taskId,
        onLog,
      }
    );

    await onLog?.(
      "info",
      `Approach generation completed (tokens: ${usage.inputTokens}/${usage.outputTokens}, cost: $${usage.costUsd.toFixed(4)})`
    );

    // Parse the JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in approach generation response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as ApproachGenerationResult;

    // Validate the response structure
    if (!Array.isArray(parsed.approaches) || parsed.approaches.length === 0) {
      throw new Error("Invalid approaches array in response");
    }

    // Ensure at least one approach is recommended
    const hasRecommended = parsed.approaches.some((a) => a.isRecommended);
    if (!hasRecommended && parsed.approaches.length > 0) {
      parsed.approaches[0].isRecommended = true;
      parsed.recommendedIndex = 0;
    }

    // Validate complexity values
    const validComplexities = ["low", "medium", "high"];
    for (const approach of parsed.approaches) {
      if (!validComplexities.includes(approach.complexity)) {
        approach.complexity = "medium";
      }
      // Ensure tradeoffs structure
      if (!approach.tradeoffs) {
        approach.tradeoffs = { pros: [], cons: [] };
      }
      if (!Array.isArray(approach.tradeoffs.pros)) {
        approach.tradeoffs.pros = [];
      }
      if (!Array.isArray(approach.tradeoffs.cons)) {
        approach.tradeoffs.cons = [];
      }
      // Ensure affectedAreas is array
      if (!Array.isArray(approach.affectedAreas)) {
        approach.affectedAreas = [];
      }
    }

    await onLog?.(
      "success",
      `Generated ${parsed.approaches.length} implementation approaches`
    );

    return parsed;
  } catch (error) {
    console.error("Failed to generate approaches:", error);
    await onLog?.(
      "error",
      `Approach generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    // Return a single default approach on error
    return createFallbackApproach();
  }
}

/**
 * Create a fallback approach when generation fails.
 */
function createFallbackApproach(): ApproachGenerationResult {
  return {
    approaches: [
      {
        name: "Standard Implementation",
        description:
          "Implement the task using conventional patterns and best practices appropriate for the codebase. This approach follows existing code conventions and patterns.",
        tradeoffs: {
          pros: [
            "Follows existing patterns",
            "Predictable implementation",
            "Lower risk of breaking changes",
          ],
          cons: [
            "May miss optimization opportunities",
            "Detailed approach analysis not available",
          ],
        },
        complexity: "medium",
        estimatedTime: "To be determined during planning",
        affectedAreas: [],
        isRecommended: true,
        reasoning:
          "Default approach when detailed codebase analysis could not be completed. The planning phase will determine specific implementation details.",
      },
    ],
    recommendedIndex: 0,
    analysisContext:
      "Fallback approach generated due to analysis limitations. The planning phase will provide more detailed implementation guidance.",
  };
}

/**
 * Generate a detailed plan for a selected approach.
 * This is called after the user selects an approach.
 */
export async function generatePlanForSelectedApproach(
  approach: ImplementationApproach,
  options: Omit<GenerateApproachesOptions, "taskTitle" | "taskDescription"> & {
    taskTitle: string;
    taskDescription: string;
    previousContext?: string;
  }
): Promise<{ plan: string; affectedFiles: string[] }> {
  const {
    taskId,
    taskTitle,
    taskDescription,
    projectContext,
    repoDir,
    apiKeyId,
    onLog,
    previousContext,
  } = options;

  const prompt = `${projectContext ? projectContext + "\n---\n\n" : ""}You are an expert software engineer creating a detailed implementation plan.

## Task: ${taskTitle}

${taskDescription}

## Selected Approach: ${approach.name}

${approach.description}

**Complexity:** ${approach.complexity}
**Estimated Time:** ${approach.estimatedTime}
**Affected Areas:** ${approach.affectedAreas.join(", ") || "To be determined"}

### Tradeoffs Accepted
**Pros:**
${approach.tradeoffs.pros.map((p) => `- ${p}`).join("\n")}

**Cons (user has accepted these):**
${approach.tradeoffs.cons.map((c) => `- ${c}`).join("\n")}

### Selection Reasoning
${approach.reasoning}

${previousContext ? `## Previous Analysis\n${previousContext}\n` : ""}

## Instructions

Explore the codebase to create a detailed implementation plan that:
1. Follows the selected approach precisely
2. Addresses the accepted tradeoffs
3. Is specific enough for another AI agent to implement without ambiguity

Respond with ONLY a JSON object:

\`\`\`json
{
  "plan": "# Implementation Plan\\n\\n## Overview\\n...\\n\\n## Step-by-step Changes\\n1. ...\\n2. ...\\n\\n## Testing Strategy\\n...",
  "affectedFiles": ["src/file1.ts", "src/file2.ts"]
}
\`\`\`

The plan should include:
- Clear overview of what will be done
- Numbered step-by-step changes with specific file paths
- Code patterns to follow (reference existing code)
- Testing strategy
- Potential risks and mitigations`;

  try {
    await onLog?.("step", `Creating plan for approach: ${approach.name}`);

    const { result, usage } = await agentQueryWithUsage(
      {
        prompt,
        options: {
          allowedTools: ["Read", "Glob", "Grep", "Bash"],
          permissionMode: "bypassPermissions",
          maxTurns: 20,
          maxBudgetUsd: 1.0, // Higher budget for detailed planning
          cwd: repoDir,
        },
      },
      {
        apiKeyId,
        source: "plan",
        sourceId: taskId,
        onLog,
      }
    );

    await onLog?.(
      "info",
      `Plan generation completed (tokens: ${usage.inputTokens}/${usage.outputTokens}, cost: $${usage.costUsd.toFixed(4)})`
    );

    // Parse the JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON, treat the entire result as the plan
      return {
        plan: result,
        affectedFiles: approach.affectedAreas,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      plan: parsed.plan || result,
      affectedFiles: Array.isArray(parsed.affectedFiles)
        ? parsed.affectedFiles
        : approach.affectedAreas,
    };
  } catch (error) {
    console.error("Failed to generate plan for approach:", error);
    await onLog?.(
      "error",
      `Plan generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    // Return a basic plan structure
    return {
      plan: `# Implementation Plan for: ${approach.name}

## Overview
${approach.description}

## Approach Details
- **Complexity:** ${approach.complexity}
- **Estimated Time:** ${approach.estimatedTime}

## Tradeoffs
**Pros:**
${approach.tradeoffs.pros.map((p) => `- ${p}`).join("\n")}

**Cons:**
${approach.tradeoffs.cons.map((c) => `- ${c}`).join("\n")}

## Next Steps
The planning phase encountered an issue. Please retry or proceed with manual implementation guidance.

Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      affectedFiles: approach.affectedAreas,
    };
  }
}
