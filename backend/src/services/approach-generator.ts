/**
 * Approach Generator Service
 *
 * Generates multiple implementation approaches for a task by analyzing
 * the task description and codebase context. Each approach includes:
 * - Name and description
 * - Tradeoffs (pros/cons)
 * - Estimated complexity
 * - Recommendation score
 */

import { simpleQuery } from "./claude-query.js";

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

/**
 * Generate implementation approaches for a task.
 *
 * @param taskTitle - The task title
 * @param taskDescription - The task description
 * @param codebaseContext - Context about the codebase (tech stack, patterns, etc.)
 * @param affectedFiles - Files that might be affected (from previous analysis)
 * @returns Generated approaches with tradeoffs
 */
export async function generateApproaches(
  taskTitle: string,
  taskDescription: string,
  codebaseContext: string,
  affectedFiles: string[] = []
): Promise<ApproachGenerationResult> {
  const systemPrompt = `You are an expert software architect analyzing implementation options.
Your task is to generate 2-3 distinct implementation approaches for the given task.

For each approach, consider:
1. Different architectural patterns (e.g., direct implementation vs abstraction layer)
2. Different levels of refactoring (minimal changes vs comprehensive restructuring)
3. Different tradeoffs between speed, maintainability, and extensibility

Be specific and practical. Reference actual patterns and files when possible.`;

  const userPrompt = `## Task: ${taskTitle}

${taskDescription}

${codebaseContext ? `## Codebase Context\n${codebaseContext}\n` : ""}
${affectedFiles.length > 0 ? `## Potentially Affected Files\n${affectedFiles.join("\n")}\n` : ""}

## Instructions

Generate 2-3 distinct implementation approaches. Each approach should be meaningfully different from the others, not just variations on the same theme.

Respond with a JSON object in this exact format:
\`\`\`json
{
  "approaches": [
    {
      "name": "Short descriptive name",
      "description": "2-3 sentence description of the approach",
      "tradeoffs": {
        "pros": ["Pro 1", "Pro 2", "Pro 3"],
        "cons": ["Con 1", "Con 2"]
      },
      "complexity": "low" | "medium" | "high",
      "estimatedTime": "e.g., 2-4 hours, 1-2 days",
      "affectedAreas": ["area1", "area2"],
      "isRecommended": true/false,
      "reasoning": "Why this approach is/isn't recommended"
    }
  ],
  "recommendedIndex": 0,
  "analysisContext": "Brief summary of the analysis and key considerations"
}
\`\`\`

Ensure exactly one approach has "isRecommended": true and its index matches "recommendedIndex".`;

  try {
    const { result } = await simpleQuery(systemPrompt, userPrompt, {
      model: "claude-sonnet-4-20250514",
    });

    // Parse the JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as ApproachGenerationResult;

    // Validate the response structure
    if (!Array.isArray(parsed.approaches) || parsed.approaches.length === 0) {
      throw new Error("Invalid approaches array");
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
    }

    return parsed;
  } catch (error) {
    console.error("Failed to generate approaches:", error);

    // Return a single default approach on error
    return {
      approaches: [
        {
          name: "Standard Implementation",
          description:
            "Implement the task using conventional patterns and practices appropriate for the codebase.",
          tradeoffs: {
            pros: [
              "Follows existing patterns",
              "Predictable outcome",
              "Lower risk",
            ],
            cons: ["May miss optimization opportunities"],
          },
          complexity: "medium",
          estimatedTime: "Variable",
          affectedAreas: affectedFiles.slice(0, 5),
          isRecommended: true,
          reasoning:
            "Default approach when detailed analysis is not available.",
        },
      ],
      recommendedIndex: 0,
      analysisContext:
        "Fallback approach generated due to analysis limitations.",
    };
  }
}

/**
 * Generate a detailed implementation plan for a selected approach.
 *
 * @param approach - The selected approach
 * @param taskTitle - The task title
 * @param taskDescription - The task description
 * @param codebaseContext - Context about the codebase
 * @returns Detailed implementation plan
 */
export async function generatePlanForApproach(
  approach: ImplementationApproach,
  taskTitle: string,
  taskDescription: string,
  codebaseContext: string
): Promise<string> {
  const systemPrompt = `You are an expert software engineer creating a detailed implementation plan.
The user has selected a specific approach for their task. Create a step-by-step plan that follows this approach precisely.`;

  const userPrompt = `## Task: ${taskTitle}

${taskDescription}

## Selected Approach: ${approach.name}

${approach.description}

**Complexity:** ${approach.complexity}
**Estimated Time:** ${approach.estimatedTime}
**Affected Areas:** ${approach.affectedAreas.join(", ")}

### Tradeoffs to Consider
**Pros:**
${approach.tradeoffs.pros.map((p) => `- ${p}`).join("\n")}

**Cons:**
${approach.tradeoffs.cons.map((c) => `- ${c}`).join("\n")}

${codebaseContext ? `## Codebase Context\n${codebaseContext}\n` : ""}

## Instructions

Create a detailed, step-by-step implementation plan that:
1. Follows the selected approach precisely
2. Addresses the tradeoffs mentioned
3. Is specific enough for another AI agent to implement without ambiguity
4. Includes file paths, function names, and code patterns to follow

Format the plan as Markdown with clear sections for:
- Overview
- Step-by-step Changes (numbered)
- Testing Strategy
- Potential Risks and Mitigations`;

  const { result } = await simpleQuery(systemPrompt, userPrompt, {
    model: "claude-sonnet-4-20250514",
  });

  return result;
}
