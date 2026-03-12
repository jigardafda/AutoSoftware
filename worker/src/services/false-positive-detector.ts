import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';

/**
 * Context information used to assess false positive risk for a finding.
 */
export interface FalsePositiveContext {
  isExported: boolean;
  isUsedElsewhere: boolean;
  hasTestCoverage: boolean;
  isInTestFile: boolean;
  exportedFromIndex: boolean;
  usageCount: number;
  testFileMatches: string[];
}

/**
 * A finding from the scan that may need false positive assessment.
 */
export interface FindingForAnalysis {
  filePath: string;
  codeSnippet: string;
  type: 'dead_code' | 'unused_function' | 'unused_variable' | 'unused_import' | 'other';
  identifier?: string; // The name of the function/variable/import being flagged
}

/**
 * Result of false positive analysis for a finding.
 */
export interface FalsePositiveAnalysis {
  finding: FindingForAnalysis;
  context: FalsePositiveContext;
  falsePositiveRisk: number; // 0-1 scale
  reasoning: string;
}

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /_spec\.[jt]sx?$/,
  /test_.*\.[jt]sx?$/,
  /spec_.*\.[jt]sx?$/,
  /__tests__\//,
  /tests?\//,
  /specs?\//,
  // Python
  /test_.*\.py$/,
  /_test\.py$/,
  /tests?\.py$/,
  // Go
  /_test\.go$/,
  // Rust
  /tests?\//,
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.rb', '.php'];

/**
 * Check if a file is a test file based on its path.
 */
export function isTestFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return TEST_FILE_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Get all source files in a repository (excluding node_modules, etc.)
 */
async function getSourceFiles(repoPath: string, maxDepth = 8): Promise<string[]> {
  const files: string[] = [];
  const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.next', 'coverage', '.cache'];

  async function walkDir(dir: string, depth = 0): Promise<void> {
    if (depth > maxDepth || files.length > 5000) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length > 5000) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            await walkDir(fullPath, depth + 1);
          }
        } else if (SOURCE_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory unreadable
    }
  }

  await walkDir(repoPath);
  return files;
}

/**
 * Search for an identifier in source files.
 */
async function searchForIdentifier(
  identifier: string,
  sourceFiles: string[],
  excludeFile: string
): Promise<{ count: number; files: string[] }> {
  const matchingFiles: string[] = [];
  let totalCount = 0;

  // Create patterns for different usage contexts
  const patterns = [
    new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'g'),
  ];

  for (const file of sourceFiles) {
    if (file === excludeFile) continue;

    try {
      const content = await readFile(file, 'utf-8');
      let fileMatches = 0;

      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          fileMatches += matches.length;
        }
      }

      if (fileMatches > 0) {
        totalCount += fileMatches;
        matchingFiles.push(file);
      }
    } catch {
      // File unreadable
    }
  }

  return { count: totalCount, files: matchingFiles };
}

/**
 * Check if an identifier is exported from a file.
 */
async function checkIfExported(filePath: string, identifier: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');

    // TypeScript/JavaScript export patterns
    const exportPatterns = [
      // export function name
      new RegExp(`export\\s+(async\\s+)?function\\s+${escapeRegex(identifier)}\\b`),
      // export const/let/var name
      new RegExp(`export\\s+(const|let|var)\\s+${escapeRegex(identifier)}\\b`),
      // export class name
      new RegExp(`export\\s+class\\s+${escapeRegex(identifier)}\\b`),
      // export interface/type name
      new RegExp(`export\\s+(interface|type)\\s+${escapeRegex(identifier)}\\b`),
      // export { name }
      new RegExp(`export\\s*\\{[^}]*\\b${escapeRegex(identifier)}\\b[^}]*\\}`),
      // export default name
      new RegExp(`export\\s+default\\s+${escapeRegex(identifier)}\\b`),
      // module.exports.name or module.exports = { name }
      new RegExp(`module\\.exports\\s*[.=][^;]*\\b${escapeRegex(identifier)}\\b`),
      // exports.name
      new RegExp(`exports\\.${escapeRegex(identifier)}\\s*=`),
    ];

    // Python export patterns (__all__)
    if (filePath.endsWith('.py')) {
      exportPatterns.push(
        new RegExp(`__all__\\s*=\\s*\\[[^\\]]*['"]${escapeRegex(identifier)}['"][^\\]]*\\]`)
      );
    }

    // Go - public if starts with uppercase
    if (filePath.endsWith('.go') && /^[A-Z]/.test(identifier)) {
      return true;
    }

    return exportPatterns.some(pattern => pattern.test(content));
  } catch {
    return false;
  }
}

/**
 * Check if identifier is exported from an index file in the same directory.
 */
async function checkIfExportedFromIndex(filePath: string, identifier: string): Promise<boolean> {
  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', '__init__.py', 'mod.rs'];

  for (const indexFile of indexFiles) {
    const indexPath = path.join(dir, indexFile);
    try {
      const content = await readFile(indexPath, 'utf-8');

      // Check if the index file re-exports from this file
      const fileBaseName = path.basename(filePath).replace(/\.[^.]+$/, '');
      const reExportPatterns = [
        // export { something } from './filename'
        new RegExp(`export\\s*\\{[^}]*\\}\\s*from\\s*['"]\\./` + escapeRegex(fileBaseName) + `['"]`),
        // export * from './filename'
        new RegExp(`export\\s*\\*\\s*from\\s*['"]\\./` + escapeRegex(fileBaseName) + `['"]`),
        // Python: from .filename import identifier
        new RegExp(`from\\s+\\.${escapeRegex(fileBaseName)}\\s+import\\s+.*\\b${escapeRegex(identifier)}\\b`),
        // Python: from .filename import *
        new RegExp(`from\\s+\\.${escapeRegex(fileBaseName)}\\s+import\\s+\\*`),
      ];

      if (reExportPatterns.some(pattern => pattern.test(content))) {
        return true;
      }
    } catch {
      // Index file doesn't exist or is unreadable
    }
  }

  return false;
}

/**
 * Find test files that might test a given identifier.
 */
async function findTestFilesForIdentifier(
  identifier: string,
  filePath: string,
  sourceFiles: string[]
): Promise<string[]> {
  const testFiles = sourceFiles.filter(f => isTestFile(f));
  const matchingTestFiles: string[] = [];

  // Get the base name of the source file for matching test files
  const baseName = path.basename(filePath).replace(/\.[^.]+$/, '');

  for (const testFile of testFiles) {
    try {
      const content = await readFile(testFile, 'utf-8');
      const testBaseName = path.basename(testFile).replace(/\.(test|spec)\.[^.]+$/, '').replace(/_test\.[^.]+$/, '');

      // Check if test file name matches source file name
      const nameMatches = testBaseName === baseName || testFile.includes(baseName);

      // Check if identifier is referenced in the test
      const identifierReferenced = new RegExp(`\\b${escapeRegex(identifier)}\\b`).test(content);

      if (nameMatches || identifierReferenced) {
        matchingTestFiles.push(testFile);
      }
    } catch {
      // Test file unreadable
    }
  }

  return matchingTestFiles;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate the false positive risk for a finding based on context.
 */
function calculateFalsePositiveRisk(context: FalsePositiveContext, type: string): { risk: number; reasoning: string } {
  let risk = 0.3; // Base risk
  const reasons: string[] = [];

  // If it's exported, high chance of false positive
  if (context.isExported) {
    risk += 0.3;
    reasons.push('Identifier is exported and may be used by external consumers');
  }

  // If exported from index, even higher chance
  if (context.exportedFromIndex) {
    risk += 0.2;
    reasons.push('Identifier is re-exported from index file (public API)');
  }

  // If used elsewhere in codebase
  if (context.isUsedElsewhere) {
    risk += 0.25;
    reasons.push(`Identifier found in ${context.usageCount} other location(s)`);
  }

  // If it's in a test file, very likely false positive for "unused" findings
  if (context.isInTestFile && type === 'dead_code') {
    risk += 0.4;
    reasons.push('Code is in a test file (test utilities may appear unused)');
  }

  // If there are test files that reference this identifier
  if (context.hasTestCoverage) {
    risk += 0.2;
    reasons.push(`Found ${context.testFileMatches.length} test file(s) referencing this identifier`);
  }

  // Clamp to 0-1
  risk = Math.min(1, Math.max(0, risk));

  // If no reasons found, add a default
  if (reasons.length === 0) {
    reasons.push('No external usage or exports detected');
  }

  return { risk, reasoning: reasons.join('; ') };
}

/**
 * Extract an identifier name from a code snippet.
 */
export function extractIdentifierFromSnippet(snippet: string, type: string): string | undefined {
  // Try to extract function/class/variable name from snippet
  const patterns = [
    // function name(
    /function\s+(\w+)\s*\(/,
    // const/let/var name =
    /(const|let|var)\s+(\w+)\s*=/,
    // class Name
    /class\s+(\w+)/,
    // def name( (Python)
    /def\s+(\w+)\s*\(/,
    // func name( (Go)
    /func\s+(\w+)\s*\(/,
    // fn name( (Rust)
    /fn\s+(\w+)\s*\(/,
    // import { name } or import name
    /import\s+(?:\{[^}]*\b(\w+)\b[^}]*\}|\b(\w+)\b)/,
  ];

  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match) {
      // Return the last non-undefined capture group
      return match.slice(1).filter(Boolean).pop();
    }
  }

  // Try to extract the first word that looks like an identifier
  const identifierMatch = snippet.match(/\b([a-zA-Z_]\w*)\b/);
  return identifierMatch?.[1];
}

/**
 * Analyze a finding for false positive risk.
 */
export async function analyzeFalsePositiveRisk(
  finding: FindingForAnalysis,
  repoPath: string,
  sourceFilesCache?: string[]
): Promise<FalsePositiveAnalysis> {
  const sourceFiles = sourceFilesCache || await getSourceFiles(repoPath);
  const fullFilePath = path.isAbsolute(finding.filePath)
    ? finding.filePath
    : path.join(repoPath, finding.filePath);

  // Extract identifier if not provided
  const identifier = finding.identifier || extractIdentifierFromSnippet(finding.codeSnippet, finding.type);

  let context: FalsePositiveContext = {
    isExported: false,
    isUsedElsewhere: false,
    hasTestCoverage: false,
    isInTestFile: isTestFile(finding.filePath),
    exportedFromIndex: false,
    usageCount: 0,
    testFileMatches: [],
  };

  if (identifier) {
    // Check if exported
    context.isExported = await checkIfExported(fullFilePath, identifier);

    // Check if exported from index
    context.exportedFromIndex = await checkIfExportedFromIndex(fullFilePath, identifier);

    // Search for usage elsewhere
    const usageSearch = await searchForIdentifier(identifier, sourceFiles, fullFilePath);
    context.isUsedElsewhere = usageSearch.count > 0;
    context.usageCount = usageSearch.count;

    // Find test files
    context.testFileMatches = await findTestFilesForIdentifier(identifier, fullFilePath, sourceFiles);
    context.hasTestCoverage = context.testFileMatches.length > 0;
  }

  const { risk, reasoning } = calculateFalsePositiveRisk(context, finding.type);

  return {
    finding,
    context,
    falsePositiveRisk: risk,
    reasoning,
  };
}

/**
 * Batch analyze multiple findings for false positive risk.
 */
export async function batchAnalyzeFalsePositiveRisk(
  findings: FindingForAnalysis[],
  repoPath: string
): Promise<FalsePositiveAnalysis[]> {
  // Cache source files for all findings
  const sourceFiles = await getSourceFiles(repoPath);

  // Process findings in parallel (with concurrency limit)
  const results: FalsePositiveAnalysis[] = [];
  const batchSize = 10;

  for (let i = 0; i < findings.length; i += batchSize) {
    const batch = findings.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(finding => analyzeFalsePositiveRisk(finding, repoPath, sourceFiles))
    );
    results.push(...batchResults);
  }

  return results;
}
