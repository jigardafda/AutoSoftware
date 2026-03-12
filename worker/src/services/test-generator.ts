import { readFile, readdir } from "fs/promises";
import path from "path";
import { simpleGit } from "simple-git";
import { simpleQueryWithUsage } from "./claude-query.js";

export interface TestGeneratorOptions {
  workDir: string;
  apiKeyId?: string | null;
  taskId?: string;
  testFramework?: string; // Override auto-detection
}

export interface GeneratedTest {
  filePath: string;
  testCode: string;
  targetFile: string;
  framework: string;
}

export interface TestGenerationResult {
  success: boolean;
  tests: GeneratedTest[];
  framework: string | null;
  error?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

interface TestFrameworkInfo {
  name: string;
  filePattern: RegExp;
  testDirPatterns: string[];
  importStatement: string;
  exampleTest: string;
}

const TEST_FRAMEWORKS: Record<string, TestFrameworkInfo> = {
  jest: {
    name: "Jest",
    filePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
    testDirPatterns: ["__tests__", "tests", "test", "spec"],
    importStatement: "",
    exampleTest: `describe('functionName', () => {
  it('should work correctly', () => {
    expect(functionName()).toBe(expected);
  });
});`,
  },
  vitest: {
    name: "Vitest",
    filePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
    testDirPatterns: ["__tests__", "tests", "test", "spec"],
    importStatement: `import { describe, it, expect, vi } from 'vitest';`,
    exampleTest: `describe('functionName', () => {
  it('should work correctly', () => {
    expect(functionName()).toBe(expected);
  });
});`,
  },
  mocha: {
    name: "Mocha",
    filePattern: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
    testDirPatterns: ["test", "tests", "spec"],
    importStatement: `import { expect } from 'chai';`,
    exampleTest: `describe('functionName', () => {
  it('should work correctly', () => {
    expect(functionName()).to.equal(expected);
  });
});`,
  },
  pytest: {
    name: "pytest",
    filePattern: /test_.*\.py$|.*_test\.py$/,
    testDirPatterns: ["tests", "test"],
    importStatement: `import pytest`,
    exampleTest: `def test_function_name():
    assert function_name() == expected`,
  },
  gotest: {
    name: "Go testing",
    filePattern: /_test\.go$/,
    testDirPatterns: [],
    importStatement: `import "testing"`,
    exampleTest: `func TestFunctionName(t *testing.T) {
    result := FunctionName()
    if result != expected {
        t.Errorf("got %v, want %v", result, expected)
    }
}`,
  },
};

/**
 * Detect the test framework used in a project
 */
export async function detectTestFramework(workDir: string): Promise<string | null> {
  // Check package.json for JS/TS projects
  try {
    const packageJsonPath = path.join(workDir, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.vitest) return "vitest";
    if (deps.jest) return "jest";
    if (deps.mocha) return "mocha";
  } catch {
    // Not a Node.js project or package.json unreadable
  }

  // Check for pytest (requirements.txt or pyproject.toml)
  try {
    const requirementsPath = path.join(workDir, "requirements.txt");
    const requirements = await readFile(requirementsPath, "utf-8");
    if (requirements.includes("pytest")) return "pytest";
  } catch {
    // No requirements.txt
  }

  try {
    const pyprojectPath = path.join(workDir, "pyproject.toml");
    const pyproject = await readFile(pyprojectPath, "utf-8");
    if (pyproject.includes("pytest")) return "pytest";
  } catch {
    // No pyproject.toml
  }

  // Check for Go tests
  try {
    const entries = await readdir(workDir);
    for (const entry of entries) {
      if (entry.endsWith("_test.go")) return "gotest";
    }
  } catch {
    // Directory unreadable
  }

  // Look for existing test files to infer framework
  try {
    const testDirs = ["__tests__", "tests", "test", "spec"];
    for (const dir of testDirs) {
      try {
        const testDir = path.join(workDir, dir);
        const files = await readdir(testDir);
        for (const file of files) {
          if (file.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
            // Check file content for framework clues
            const content = await readFile(path.join(testDir, file), "utf-8");
            if (content.includes("from 'vitest'") || content.includes("from \"vitest\"")) {
              return "vitest";
            }
            if (content.includes("from 'chai'") || content.includes("from \"chai\"")) {
              return "mocha";
            }
            // Default to Jest for JS/TS test files
            return "jest";
          }
        }
      } catch {
        // Test directory not found
      }
    }
  } catch {
    // Error scanning for test files
  }

  return null;
}

/**
 * Find existing test patterns in the codebase
 */
async function findExistingTestPatterns(
  workDir: string,
  framework: string
): Promise<string[]> {
  const patterns: string[] = [];
  const frameworkInfo = TEST_FRAMEWORKS[framework];
  if (!frameworkInfo) return patterns;

  const testDirs = frameworkInfo.testDirPatterns;

  for (const dir of testDirs) {
    try {
      const testDir = path.join(workDir, dir);
      const files = await readdir(testDir, { recursive: true });

      for (const file of files) {
        if (typeof file === "string" && file.match(frameworkInfo.filePattern)) {
          try {
            const content = await readFile(path.join(testDir, file), "utf-8");
            // Extract just the first 100 lines as a pattern example
            const sample = content.split("\n").slice(0, 100).join("\n");
            patterns.push(`// Example from ${dir}/${file}:\n${sample}`);
            if (patterns.length >= 3) break; // Max 3 examples
          } catch {
            // File unreadable
          }
        }
      }
    } catch {
      // Test directory not found
    }
  }

  return patterns;
}

/**
 * Analyze changed files to identify functions/methods that need tests
 */
async function analyzeChangedFiles(
  workDir: string,
  baseBranch: string = "HEAD~1"
): Promise<Array<{ file: string; content: string; diff: string }>> {
  const git = simpleGit(workDir);
  const changedFiles: Array<{ file: string; content: string; diff: string }> = [];

  try {
    // Get list of changed files
    const diffSummary = await git.diffSummary([baseBranch]);

    for (const file of diffSummary.files) {
      // Skip test files, config files, and non-code files
      if (
        file.file.includes(".test.") ||
        file.file.includes(".spec.") ||
        file.file.includes("test_") ||
        file.file.endsWith(".json") ||
        file.file.endsWith(".md") ||
        file.file.endsWith(".yml") ||
        file.file.endsWith(".yaml") ||
        file.file.endsWith(".lock")
      ) {
        continue;
      }

      // Only process code files
      const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb"];
      if (!codeExtensions.some((ext) => file.file.endsWith(ext))) {
        continue;
      }

      try {
        const filePath = path.join(workDir, file.file);
        const content = await readFile(filePath, "utf-8");
        const diff = await git.diff([baseBranch, "--", file.file]);

        changedFiles.push({
          file: file.file,
          content,
          diff,
        });
      } catch {
        // File might have been deleted or is unreadable
      }
    }
  } catch (err) {
    console.error("Error analyzing changed files:", err);
  }

  return changedFiles;
}

/**
 * Generate tests for changed files
 */
export async function generateTests(
  options: TestGeneratorOptions
): Promise<TestGenerationResult> {
  const { workDir, apiKeyId, taskId, testFramework } = options;

  const totalUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  try {
    // Detect or use provided test framework
    const framework = testFramework || (await detectTestFramework(workDir));

    if (!framework) {
      return {
        success: false,
        tests: [],
        framework: null,
        error: "No test framework detected. Consider adding Jest, Vitest, pytest, or another testing framework.",
        usage: totalUsage,
      };
    }

    const frameworkInfo = TEST_FRAMEWORKS[framework];
    if (!frameworkInfo) {
      return {
        success: false,
        tests: [],
        framework,
        error: `Unsupported test framework: ${framework}`,
        usage: totalUsage,
      };
    }

    // Analyze changed files
    const changedFiles = await analyzeChangedFiles(workDir);

    if (changedFiles.length === 0) {
      return {
        success: true,
        tests: [],
        framework,
        error: "No code files were changed that require tests",
        usage: totalUsage,
      };
    }

    // Find existing test patterns for style guidance
    const existingPatterns = await findExistingTestPatterns(workDir, framework);

    const generatedTests: GeneratedTest[] = [];

    // Generate tests for each changed file
    for (const changedFile of changedFiles) {
      const systemPrompt = `You are an expert test engineer. Generate comprehensive unit tests for the provided code changes.

Test Framework: ${frameworkInfo.name}
${frameworkInfo.importStatement ? `Import Statement: ${frameworkInfo.importStatement}` : ""}

Example test structure:
${frameworkInfo.exampleTest}

${existingPatterns.length > 0 ? `\nExisting test patterns in this project:\n${existingPatterns.join("\n\n")}` : ""}

Guidelines:
1. Generate tests that cover:
   - Happy path scenarios
   - Edge cases
   - Error handling
   - Boundary conditions
2. Use descriptive test names that explain the scenario
3. Follow the existing test patterns and conventions in the project
4. Mock external dependencies appropriately
5. Focus on testing the changed code (shown in the diff)

Output ONLY the test code, no explanations. Include necessary imports.`;

      const userPrompt = `Generate tests for the following file:

File: ${changedFile.file}

Full file content:
\`\`\`
${changedFile.content}
\`\`\`

Changes made (diff):
\`\`\`diff
${changedFile.diff}
\`\`\`

Generate comprehensive tests focusing on the changed code.`;

      try {
        const result = await simpleQueryWithUsage(systemPrompt, userPrompt, {
          apiKeyId,
          source: "test_generation",
          sourceId: taskId,
        });

        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        totalUsage.costUsd += result.usage.costUsd;

        // Extract test code from response
        let testCode = result.result;

        // Remove markdown code blocks if present
        testCode = testCode.replace(/^```[\w]*\n?/gm, "").replace(/```$/gm, "").trim();

        // Determine test file path
        const testFilePath = getTestFilePath(changedFile.file, framework);

        generatedTests.push({
          filePath: testFilePath,
          testCode,
          targetFile: changedFile.file,
          framework,
        });
      } catch (err) {
        console.error(`Error generating tests for ${changedFile.file}:`, err);
      }
    }

    return {
      success: true,
      tests: generatedTests,
      framework,
      usage: totalUsage,
    };
  } catch (err) {
    return {
      success: false,
      tests: [],
      framework: null,
      error: err instanceof Error ? err.message : "Unknown error generating tests",
      usage: totalUsage,
    };
  }
}

/**
 * Get the appropriate test file path for a source file
 */
function getTestFilePath(sourceFile: string, framework: string): string {
  const ext = path.extname(sourceFile);
  const baseName = path.basename(sourceFile, ext);
  const dirName = path.dirname(sourceFile);

  switch (framework) {
    case "pytest":
      return path.join(dirName, `test_${baseName}.py`);
    case "gotest":
      return path.join(dirName, `${baseName}_test.go`);
    default:
      // Jest, Vitest, Mocha - use .test.{ext} pattern
      return path.join(dirName, `${baseName}.test${ext}`);
  }
}

/**
 * Validate generated tests by attempting a syntax check
 */
export async function validateGeneratedTests(
  tests: GeneratedTest[],
  workDir: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const test of tests) {
    // Basic syntax validation
    if (!test.testCode || test.testCode.trim().length === 0) {
      errors.push(`Empty test code for ${test.targetFile}`);
      continue;
    }

    // Check for common test patterns based on framework
    switch (test.framework) {
      case "jest":
      case "vitest":
        if (
          !test.testCode.includes("describe") &&
          !test.testCode.includes("it(") &&
          !test.testCode.includes("test(")
        ) {
          errors.push(`Missing describe/it/test blocks in tests for ${test.targetFile}`);
        }
        break;
      case "mocha":
        if (!test.testCode.includes("describe") && !test.testCode.includes("it(")) {
          errors.push(`Missing describe/it blocks in tests for ${test.targetFile}`);
        }
        break;
      case "pytest":
        if (!test.testCode.includes("def test_")) {
          errors.push(`Missing test_ functions in tests for ${test.targetFile}`);
        }
        break;
      case "gotest":
        if (!test.testCode.includes("func Test")) {
          errors.push(`Missing Test functions in tests for ${test.targetFile}`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
